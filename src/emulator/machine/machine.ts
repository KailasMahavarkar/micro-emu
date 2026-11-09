import type { Program } from "../asm/assemble.ts";
import { Cpu } from "../cpu/cpu.ts";
import { decode } from "../cpu/decode.ts";
import { execute } from "../cpu/execute.ts";
import { F, FLAGS_FIXED, R, S } from "../cpu/registers.ts";
import type { Instruction } from "../cpu/types.ts";
import { hex } from "../hex.ts";
import {
  BIOS_COLUMNS, BIOS_SEG, BIOS_VIDEO_MODE, BLANK_CHAR, COLS, DEFAULT_ATTR, LOAD_SEG, PSP_COMMAND_TAIL_END, PSP_SIZE,
  PSP_TOP_OF_MEMORY, TEXT_MODE, TOP_OF_MEMORY_PARA, VIDEO_BYTES, VIDEO_LIN
} from "../layout.ts";
import { TextScreen } from "./screen.ts";
import { serviceInterrupt } from "./services.ts";
import type { Key, MachineHost, Notice } from "./types.ts";

export const HISTORY_MAX = 20000;
const HISTORY_TRIM = 2000;
const INT_20H = [0xCD, 0x20] as const;
const CR = 0x0D;
const PORT_MASK = 0xFFFF;
const FLOATING_PORT = 0xFF;

export interface Snapshot {
  r: Uint16Array;
  s: Uint16Array;
  ip: number;
  flags: number;
  halted: boolean;
  exited: boolean;
  exitCode: number;
  keyPos: number;
  lineBuf: number[] | null;
  notice: Notice | null;
  steps: number;
}

export interface OperandValues { pre: (number | null)[]; post: (number | null)[] }
export interface StepRecord { snap: Snapshot; log: number[]; ins: Instruction; values: OperandValues | null }
export interface PortWrite { port: number; v: number }

export class Machine implements MachineHost {
  readonly cpu = new Cpu();
  readonly screen = new TextScreen(this.cpu);
  readonly ports = new Map<number, number>();
  prog: Program | null = null;
  keys: Key[] = [];
  keyPos = 0;
  lineBuf: number[] | null = null;
  waiting = false;
  exited = false;
  exitCode = 0;
  notice: Notice | null = null;
  breakHit = false;
  steps = 0;
  history: StepRecord[] = [];
  lastPort: PortWrite | null = null;
  private ranges: [number, number][] = [];

  constructor() {
    this.cpu.intHook = n => serviceInterrupt(this, n);
    const readPort = (p: number): number => this.ports.get(p & PORT_MASK) ?? FLOATING_PORT;
    this.cpu.portIn = (port, w) => (w ? readPort(port) | (readPort(port + 1) << 8) : readPort(port));
    this.cpu.portOut = (port, v, w) => {
      this.ports.set(port & PORT_MASK, v & 0xFF);
      if (w) this.ports.set((port + 1) & PORT_MASK, (v >> 8) & 0xFF);
      this.lastPort = { port, v: w ? v & 0xFFFF : v & 0xFF };
    };
  }

  private resetRun(): void {
    this.keys = [];
    this.keyPos = 0;
    this.lineBuf = null;
    this.waiting = false;
    this.exited = false;
    this.exitCode = 0;
    this.notice = null;
    this.breakHit = false;
    this.steps = 0;
    this.history = [];
    this.lastPort = null;
  }

  load(prog: Program): void {
    const c = this.cpu, psp = LOAD_SEG << 4;
    this.prog = prog;
    this.resetRun();
    this.ports.clear();
    c.mem.fill(0);
    c.r.fill(0);
    c.halted = false;
    c.flags = FLAGS_FIXED | F.IF;
    for (const s of prog.segments) c.mem.set(s.bytes, s.base << 4);
    c.mem.set(INT_20H, psp);
    c.mem[psp + PSP_TOP_OF_MEMORY] = TOP_OF_MEMORY_PARA & 0xFF;
    c.mem[psp + PSP_TOP_OF_MEMORY + 1] = TOP_OF_MEMORY_PARA >> 8;
    c.mem[psp + PSP_COMMAND_TAIL_END] = CR;
    c.mem[(BIOS_SEG << 4) + BIOS_VIDEO_MODE] = TEXT_MODE;
    c.mem[(BIOS_SEG << 4) + BIOS_COLUMNS] = COLS;
    for (let i = 0; i < VIDEO_BYTES; i += 2) { c.mem[VIDEO_LIN + i] = BLANK_CHAR; c.mem[VIDEO_LIN + i + 1] = DEFAULT_ATTR; }
    c.videoDirty = true;
    c.lastVideo = null;
    c.s[S.ES] = LOAD_SEG;
    c.s[S.DS] = LOAD_SEG;
    c.s[S.CS] = prog.entry.cs;
    c.ip = prog.entry.ip;
    c.s[S.SS] = prog.ss;
    c.r[R.SP] = prog.sp;
    this.ranges = prog.segments.map((s): [number, number] => [s.base << 4, (s.base << 4) + Math.max(s.size, 1)]);
    this.ranges.push([psp, psp + PSP_SIZE]);
  }

  snapshot(): Snapshot {
    const c = this.cpu;
    return {
      r: c.r.slice(), s: c.s.slice(), ip: c.ip, flags: c.flags, halted: c.halted,
      exited: this.exited, exitCode: this.exitCode, keyPos: this.keyPos,
      lineBuf: this.lineBuf ? this.lineBuf.slice() : null, notice: this.notice, steps: this.steps
    };
  }

  private restore(s: Snapshot): void {
    const c = this.cpu;
    c.r.set(s.r); c.s.set(s.s); c.ip = s.ip; c.flags = s.flags; c.halted = s.halted;
    this.exited = s.exited; this.exitCode = s.exitCode; this.keyPos = s.keyPos;
    this.lineBuf = s.lineBuf ? s.lineBuf.slice() : null; this.notice = s.notice; this.steps = s.steps;
    this.waiting = false;
  }

  private undo(log: readonly number[]): void {
    for (let i = log.length - 2; i >= 0; i -= 2) this.cpu.mem[log[i]] = log[i + 1];
  }

  finished(): boolean { return this.exited || this.cpu.halted || this.notice?.fatal === true; }
  isWaiting(): boolean { return this.waiting; }

  private beginStep(): void {
    this.waiting = false;
    this.breakHit = false;
  }
  get lastRecord(): StepRecord | null { return this.history.at(-1) ?? null; }

  private inRange(lin: number): boolean { return this.ranges.some(([a, b]) => lin >= a && lin < b); }

  step(capture = false): StepRecord | null {
    if (this.finished()) return null;
    const c = this.cpu, snap = this.snapshot(), log: number[] = [];
    c.log = log;
    this.beginStep();
    const ins = decode(c);
    const pre = capture ? ins.ops.map(o => c.get(o)) : null;
    execute(c, ins);
    const values = pre ? { pre, post: ins.ops.map(o => c.get(o)) } : null;
    c.log = null;
    const record: StepRecord = { snap, log, ins, values };
    if (this.isWaiting()) {
      c.r.set(snap.r); c.s.set(snap.s); c.ip = snap.ip; c.flags = snap.flags;
      this.undo(log);
      return record;
    }
    this.steps++;
    this.history.push(record);
    if (this.history.length > HISTORY_MAX + HISTORY_TRIM) this.history.splice(0, HISTORY_TRIM);
    if (!this.finished() && !this.inRange(c.lin(c.s[S.CS], c.ip))) {
      this.notice = { code: "RUNAWAY", args: { ip: `${hex(c.s[S.CS])}:${hex(c.ip)}` }, fatal: true };
    }
    return record;
  }

  back(): boolean {
    const h = this.history.pop();
    if (!h) return false;
    this.undo(h.log);
    this.cpu.videoDirty = true;
    this.restore(h.snap);
    return true;
  }

  pressKey(ascii: number, scan = 0): void { this.keys.push({ a: ascii & 0xFF, s: scan & 0xFF }); }
  hasKey(): boolean { return this.keyPos < this.keys.length; }
  peekKey(): Key | null { return this.keys[this.keyPos] ?? null; }
  readKey(): Key {
    const k = this.keys.at(this.keyPos);
    if (!k) throw new Error("readKey called with an empty keyboard buffer");
    this.keyPos++;
    return k;
  }
  waitKey(): true { this.waiting = true; return true; }
  exit(code: number): void { this.exited = true; this.exitCode = code; }
}

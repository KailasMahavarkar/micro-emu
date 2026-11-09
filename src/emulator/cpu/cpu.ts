import { BYTE_MASK, MEMORY_SIZE, WORD_MASK, isVideoAddress, linear } from "../layout.ts";
import { F, FLAGS_FIXED, PARITY, R, S } from "./registers.ts";
import type { Operand, Width } from "./types.ts";

export type InterruptHook = (vector: number) => boolean;
export type PortIn = (port: number, w: Width) => number;
export type PortOut = (port: number, value: number, w: Width) => void;

const FLOATING_BUS_WORD = 0xFFFF;
const FLOATING_BUS_BYTE = 0xFF;
const HIGH_HALF = 4;
const VECTOR_SIZE = 4;

export class Cpu {
  readonly mem = new Uint8Array(MEMORY_SIZE);
  readonly r = new Uint16Array(8);
  readonly s = new Uint16Array(4);
  ip = 0;
  flags = FLAGS_FIXED;
  halted = false;
  log: number[] | null = null;
  videoDirty = true;
  lastVideo: number | null = null;
  intHook: InterruptHook | null = null;
  portIn: PortIn = (_port, w) => (w ? FLOATING_BUS_WORD : FLOATING_BUS_BYTE);
  portOut: PortOut = () => undefined;

  getF(mask: number): 0 | 1 { return this.flags & mask ? 1 : 0; }
  setF(mask: number, on: boolean | number): void {
    if (on) this.flags |= mask;
    else this.flags &= ~mask;
  }

  get8(i: number): number { return i < HIGH_HALF ? this.r[i] & BYTE_MASK : this.r[i - HIGH_HALF] >> 8; }
  set8(i: number, value: number): void {
    const v = value & BYTE_MASK;
    if (i < HIGH_HALF) this.r[i] = (this.r[i] & 0xFF00) | v;
    else this.r[i - HIGH_HALF] = (this.r[i - HIGH_HALF] & BYTE_MASK) | (v << 8);
  }

  lin(seg: number, off: number): number { return linear(seg, off); }
  rb(seg: number, off: number): number { return this.mem[linear(seg, off)]; }
  rw(seg: number, off: number): number { return this.rb(seg, off) | (this.rb(seg, off + 1) << 8); }
  wb(seg: number, off: number, value: number): void {
    const a = linear(seg, off);
    this.log?.push(a, this.mem[a]);
    if (isVideoAddress(a)) { this.videoDirty = true; this.lastVideo = a; }
    this.mem[a] = value & BYTE_MASK;
  }
  ww(seg: number, off: number, value: number): void { this.wb(seg, off, value); this.wb(seg, off + 1, value >> 8); }

  push(value: number): void { this.r[R.SP] = (this.r[R.SP] - 2) & WORD_MASK; this.ww(this.s[S.SS], this.r[R.SP], value); }
  pop(): number {
    const v = this.rw(this.s[S.SS], this.r[R.SP]);
    this.r[R.SP] = (this.r[R.SP] + 2) & WORD_MASK;
    return v;
  }
  fetchB(): number {
    const v = this.rb(this.s[S.CS], this.ip);
    this.ip = (this.ip + 1) & WORD_MASK;
    return v;
  }
  fetchW(): number {
    const lo = this.fetchB();
    return lo | (this.fetchB() << 8);
  }

  get(o: Operand): number | null {
    switch (o.kind) {
      case "reg": return o.w ? this.r[o.n] : this.get8(o.n);
      case "seg": return this.s[o.n];
      case "mem": return o.w ? this.rw(this.s[o.seg], o.off) : this.rb(this.s[o.seg], o.off);
      case "imm": return o.v;
      case "rel": case "far": return null;
    }
  }

  set(o: Operand, value: number): void {
    switch (o.kind) {
      case "reg": if (o.w) this.r[o.n] = value & WORD_MASK; else this.set8(o.n, value); break;
      case "seg": this.s[o.n] = value & WORD_MASK; break;
      case "mem": if (o.w) this.ww(this.s[o.seg], o.off, value); else this.wb(this.s[o.seg], o.off, value); break;
      case "imm": case "rel": case "far": break;
    }
  }

  szp(result: number, w: Width): void {
    this.setF(F.ZF, result === 0);
    this.setF(F.SF, (result & (w ? 0x8000 : 0x80)) !== 0);
    this.setF(F.PF, PARITY[result & BYTE_MASK]);
  }

  interrupt(vector: number): void {
    if (this.intHook?.(vector)) return;
    this.push(this.flags);
    this.setF(F.IF, false);
    this.setF(F.TF, false);
    this.push(this.s[S.CS]);
    this.push(this.ip);
    this.ip = this.rw(0, vector * VECTOR_SIZE);
    this.s[S.CS] = this.rw(0, vector * VECTOR_SIZE + 2);
  }
}

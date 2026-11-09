import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { Cpu, Machine, assemble, decode, disasm, execute, type Instruction, type Program } from "./index.ts";

interface LegacyProgram {
  mode: string;
  segments: { name: string; base: number; size: number; bytes: Uint8Array; stack: boolean }[];
  entry: { cs: number; ip: number };
  ss: number;
  sp: number;
  listing: { line: number; off: number; bytes: number[]; linear: number; kind: string }[];
  errors: { line: number; code: string; args: Record<string, string | number> }[];
}
interface LegacyCpu {
  mem: Uint8Array; r: Uint16Array; s: Uint16Array; ip: number; flags: number; halted: boolean; log: number[] | null;
  decode(): unknown;
  exec(ins: unknown): void;
}
interface LegacyMachine {
  cpu: LegacyCpu; waiting: boolean; exited: boolean; exitCode: number; done: boolean; steps: number; keyPos: number;
  notice: { code: string } | null;
  load(p: LegacyProgram): void;
  step(capture?: boolean): { pre?: unknown[]; post?: unknown[] } | null;
  back(): boolean;
  pressKey(a: number, s?: number): void;
}
interface LegacyCore {
  assemble(src: string): LegacyProgram;
  Machine: new () => LegacyMachine;
  CPU: new () => LegacyCpu;
  disasm(ins: unknown): string;
}

const require = createRequire(import.meta.url);
// The legacy files are untyped CommonJS kept only as the parity oracle for this refactor.
const legacy = require("../../legacy/src/core.js") as LegacyCore;
const { EXAMPLES } = require("../../legacy/src/examples.js") as { EXAMPLES: { id: string; src: string }[] };
const coverage = readFileSync(new URL("./coverage.asm", import.meta.url), "utf8");

const EXTRA_SOURCES: Record<string, string> = {
  coverage,
  directives: `org 100h
msg db 'Hi there'
len equ $ - msg
tbl db 2 dup(1, 2 dup(9))
w dw tbl, -1
dd1 dd 12345678h
arr label byte
    db 7
start:
    mov cx, len
    mov al, arr
    mov bx, offset w
    mov dx, seg msg
    jmp short done
    nop
done:
    call far_proc
    ret
far_proc proc far
    ret
far_proc endp`,
  localMacro: `include 'emu8086.inc'
org 100h
twice macro x
    local again
again:
    add ax, x
    add ax, x
endm
    twice 2
    twice 3
    printn 'ok'
    ret`,
  exeModel: `.model small
.stack 200h
.data
a dw 1234h
b db 'xy'
.code
start:
    mov ax, @data
    mov ds, ax
    mov ax, a
    mov bl, b+1
    mov ah, 4Ch
    int 21h
end start`,
  errors: ["mov [bx], [si]", "mov ds, 1234h", "mul 5", "shl ax, 3", "push 5", "push al", "mov ax, bl", "mov [bx], 5",
    "mov ax, [ax]", "mov ax, [si+di]", "movv ax, 1", "jmp nowhere", "mov al, 300", "mov cs, ax", "mov es, ds", "pop cs",
    "in bl, 60h", "lea ax, bx", "x: x: nop", "ax db 1", "db 'a', 999", "jz far_label\nfar_label equ 5"].join("\n"),
  jumpRange: `org 100h\nstart: jz target\n${"nop\n".repeat(200)}target: ret\n`
};

const SOURCES: [string, string][] = [...EXAMPLES.map((e): [string, string] => [e.id, e.src]), ...Object.entries(EXTRA_SOURCES)];
const KEYS = "12\r30\rabc Z1\r";
const FAR_POINTER_OPS: ReadonlySet<string> = new Set(["LES", "LDS", "CALLF", "JMPF"]);
const MAX_STEPS = 6000;
const BACK_STEPS = 400;

const programShape = (p: Program | LegacyProgram): unknown => ({
  mode: p.mode,
  segments: p.segments.map(s => ({ name: s.name, base: s.base, size: s.size, bytes: [...s.bytes], stack: s.stack })),
  entry: p.entry, ss: p.ss, sp: p.sp,
  listing: p.listing.map(l => [l.line, l.off, l.linear, l.kind, l.bytes.join(",")]),
  errors: p.errors.map(e => [e.line, e.code, JSON.stringify(e.args)])
});

const cpuState = (c: { r: Uint16Array; s: Uint16Array; ip: number; flags: number; halted: boolean }): unknown =>
  [[...c.r], [...c.s], c.ip, c.flags, c.halted];

const hashMem = (mem: Uint8Array): number => {
  let h = 2166136261;
  for (const b of mem) h = Math.imul(h ^ b, 16777619);
  return h >>> 0;
};

const normalizeValues = (values: readonly unknown[] | undefined): unknown[] => (values ?? []).map(v => v ?? null);

describe("TypeScript emulator matches the legacy emulator", () => {
  it.each(SOURCES)("assembles %s identically", (_id, src) => {
    expect(programShape(assemble(src))).toEqual(programShape(legacy.assemble(src)));
  });

  it.each(SOURCES)("runs %s step by step identically, then steps back identically", (_id, src) => {
    const oldProg = legacy.assemble(src), newProg = assemble(src);
    if (newProg.errors.length) return;
    const a = new legacy.Machine(), b = new Machine();
    a.load(oldProg);
    b.load(newProg);
    for (const ch of KEYS) { const scan = ch === "\r" ? 0x1C : 0x10; a.pressKey(ch.charCodeAt(0), scan); b.pressKey(ch.charCodeAt(0), scan); }
    for (let n = 0; n < MAX_STEPS && !a.done; n++) {
      const oldIns = a.step(true), rec = b.step(true);
      expect(rec?.values?.pre ?? []).toEqual(normalizeValues(oldIns?.pre));
      expect(rec?.values?.post ?? []).toEqual(normalizeValues(oldIns?.post));
      expect([cpuState(b.cpu), b.isWaiting(), b.exited, b.exitCode, b.steps, b.keyPos, b.notice?.code ?? null])
        .toEqual([cpuState(a.cpu), a.waiting, a.exited, a.exitCode, a.steps, a.keyPos, a.notice?.code ?? null]);
      if (a.waiting) break;
    }
    expect(b.finished()).toBe(a.done);
    expect(hashMem(b.cpu.mem)).toBe(hashMem(a.cpu.mem));
    for (let n = 0; n < BACK_STEPS && a.back(); n++) {
      expect(b.back()).toBe(true);
      expect(cpuState(b.cpu)).toEqual(cpuState(a.cpu));
    }
    expect(hashMem(b.cpu.mem)).toBe(hashMem(a.cpu.mem));
  });

  it("decodes, disassembles and executes 60,000 random instructions identically", () => {
    let seed = 0x8086;
    const rand = (): number => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed >>> 8; };
    const CODE = 0x10000, DATA_SPAN = 0x400;
    for (let n = 0; n < 60_000; n++) {
      const a = new legacy.CPU(), b = new Cpu();
      for (const c of [a, b]) c.mem.fill(0, 0, 0x20000);
      for (let i = 0; i < DATA_SPAN; i++) { const v = rand() & 0xFF; a.mem[i] = v; b.mem[i] = v; a.mem[CODE + i] = v; b.mem[CODE + i] = v; }
      for (let i = 0; i < 8; i++) { const v = rand() & 0xFFFF; a.r[i] = v; b.r[i] = v; }
      for (let i = 0; i < 4; i++) { const v = (rand() & 0x3F) * 0x10; a.s[i] = v; b.s[i] = v; }
      a.s[1] = CODE >> 4; b.s[1] = CODE >> 4;
      const ip = rand() & 0x1FF, flags = (rand() & 0x0FD5) | 0xF002;
      a.ip = ip; b.ip = ip; a.flags = flags; b.flags = flags;
      if ((rand() & 3) === 0) { a.r[1] &= 0x1F; b.r[1] &= 0x1F; }
      a.log = []; b.log = [];
      const oldIns = a.decode(), newIns: Instruction = decode(b);
      expect(disasm(newIns)).toBe(legacy.disasm(oldIns));
      if (FAR_POINTER_OPS.has(newIns.mn) && newIns.ops.some(o => o.kind === "reg")) continue;
      a.exec(oldIns);
      execute(b, newIns);
      expect(cpuState(b)).toEqual(cpuState(a));
      expect(b.log).toEqual(a.log);
    }
  });
});

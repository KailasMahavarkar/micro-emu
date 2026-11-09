import { signed16 } from "../hex.ts";
import { LOAD_SEG } from "../layout.ts";
import { REG16, S } from "../cpu/registers.ts";
import { JCC, type Width } from "../cpu/types.ts";
import { fail } from "./errors.ts";
import { argSize, SHIFT_BY_ONE, type Arg, type ImmArg } from "./operand.ts";
import { ALU_INDEX, GRP3_INDEX, JCC_CODES, LOOP_CODES, POINTER_LOAD, RM_CODE, SHIFT_INDEX, SIMPLE } from "./tables.ts";

export type AsmMode = "com" | "exe";

export interface EncodeContext {
  readonly final: boolean;
  readonly mode: AsmMode;
  here(): number;
  segValue(name: string): number;
  inFarProc(): boolean;
}

const DIRECT_RM = 6;
const BP_RM = 6;
const MOD_DISP8 = 0x40;
const MOD_DISP16 = 0x80;
const MOD_REG = 0xC0;
const DEFAULT_AAM_BASE = 0x0A;
const BREAKPOINT_INT = 3;
const SHORT_JUMP_SIZE = 2;
const NEAR_JUMP_SIZE = 3;

const imm16 = (v: number): number[] => [v & 0xFF, (v >> 8) & 0xFF];
const immW = (v: number, w: Width): number[] => (w ? imm16(v) : [v & 0xFF]);
const fitsS8 = (v: number): boolean => { const x = v & 0xFFFF; return x <= 0x7F || x >= 0xFF80; };
const inS8 = (d: number): boolean => d >= -128 && d <= 127;

const segPrefix = (o: Arg): number[] => {
  if (o.k !== "m" || o.seg < 0) return [];
  const def = o.regs.includes("BP") ? S.SS : S.DS;
  return o.seg === def ? [] : [0x26 | (o.seg << 3)];
};

const modrm = (reg: number, o: Arg): number[] => {
  if (o.k === "r") return [MOD_REG | (reg << 3) | o.n];
  if (o.k !== "m") return fail("OPERANDS", {});
  const key = [...o.regs].sort().join("+");
  if (!key) return [(reg << 3) | DIRECT_RM, ...imm16(o.disp)];
  const rm = RM_CODE[key];
  if (rm === undefined) return fail("BAD_ADDR", { x: o.text });
  const d = signed16(o.disp & 0xFFFF);
  if (!o.fwd && d === 0 && rm !== BP_RM) return [(reg << 3) | rm];
  if (!o.fwd && inS8(d)) return [MOD_DISP8 | (reg << 3) | rm, d & 0xFF];
  return [MOD_DISP16 | (reg << 3) | rm, ...imm16(o.disp)];
};

const wordFlag = (mn: string, size: number): Width => {
  if (!size) fail("SIZE_UNKNOWN", { mn });
  if (size > 2) fail("OPERANDS", { mn });
  return size === 2 ? 1 : 0;
};
const sameSize = (mn: string, a: Arg, b: Arg): Width => {
  const x = argSize(a), y = argSize(b);
  if (x && y && x !== y) fail("SIZE_MISMATCH", { mn, a: a.text, b: b.text, sa: x, sb: y });
  return wordFlag(mn, x || y);
};
const sizeOf = (mn: string, d: Arg): Width => wordFlag(mn, argSize(d));

const checkImm = (i: ImmArg, w: Width): void => {
  if (i.fwd) return;
  if (w ? i.v < -0x8000 || i.v > 0xFFFF : i.v < -0x80 || i.v > 0xFF) fail("IMM_RANGE", { v: i.text, bits: w ? 16 : 8 });
};
const count = (mn: string, ops: readonly Arg[], n: number): void => {
  if (ops.length !== n) fail("OPERAND_COUNT", { mn, n, got: ops.length });
};
const two = (mn: string, ops: readonly Arg[]): [Arg, Arg] => {
  count(mn, ops, 2);
  return [ops[0], ops[1]];
};
const one = (mn: string, ops: readonly Arg[]): Arg => {
  count(mn, ops, 1);
  return ops[0];
};
const imm = (mn: string, o: Arg): ImmArg => (o.k === "i" ? o : fail("OPERANDS", { mn }));

class Encoder {
  constructor(private readonly ctx: EncodeContext) {}

  rel(mn: string, t: ImmArg, size: number): number {
    const d = t.v - (this.ctx.here() + size);
    if (this.ctx.final && !inS8(d)) {
      const cc = JCC_CODES[mn];
      fail("JUMP_RANGE", { mn, label: t.text, d, inv: cc !== undefined ? JCC[cc ^ 1] : "" });
    }
    return d & 0xFF;
  }

  mov(mn: string, ops: readonly Arg[]): number[] {
    const [d, s] = two(mn, ops);
    if (d.k === "m" && s.k === "m") fail("TWO_MEM", { mn });
    if (d.k === "i") fail("DEST_IMM", { mn });
    if (d.k === "s") {
      if (s.k === "i") fail("SEG_IMM", { x: d.text });
      if (s.k === "s") fail("SEG_SEG", {});
      if (d.n === S.CS) fail("MOV_CS", {});
      if (argSize(s) === 1) fail("SIZE_MISMATCH", { mn, a: d.text, b: s.text, sa: 2, sb: 1 });
      return [...segPrefix(s), 0x8E, ...modrm(d.n, s)];
    }
    if (s.k === "s") {
      if (argSize(d) === 1) fail("SIZE_MISMATCH", { mn, a: d.text, b: s.text, sa: 1, sb: 2 });
      return [...segPrefix(d), 0x8C, ...modrm(s.n, d)];
    }
    if (s.k === "i") {
      const w = sizeOf(mn, d);
      checkImm(s, w);
      if (d.k === "r") return w ? [0xB8 + d.n, ...imm16(s.v)] : [0xB0 + d.n, s.v & 0xFF];
      return [...segPrefix(d), 0xC6 | w, ...modrm(0, d), ...immW(s.v, w)];
    }
    const w = sameSize(mn, d, s);
    if (d.k === "r" && s.k === "r") return [0x8A | w, MOD_REG | (d.n << 3) | s.n];
    if (d.k === "r" && d.n === 0 && s.k === "m" && !s.regs.length) return [...segPrefix(s), 0xA0 | w, ...imm16(s.disp)];
    if (s.k === "r" && s.n === 0 && d.k === "m" && !d.regs.length) return [...segPrefix(d), 0xA2 | w, ...imm16(d.disp)];
    if (d.k === "r") return [...segPrefix(s), 0x8A | w, ...modrm(d.n, s)];
    return [...segPrefix(d), 0x88 | w, ...modrm(this.regOf(s), d)];
  }

  regOf(o: Arg): number { return o.k === "r" || o.k === "s" ? o.n : fail("OPERANDS", {}); }

  alu(mn: string, ops: readonly Arg[], op: number): number[] {
    const [d, s] = two(mn, ops);
    if (d.k === "m" && s.k === "m") fail("TWO_MEM", { mn });
    if (d.k === "i") fail("DEST_IMM", { mn });
    if (d.k === "s" || s.k === "s") fail("SEG_ALU", { mn });
    if (s.k === "i") {
      const w = sizeOf(mn, d);
      checkImm(s, w);
      if (d.k === "r" && d.n === 0) return w ? [op * 8 + 5, ...imm16(s.v)] : [op * 8 + 4, s.v & 0xFF];
      if (w && !s.fwd && fitsS8(s.v)) return [...segPrefix(d), 0x83, ...modrm(op, d), s.v & 0xFF];
      return [...segPrefix(d), 0x80 | w, ...modrm(op, d), ...immW(s.v, w)];
    }
    const w = sameSize(mn, d, s);
    if (d.k === "r") return [...segPrefix(s), op * 8 + 2 + w, ...modrm(d.n, s)];
    return [...segPrefix(d), op * 8 + w, ...modrm(this.regOf(s), d)];
  }

  test(mn: string, ops: readonly Arg[]): number[] {
    const [d, s] = two(mn, ops);
    if (d.k === "m" && s.k === "m") fail("TWO_MEM", { mn });
    if (d.k === "s" || s.k === "s") fail("SEG_ALU", { mn });
    if (s.k === "i") {
      const w = sizeOf(mn, d);
      checkImm(s, w);
      if (d.k === "r" && d.n === 0) return w ? [0xA9, ...imm16(s.v)] : [0xA8, s.v & 0xFF];
      return [...segPrefix(d), 0xF6 | w, ...modrm(0, d), ...immW(s.v, w)];
    }
    if (d.k === "i") fail("DEST_IMM", { mn });
    const w = sameSize(mn, d, s);
    return s.k === "r" ? [...segPrefix(d), 0x84 | w, ...modrm(s.n, d)] : [...segPrefix(s), 0x84 | w, ...modrm(this.regOf(d), s)];
  }

  xchg(mn: string, ops: readonly Arg[]): number[] {
    const [d, s] = two(mn, ops);
    if (d.k === "m" && s.k === "m") fail("TWO_MEM", { mn });
    if (d.k === "i" || s.k === "i" || d.k === "s" || s.k === "s") fail("OPERANDS", { mn });
    const w = sameSize(mn, d, s);
    if (w && d.k === "r" && s.k === "r" && (d.n === 0 || s.n === 0)) return [0x90 + (d.n === 0 ? s.n : d.n)];
    const reg = d.k === "r" ? d : s, other = reg === d ? s : d;
    return [...segPrefix(other), 0x86 | w, ...modrm(this.regOf(reg), other)];
  }

  incDec(mn: string, ops: readonly Arg[]): number[] {
    const d = one(mn, ops);
    if (d.k === "i" || d.k === "s") fail("OPERANDS", { mn });
    if (d.k === "r" && d.w) return [(mn === "INC" ? 0x40 : 0x48) + d.n];
    const w = sizeOf(mn, d);
    return [...segPrefix(d), 0xFE | w, ...modrm(mn === "INC" ? 0 : 1, d)];
  }

  group3(mn: string, ops: readonly Arg[], sub: number): number[] {
    const first = ops.at(0);
    if (first?.k === "i" && mn !== "NOT" && mn !== "NEG") fail("MUL_IMM", { mn, v: first.text });
    const d = one(mn, ops);
    if (d.k === "i" || d.k === "s") fail("OPERANDS", { mn });
    const w = sizeOf(mn, d);
    return [...segPrefix(d), 0xF6 | w, ...modrm(sub, d)];
  }

  shift(mn: string, given: readonly Arg[], sub: number): number[] {
    const ops = given.length === 1 ? [given[0], SHIFT_BY_ONE] : given;
    const [d, c] = two(mn, ops);
    if (d.k === "i" || d.k === "s") fail("OPERANDS", { mn });
    const w = sizeOf(mn, d);
    if (c.k === "i") {
      if (c.v !== 1) fail("SHIFT_COUNT", { mn, x: d.text, v: c.text });
      return [...segPrefix(d), 0xD0 | w, ...modrm(sub, d)];
    }
    if (c.k === "r" && !c.w && c.n === 1) return [...segPrefix(d), 0xD2 | w, ...modrm(sub, d)];
    return fail("SHIFT_COUNT", { mn, x: d.text, v: c.text });
  }

  pushPop(mn: string, ops: readonly Arg[]): number[] {
    const d = one(mn, ops), push = mn === "PUSH";
    if (d.k === "i") fail(push ? "PUSH_IMM" : "OPERANDS", { mn, v: d.text });
    if (d.k === "r") {
      if (!d.w) fail("PUSH_8", { mn, x: d.text, y: REG16[d.n & 3] });
      return [(push ? 0x50 : 0x58) + d.n];
    }
    if (d.k === "s") {
      if (!push && d.n === S.CS) fail("POP_CS", {});
      return [(push ? 0x06 : 0x07) | (d.n << 3)];
    }
    if (d.k === "m" && d.size === 1) fail("PUSH_8", { mn, x: d.text, y: "AX" });
    return push ? [...segPrefix(d), 0xFF, ...modrm(6, d)] : [...segPrefix(d), 0x8F, ...modrm(0, d)];
  }

  pointer(mn: string, ops: readonly Arg[], opcode: number): number[] {
    const [d, s] = two(mn, ops);
    if (d.k !== "r" || !d.w || s.k !== "m") return fail("OPERANDS", { mn });
    return [...(mn === "LEA" ? [] : segPrefix(s)), opcode, ...modrm(d.n, s)];
  }

  io(mn: string, ops: readonly Arg[]): number[] {
    const pair = two(mn, ops);
    const [a, b] = mn === "IN" ? pair : [pair[1], pair[0]];
    if (a.k !== "r" || a.n !== 0) return fail("IO_ACC", { mn });
    if (b.k === "i") return [(mn === "IN" ? 0xE4 : 0xE6) | a.w, b.v & 0xFF];
    if (b.k === "r" && b.w && b.n === 2) return [(mn === "IN" ? 0xEC : 0xEE) | a.w];
    return fail("IO_ACC", { mn });
  }

  ret(mn: string, ops: readonly Arg[]): number[] {
    const far = mn === "RETF" || (mn === "RET" && this.ctx.inFarProc());
    const bytes = ops.at(0);
    if (!bytes) return [far ? 0xCB : 0xC3];
    return [far ? 0xCA : 0xC2, ...imm16(imm(mn, bytes).v)];
  }

  jumpOrCall(mn: string, ops: readonly Arg[]): number[] {
    const t = one(mn, ops), call = mn === "CALL";
    if (t.k === "r" || t.k === "m") {
      if (t.k === "r" && !t.w) fail("OPERANDS", { mn });
      const far = t.k === "m" && t.size === 4;
      return [...segPrefix(t), 0xFF, ...modrm(call ? (far ? 3 : 2) : far ? 5 : 4, t)];
    }
    if (t.k !== "i") return fail("JUMP_TARGET", { mn });
    if (t.dist === "FAR" || (call && t.sym?.kind === "label" && t.sym.far)) {
      const seg = this.ctx.mode === "com" ? LOAD_SEG : t.sym ? this.ctx.segValue(t.sym.seg) : 0;
      return [call ? 0x9A : 0xEA, ...imm16(t.v), ...imm16(seg)];
    }
    const shortD = t.v - (this.ctx.here() + SHORT_JUMP_SIZE);
    if (!call && (t.dist === "SHORT" || (!t.fwd && t.dist !== "NEAR" && inS8(shortD)))) return [0xEB, this.rel(mn, t, SHORT_JUMP_SIZE)];
    return [call ? 0xE8 : 0xE9, ...imm16(t.v - (this.ctx.here() + NEAR_JUMP_SIZE))];
  }

  encode(mn: string, ops: readonly Arg[], prefixes: readonly number[]): number[] {
    const simple = SIMPLE[mn];
    if (simple !== undefined) {
      if (ops.length) fail("OPERAND_COUNT", { mn, n: 0, got: ops.length });
      return [...prefixes, simple];
    }
    if (mn === "AAM" || mn === "AAD") {
      const base = ops.at(0);
      return [mn === "AAM" ? 0xD4 : 0xD5, base ? imm(mn, base).v & 0xFF : DEFAULT_AAM_BASE];
    }
    if (mn === "MOV") return this.mov(mn, ops);
    const alu = ALU_INDEX[mn];
    if (alu !== undefined) return this.alu(mn, ops, alu);
    if (mn === "TEST") return this.test(mn, ops);
    if (mn === "XCHG") return this.xchg(mn, ops);
    if (mn === "INC" || mn === "DEC") return this.incDec(mn, ops);
    const g3 = GRP3_INDEX[mn];
    if (g3 !== undefined) return this.group3(mn, ops, g3);
    const sh = SHIFT_INDEX[mn];
    if (sh !== undefined) return this.shift(mn, ops, sh);
    if (mn === "PUSH" || mn === "POP") return this.pushPop(mn, ops);
    const pointer = POINTER_LOAD[mn];
    if (pointer !== undefined) return this.pointer(mn, ops, pointer);
    if (mn === "INT") {
      const n = imm(mn, one(mn, ops)).v;
      return n === BREAKPOINT_INT ? [0xCC] : [0xCD, n & 0xFF];
    }
    if (mn === "IN" || mn === "OUT") return this.io(mn, ops);
    if (mn === "RET" || mn === "RETN" || mn === "RETF") return this.ret(mn, ops);
    const cc = JCC_CODES[mn], loop = LOOP_CODES[mn];
    if (cc !== undefined || loop !== undefined) {
      const t = one(mn, ops);
      if (t.k !== "i") return fail("JUMP_TARGET", { mn });
      return [cc !== undefined ? 0x70 + cc : loop ?? 0, this.rel(mn, t, SHORT_JUMP_SIZE)];
    }
    if (mn === "JMP" || mn === "CALL") return this.jumpOrCall(mn, ops);
    return fail("UNKNOWN_MN", { x: mn });
  }
}

export const encode = (ctx: EncodeContext, mn: string, ops: readonly Arg[], prefixes: readonly number[]): number[] =>
  new Encoder(ctx).encode(mn, ops, prefixes);

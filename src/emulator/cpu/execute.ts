import { BYTE_MASK, WORD_MASK } from "../layout.ts";
import { signed16, signed8 } from "../hex.ts";
import type { Cpu } from "./cpu.ts";
import { decode } from "./decode.ts";
import { F, FLAGS_FIXED, FLAGS_RESERVED_ONE, FLAGS_WRITABLE, LOW_BYTE_FLAGS, R, R8, S, SAHF_MASK } from "./registers.ts";
import {
  JCC, REPE, type AluOp, type Instruction, type JccOp, type MemOperand, type Operand, type ShiftOp, type StringOp, type Width
} from "./types.ts";

type ArithOp = AluOp | "TEST";
const DIVIDE_ERROR = 0;
const OVERFLOW_INT = 4;
const BCD_LOW_LIMIT = 9;
const BCD_ADJUST = 6;
const BCD_HIGH_ADJUST = 0x60;
const DAA_HIGH = 0x99;
const DAA_HIGH_WITH_AF = 0x9F;
const NIBBLE = 0x0F;
const AF_BIT = 0x10;
const WORD_RANGE = 0x10000;
const JCC_INDEX = Object.fromEntries(JCC.map((mn, i) => [mn, i])) as Record<JccOp, number>;

const signOf = (w: Width): number => (w ? 0x8000 : 0x80);
const maskOf = (w: Width): number => (w ? WORD_MASK : BYTE_MASK);

const value = (cpu: Cpu, o: Operand): number => cpu.get(o) ?? 0;
const operand = (ins: Instruction, i: number): Operand => {
  const o = ins.ops.at(i);
  if (!o) throw new Error(`${ins.mn} decoded without operand ${i}`);
  return o;
};
const widthOf = (o: Operand): Width => ("w" in o ? o.w : 1);
const targetOf = (cpu: Cpu, o: Operand): number => (o.kind === "rel" ? o.target : value(cpu, o));

export const arith = (cpu: Cpu, mn: ArithOp, a: number, b: number, w: Width): number => {
  const mask = maskOf(w), sign = signOf(w), carry = cpu.getF(F.CF);
  let res: number;
  switch (mn) {
    case "ADD": case "ADC":
      res = a + b + (mn === "ADC" ? carry : 0);
      cpu.setF(F.CF, res > mask);
      cpu.setF(F.OF, ((a ^ res) & (b ^ res) & sign) !== 0);
      cpu.setF(F.AF, ((a ^ b ^ res) & AF_BIT) !== 0);
      break;
    case "SUB": case "SBB": case "CMP":
      res = a - b - (mn === "SBB" ? carry : 0);
      cpu.setF(F.CF, res < 0);
      cpu.setF(F.OF, ((a ^ b) & (a ^ res) & sign) !== 0);
      cpu.setF(F.AF, ((a ^ b ^ res) & AF_BIT) !== 0);
      break;
    case "OR": case "XOR": case "AND": case "TEST":
      res = mn === "OR" ? a | b : mn === "XOR" ? a ^ b : a & b;
      cpu.setF(F.CF, false);
      cpu.setF(F.OF, false);
      cpu.setF(F.AF, false);
  }
  res &= mask;
  cpu.szp(res, w);
  return res;
};

const shiftOnce = (mn: ShiftOp, res: number, cf: number, mask: number, sign: number): [number, number] => {
  switch (mn) {
    case "ROL": { const out = res & sign ? 1 : 0; return [((res << 1) | out) & mask, out]; }
    case "ROR": { const out = res & 1; return [(res >> 1) | (out ? sign : 0), out]; }
    case "RCL": return [((res << 1) | cf) & mask, res & sign ? 1 : 0];
    case "RCR": return [(res >> 1) | (cf ? sign : 0), res & 1];
    case "SHL": return [(res << 1) & mask, res & sign ? 1 : 0];
    case "SETMO": return [mask, 0];
    case "SHR": return [res >> 1, res & 1];
    case "SAR": return [(res >> 1) | (res & sign), res & 1];
  }
};

const shift = (cpu: Cpu, mn: ShiftOp, a: number, count: number, w: Width): number => {
  if (count === 0) return a;
  const mask = maskOf(w), sign = signOf(w);
  let res = a, cf: number = cpu.getF(F.CF);
  for (let i = 0; i < count; i++) [res, cf] = shiftOnce(mn, res, cf, mask, sign);
  cpu.setF(F.CF, cf);
  if (mn === "ROL" || mn === "RCL" || mn === "SHL") cpu.setF(F.OF, ((res & sign ? 1 : 0) ^ cf) === 1);
  else cpu.setF(F.OF, ((res ^ (res << 1)) & sign) !== 0);
  if (mn === "SHL" || mn === "SHR" || mn === "SAR" || mn === "SETMO") { cpu.szp(res, w); cpu.setF(F.AF, false); }
  return res;
};

const multiply = (cpu: Cpu, signed: boolean, src: number, w: Width): void => {
  if (w) {
    const res = signed ? signed16(cpu.r[R.AX]) * signed16(src) : cpu.r[R.AX] * src;
    cpu.r[R.AX] = res & WORD_MASK;
    cpu.r[R.DX] = Math.floor(res / WORD_RANGE) & WORD_MASK;
    const over = signed ? res < -0x8000 || res > 0x7FFF : cpu.r[R.DX] !== 0;
    cpu.setF(F.CF, over);
    cpu.setF(F.OF, over);
    return;
  }
  const res = signed ? signed8(cpu.r[R.AX]) * signed8(src) : (cpu.r[R.AX] & BYTE_MASK) * src;
  cpu.r[R.AX] = res & WORD_MASK;
  const over = signed ? res < -0x80 || res > 0x7F : (res & 0xFF00) !== 0;
  cpu.setF(F.CF, over);
  cpu.setF(F.OF, over);
};

const divide = (cpu: Cpu, signed: boolean, src: number, w: Width, rep: boolean): void => {
  if (src === 0) { cpu.interrupt(DIVIDE_ERROR); return; }
  if (w && !signed) {
    const n = cpu.r[R.DX] * WORD_RANGE + cpu.r[R.AX], q = Math.floor(n / src);
    if (q > WORD_MASK) { cpu.interrupt(DIVIDE_ERROR); return; }
    cpu.r[R.AX] = q;
    cpu.r[R.DX] = n % src;
  } else if (w) {
    const n = (cpu.r[R.DX] << 16) | cpu.r[R.AX], d = signed16(src), raw = Math.trunc(n / d), q = rep ? -raw : raw;
    if (raw > 0x7FFF || raw < -0x7FFF) { cpu.interrupt(DIVIDE_ERROR); return; }
    cpu.r[R.AX] = q & WORD_MASK;
    cpu.r[R.DX] = (n % d) & WORD_MASK;
  } else if (!signed) {
    const n = cpu.r[R.AX], q = Math.floor(n / src);
    if (q > BYTE_MASK) { cpu.interrupt(DIVIDE_ERROR); return; }
    cpu.r[R.AX] = ((n % src) << 8) | q;
  } else {
    const n = signed16(cpu.r[R.AX]), d = signed8(src), raw = Math.trunc(n / d), q = rep ? -raw : raw;
    if (raw > 0x7F || raw < -0x7F) { cpu.interrupt(DIVIDE_ERROR); return; }
    cpu.r[R.AX] = (((n % d) & BYTE_MASK) << 8) | (q & BYTE_MASK);
  }
};

const condition = (cpu: Cpu, cc: number): boolean => {
  const f = cpu.flags, sfNeOf = !(f & F.SF) !== !(f & F.OF);
  const tests = [f & F.OF, f & F.CF, f & F.ZF, f & (F.CF | F.ZF), f & F.SF, f & F.PF, sfNeOf, (f & F.ZF) || sfNeOf];
  const r = Boolean(tests[cc >> 1]);
  return cc & 1 ? !r : r;
};

const stringStep = (cpu: Cpu, ins: Instruction, mn: StringOp): void => {
  const w = ins.w, size = w ? 2 : 1, d = cpu.getF(F.DF) ? -size : size, src = ins.seg >= 0 ? ins.seg : S.DS;
  const read = (seg: number, off: number): number => (w ? cpu.rw(seg, off) : cpu.rb(seg, off));
  const write = (off: number, v: number): void => { if (w) cpu.ww(cpu.s[S.ES], off, v); else cpu.wb(cpu.s[S.ES], off, v); };
  const acc = w ? cpu.r[R.AX] : cpu.r[R.AX] & BYTE_MASK;
  switch (mn) {
    case "MOVS": write(cpu.r[R.DI], read(cpu.s[src], cpu.r[R.SI])); cpu.r[R.SI] += d; cpu.r[R.DI] += d; break;
    case "CMPS": arith(cpu, "CMP", read(cpu.s[src], cpu.r[R.SI]), read(cpu.s[S.ES], cpu.r[R.DI]), w); cpu.r[R.SI] += d; cpu.r[R.DI] += d; break;
    case "STOS": write(cpu.r[R.DI], acc); cpu.r[R.DI] += d; break;
    case "LODS": { const v = read(cpu.s[src], cpu.r[R.SI]); if (w) cpu.r[R.AX] = v; else cpu.set8(R8.AL, v); cpu.r[R.SI] += d; break; }
    case "SCAS": arith(cpu, "CMP", acc, read(cpu.s[S.ES], cpu.r[R.DI]), w); cpu.r[R.DI] += d; break;
  }
};

const stringOp = (cpu: Cpu, ins: Instruction, mn: StringOp): void => {
  if (!ins.rep) { stringStep(cpu, ins, mn); return; }
  const compare = mn === "CMPS" || mn === "SCAS";
  while (cpu.r[R.CX] !== 0) {
    stringStep(cpu, ins, mn);
    cpu.r[R.CX]--;
    if (compare && (ins.rep === REPE ? !cpu.getF(F.ZF) : cpu.getF(F.ZF))) break;
  }
};

const decimalAdjust = (cpu: Cpu, subtract: boolean): void => {
  const al = cpu.get8(R8.AL), cf = cpu.getF(F.CF), afIn = cpu.getF(F.AF);
  let v = al, af = 0, c = 0;
  if ((al & NIBBLE) > BCD_LOW_LIMIT || afIn) { v = subtract ? v - BCD_ADJUST : v + BCD_ADJUST; af = 1; }
  if (al > (afIn ? DAA_HIGH_WITH_AF : DAA_HIGH) || cf) { v = subtract ? v - BCD_HIGH_ADJUST : v + BCD_HIGH_ADJUST; c = 1; }
  v &= BYTE_MASK;
  cpu.set8(R8.AL, v);
  cpu.setF(F.AF, af);
  cpu.setF(F.CF, c);
  cpu.szp(v, 0);
};

const asciiAdjust = (cpu: Cpu, up: boolean): void => {
  if ((cpu.get8(R8.AL) & NIBBLE) > BCD_LOW_LIMIT || cpu.getF(F.AF)) {
    cpu.set8(R8.AL, cpu.get8(R8.AL) + (up ? BCD_ADJUST : -BCD_ADJUST));
    cpu.set8(R8.AH, cpu.get8(R8.AH) + (up ? 1 : -1));
    cpu.setF(F.AF, true);
    cpu.setF(F.CF, true);
  } else {
    cpu.setF(F.AF, false);
    cpu.setF(F.CF, false);
  }
  cpu.set8(R8.AL, cpu.get8(R8.AL) & NIBBLE);
};

const farPointer = (cpu: Cpu, m: MemOperand): { seg: number; off: number } => {
  const seg = cpu.s[m.seg];
  return { off: cpu.rw(seg, m.off), seg: cpu.rw(seg, m.off + 2) };
};

const farTarget = (cpu: Cpu, o: Operand): { seg: number; off: number } | null => {
  if (o.kind === "far") return { seg: o.seg, off: o.off };
  return o.kind === "mem" ? farPointer(cpu, o) : null;
};

const releaseStack = (cpu: Cpu, ins: Instruction): void => {
  const bytes = ins.ops.at(0);
  if (bytes?.kind === "imm") cpu.r[R.SP] = (cpu.r[R.SP] + bytes.v) & WORD_MASK;
};

const loop = (cpu: Cpu, ins: Instruction, extra: boolean): void => {
  cpu.r[R.CX]--;
  if (cpu.r[R.CX] !== 0 && extra) cpu.ip = targetOf(cpu, operand(ins, 0));
};

export const execute = (cpu: Cpu, ins: Instruction): void => {
  const mn = ins.mn;
  switch (mn) {
    case "ADD": case "OR": case "ADC": case "SBB": case "AND": case "SUB": case "XOR": case "CMP": case "TEST": {
      const d = operand(ins, 0), res = arith(cpu, mn, value(cpu, d), value(cpu, operand(ins, 1)), widthOf(d));
      if (mn !== "CMP" && mn !== "TEST") cpu.set(d, res);
      break;
    }
    case "INC": case "DEC": {
      const d = operand(ins, 0), cf = cpu.getF(F.CF);
      cpu.set(d, arith(cpu, mn === "INC" ? "ADD" : "SUB", value(cpu, d), 1, widthOf(d)));
      cpu.setF(F.CF, cf);
      break;
    }
    case "NOT": { const d = operand(ins, 0); cpu.set(d, ~value(cpu, d)); break; }
    case "NEG": { const d = operand(ins, 0); cpu.set(d, arith(cpu, "SUB", 0, value(cpu, d), widthOf(d))); break; }
    case "ROL": case "ROR": case "RCL": case "RCR": case "SHL": case "SHR": case "SAR": case "SETMO": {
      const d = operand(ins, 0), count = operand(ins, 1).kind === "imm" ? 1 : cpu.get8(R8.CL);
      cpu.set(d, shift(cpu, mn, value(cpu, d), count, widthOf(d)));
      break;
    }
    case "MUL": case "IMUL": { const s = operand(ins, 0); multiply(cpu, mn === "IMUL", value(cpu, s), widthOf(s)); break; }
    case "DIV": case "IDIV": { const s = operand(ins, 0); divide(cpu, mn === "IDIV", value(cpu, s), widthOf(s), ins.rep !== 0); break; }
    case "MOV": cpu.set(operand(ins, 0), value(cpu, operand(ins, 1))); break;
    case "XCHG": {
      const a = operand(ins, 0), b = operand(ins, 1), av = value(cpu, a), bv = value(cpu, b);
      cpu.set(a, bv);
      cpu.set(b, av);
      break;
    }
    case "LEA": { const m = operand(ins, 1); if (m.kind === "mem") cpu.set(operand(ins, 0), m.off); break; }
    case "LDS": case "LES": {
      const m = operand(ins, 1);
      if (m.kind !== "mem") break;
      const seg = cpu.s[m.seg];
      cpu.set(operand(ins, 0), cpu.rw(seg, m.off));
      cpu.s[mn === "LDS" ? S.DS : S.ES] = cpu.rw(seg, m.off + 2);
      break;
    }
    case "PUSH": {
      const s = operand(ins, 0);
      cpu.push(s.kind === "reg" && s.n === R.SP ? (cpu.r[R.SP] - 2) & WORD_MASK : value(cpu, s));
      break;
    }
    case "POP": cpu.set(operand(ins, 0), cpu.pop()); break;
    case "PUSHF": cpu.push(cpu.flags); break;
    case "POPF": cpu.flags = (cpu.pop() & FLAGS_WRITABLE) | FLAGS_FIXED; break;
    case "SAHF": cpu.flags = (cpu.flags & LOW_BYTE_FLAGS) | (cpu.get8(R8.AH) & SAHF_MASK) | FLAGS_RESERVED_ONE; break;
    case "LAHF": cpu.set8(R8.AH, cpu.flags & BYTE_MASK); break;
    case "CBW": cpu.r[R.AX] = cpu.r[R.AX] & 0x80 ? cpu.r[R.AX] | 0xFF00 : cpu.r[R.AX] & BYTE_MASK; break;
    case "CWD": cpu.r[R.DX] = cpu.r[R.AX] & 0x8000 ? WORD_MASK : 0; break;
    case "XLAT": cpu.set8(R8.AL, cpu.rb(cpu.s[ins.seg >= 0 ? ins.seg : S.DS], (cpu.r[R.BX] + cpu.get8(R8.AL)) & WORD_MASK)); break;
    case "SALC": cpu.set8(R8.AL, cpu.getF(F.CF) ? BYTE_MASK : 0); break;
    case "NOP": case "WAIT": case "ESC": case "BAD": break;
    case "HLT": cpu.halted = true; break;
    case "CLC": cpu.setF(F.CF, false); break;
    case "STC": cpu.setF(F.CF, true); break;
    case "CMC": cpu.setF(F.CF, !cpu.getF(F.CF)); break;
    case "CLI": cpu.setF(F.IF, false); break;
    case "STI": cpu.setF(F.IF, true); break;
    case "CLD": cpu.setF(F.DF, false); break;
    case "STD": cpu.setF(F.DF, true); break;
    case "JMP": cpu.ip = targetOf(cpu, operand(ins, 0)); break;
    case "JMPF": {
      const t = farTarget(cpu, operand(ins, 0));
      if (!t) break;
      cpu.s[S.CS] = t.seg;
      cpu.ip = t.off;
      break;
    }
    case "CALL": { const t = targetOf(cpu, operand(ins, 0)); cpu.push(cpu.ip); cpu.ip = t; break; }
    case "CALLF": {
      const t = farTarget(cpu, operand(ins, 0));
      if (!t) break;
      cpu.push(cpu.s[S.CS]);
      cpu.push(cpu.ip);
      cpu.s[S.CS] = t.seg;
      cpu.ip = t.off;
      break;
    }
    case "RET": cpu.ip = cpu.pop(); releaseStack(cpu, ins); break;
    case "RETF": cpu.ip = cpu.pop(); cpu.s[S.CS] = cpu.pop(); releaseStack(cpu, ins); break;
    case "IRET": cpu.ip = cpu.pop(); cpu.s[S.CS] = cpu.pop(); cpu.flags = (cpu.pop() & FLAGS_WRITABLE) | FLAGS_FIXED; break;
    case "INT": cpu.interrupt(value(cpu, operand(ins, 0))); break;
    case "INTO": if (cpu.getF(F.OF)) cpu.interrupt(OVERFLOW_INT); break;
    case "LOOP": loop(cpu, ins, true); break;
    case "LOOPE": loop(cpu, ins, cpu.getF(F.ZF) === 1); break;
    case "LOOPNE": loop(cpu, ins, cpu.getF(F.ZF) === 0); break;
    case "JCXZ": if (cpu.r[R.CX] === 0) cpu.ip = targetOf(cpu, operand(ins, 0)); break;
    case "IN": { const d = operand(ins, 0); cpu.set(d, cpu.portIn(value(cpu, operand(ins, 1)), widthOf(d))); break; }
    case "OUT": { const s = operand(ins, 1); cpu.portOut(value(cpu, operand(ins, 0)), value(cpu, s), widthOf(s)); break; }
    case "DAA": case "DAS": decimalAdjust(cpu, mn === "DAS"); break;
    case "AAA": case "AAS": asciiAdjust(cpu, mn === "AAA"); break;
    case "AAM": {
      const base = value(cpu, operand(ins, 0));
      if (base === 0) { cpu.szp(0, 0); cpu.interrupt(DIVIDE_ERROR); break; }
      const al = cpu.get8(R8.AL);
      cpu.set8(R8.AH, Math.floor(al / base));
      cpu.set8(R8.AL, al % base);
      cpu.szp(cpu.get8(R8.AL), 0);
      break;
    }
    case "AAD": {
      const v = (cpu.get8(R8.AH) * value(cpu, operand(ins, 0)) + cpu.get8(R8.AL)) & BYTE_MASK;
      cpu.r[R.AX] = v;
      cpu.szp(v, 0);
      break;
    }
    case "MOVS": case "CMPS": case "STOS": case "LODS": case "SCAS": stringOp(cpu, ins, mn); break;
    default:
      if (condition(cpu, JCC_INDEX[mn])) cpu.ip = targetOf(cpu, operand(ins, 0));
  }
};

export const step = (cpu: Cpu): Instruction => {
  const ins = decode(cpu);
  execute(cpu, ins);
  return ins;
};

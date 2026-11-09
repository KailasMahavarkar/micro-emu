import { WORD_MASK } from "../layout.ts";
import { signed16, signed8 } from "../hex.ts";
import type { Cpu } from "./cpu.ts";
import { S } from "./registers.ts";
import {
  ALU_OPS, EA_TEXT, GRP3_OPS, GRP5_OPS, JCC, NO_SEGMENT_OVERRIDE, REPE, REPNE, REP_NONE, SHIFT_OPS,
  type ImmOperand, type Instruction, type MemOperand, type Mnemonic, type Operand, type RegOperand, type RelOperand,
  type SegOperand, type StringOp, type Width
} from "./types.ts";

const MAX_PREFIXES = 15;
const EA_REGS = [[3, 6], [3, 7], [5, 6], [5, 7], [6], [7], [5], [3]] as const;
const STRING_BY_OPCODE: Readonly<Record<number, StringOp>> = { 0xA4: "MOVS", 0xA6: "CMPS", 0xAA: "STOS", 0xAC: "LODS", 0xAE: "SCAS" };
const INC_DEC_PUSH_POP = ["INC", "DEC", "PUSH", "POP"] as const;
const DIRECT_ADDRESS_RM = 6;
const MOD_REGISTER = 3;
const SEG_PREFIX_MASK = 0xE7;
const SEG_PREFIX = 0x26;
const DS = S.DS;
const SS = S.SS;

const reg = (n: number, w: Width): RegOperand => ({ kind: "reg", n, w });
const imm = (v: number, w: Width): ImmOperand => ({ kind: "imm", v, w });
const sreg = (n: number): SegOperand => ({ kind: "seg", n });
const width = (op: number): Width => (op & 1 ? 1 : 0);

const defaultSegment = (rm: number): number => (rm === 2 || rm === 3 || rm === 6 ? SS : DS);

class Decoder {
  readonly ins: Instruction;
  regField = 0;

  constructor(private readonly cpu: Cpu) {
    this.ins = { cs: cpu.s[S.CS], addr: cpu.ip, seg: NO_SEGMENT_OVERRIDE, rep: REP_NONE, op: 0, mn: "BAD", w: 1, ops: [], len: 0 };
  }

  b(): number { return this.cpu.fetchB(); }
  w(): number { return this.cpu.fetchW(); }
  immOf(w: Width): ImmOperand { return imm(w ? this.w() : this.b(), w); }
  rel8(): RelOperand {
    const d = signed8(this.b());
    return { kind: "rel", target: (this.cpu.ip + d) & WORD_MASK };
  }
  rel16(): RelOperand {
    const d = signed16(this.w());
    return { kind: "rel", target: (this.cpu.ip + d) & WORD_MASK };
  }

  modrm(w: Width): RegOperand | MemOperand {
    const byte = this.b(), mod = byte >> 6, rm = byte & 7;
    this.regField = (byte >> 3) & 7;
    if (mod === MOD_REGISTER) return reg(rm, w);
    let seg = defaultSegment(rm), off: number, disp = 0;
    let base: MemOperand["base"] = EA_TEXT[rm];
    if (mod === 0 && rm === DIRECT_ADDRESS_RM) {
      disp = this.w();
      off = disp;
      seg = DS;
      base = "";
    } else {
      if (mod === 1) disp = signed8(this.b());
      else if (mod === 2) disp = signed16(this.w());
      off = EA_REGS[rm].reduce((sum: number, i) => sum + this.cpu.r[i], 0) + disp;
    }
    if (this.ins.seg !== NO_SEGMENT_OVERRIDE) seg = this.ins.seg;
    return { kind: "mem", seg, off: off & WORD_MASK, w, base, disp };
  }

  set(mn: Mnemonic, ops: Operand[] = [], w?: Width): void {
    this.ins.mn = mn;
    this.ins.ops = ops;
    if (w !== undefined) this.ins.w = w;
  }

  prefixes(): number {
    for (let guard = 0; ; guard++) {
      const op = this.b();
      if (guard > MAX_PREFIXES) return op;
      if ((op & SEG_PREFIX_MASK) === SEG_PREFIX) { this.ins.seg = (op >> 3) & 3; continue; }
      if (op === REPNE || op === REPE) { this.ins.rep = op; continue; }
      if (op === 0xF0 || op === 0xF1) continue;
      return op;
    }
  }

  decode(): Instruction {
    const op = this.prefixes();
    this.ins.op = op;
    if (op < 0x40 && (op & 7) < 6) this.alu(op);
    else if (op >= 0x40 && op < 0x60) this.set(INC_DEC_PUSH_POP[(op - 0x40) >> 3], [reg(op & 7, 1)]);
    else if (op >= 0x60 && op < 0x80) this.set(JCC[op & 15], [this.rel8()]);
    else if (op >= 0xB0 && op < 0xC0) { const w: Width = op >= 0xB8 ? 1 : 0; this.set("MOV", [reg(op & 7, w), this.immOf(w)]); }
    else if (op >= 0x91 && op <= 0x97) this.set("XCHG", [reg(0, 1), reg(op & 7, 1)]);
    else if (op >= 0xD8 && op <= 0xDF) this.set("ESC", [this.modrm(1)]);
    else if (op >= 0xA4 && (op & 0xFE) in STRING_BY_OPCODE) this.set(STRING_BY_OPCODE[op & 0xFE], [], width(op));
    else this.other(op);
    this.ins.len = (this.cpu.ip - this.ins.addr) & WORD_MASK;
    return this.ins;
  }

  alu(op: number): void {
    const k = op & 7, w = width(k);
    if (k < 4) {
      const m = this.modrm(w), g = reg(this.regField, w);
      this.set(ALU_OPS[op >> 3], k < 2 ? [m, g] : [g, m], w);
    } else this.set(ALU_OPS[op >> 3], [reg(0, w), this.immOf(w)], w);
  }

  other(op: number): void {
    switch (op) {
      case 0x06: case 0x0E: case 0x16: case 0x1E: this.set("PUSH", [sreg(op >> 3)]); break;
      case 0x07: case 0x0F: case 0x17: case 0x1F: this.set("POP", [sreg(op >> 3)]); break;
      case 0x27: this.set("DAA"); break;
      case 0x2F: this.set("DAS"); break;
      case 0x37: this.set("AAA"); break;
      case 0x3F: this.set("AAS"); break;
      case 0x80: case 0x81: case 0x82: case 0x83: {
        const w = width(op), m = this.modrm(w);
        const v = op === 0x81 ? this.w() : op === 0x83 ? signed8(this.b()) & WORD_MASK : this.b();
        this.set(ALU_OPS[this.regField], [m, imm(v, w)], w);
        break;
      }
      case 0x84: case 0x85: case 0x86: case 0x87: {
        const w = width(op), m = this.modrm(w);
        this.set(op < 0x86 ? "TEST" : "XCHG", [m, reg(this.regField, w)], w);
        break;
      }
      case 0x88: case 0x89: case 0x8A: case 0x8B: {
        const w = width(op), m = this.modrm(w), g = reg(this.regField, w);
        this.set("MOV", op < 0x8A ? [m, g] : [g, m], w);
        break;
      }
      case 0x8C: { const m = this.modrm(1); this.set("MOV", [m, sreg(this.regField & 3)]); break; }
      case 0x8D: { const m = this.modrm(1); this.set("LEA", [reg(this.regField, 1), m]); break; }
      case 0x8E: { const m = this.modrm(1); this.set("MOV", [sreg(this.regField & 3), m]); break; }
      case 0x8F: this.set("POP", [this.modrm(1)]); break;
      case 0x90: this.set("NOP"); break;
      case 0x98: this.set("CBW"); break;
      case 0x99: this.set("CWD"); break;
      case 0x9A: { const off = this.w(), seg = this.w(); this.set("CALLF", [{ kind: "far", seg, off }]); break; }
      case 0x9B: this.set("WAIT"); break;
      case 0x9C: this.set("PUSHF"); break;
      case 0x9D: this.set("POPF"); break;
      case 0x9E: this.set("SAHF"); break;
      case 0x9F: this.set("LAHF"); break;
      case 0xA0: case 0xA1: case 0xA2: case 0xA3: {
        const w = width(op), a = this.w();
        const m: MemOperand = { kind: "mem", seg: this.ins.seg === NO_SEGMENT_OVERRIDE ? DS : this.ins.seg, off: a, w, base: "", disp: a };
        this.set("MOV", op < 0xA2 ? [reg(0, w), m] : [m, reg(0, w)], w);
        break;
      }
      case 0xA8: case 0xA9: { const w = width(op); this.set("TEST", [reg(0, w), this.immOf(w)], w); break; }
      case 0xC0: case 0xC2: this.set("RET", [imm(this.w(), 1)]); break;
      case 0xC1: case 0xC3: this.set("RET"); break;
      case 0xC4: case 0xC5: { const m = this.modrm(1); this.set(op === 0xC4 ? "LES" : "LDS", [reg(this.regField, 1), m]); break; }
      case 0xC6: case 0xC7: { const w = width(op), m = this.modrm(w); this.set("MOV", [m, this.immOf(w)], w); break; }
      case 0xC8: case 0xCA: this.set("RETF", [imm(this.w(), 1)]); break;
      case 0xC9: case 0xCB: this.set("RETF"); break;
      case 0xCC: this.set("INT", [imm(3, 0)]); break;
      case 0xCD: this.set("INT", [imm(this.b(), 0)]); break;
      case 0xCE: this.set("INTO"); break;
      case 0xCF: this.set("IRET"); break;
      case 0xD0: case 0xD1: case 0xD2: case 0xD3: {
        const w = width(op), m = this.modrm(w);
        this.set(SHIFT_OPS[this.regField], [m, op < 0xD2 ? imm(1, 0) : reg(1, 0)], w);
        break;
      }
      case 0xD4: this.set("AAM", [imm(this.b(), 0)]); break;
      case 0xD5: this.set("AAD", [imm(this.b(), 0)]); break;
      case 0xD6: this.set("SALC"); break;
      case 0xD7: this.set("XLAT"); break;
      case 0xE0: this.set("LOOPNE", [this.rel8()]); break;
      case 0xE1: this.set("LOOPE", [this.rel8()]); break;
      case 0xE2: this.set("LOOP", [this.rel8()]); break;
      case 0xE3: this.set("JCXZ", [this.rel8()]); break;
      case 0xE4: case 0xE5: { const w = width(op); this.set("IN", [reg(0, w), imm(this.b(), 0)], w); break; }
      case 0xE6: case 0xE7: { const w = width(op); this.set("OUT", [imm(this.b(), 0), reg(0, w)], w); break; }
      case 0xEC: case 0xED: { const w = width(op); this.set("IN", [reg(0, w), reg(2, 1)], w); break; }
      case 0xEE: case 0xEF: { const w = width(op); this.set("OUT", [reg(2, 1), reg(0, w)], w); break; }
      case 0xE8: this.set("CALL", [this.rel16()]); break;
      case 0xE9: this.set("JMP", [this.rel16()]); break;
      case 0xEA: { const off = this.w(), seg = this.w(); this.set("JMPF", [{ kind: "far", seg, off }]); break; }
      case 0xEB: this.set("JMP", [this.rel8()]); break;
      case 0xF4: this.set("HLT"); break;
      case 0xF5: this.set("CMC"); break;
      case 0xF6: case 0xF7: {
        const w = width(op), m = this.modrm(w);
        this.set(GRP3_OPS[this.regField], this.regField < 2 ? [m, this.immOf(w)] : [m], w);
        break;
      }
      case 0xF8: this.set("CLC"); break;
      case 0xF9: this.set("STC"); break;
      case 0xFA: this.set("CLI"); break;
      case 0xFB: this.set("STI"); break;
      case 0xFC: this.set("CLD"); break;
      case 0xFD: this.set("STD"); break;
      case 0xFE: { const m = this.modrm(0); this.set(this.regField === 0 ? "INC" : this.regField === 1 ? "DEC" : "BAD", [m], 0); break; }
      case 0xFF: { const m = this.modrm(1); this.set(GRP5_OPS[this.regField], [m]); break; }
      default: this.set("BAD");
    }
  }
}

export const decode = (cpu: Cpu): Instruction => new Decoder(cpu).decode();

"use strict";

const REG16 = ["AX", "CX", "DX", "BX", "SP", "BP", "SI", "DI"];
const REG8 = ["AL", "CL", "DL", "BL", "AH", "CH", "DH", "BH"];
const SREG = ["ES", "CS", "SS", "DS"];
const F = { CF: 0x0001, PF: 0x0004, AF: 0x0010, ZF: 0x0040, SF: 0x0080, TF: 0x0100, IF: 0x0200, DF: 0x0400, OF: 0x0800 };
const FLAG_NAMES = ["CF", "PF", "AF", "ZF", "SF", "TF", "IF", "DF", "OF"];
const FLAGS_FIXED = 0xF002;
const FLAGS_WRITABLE = 0x0FD5;
const PARITY = Uint8Array.from({ length: 256 }, (_, i) => {
  let b = i, c = 0;
  while (b) { c += b & 1; b >>= 1; }
  return c % 2 === 0 ? 1 : 0;
});
const EA_REGS = [[3, 6], [3, 7], [5, 6], [5, 7], [6], [7], [5], [3]];
const EA_TEXT = ["BX+SI", "BX+DI", "BP+SI", "BP+DI", "SI", "DI", "BP", "BX"];
const JCC = ["JO", "JNO", "JB", "JAE", "JE", "JNE", "JBE", "JA", "JS", "JNS", "JP", "JNP", "JL", "JGE", "JLE", "JG"];
const ALU_OPS = ["ADD", "OR", "ADC", "SBB", "AND", "SUB", "XOR", "CMP"];
const SHIFT_OPS = ["ROL", "ROR", "RCL", "RCR", "SHL", "SHR", "SETMO", "SAR"];
const GRP3 = ["TEST", "TEST", "NOT", "NEG", "MUL", "IMUL", "DIV", "IDIV"];
const GRP5 = ["INC", "DEC", "CALL", "CALLF", "JMP", "JMPF", "PUSH", "PUSH"];
const STRING_OPS = { 0xA4: "MOVS", 0xA6: "CMPS", 0xAA: "STOS", 0xAC: "LODS", 0xAE: "SCAS" };
const MAX_PREFIXES = 15;

const LOAD_SEG = 0x0700;
const PSP_PARAS = 0x10;
const COM_ORIGIN = 0x100;
const DEFAULT_STACK = 0x100;
const VIDEO_SEG = 0xB800;
const VIDEO_LIN = VIDEO_SEG << 4;
const COLS = 80;
const ROWS = 25;
const VIDEO_BYTES = COLS * ROWS * 2;
const BIOS_SEG = 0x40;
const CURSOR_COL = 0x50;
const CURSOR_ROW = 0x51;
const DEFAULT_ATTR = 0x07;
const HISTORY_MAX = 20000;
const HISTORY_TRIM = 2000;
const STRING_LIMIT = 4096;
const TOP_OF_MEMORY_PARA = 0xA000;

const hex = (v, n = 4) => (v >>> 0).toString(16).toUpperCase().padStart(n, "0");
const s8 = v => (v << 24) >> 24;
const s16 = v => (v << 16) >> 16;

class CPU {
  constructor() {
    this.mem = new Uint8Array(0x100000);
    this.r = new Uint16Array(8);
    this.s = new Uint16Array(4);
    this.ip = 0;
    this.flags = FLAGS_FIXED;
    this.halted = false;
    this.log = null;
    this.videoDirty = true;
    this.intHook = null;
    this.portIn = (port, w) => (w ? 0xFFFF : 0xFF);
    this.portOut = () => {};
  }

  getF(m) { return (this.flags & m) ? 1 : 0; }
  setF(m, on) { if (on) this.flags |= m; else this.flags &= ~m; }
  get8(i) { return i < 4 ? this.r[i] & 0xFF : this.r[i - 4] >> 8; }
  set8(i, v) {
    v &= 0xFF;
    if (i < 4) this.r[i] = (this.r[i] & 0xFF00) | v;
    else this.r[i - 4] = (this.r[i - 4] & 0x00FF) | (v << 8);
  }
  lin(seg, off) { return ((seg << 4) + (off & 0xFFFF)) & 0xFFFFF; }
  rb(seg, off) { return this.mem[this.lin(seg, off)]; }
  rw(seg, off) { return this.rb(seg, off) | (this.rb(seg, off + 1) << 8); }
  wb(seg, off, v) {
    const a = this.lin(seg, off);
    if (this.log) this.log.push(a, this.mem[a]);
    if (a >= VIDEO_LIN && a < VIDEO_LIN + VIDEO_BYTES) { this.videoDirty = true; this.lastVideo = a; }
    this.mem[a] = v & 0xFF;
  }
  ww(seg, off, v) { this.wb(seg, off, v); this.wb(seg, off + 1, v >> 8); }
  push(v) { this.r[4] = (this.r[4] - 2) & 0xFFFF; this.ww(this.s[2], this.r[4], v); }
  pop() { const v = this.rw(this.s[2], this.r[4]); this.r[4] = (this.r[4] + 2) & 0xFFFF; return v; }
  fetchB() { const v = this.rb(this.s[1], this.ip); this.ip = (this.ip + 1) & 0xFFFF; return v; }
  fetchW() { const lo = this.fetchB(); return lo | (this.fetchB() << 8); }

  modrm(ins, w) {
    const b = this.fetchB(), mod = b >> 6, rm = b & 7;
    ins.reg = (b >> 3) & 7;
    if (mod === 3) return { t: "r", n: rm, w };
    let seg = rm === 2 || rm === 3 || rm === 6 ? 2 : 3, base = EA_TEXT[rm], disp = 0, off;
    if (mod === 0 && rm === 6) { disp = this.fetchW(); off = disp; seg = 3; base = ""; }
    else {
      if (mod === 1) disp = s8(this.fetchB());
      else if (mod === 2) disp = s16(this.fetchW());
      off = EA_REGS[rm].reduce((a, i) => a + this.r[i], 0) + disp;
    }
    if (ins.seg >= 0) seg = ins.seg;
    return { t: "m", seg, off: off & 0xFFFF, w, base, disp };
  }

  decode() {
    const start = this.ip, cs = this.s[1];
    const ins = { cs, addr: start, seg: -1, rep: 0, ops: [], mn: "", w: 1 };
    const R = (n, w) => ({ t: "r", n, w });
    const I = (v, w) => ({ t: "i", v, w });
    const rel8 = () => { const d = s8(this.fetchB()); return { t: "rel", target: (this.ip + d) & 0xFFFF }; };
    let op, guard = 0;
    for (;;) {
      op = this.fetchB();
      if (guard++ > MAX_PREFIXES) break;
      if ((op & 0xE7) === 0x26) { ins.seg = (op >> 3) & 3; continue; }
      if (op === 0xF2 || op === 0xF3) { ins.rep = op; continue; }
      if (op === 0xF0 || op === 0xF1) continue;
      break;
    }
    ins.op = op;
    if (op < 0x40 && (op & 7) < 6) {
      const k = op & 7, w = k & 1;
      ins.mn = ALU_OPS[op >> 3];
      ins.w = w;
      if (k < 4) { const m = this.modrm(ins, w), g = R(ins.reg, w); ins.ops = k < 2 ? [m, g] : [g, m]; }
      else ins.ops = [R(0, w), I(w ? this.fetchW() : this.fetchB(), w)];
    } else if (op >= 0x40 && op < 0x60) {
      ins.mn = ["INC", "DEC", "PUSH", "POP"][(op - 0x40) >> 3];
      ins.ops = [R(op & 7, 1)];
    } else if (op >= 0x60 && op < 0x80) {
      ins.mn = JCC[op & 15]; ins.cc = op & 15; ins.ops = [rel8()];
    } else if (op >= 0xB0 && op < 0xC0) {
      const w = op >= 0xB8 ? 1 : 0;
      ins.mn = "MOV"; ins.ops = [R(op & 7, w), I(w ? this.fetchW() : this.fetchB(), w)];
    } else if (op >= 0x91 && op <= 0x97) {
      ins.mn = "XCHG"; ins.ops = [R(0, 1), R(op & 7, 1)];
    } else if (op >= 0xD8 && op <= 0xDF) {
      ins.mn = "ESC"; ins.ops = [this.modrm(ins, 1)];
    } else if (STRING_OPS[op & 0xFE] && op >= 0xA4) {
      ins.mn = STRING_OPS[op & 0xFE]; ins.w = op & 1;
    } else switch (op) {
      case 0x06: case 0x0E: case 0x16: case 0x1E: ins.mn = "PUSH"; ins.ops = [{ t: "s", n: op >> 3 }]; break;
      case 0x07: case 0x0F: case 0x17: case 0x1F: ins.mn = "POP"; ins.ops = [{ t: "s", n: op >> 3 }]; break;
      case 0x27: ins.mn = "DAA"; break;
      case 0x2F: ins.mn = "DAS"; break;
      case 0x37: ins.mn = "AAA"; break;
      case 0x3F: ins.mn = "AAS"; break;
      case 0x80: case 0x81: case 0x82: case 0x83: {
        const w = op & 1, m = this.modrm(ins, w);
        const v = op === 0x81 ? this.fetchW() : op === 0x83 ? s8(this.fetchB()) & 0xFFFF : this.fetchB();
        ins.mn = ALU_OPS[ins.reg]; ins.w = w; ins.ops = [m, I(v, w)];
        break;
      }
      case 0x84: case 0x85: case 0x86: case 0x87: {
        const w = op & 1, m = this.modrm(ins, w);
        ins.mn = op < 0x86 ? "TEST" : "XCHG"; ins.w = w; ins.ops = [m, R(ins.reg, w)];
        break;
      }
      case 0x88: case 0x89: case 0x8A: case 0x8B: {
        const w = op & 1, m = this.modrm(ins, w), g = R(ins.reg, w);
        ins.mn = "MOV"; ins.w = w; ins.ops = op < 0x8A ? [m, g] : [g, m];
        break;
      }
      case 0x8C: { const m = this.modrm(ins, 1); ins.mn = "MOV"; ins.ops = [m, { t: "s", n: ins.reg & 3 }]; break; }
      case 0x8D: { const m = this.modrm(ins, 1); ins.mn = "LEA"; ins.ops = [R(ins.reg, 1), m]; break; }
      case 0x8E: { const m = this.modrm(ins, 1); ins.mn = "MOV"; ins.ops = [{ t: "s", n: ins.reg & 3 }, m]; break; }
      case 0x8F: ins.mn = "POP"; ins.ops = [this.modrm(ins, 1)]; break;
      case 0x90: ins.mn = "NOP"; break;
      case 0x98: ins.mn = "CBW"; break;
      case 0x99: ins.mn = "CWD"; break;
      case 0x9A: { const off = this.fetchW(), seg = this.fetchW(); ins.mn = "CALLF"; ins.ops = [{ t: "far", seg, off }]; break; }
      case 0x9B: ins.mn = "WAIT"; break;
      case 0x9C: ins.mn = "PUSHF"; break;
      case 0x9D: ins.mn = "POPF"; break;
      case 0x9E: ins.mn = "SAHF"; break;
      case 0x9F: ins.mn = "LAHF"; break;
      case 0xA0: case 0xA1: case 0xA2: case 0xA3: {
        const w = op & 1, a = this.fetchW();
        const m = { t: "m", seg: ins.seg >= 0 ? ins.seg : 3, off: a, w, base: "", disp: a };
        ins.mn = "MOV"; ins.w = w; ins.ops = op < 0xA2 ? [R(0, w), m] : [m, R(0, w)];
        break;
      }
      case 0xA8: case 0xA9: { const w = op & 1; ins.mn = "TEST"; ins.w = w; ins.ops = [R(0, w), I(w ? this.fetchW() : this.fetchB(), w)]; break; }
      case 0xC0: case 0xC2: ins.mn = "RET"; ins.ops = [I(this.fetchW(), 1)]; break;
      case 0xC1: case 0xC3: ins.mn = "RET"; break;
      case 0xC4: case 0xC5: { const m = this.modrm(ins, 1); ins.mn = op === 0xC4 ? "LES" : "LDS"; ins.ops = [R(ins.reg, 1), m]; break; }
      case 0xC6: case 0xC7: {
        const w = op & 1, m = this.modrm(ins, w);
        ins.mn = "MOV"; ins.w = w; ins.ops = [m, I(w ? this.fetchW() : this.fetchB(), w)];
        break;
      }
      case 0xC8: case 0xCA: ins.mn = "RETF"; ins.ops = [I(this.fetchW(), 1)]; break;
      case 0xC9: case 0xCB: ins.mn = "RETF"; break;
      case 0xCC: ins.mn = "INT"; ins.ops = [I(3, 0)]; break;
      case 0xCD: ins.mn = "INT"; ins.ops = [I(this.fetchB(), 0)]; break;
      case 0xCE: ins.mn = "INTO"; break;
      case 0xCF: ins.mn = "IRET"; break;
      case 0xD0: case 0xD1: case 0xD2: case 0xD3: {
        const w = op & 1, m = this.modrm(ins, w);
        ins.mn = SHIFT_OPS[ins.reg]; ins.w = w; ins.ops = [m, op < 0xD2 ? I(1, 0) : R(1, 0)];
        break;
      }
      case 0xD4: ins.mn = "AAM"; ins.ops = [I(this.fetchB(), 0)]; break;
      case 0xD5: ins.mn = "AAD"; ins.ops = [I(this.fetchB(), 0)]; break;
      case 0xD6: ins.mn = "SALC"; break;
      case 0xD7: ins.mn = "XLAT"; break;
      case 0xE0: ins.mn = "LOOPNE"; ins.ops = [rel8()]; break;
      case 0xE1: ins.mn = "LOOPE"; ins.ops = [rel8()]; break;
      case 0xE2: ins.mn = "LOOP"; ins.ops = [rel8()]; break;
      case 0xE3: ins.mn = "JCXZ"; ins.ops = [rel8()]; break;
      case 0xE4: case 0xE5: { const w = op & 1; ins.mn = "IN"; ins.w = w; ins.ops = [R(0, w), I(this.fetchB(), 0)]; break; }
      case 0xE6: case 0xE7: { const w = op & 1; ins.mn = "OUT"; ins.w = w; ins.ops = [I(this.fetchB(), 0), R(0, w)]; break; }
      case 0xEC: case 0xED: { const w = op & 1; ins.mn = "IN"; ins.w = w; ins.ops = [R(0, w), R(2, 1)]; break; }
      case 0xEE: case 0xEF: { const w = op & 1; ins.mn = "OUT"; ins.w = w; ins.ops = [R(2, 1), R(0, w)]; break; }
      case 0xE8: { const d = s16(this.fetchW()); ins.mn = "CALL"; ins.ops = [{ t: "rel", target: (this.ip + d) & 0xFFFF }]; break; }
      case 0xE9: { const d = s16(this.fetchW()); ins.mn = "JMP"; ins.ops = [{ t: "rel", target: (this.ip + d) & 0xFFFF }]; break; }
      case 0xEA: { const off = this.fetchW(), seg = this.fetchW(); ins.mn = "JMPF"; ins.ops = [{ t: "far", seg, off }]; break; }
      case 0xEB: ins.mn = "JMP"; ins.ops = [rel8()]; break;
      case 0xF4: ins.mn = "HLT"; break;
      case 0xF5: ins.mn = "CMC"; break;
      case 0xF6: case 0xF7: {
        const w = op & 1, m = this.modrm(ins, w);
        ins.mn = GRP3[ins.reg]; ins.w = w;
        ins.ops = ins.reg < 2 ? [m, I(w ? this.fetchW() : this.fetchB(), w)] : [m];
        break;
      }
      case 0xF8: ins.mn = "CLC"; break;
      case 0xF9: ins.mn = "STC"; break;
      case 0xFA: ins.mn = "CLI"; break;
      case 0xFB: ins.mn = "STI"; break;
      case 0xFC: ins.mn = "CLD"; break;
      case 0xFD: ins.mn = "STD"; break;
      case 0xFE: { const m = this.modrm(ins, 0); ins.mn = ins.reg === 0 ? "INC" : ins.reg === 1 ? "DEC" : "BAD"; ins.w = 0; ins.ops = [m]; break; }
      case 0xFF: { const m = this.modrm(ins, 1); ins.mn = GRP5[ins.reg]; ins.ops = [m]; break; }
      default: ins.mn = "BAD";
    }
    ins.len = (this.ip - start) & 0xFFFF;
    return ins;
  }

  get(o) {
    switch (o.t) {
      case "r": return o.w ? this.r[o.n] : this.get8(o.n);
      case "s": return this.s[o.n];
      case "m": return o.w ? this.rw(this.s[o.seg], o.off) : this.rb(this.s[o.seg], o.off);
      case "i": return o.v;
      default: return undefined;
    }
  }

  set(o, v) {
    switch (o.t) {
      case "r": if (o.w) this.r[o.n] = v & 0xFFFF; else this.set8(o.n, v); break;
      case "s": this.s[o.n] = v & 0xFFFF; break;
      case "m": if (o.w) this.ww(this.s[o.seg], o.off, v); else this.wb(this.s[o.seg], o.off, v); break;
    }
  }

  szp(res, w) {
    this.setF(F.ZF, res === 0);
    this.setF(F.SF, (res & (w ? 0x8000 : 0x80)) !== 0);
    this.setF(F.PF, PARITY[res & 0xFF]);
  }

  arith(mn, a, b, w) {
    const mask = w ? 0xFFFF : 0xFF, sign = w ? 0x8000 : 0x80, c = this.getF(F.CF);
    let res;
    switch (mn) {
      case "ADD": case "ADC": {
        res = a + b + (mn === "ADC" ? c : 0);
        this.setF(F.CF, res > mask);
        this.setF(F.OF, ((a ^ res) & (b ^ res) & sign) !== 0);
        this.setF(F.AF, ((a ^ b ^ res) & 0x10) !== 0);
        break;
      }
      case "SUB": case "SBB": case "CMP": {
        res = a - b - (mn === "SBB" ? c : 0);
        this.setF(F.CF, res < 0);
        this.setF(F.OF, ((a ^ b) & (a ^ res) & sign) !== 0);
        this.setF(F.AF, ((a ^ b ^ res) & 0x10) !== 0);
        break;
      }
      default:
        res = mn === "OR" ? a | b : mn === "XOR" ? a ^ b : a & b;
        this.setF(F.CF, false); this.setF(F.OF, false); this.setF(F.AF, false);
    }
    res &= mask;
    this.szp(res, w);
    return res;
  }

  shift(mn, a, cnt, w) {
    if (cnt === 0) return a;
    const mask = w ? 0xFFFF : 0xFF, sign = w ? 0x8000 : 0x80;
    let res = a, cf = this.getF(F.CF);
    for (let i = 0; i < cnt; i++) {
      switch (mn) {
        case "ROL": cf = res & sign ? 1 : 0; res = ((res << 1) | cf) & mask; break;
        case "ROR": cf = res & 1; res = (res >> 1) | (cf ? sign : 0); break;
        case "RCL": { const out = res & sign ? 1 : 0; res = ((res << 1) | cf) & mask; cf = out; break; }
        case "RCR": { const out = res & 1; res = (res >> 1) | (cf ? sign : 0); cf = out; break; }
        case "SHL": cf = res & sign ? 1 : 0; res = (res << 1) & mask; break;
        case "SETMO": cf = 0; res = mask; break;
        case "SHR": cf = res & 1; res >>= 1; break;
        case "SAR": cf = res & 1; res = (res >> 1) | (res & sign); break;
      }
    }
    this.setF(F.CF, cf);
    if (mn === "ROL" || mn === "RCL" || mn === "SHL") this.setF(F.OF, ((res & sign ? 1 : 0) ^ cf) === 1);
    else this.setF(F.OF, ((res ^ (res << 1)) & sign) !== 0);
    if (mn === "SHL" || mn === "SHR" || mn === "SAR" || mn === "SETMO") { this.szp(res, w); this.setF(F.AF, false); }
    return res;
  }

  muldiv(mn, src, w, rep) {
    if (mn === "MUL" || mn === "IMUL") {
      if (w) {
        const res = mn === "MUL" ? this.r[0] * src : s16(this.r[0]) * s16(src);
        this.r[0] = res & 0xFFFF; this.r[2] = Math.floor(res / 0x10000) & 0xFFFF;
        const over = mn === "MUL" ? this.r[2] !== 0 : res < -0x8000 || res > 0x7FFF;
        this.setF(F.CF, over); this.setF(F.OF, over);
      } else {
        const res = mn === "MUL" ? (this.r[0] & 0xFF) * src : s8(this.r[0]) * s8(src);
        this.r[0] = res & 0xFFFF;
        const over = mn === "MUL" ? (res & 0xFF00) !== 0 : res < -0x80 || res > 0x7F;
        this.setF(F.CF, over); this.setF(F.OF, over);
      }
      return;
    }
    if (src === 0) { this.interrupt(0); return; }
    if (w) {
      if (mn === "DIV") {
        const n = this.r[2] * 0x10000 + this.r[0], q = Math.floor(n / src);
        if (q > 0xFFFF) { this.interrupt(0); return; }
        this.r[0] = q; this.r[2] = n % src;
      } else {
        const n = (this.r[2] << 16) | this.r[0], d = s16(src), raw = Math.trunc(n / d), q = rep ? -raw : raw;
        if (raw > 0x7FFF || raw < -0x7FFF) { this.interrupt(0); return; }
        this.r[0] = q & 0xFFFF; this.r[2] = (n % d) & 0xFFFF;
      }
    } else if (mn === "DIV") {
      const n = this.r[0], q = Math.floor(n / src);
      if (q > 0xFF) { this.interrupt(0); return; }
      this.r[0] = ((n % src) << 8) | q;
    } else {
      const n = s16(this.r[0]), d = s8(src), raw = Math.trunc(n / d), q = rep ? -raw : raw;
      if (raw > 0x7F || raw < -0x7F) { this.interrupt(0); return; }
      this.r[0] = (((n % d) & 0xFF) << 8) | (q & 0xFF);
    }
  }

  cond(c) {
    const f = this.flags;
    let r;
    switch (c >> 1) {
      case 0: r = f & F.OF; break;
      case 1: r = f & F.CF; break;
      case 2: r = f & F.ZF; break;
      case 3: r = f & (F.CF | F.ZF); break;
      case 4: r = f & F.SF; break;
      case 5: r = f & F.PF; break;
      case 6: r = !(f & F.SF) !== !(f & F.OF); break;
      default: r = (f & F.ZF) || !(f & F.SF) !== !(f & F.OF);
    }
    return c & 1 ? !r : !!r;
  }

  interrupt(n) {
    if (this.intHook && this.intHook(n)) return;
    this.push(this.flags);
    this.setF(F.IF, false); this.setF(F.TF, false);
    this.push(this.s[1]); this.push(this.ip);
    this.ip = this.rw(0, n * 4); this.s[1] = this.rw(0, n * 4 + 2);
  }

  stringStep(ins) {
    const w = ins.w, size = w ? 2 : 1, d = this.getF(F.DF) ? -size : size, src = ins.seg >= 0 ? ins.seg : 3;
    const read = (seg, off) => (w ? this.rw(seg, off) : this.rb(seg, off));
    const write = (off, v) => (w ? this.ww(this.s[0], off, v) : this.wb(this.s[0], off, v));
    const acc = w ? this.r[0] : this.r[0] & 0xFF;
    switch (ins.mn) {
      case "MOVS": write(this.r[7], read(this.s[src], this.r[6])); this.r[6] += d; this.r[7] += d; break;
      case "CMPS": this.arith("CMP", read(this.s[src], this.r[6]), read(this.s[0], this.r[7]), w); this.r[6] += d; this.r[7] += d; break;
      case "STOS": write(this.r[7], acc); this.r[7] += d; break;
      case "LODS": { const v = read(this.s[src], this.r[6]); if (w) this.r[0] = v; else this.set8(0, v); this.r[6] += d; break; }
      case "SCAS": this.arith("CMP", acc, read(this.s[0], this.r[7]), w); this.r[7] += d; break;
    }
  }

  exec(ins) {
    const o = ins.ops, mn = ins.mn;
    switch (mn) {
      case "ADD": case "OR": case "ADC": case "SBB": case "AND": case "SUB": case "XOR": case "CMP": case "TEST": {
        const res = this.arith(mn, this.get(o[0]), this.get(o[1]), o[0].w);
        if (mn !== "CMP" && mn !== "TEST") this.set(o[0], res);
        break;
      }
      case "INC": case "DEC": {
        const cf = this.getF(F.CF);
        this.set(o[0], this.arith(mn === "INC" ? "ADD" : "SUB", this.get(o[0]), 1, o[0].w));
        this.setF(F.CF, cf);
        break;
      }
      case "NOT": this.set(o[0], ~this.get(o[0])); break;
      case "NEG": this.set(o[0], this.arith("SUB", 0, this.get(o[0]), o[0].w)); break;
      case "ROL": case "ROR": case "RCL": case "RCR": case "SHL": case "SHR": case "SAR": case "SETMO": {
        const cnt = o[1].t === "i" ? 1 : this.get8(1);
        this.set(o[0], this.shift(mn, this.get(o[0]), cnt, o[0].w));
        break;
      }
      case "MUL": case "IMUL": case "DIV": case "IDIV": this.muldiv(mn, this.get(o[0]), o[0].w, ins.rep !== 0); break;
      case "MOV": this.set(o[0], this.get(o[1])); break;
      case "XCHG": { const a = this.get(o[0]), b = this.get(o[1]); this.set(o[0], b); this.set(o[1], a); break; }
      case "LEA": if (o[1].t === "m") this.set(o[0], o[1].off); break;
      case "LDS": case "LES": {
        const m = o[1], seg = this.s[m.seg];
        this.set(o[0], this.rw(seg, m.off));
        this.s[mn === "LDS" ? 3 : 0] = this.rw(seg, m.off + 2);
        break;
      }
      case "PUSH": this.push(o[0].t === "r" && o[0].n === 4 ? (this.r[4] - 2) & 0xFFFF : this.get(o[0])); break;
      case "POP": this.set(o[0], this.pop()); break;
      case "PUSHF": this.push(this.flags); break;
      case "POPF": this.flags = (this.pop() & FLAGS_WRITABLE) | FLAGS_FIXED; break;
      case "SAHF": this.flags = (this.flags & 0xFF00) | (this.get8(4) & 0xD5) | 0x02; break;
      case "LAHF": this.set8(4, this.flags & 0xFF); break;
      case "CBW": this.r[0] = this.r[0] & 0x80 ? this.r[0] | 0xFF00 : this.r[0] & 0xFF; break;
      case "CWD": this.r[2] = this.r[0] & 0x8000 ? 0xFFFF : 0; break;
      case "XLAT": this.set8(0, this.rb(this.s[ins.seg >= 0 ? ins.seg : 3], (this.r[3] + this.get8(0)) & 0xFFFF)); break;
      case "SALC": this.set8(0, this.getF(F.CF) ? 0xFF : 0); break;
      case "NOP": case "WAIT": case "ESC": case "BAD": break;
      case "HLT": this.halted = true; break;
      case "CLC": this.setF(F.CF, false); break;
      case "STC": this.setF(F.CF, true); break;
      case "CMC": this.setF(F.CF, !this.getF(F.CF)); break;
      case "CLI": this.setF(F.IF, false); break;
      case "STI": this.setF(F.IF, true); break;
      case "CLD": this.setF(F.DF, false); break;
      case "STD": this.setF(F.DF, true); break;
      case "JMP": this.ip = o[0].t === "rel" ? o[0].target : this.get(o[0]); break;
      case "JMPF":
        if (o[0].t === "far") { this.s[1] = o[0].seg; this.ip = o[0].off; }
        else { const m = o[0], seg = this.s[m.seg]; this.ip = this.rw(seg, m.off); this.s[1] = this.rw(seg, m.off + 2); }
        break;
      case "CALL": { const t = o[0].t === "rel" ? o[0].target : this.get(o[0]); this.push(this.ip); this.ip = t; break; }
      case "CALLF": {
        let seg, off;
        if (o[0].t === "far") ({ seg, off } = o[0]);
        else { const m = o[0], s = this.s[m.seg]; off = this.rw(s, m.off); seg = this.rw(s, m.off + 2); }
        this.push(this.s[1]); this.push(this.ip); this.s[1] = seg; this.ip = off;
        break;
      }
      case "RET": this.ip = this.pop(); if (o.length) this.r[4] = (this.r[4] + o[0].v) & 0xFFFF; break;
      case "RETF": this.ip = this.pop(); this.s[1] = this.pop(); if (o.length) this.r[4] = (this.r[4] + o[0].v) & 0xFFFF; break;
      case "IRET": this.ip = this.pop(); this.s[1] = this.pop(); this.flags = (this.pop() & FLAGS_WRITABLE) | FLAGS_FIXED; break;
      case "INT": this.interrupt(o[0].v); break;
      case "INTO": if (this.getF(F.OF)) this.interrupt(4); break;
      case "LOOP": this.r[1]--; if (this.r[1] !== 0) this.ip = o[0].target; break;
      case "LOOPE": this.r[1]--; if (this.r[1] !== 0 && this.getF(F.ZF)) this.ip = o[0].target; break;
      case "LOOPNE": this.r[1]--; if (this.r[1] !== 0 && !this.getF(F.ZF)) this.ip = o[0].target; break;
      case "JCXZ": if (this.r[1] === 0) this.ip = o[0].target; break;
      case "IN": this.set(o[0], this.portIn(this.get(o[1]), o[0].w)); break;
      case "OUT": this.portOut(this.get(o[0]), this.get(o[1]), o[1].w); break;
      case "DAA": case "DAS": {
        const al = this.get8(0), cf = this.getF(F.CF), sub = mn === "DAS", afIn = this.getF(F.AF);
        let v = al, af = 0, c = 0;
        if ((al & 0x0F) > 9 || afIn) { v = sub ? v - 6 : v + 6; af = 1; }
        if (al > (afIn ? 0x9F : 0x99) || cf) { v = sub ? v - 0x60 : v + 0x60; c = 1; }
        v &= 0xFF;
        this.set8(0, v); this.setF(F.AF, af); this.setF(F.CF, c); this.szp(v, 0);
        break;
      }
      case "AAA": case "AAS": {
        if ((this.get8(0) & 0x0F) > 9 || this.getF(F.AF)) {
          const up = mn === "AAA";
          this.set8(0, this.get8(0) + (up ? 6 : -6)); this.set8(4, this.get8(4) + (up ? 1 : -1));
          this.setF(F.AF, true); this.setF(F.CF, true);
        } else { this.setF(F.AF, false); this.setF(F.CF, false); }
        this.set8(0, this.get8(0) & 0x0F);
        break;
      }
      case "AAM": {
        const b = o[0].v;
        if (b === 0) { this.szp(0, 0); this.interrupt(0); break; }
        const al = this.get8(0);
        this.set8(4, Math.floor(al / b)); this.set8(0, al % b); this.szp(this.get8(0), 0);
        break;
      }
      case "AAD": {
        const v = (this.get8(4) * o[0].v + this.get8(0)) & 0xFF;
        this.r[0] = v; this.szp(v, 0);
        break;
      }
      case "MOVS": case "CMPS": case "STOS": case "LODS": case "SCAS": {
        if (!ins.rep) { this.stringStep(ins); break; }
        const compare = mn === "CMPS" || mn === "SCAS";
        while (this.r[1] !== 0) {
          this.stringStep(ins);
          this.r[1]--;
          if (compare && (ins.rep === 0xF3 ? !this.getF(F.ZF) : this.getF(F.ZF))) break;
        }
        break;
      }
      default:
        if (ins.cc !== undefined && this.cond(ins.cc)) this.ip = o[0].target;
    }
  }

  step() {
    const ins = this.decode();
    this.exec(ins);
    return ins;
  }
}

const hexh = (v, n = 4) => { const s = hex(v, n); return (/^[A-F]/.test(s) ? "0" : "") + s + "h"; };

function formatOp(o, ins) {
  switch (o.t) {
    case "r": return o.w ? REG16[o.n] : REG8[o.n];
    case "s": return SREG[o.n];
    case "i": return o.w || o.v > 9 ? hexh(o.v, o.w ? 4 : 2) : String(o.v);
    case "rel": return hexh(o.target);
    case "far": return `${hex(o.seg)}:${hex(o.off)}`;
    case "m": {
      const far = ["CALLF", "JMPF", "LDS", "LES"].includes(ins.mn);
      const size = far ? (ins.mn[0] === "L" ? "" : "DWORD PTR ") : ins.ops.some(x => x.t === "r") ? "" : o.w ? "WORD PTR " : "BYTE PTR ";
      const segDefault = /BP/.test(o.base) ? 2 : 3;
      const seg = o.seg !== segDefault ? SREG[o.seg] + ":" : "";
      const disp = o.base ? (o.disp ? (o.disp < 0 ? "-" : "+") + hexh(Math.abs(o.disp), 2) : "") : hexh(o.disp);
      return `${size}${seg}[${o.base}${disp}]`;
    }
  }
  return "";
}

function disasm(ins) {
  const pre = ins.rep ? (ins.rep === 0xF3 ? (ins.mn === "CMPS" || ins.mn === "SCAS" ? "REPE " : "REP ") : "REPNE ") : "";
  let mn = ins.mn;
  if (STRING_OPS[ins.op & 0xFE]) mn += ins.w ? "W" : "B";
  if (mn === "CALLF") mn = ins.ops[0].t === "far" ? "CALL FAR" : "CALL";
  if (mn === "JMPF") mn = ins.ops[0].t === "far" ? "JMP FAR" : "JMP";
  return pre + mn + (ins.ops.length ? " " + ins.ops.map(o => formatOp(o, ins)).join(", ") : "");
}

class AsmError extends Error {
  constructor(code, args = {}) { super(code); this.code = code; this.args = args; }
}
const fail = (code, args) => { throw new AsmError(code, args); };

const R16 = new Map(REG16.map((r, i) => [r, i]));
const R8 = new Map(REG8.map((r, i) => [r, i]));
const RS = new Map(SREG.map((r, i) => [r, i]));
const JCC_CODES = {
  JO: 0, JNO: 1, JB: 2, JC: 2, JNAE: 2, JAE: 3, JNB: 3, JNC: 3, JE: 4, JZ: 4, JNE: 5, JNZ: 5, JBE: 6, JNA: 6,
  JA: 7, JNBE: 7, JS: 8, JNS: 9, JP: 10, JPE: 10, JNP: 11, JPO: 11, JL: 12, JNGE: 12, JGE: 13, JNL: 13,
  JLE: 14, JNG: 14, JG: 15, JNLE: 15
};
const LOOP_CODES = { LOOPNE: 0xE0, LOOPNZ: 0xE0, LOOPE: 0xE1, LOOPZ: 0xE1, LOOP: 0xE2, JCXZ: 0xE3 };
const SIMPLE = {
  NOP: [0x90], HLT: [0xF4], CLC: [0xF8], STC: [0xF9], CMC: [0xF5], CLD: [0xFC], STD: [0xFD], CLI: [0xFA], STI: [0xFB],
  CBW: [0x98], CWD: [0x99], PUSHF: [0x9C], POPF: [0x9D], SAHF: [0x9E], LAHF: [0x9F], XLAT: [0xD7], XLATB: [0xD7],
  AAA: [0x37], AAS: [0x3F], DAA: [0x27], DAS: [0x2F], WAIT: [0x9B], INTO: [0xCE], IRET: [0xCF],
  MOVSB: [0xA4], MOVSW: [0xA5], CMPSB: [0xA6], CMPSW: [0xA7], STOSB: [0xAA], STOSW: [0xAB],
  LODSB: [0xAC], LODSW: [0xAD], SCASB: [0xAE], SCASW: [0xAF]
};
const PREFIX = { REP: 0xF3, REPE: 0xF3, REPZ: 0xF3, REPNE: 0xF2, REPNZ: 0xF2, LOCK: 0xF0 };
const ALU_INDEX = { ADD: 0, OR: 1, ADC: 2, SBB: 3, AND: 4, SUB: 5, XOR: 6, CMP: 7 };
const GRP3_INDEX = { NOT: 2, NEG: 3, MUL: 4, IMUL: 5, DIV: 6, IDIV: 7 };
const SHIFT_INDEX = { ROL: 0, ROR: 1, RCL: 2, RCR: 3, SHL: 4, SAL: 4, SHR: 5, SAR: 7 };
const RM_CODE = { "BX+SI": 0, "BX+DI": 1, "BP+SI": 2, "BP+DI": 3, SI: 4, DI: 5, BP: 6, BX: 7 };
const IGNORED = new Set(["ASSUME", "NAME", "TITLE", "PUBLIC", "EXTRN", "PAGE", ".8086", ".8087", ".RADIX", "SUBTTL", ".LIST", ".NOLIST", "OPTION"]);
const DATA_SIZE = { DB: 1, DW: 2, DD: 4 };
const MAX_PASSES = 8;
const IDENT = "[A-Za-z_@?.$][\\w@?.$]*";
const MNEMONICS = new Set([
  ...Object.keys(SIMPLE), ...Object.keys(PREFIX), ...Object.keys(ALU_INDEX), ...Object.keys(GRP3_INDEX), ...Object.keys(SHIFT_INDEX),
  ...Object.keys(JCC_CODES), ...Object.keys(LOOP_CODES), "MOV", "TEST", "XCHG", "INC", "DEC", "PUSH", "POP", "LEA", "LDS", "LES",
  "JMP", "CALL", "RET", "RETN", "RETF", "INT", "IN", "OUT", "AAM", "AAD"
]);
const DIRECTIVE_WORDS = new Set(["ORG", "DB", "DW", "DD", "EQU", "PROC", "ENDP", "SEGMENT", "ENDS", "END", ".MODEL", ".STACK", ".DATA", ".CODE", "INCLUDE", "MACRO", "ENDM", "LOCAL", "LABEL", "OFFSET", "PTR", "BYTE", "WORD", "DUP", "SHORT", "NEAR", "FAR", ...IGNORED]);

function stripComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === q) q = null; }
    else if (c === "'" || c === '"') q = c;
    else if (c === ";") return line.slice(0, i);
  }
  return line;
}

function splitOperands(s) {
  const out = [];
  let depth = 0, q = null, cur = "";
  for (const c of s) {
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === "'" || c === '"') { q = c; cur += c; continue; }
    if (c === "(" || c === "[") depth++;
    if (c === ")" || c === "]") depth--;
    if (c === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim() || out.length) out.push(cur.trim());
  return out;
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const BUILTIN_MACROS = (() => {
  const m = new Map();
  const def = (name, params, text) => m.set(name, { params, body: text.trim().split("\n") });
  def("PUTC", ["CHAR"], `
    PUSH AX
    MOV AL, CHAR
    MOV AH, 0Eh
    INT 10h
    POP AX`);
  const printBody = tail => `
    LOCAL pr_str, pr_skip, pr_next, pr_done
    PUSH AX
    PUSH SI
    JMP pr_skip
pr_str DB SDAT${tail}, 0
pr_skip:
    MOV SI, OFFSET pr_str
pr_next:
    MOV AL, CS:[SI]
    CMP AL, 0
    JE pr_done
    MOV AH, 0Eh
    INT 10h
    INC SI
    JMP pr_next
pr_done:
    POP SI
    POP AX`;
  def("PRINT", ["SDAT"], printBody(""));
  def("PRINTN", ["SDAT"], printBody(", 13, 10"));
  def("GOTOXY", ["COL", "ROW"], `
    PUSH AX
    PUSH BX
    PUSH DX
    MOV AH, 02h
    MOV DH, ROW
    MOV DL, COL
    MOV BH, 0
    INT 10h
    POP DX
    POP BX
    POP AX`);
  def("CURSOROFF", [], "    NOP");
  def("CURSORON", [], "    NOP");
  const digits = (p, signed) => `
${signed ? "PRINT_NUM" : "PRINT_NUM_UNS"} PROC NEAR
    PUSH AX
    PUSH BX
    PUSH CX
    PUSH DX
${signed ? `    TEST AX, AX
    JNS ${p}_pos
    PUSH AX
    MOV AL, '-'
    MOV AH, 0Eh
    INT 10h
    POP AX
    NEG AX
${p}_pos:` : ""}
    MOV BX, 10
    XOR CX, CX
${p}_div:
    XOR DX, DX
    DIV BX
    PUSH DX
    INC CX
    TEST AX, AX
    JNZ ${p}_div
${p}_out:
    POP AX
    ADD AL, '0'
    MOV AH, 0Eh
    INT 10h
    LOOP ${p}_out
    POP DX
    POP CX
    POP BX
    POP AX
    RET
${signed ? "PRINT_NUM" : "PRINT_NUM_UNS"} ENDP`;
  def("DEFINE_PRINT_NUM", [], digits("pns", true));
  def("DEFINE_PRINT_NUM_UNS", [], digits("pnu", false));
  def("DEFINE_SCAN_NUM", [], `
SCAN_NUM PROC NEAR
    PUSH AX
    PUSH BX
    PUSH DX
    PUSH SI
    XOR CX, CX
    XOR SI, SI
sn_next:
    MOV AH, 00h
    INT 16h
    CMP AL, 13
    JE sn_done
    CMP AL, 8
    JE sn_back
    CMP AL, '-'
    JNE sn_digit
    TEST CX, CX
    JNZ sn_next
    MOV SI, 1
    MOV AH, 0Eh
    INT 10h
    JMP sn_next
sn_digit:
    CMP AL, '0'
    JB sn_next
    CMP AL, '9'
    JA sn_next
    MOV AH, 0Eh
    INT 10h
    SUB AL, '0'
    XOR AH, AH
    MOV BX, AX
    MOV AX, CX
    MOV DX, 10
    MUL DX
    ADD AX, BX
    MOV CX, AX
    JMP sn_next
sn_back:
    MOV AX, CX
    XOR DX, DX
    MOV BX, 10
    DIV BX
    MOV CX, AX
    MOV AH, 0Eh
    MOV AL, 8
    INT 10h
    MOV AL, ' '
    INT 10h
    MOV AL, 8
    INT 10h
    JMP sn_next
sn_done:
    TEST SI, SI
    JZ sn_end
    NEG CX
sn_end:
    POP SI
    POP DX
    POP BX
    POP AX
    RET
SCAN_NUM ENDP`);
  def("DEFINE_PRINT_STRING", [], `
PRINT_STRING PROC NEAR
    PUSH AX
    PUSH SI
ps_next:
    MOV AL, [SI]
    CMP AL, 0
    JE ps_done
    MOV AH, 0Eh
    INT 10h
    INC SI
    JMP ps_next
ps_done:
    POP SI
    POP AX
    RET
PRINT_STRING ENDP`);
  def("DEFINE_CLEAR_SCREEN", [], `
CLEAR_SCREEN PROC NEAR
    PUSH AX
    PUSH BX
    PUSH CX
    PUSH DX
    MOV AX, 0600h
    MOV BH, 07h
    MOV CX, 0
    MOV DX, 184Fh
    INT 10h
    MOV AH, 02h
    MOV BH, 0
    MOV DX, 0
    INT 10h
    POP DX
    POP CX
    POP BX
    POP AX
    RET
CLEAR_SCREEN ENDP`);
  return m;
})();

function preprocess(src) {
  const raw = src.replace(/\r/g, "").split("\n").map((text, line) => ({ text, line }));
  const macros = new Map(), body = [];
  let include = false;
  for (let k = 0; k < raw.length; k++) {
    const t = stripComment(raw[k].text).trim();
    const m = new RegExp(`^(${IDENT})\\s+MACRO\\b(.*)$`, "i").exec(t);
    if (m) {
      const params = m[2].split(",").map(p => p.trim().toUpperCase()).filter(Boolean), lines = [];
      for (k++; k < raw.length && !/^\s*ENDM\b/i.test(stripComment(raw[k].text)); k++) lines.push(raw[k].text);
      macros.set(m[1].toUpperCase(), { params, body: lines });
      continue;
    }
    if (/^INCLUDE\b/i.test(t)) { if (/emu8086\.inc/i.test(t)) include = true; continue; }
    body.push(raw[k]);
  }
  if (include) for (const [name, d] of BUILTIN_MACROS) if (!macros.has(name)) macros.set(name, d);
  const out = [];
  let uid = 0;
  const call = new RegExp(`^(?:(${IDENT})\\s*:\\s*)?(${IDENT})(?:\\s+(.*))?$`);
  const expand = (lines, depth) => {
    for (const L of lines) {
      const m = call.exec(stripComment(L.text).trim());
      const name = m && m[2].toUpperCase();
      if (!m || !macros.has(name) || depth > 8) { out.push(L); continue; }
      if (m[1]) out.push({ text: m[1] + ":", line: L.line });
      const d = macros.get(name), args = splitOperands(m[3] || ""), id = ++uid, locals = [], kept = [];
      for (const b of d.body) {
        const lm = /^\s*LOCAL\s+(.*)$/i.exec(stripComment(b));
        if (lm) locals.push(...lm[1].split(",").map(s => s.trim()).filter(Boolean));
        else kept.push(b);
      }
      const word = w => new RegExp(`(?<![\\w@?.$])${escapeRe(w)}(?![\\w@?.$])`, "gi");
      const sub = kept.map(b => {
        let s = b;
        d.params.forEach((p, j) => { s = s.replace(word(p), args[j] ?? ""); });
        locals.forEach(lc => { s = s.replace(word(lc), `${lc}??${id}`); });
        return { text: s, line: L.line, macro: name };
      });
      expand(sub, depth + 1);
    }
  };
  expand(body, 0);
  return out;
}

function tokenize(s) {
  const toks = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i], rest = s.slice(i);
    if (/\s/.test(c)) { i++; continue; }
    if (c === "'" || c === '"') {
      const j = s.indexOf(c, i + 1);
      if (j < 0) fail("SYNTAX", { x: s });
      toks.push({ t: "str", v: s.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let m, v;
      if ((m = /^[0-9][0-9A-Fa-f]*[Hh](?![\w])/.exec(rest))) v = parseInt(m[0].slice(0, -1), 16);
      else if ((m = /^0[xX][0-9A-Fa-f]+/.exec(rest))) v = parseInt(m[0].slice(2), 16);
      else if ((m = /^[01]+[Bb](?![\w])/.exec(rest))) v = parseInt(m[0].slice(0, -1), 2);
      else if ((m = /^[0-7]+[OoQq](?![\w])/.exec(rest))) v = parseInt(m[0].slice(0, -1), 8);
      else if ((m = /^[0-9]+[Dd]?(?![\w])/.exec(rest))) v = parseInt(m[0], 10);
      else fail("SYNTAX", { x: s });
      toks.push({ t: "num", v });
      i += m[0].length;
      continue;
    }
    const id = new RegExp(`^${IDENT}`).exec(rest);
    if (id) { toks.push({ t: "id", v: id[0].toUpperCase() }); i += id[0].length; continue; }
    if ("+-*/()[]:".includes(c)) { toks.push({ t: "op", v: c }); i++; continue; }
    fail("SYNTAX", { x: s });
  }
  return toks;
}

class Expr {
  constructor(toks, ctx, allowRegs) { this.t = toks; this.i = 0; this.ctx = ctx; this.allowRegs = allowRegs; }
  peek() { return this.t[this.i]; }
  isOp(v) { const p = this.peek(); return p && (p.t === "op" || p.t === "id") && p.v === v; }
  next() { return this.t[this.i++]; }
  parse() {
    const r = this.sum();
    if (this.i < this.t.length) fail("SYNTAX", { x: this.t.map(t => t.v).join(" ") });
    return r;
  }
  sum() {
    let a = this.product();
    while (this.isOp("+") || this.isOp("-")) {
      const op = this.next().v, b = this.product();
      if (op === "-" && b.regs.length) fail("BAD_ADDR", { x: "" });
      a = { v: op === "+" ? a.v + b.v : a.v - b.v, fwd: a.fwd || b.fwd, regs: [...a.regs, ...b.regs], vars: [...a.vars, ...b.vars], code: a.code || b.code };
    }
    return a;
  }
  product() {
    let a = this.unary();
    while (this.isOp("*") || this.isOp("/") || this.isOp("MOD")) {
      const op = this.next().v, b = this.unary();
      if (a.regs.length || b.regs.length) fail("BAD_ADDR", { x: "" });
      const v = op === "*" ? a.v * b.v : b.v === 0 ? 0 : op === "/" ? Math.trunc(a.v / b.v) : a.v % b.v;
      a = { v, fwd: a.fwd || b.fwd, regs: [], vars: [], code: false };
    }
    return a;
  }
  unary() {
    if (this.isOp("-")) { this.next(); const a = this.unary(); return { ...a, v: -a.v }; }
    if (this.isOp("+")) { this.next(); return this.unary(); }
    if (this.isOp("OFFSET")) { this.next(); const a = this.unary(); return { ...a, vars: [], code: false, offset: true }; }
    if (this.isOp("SEG")) { this.next(); const a = this.unary(); const s = a.sym; return { v: s ? this.ctx.segValue(s.seg) : 0, fwd: a.fwd, regs: [], vars: [], code: false }; }
    return this.primary();
  }
  primary() {
    const tk = this.next();
    if (!tk) fail("SYNTAX", { x: "" });
    if (tk.t === "num") return { v: tk.v, fwd: false, regs: [], vars: [], code: false };
    if (tk.t === "str") {
      if (tk.v.length === 1) return { v: tk.v.charCodeAt(0), fwd: false, regs: [], vars: [], code: false };
      if (tk.v.length === 2) return { v: (tk.v.charCodeAt(0) << 8) | tk.v.charCodeAt(1), fwd: false, regs: [], vars: [], code: false };
      fail("SYNTAX", { x: `'${tk.v}'` });
    }
    if (tk.t === "op" && (tk.v === "(" || tk.v === "[")) {
      const r = this.sum(), close = this.next();
      if (!close || close.v !== (tk.v === "(" ? ")" : "]")) fail("SYNTAX", { x: "" });
      return r;
    }
    if (tk.t === "id") {
      if (["BX", "BP", "SI", "DI"].includes(tk.v)) {
        if (!this.allowRegs) fail("OPERANDS", {});
        return { v: 0, fwd: false, regs: [tk.v], vars: [], code: false };
      }
      if (R16.has(tk.v) || R8.has(tk.v)) fail(this.allowRegs ? "BAD_ADDR" : "OPERANDS", { x: tk.v });
      if (tk.v === "$") return { v: this.ctx.here(), fwd: false, regs: [], vars: [], code: false };
      return this.ctx.symbol(tk.v);
    }
    fail("SYNTAX", { x: tk.v });
  }
}

function assemble(src) {
  const lines = preprocess(src);
  const upper = lines.map(L => stripComment(L.text).trim().toUpperCase());
  const tiny = upper.some(t => /^\.MODEL\s+TINY/.test(t));
  const exe = !tiny && upper.some(t => /^\.(MODEL|CODE|DATA|STACK)\b/.test(t) || new RegExp(`^${IDENT}\\s+SEGMENT\\b`).test(t));
  const mode = exe ? "exe" : "com";
  const syms = new Map();
  let prev = "", res;
  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    res = runPass(lines, mode, syms, false);
    const sig = [...syms.values()].map(s => `${s.seg}:${s.off}:${s.v}`).join("|");
    if (pass > 1 && sig === prev) break;
    prev = sig;
  }
  res = runPass(lines, mode, syms, true);
  return finish(res, mode, syms, lines);
}

function runPass(lines, mode, syms, final) {
  const segs = new Map(), order = [], errors = [], listing = [];
  const procs = [];
  let cur = null, entry = null, firstCode = null, stopped = false;
  const getSeg = name => {
    if (!segs.has(name)) { const s = { name, lc: 0, size: 0, bytes: new Map(), stack: false }; segs.set(name, s); order.push(s); }
    return segs.get(name);
  };
  if (mode === "com") { cur = getSeg("PROGRAM"); cur.lc = COM_ORIGIN; }
  const ctx = {
    idx: 0,
    here: () => (cur ? cur.lc : 0),
    segValue: name => { const s = syms.get(name); return s && s.kind === "seg" ? s.v : 0; },
    symbol(name) {
      const s = syms.get(name);
      if (!s || (s.kind === "seg" && s.v === undefined)) {
        if (final) fail("UNKNOWN_SYM", { x: name });
        return { v: 0, fwd: true, regs: [], vars: [], code: false };
      }
      const fwd = s.defLine > ctx.idx;
      if (s.kind === "equ") return { v: s.v, fwd, regs: [], vars: [], code: false };
      if (s.kind === "seg") return { v: s.v, fwd: false, regs: [], vars: [], code: false };
      if (s.kind === "var") return { v: s.off, fwd, regs: [], vars: [s], code: false, sym: s };
      return { v: s.off, fwd, regs: [], vars: [], code: true, sym: s };
    }
  };
  const define = (name, info) => {
    const key = name.toUpperCase();
    if (["AX", "BX", "CX", "DX", "AL", "AH", "BL", "BH", "CL", "CH", "DL", "DH", "SI", "DI", "SP", "BP", "CS", "DS", "ES", "SS"].includes(key) || MNEMONICS.has(key)) fail("RESERVED_NAME", { x: name });
    const old = syms.get(key);
    if (old && old.defLine !== ctx.idx && old.kind !== "seg") fail("DUP_LABEL", { x: name });
    syms.set(key, { ...old, ...info, name: key, defLine: ctx.idx });
  };
  const needSeg = () => { if (!cur) cur = getSeg("_TEXT"); return cur; };
  const emit = (bytes, kind, line) => {
    const s = needSeg();
    if (kind === "code" && !firstCode) firstCode = { seg: s.name, off: s.lc };
    listing.push({ line, seg: s.name, off: s.lc, bytes: bytes.slice(), kind });
    bytes.forEach((b, i) => s.bytes.set((s.lc + i) & 0xFFFF, b & 0xFF));
    s.lc += bytes.length;
    s.size = Math.max(s.size, s.lc);
  };
  const evalExpr = (text, allowRegs = false) => new Expr(tokenize(text), ctx, allowRegs).parse();

  const parseOperand = text => {
    let s = text.trim(), size = 0, dist = "";
    let m = /^(BYTE|WORD|DWORD)\s+PTR\s+/i.exec(s);
    if (m) { size = { BYTE: 1, WORD: 2, DWORD: 4 }[m[1].toUpperCase()]; s = s.slice(m[0].length); }
    m = /^(SHORT|NEAR|FAR)(\s+PTR)?\s+/i.exec(s);
    if (m) { dist = m[1].toUpperCase(); s = s.slice(m[0].length); }
    const up = s.toUpperCase();
    if (R16.has(up)) return { k: "r", n: R16.get(up), w: 1, text: up };
    if (R8.has(up)) return { k: "r", n: R8.get(up), w: 0, text: up };
    if (RS.has(up)) return { k: "s", n: RS.get(up), text: up };
    let seg = -1;
    m = /^(ES|CS|SS|DS)\s*:\s*/i.exec(s);
    if (m) { seg = RS.get(m[1].toUpperCase()); s = s.slice(m[0].length); }
    const toks = tokenize(s);
    const bracket = toks.some(t => t.t === "op" && t.v === "[");
    const r = new Expr(toks, ctx, true).parse();
    if (bracket || r.regs.length || r.vars.length || seg >= 0 || (size && !dist)) {
      const varSize = r.vars.length && r.vars[0].size <= 4 ? r.vars[0].size : 0;
      return { k: "m", regs: r.regs, disp: r.v, fwd: r.fwd, size: size || varSize, seg, text };
    }
    return { k: "i", v: r.v, fwd: r.fwd, code: r.code, sym: r.sym, dist, text };
  };

  const sz = o => (o.k === "r" ? (o.w ? 2 : 1) : o.k === "m" ? o.size : o.k === "s" ? 2 : 0);
  const imm16 = v => [v & 0xFF, (v >> 8) & 0xFF];
  const immW = (v, w) => (w ? imm16(v) : [v & 0xFF]);
  const fitsS8 = v => { const x = v & 0xFFFF; return x <= 0x7F || x >= 0xFF80; };
  const pfx = o => {
    if (o.k !== "m" || o.seg < 0) return [];
    const def = o.regs.includes("BP") ? 2 : 3;
    return o.seg === def ? [] : [0x26 | (o.seg << 3)];
  };
  const modrm = (reg, o) => {
    if (o.k === "r") return [0xC0 | (reg << 3) | o.n];
    const key = [...o.regs].sort().join("+");
    if (!key) return [(reg << 3) | 6, ...imm16(o.disp)];
    const rm = RM_CODE[key];
    if (rm === undefined) fail("BAD_ADDR", { x: o.text });
    const d = s16(o.disp & 0xFFFF);
    if (!o.fwd && d === 0 && rm !== 6) return [(reg << 3) | rm];
    if (!o.fwd && d >= -128 && d <= 127) return [0x40 | (reg << 3) | rm, d & 0xFF];
    return [0x80 | (reg << 3) | rm, ...imm16(o.disp)];
  };
  const sameSize = (mn, a, b) => {
    const x = sz(a), y = sz(b);
    if (x && y && x !== y) fail("SIZE_MISMATCH", { mn, a: a.text, b: b.text, sa: x, sb: y });
    const size = x || y;
    if (!size) fail("SIZE_UNKNOWN", { mn });
    if (size > 2) fail("OPERANDS", { mn });
    return size === 2 ? 1 : 0;
  };
  const sizeOf = (mn, d) => {
    const size = sz(d);
    if (!size) fail("SIZE_UNKNOWN", { mn });
    if (size > 2) fail("OPERANDS", { mn });
    return size === 2 ? 1 : 0;
  };
  const checkImm = (i, w) => {
    if (i.fwd) return;
    const v = i.v;
    if (w ? v < -0x8000 || v > 0xFFFF : v < -0x80 || v > 0xFF) fail("IMM_RANGE", { v: i.text, bits: w ? 16 : 8 });
  };
  const count = (mn, ops, n) => { if (ops.length !== n) fail("OPERAND_COUNT", { mn, n, got: ops.length }); };
  const rel = (mn, t, size) => {
    const d = t.v - (cur.lc + size);
    if (final && (d < -128 || d > 127)) {
      const cc = JCC_CODES[mn];
      fail("JUMP_RANGE", { mn, label: t.text, d, inv: cc !== undefined ? JCC[cc ^ 1] : "" });
    }
    return d & 0xFF;
  };

  const encode = (mn, ops, prefixes) => {
    const P = prefixes;
    if (SIMPLE[mn] && !ops.length) return [...P, ...SIMPLE[mn]];
    if (SIMPLE[mn]) fail("OPERAND_COUNT", { mn, n: 0, got: ops.length });
    if (mn === "AAM" || mn === "AAD") return [mn === "AAM" ? 0xD4 : 0xD5, ops.length ? ops[0].v & 0xFF : 0x0A];
    if (mn === "MOV") {
      count(mn, ops, 2);
      const [d, s] = ops;
      if (d.k === "m" && s.k === "m") fail("TWO_MEM", { mn });
      if (d.k === "i") fail("DEST_IMM", { mn });
      if (d.k === "s") {
        if (s.k === "i") fail("SEG_IMM", { x: d.text });
        if (s.k === "s") fail("SEG_SEG", {});
        if (d.n === 1) fail("MOV_CS", {});
        if (sz(s) === 1) fail("SIZE_MISMATCH", { mn, a: d.text, b: s.text, sa: 2, sb: 1 });
        return [...pfx(s), 0x8E, ...modrm(d.n, s)];
      }
      if (s.k === "s") {
        if (sz(d) === 1) fail("SIZE_MISMATCH", { mn, a: d.text, b: s.text, sa: 1, sb: 2 });
        return [...pfx(d), 0x8C, ...modrm(s.n, d)];
      }
      if (s.k === "i") {
        const w = sizeOf(mn, d);
        checkImm(s, w);
        if (d.k === "r") return w ? [0xB8 + d.n, ...imm16(s.v)] : [0xB0 + d.n, s.v & 0xFF];
        return [...pfx(d), 0xC6 | w, ...modrm(0, d), ...immW(s.v, w)];
      }
      const w = sameSize(mn, d, s);
      if (d.k === "r" && s.k === "r") return [0x8A | w, 0xC0 | (d.n << 3) | s.n];
      if (d.k === "r" && d.n === 0 && !s.regs.length) return [...pfx(s), 0xA0 | w, ...imm16(s.disp)];
      if (s.k === "r" && s.n === 0 && !d.regs.length) return [...pfx(d), 0xA2 | w, ...imm16(d.disp)];
      if (d.k === "r") return [...pfx(s), 0x8A | w, ...modrm(d.n, s)];
      return [...pfx(d), 0x88 | w, ...modrm(s.n, d)];
    }
    if (ALU_INDEX[mn] !== undefined) {
      count(mn, ops, 2);
      const op = ALU_INDEX[mn], [d, s] = ops;
      if (d.k === "m" && s.k === "m") fail("TWO_MEM", { mn });
      if (d.k === "i") fail("DEST_IMM", { mn });
      if (d.k === "s" || s.k === "s") fail("SEG_ALU", { mn });
      if (s.k === "i") {
        const w = sizeOf(mn, d);
        checkImm(s, w);
        if (d.k === "r" && d.n === 0) return w ? [op * 8 + 5, ...imm16(s.v)] : [op * 8 + 4, s.v & 0xFF];
        if (w && !s.fwd && fitsS8(s.v)) return [...pfx(d), 0x83, ...modrm(op, d), s.v & 0xFF];
        return [...pfx(d), 0x80 | w, ...modrm(op, d), ...immW(s.v, w)];
      }
      const w = sameSize(mn, d, s);
      if (d.k === "r") return [...pfx(s), op * 8 + 2 + w, ...modrm(d.n, s)];
      return [...pfx(d), op * 8 + w, ...modrm(s.n, d)];
    }
    if (mn === "TEST") {
      count(mn, ops, 2);
      const [d, s] = ops;
      if (d.k === "m" && s.k === "m") fail("TWO_MEM", { mn });
      if (d.k === "s" || s.k === "s") fail("SEG_ALU", { mn });
      if (s.k === "i") {
        const w = sizeOf(mn, d);
        checkImm(s, w);
        if (d.k === "r" && d.n === 0) return w ? [0xA9, ...imm16(s.v)] : [0xA8, s.v & 0xFF];
        return [...pfx(d), 0xF6 | w, ...modrm(0, d), ...immW(s.v, w)];
      }
      if (d.k === "i") fail("DEST_IMM", { mn });
      const w = sameSize(mn, d, s);
      return s.k === "r" ? [...pfx(d), 0x84 | w, ...modrm(s.n, d)] : [...pfx(s), 0x84 | w, ...modrm(d.n, s)];
    }
    if (mn === "XCHG") {
      count(mn, ops, 2);
      const [d, s] = ops;
      if (d.k === "m" && s.k === "m") fail("TWO_MEM", { mn });
      if (d.k === "i" || s.k === "i" || d.k === "s" || s.k === "s") fail("OPERANDS", { mn });
      const w = sameSize(mn, d, s);
      if (w && d.k === "r" && s.k === "r" && (d.n === 0 || s.n === 0)) return [0x90 + (d.n === 0 ? s.n : d.n)];
      const reg = d.k === "r" ? d : s, other = reg === d ? s : d;
      return [...pfx(other), 0x86 | w, ...modrm(reg.n, other)];
    }
    if (mn === "INC" || mn === "DEC") {
      count(mn, ops, 1);
      const [d] = ops;
      if (d.k === "i" || d.k === "s") fail("OPERANDS", { mn });
      if (d.k === "r" && d.w) return [(mn === "INC" ? 0x40 : 0x48) + d.n];
      const w = sizeOf(mn, d);
      return [...pfx(d), 0xFE | w, ...modrm(mn === "INC" ? 0 : 1, d)];
    }
    if (GRP3_INDEX[mn] !== undefined) {
      if (ops[0] && ops[0].k === "i" && mn !== "NOT" && mn !== "NEG") fail("MUL_IMM", { mn, v: ops[0].text });
      count(mn, ops, 1);
      const [d] = ops;
      if (d.k === "i" || d.k === "s") fail("OPERANDS", { mn });
      const w = sizeOf(mn, d);
      return [...pfx(d), 0xF6 | w, ...modrm(GRP3_INDEX[mn], d)];
    }
    if (SHIFT_INDEX[mn] !== undefined) {
      if (ops.length === 1) ops = [ops[0], { k: "i", v: 1, text: "1" }];
      count(mn, ops, 2);
      const [d, c] = ops;
      if (d.k === "i" || d.k === "s") fail("OPERANDS", { mn });
      const w = sizeOf(mn, d);
      if (c.k === "i") {
        if (c.v !== 1) fail("SHIFT_COUNT", { mn, x: d.text, v: c.text });
        return [...pfx(d), 0xD0 | w, ...modrm(SHIFT_INDEX[mn], d)];
      }
      if (c.k === "r" && !c.w && c.n === 1) return [...pfx(d), 0xD2 | w, ...modrm(SHIFT_INDEX[mn], d)];
      fail("SHIFT_COUNT", { mn, x: d.text, v: c.text });
    }
    if (mn === "PUSH" || mn === "POP") {
      count(mn, ops, 1);
      const [d] = ops, push = mn === "PUSH";
      if (d.k === "i") fail(push ? "PUSH_IMM" : "OPERANDS", { mn, v: d.text });
      if (d.k === "r") { if (!d.w) fail("PUSH_8", { mn, x: d.text, y: REG16[d.n & 3] }); return [(push ? 0x50 : 0x58) + d.n]; }
      if (d.k === "s") { if (!push && d.n === 1) fail("POP_CS", {}); return [(push ? 0x06 : 0x07) | (d.n << 3)]; }
      if (d.size === 1) fail("PUSH_8", { mn, x: d.text, y: "AX" });
      return push ? [...pfx(d), 0xFF, ...modrm(6, d)] : [...pfx(d), 0x8F, ...modrm(0, d)];
    }
    if (mn === "LEA" || mn === "LDS" || mn === "LES") {
      count(mn, ops, 2);
      const [d, s] = ops;
      if (d.k !== "r" || !d.w || s.k !== "m") fail("OPERANDS", { mn });
      return [...(mn === "LEA" ? [] : pfx(s)), { LEA: 0x8D, LDS: 0xC5, LES: 0xC4 }[mn], ...modrm(d.n, s)];
    }
    if (mn === "INT") {
      count(mn, ops, 1);
      if (ops[0].k !== "i") fail("OPERANDS", { mn });
      return ops[0].v === 3 ? [0xCC] : [0xCD, ops[0].v & 0xFF];
    }
    if (mn === "IN" || mn === "OUT") {
      count(mn, ops, 2);
      const [a, b] = mn === "IN" ? ops : [ops[1], ops[0]];
      if (a.k !== "r" || a.n !== 0) fail("IO_ACC", { mn });
      if (b.k === "i") return [(mn === "IN" ? 0xE4 : 0xE6) | a.w, b.v & 0xFF];
      if (b.k === "r" && b.w && b.n === 2) return [(mn === "IN" ? 0xEC : 0xEE) | a.w];
      fail("IO_ACC", { mn });
    }
    if (mn === "RET" || mn === "RETN" || mn === "RETF") {
      const far = mn === "RETF" || (mn === "RET" && procs.length && procs[procs.length - 1].far);
      if (!ops.length) return [far ? 0xCB : 0xC3];
      return [far ? 0xCA : 0xC2, ...imm16(ops[0].v)];
    }
    if (JCC_CODES[mn] !== undefined || LOOP_CODES[mn] !== undefined) {
      count(mn, ops, 1);
      const t = ops[0];
      if (t.k !== "i") fail("JUMP_TARGET", { mn });
      return [JCC_CODES[mn] !== undefined ? 0x70 + JCC_CODES[mn] : LOOP_CODES[mn], rel(mn, t, 2)];
    }
    if (mn === "JMP" || mn === "CALL") {
      count(mn, ops, 1);
      const t = ops[0], call = mn === "CALL";
      if (t.k === "r" || t.k === "m") {
        if (t.k === "r" && !t.w) fail("OPERANDS", { mn });
        return [...pfx(t), 0xFF, ...modrm(call ? (t.size === 4 ? 3 : 2) : t.size === 4 ? 5 : 4, t)];
      }
      if (t.k !== "i") fail("JUMP_TARGET", { mn });
      if (t.dist === "FAR" || (call && t.sym && t.sym.far)) {
        const seg = mode === "com" ? LOAD_SEG : t.sym ? ctx.segValue(t.sym.seg) : 0;
        return [call ? 0x9A : 0xEA, ...imm16(t.v), ...imm16(seg)];
      }
      if (!call && (t.dist === "SHORT" || (!t.fwd && t.dist !== "NEAR" && t.v - (cur.lc + 2) >= -128 && t.v - (cur.lc + 2) <= 127))) return [0xEB, rel(mn, t, 2)];
      return [call ? 0xE8 : 0xE9, ...imm16(t.v - (cur.lc + 3))];
    }
    fail("UNKNOWN_MN", { x: mn });
  };

  const dataItems = (kind, text, out) => {
    const size = DATA_SIZE[kind];
    for (const item of splitOperands(text)) {
      if (!item) continue;
      const dup = /^(.+?)\s+DUP\s*\(([\s\S]*)\)$/i.exec(item);
      if (dup) {
        const n = evalExpr(dup[1]).v, inner = [];
        dataItems(kind, dup[2], inner);
        for (let i = 0; i < n; i++) out.push(...inner);
        continue;
      }
      if (item === "?") { for (let i = 0; i < size; i++) out.push(0); continue; }
      const str = /^(['"])([\s\S]*)\1$/.exec(item);
      if (str && kind === "DB") { for (const ch of str[2]) out.push(ch.charCodeAt(0) & 0xFF); continue; }
      const r = evalExpr(item);
      if (kind === "DB") {
        if (!r.fwd && (r.v < -128 || r.v > 255)) fail("IMM_RANGE", { v: item, bits: 8 });
        out.push(r.v & 0xFF);
      } else if (kind === "DW") out.push(...imm16(r.v));
      else {
        const hi = r.sym && r.sym.kind !== "equ" ? ctx.segValue(r.sym.seg) : (r.v >>> 16) & 0xFFFF;
        out.push(...imm16(r.v), ...imm16(hi));
      }
    }
  };

  for (let i = 0; i < lines.length && !stopped; i++) {
    const L = lines[i];
    ctx.idx = i;
    let text = stripComment(L.text).trim();
    if (!text || text.startsWith("#")) continue;
    try {
      let m = new RegExp(`^(${IDENT})\\s*:(?!\\s*\\[)\\s*`).exec(text);
      if (m && !RS.has(m[1].toUpperCase())) {
        const after = text.slice(m[0].length), w = after.split(/\s+/)[0].toUpperCase();
        if (DATA_SIZE[w]) define(m[1], { kind: "var", seg: needSeg().name, off: cur.lc, size: DATA_SIZE[w] });
        else define(m[1], { kind: "label", seg: needSeg().name, off: cur.lc });
        text = after;
        if (!text) continue;
      }
      const words = text.split(/\s+/), w1 = words[0].toUpperCase(), w2 = (words[1] || "").toUpperCase();
      const rest1 = words.length > 1 ? text.slice(words[0].length).trim() : "";
      const rest2 = words.length > 2 ? rest1.slice(words[1].length).trim() : "";
      if (DATA_SIZE[w2] && !MNEMONICS.has(w1)) {
        define(words[0], { kind: "var", seg: needSeg().name, off: cur.lc, size: DATA_SIZE[w2] });
        const out = [];
        dataItems(w2, rest2, out);
        emit(out, "data", L.line);
      } else if (w2 === "EQU" || w2 === "=") {
        const r = evalExpr(rest2);
        define(words[0], { kind: "equ", v: r.v });
      } else if (w2 === "PROC") {
        define(words[0], { kind: "label", seg: needSeg().name, off: cur.lc, proc: true, far: /\bFAR\b/i.test(rest2) });
        procs.push({ name: words[0].toUpperCase(), far: /\bFAR\b/i.test(rest2) });
      } else if (w2 === "ENDP") {
        procs.pop();
      } else if (w2 === "LABEL") {
        const t = rest2.toUpperCase();
        define(words[0], t === "BYTE" || t === "WORD" ? { kind: "var", seg: needSeg().name, off: cur.lc, size: t === "BYTE" ? 1 : 2 } : { kind: "label", seg: needSeg().name, off: cur.lc });
      } else if (w2 === "SEGMENT") {
        if (mode === "exe") {
          const name = words[0].toUpperCase();
          cur = getSeg(name);
          if (/\bSTACK\b/i.test(rest2) || name === "STACK") cur.stack = true;
          if (!syms.has(name) || syms.get(name).kind !== "seg") syms.set(name, { kind: "seg", name, defLine: -1, v: undefined, seg: name });
        }
      } else if (w2 === "ENDS") {
        if (mode === "exe") cur = null;
      } else if (DATA_SIZE[w1]) {
        const out = [];
        dataItems(w1, rest1, out);
        emit(out, "data", L.line);
      } else if (w1 === "ORG") {
        needSeg().lc = evalExpr(rest1).v & 0xFFFF;
      } else if (w1 === ".MODEL" || IGNORED.has(w1)) {
        continue;
      } else if (w1 === ".STACK") {
        if (mode === "exe") {
          const s = getSeg("STACK");
          s.stack = true;
          s.size = Math.max(s.size, rest1 ? evalExpr(rest1).v : 1024);
          syms.set("STACK", { ...syms.get("STACK"), kind: "seg", name: "STACK", defLine: -1, seg: "STACK" });
        }
      } else if (w1 === ".DATA" || w1 === ".DATA?") {
        if (mode === "exe") { cur = getSeg("_DATA"); if (!syms.has("_DATA")) syms.set("_DATA", { kind: "seg", name: "_DATA", defLine: -1, seg: "_DATA" }); }
      } else if (w1 === ".CODE") {
        if (mode === "exe") { cur = getSeg("_TEXT"); if (!syms.has("_TEXT")) syms.set("_TEXT", { kind: "seg", name: "_TEXT", defLine: -1, seg: "_TEXT" }); }
      } else if (w1 === "END") {
        if (rest1) entry = rest1.toUpperCase();
        stopped = true;
      } else {
        const prefixes = [];
        let mnText = words[0], opText = rest1;
        while (PREFIX[mnText.toUpperCase()]) {
          prefixes.push(PREFIX[mnText.toUpperCase()]);
          const t = opText.split(/\s+/);
          mnText = t[0];
          opText = opText.slice(mnText.length).trim();
        }
        const mn = mnText.toUpperCase();
        if (!MNEMONICS.has(mn)) fail("UNKNOWN_MN", { x: mnText });
        needSeg();
        const ops = opText ? splitOperands(opText).map(parseOperand) : [];
        emit(encode(mn, ops, prefixes), "code", L.line);
      }
    } catch (e) {
      if (!(e instanceof AsmError)) throw e;
      if (final) errors.push({ line: L.line, code: e.code, args: e.args, macro: L.macro });
    }
  }

  let base = mode === "com" ? LOAD_SEG : LOAD_SEG + PSP_PARAS;
  for (const s of order) {
    if (mode === "com") { s.base = LOAD_SEG; continue; }
    s.base = base;
    base += Math.ceil(s.size / 16);
    syms.set(s.name, { ...(syms.get(s.name) || {}), kind: "seg", name: s.name, v: s.base, defLine: -1, seg: s.name });
  }
  const dataSeg = segs.get("_DATA") || segs.get("DATA");
  if (dataSeg) syms.set("@DATA", { kind: "seg", name: "@DATA", v: dataSeg.base, defLine: -1, seg: dataSeg.name });
  const codeSeg = segs.get("_TEXT") || segs.get("CODE");
  if (codeSeg) syms.set("@CODE", { kind: "seg", name: "@CODE", v: codeSeg.base, defLine: -1, seg: codeSeg.name });
  return { segs: order, errors, listing, entry, firstCode, nextPara: base };
}

function finish(res, mode, syms, lines) {
  const errors = res.errors.slice().sort((a, b) => a.line - b.line);
  const segBase = new Map(res.segs.map(s => [s.name, s.base]));
  const segments = res.segs.map(s => {
    const bytes = new Uint8Array(s.size);
    for (const [off, b] of s.bytes) if (off < s.size) bytes[off] = b;
    return { name: s.name, base: s.base, size: s.size, bytes, stack: s.stack };
  });
  let cs = LOAD_SEG, ip = COM_ORIGIN;
  if (res.entry) {
    const e = syms.get(res.entry);
    if (!e || e.kind === "equ" || e.kind === "seg") errors.push({ line: lines.length ? lines[lines.length - 1].line : 0, code: "UNKNOWN_SYM", args: { x: res.entry } });
    else { cs = segBase.get(e.seg); ip = e.off; }
  } else if (mode === "exe" && res.firstCode) {
    cs = segBase.get(res.firstCode.seg); ip = res.firstCode.off;
  }
  let ss = LOAD_SEG, sp = 0xFFFE;
  if (mode === "exe") {
    const st = segments.find(s => s.stack);
    if (st) { ss = st.base; sp = st.size & 0xFFFF; }
    else { ss = res.nextPara; sp = DEFAULT_STACK; }
  }
  const lineAt = new Map(), addrsOfLine = new Map(), listing = [];
  for (const l of res.listing) {
    const base = segBase.get(l.seg), linear = ((base << 4) + l.off) & 0xFFFFF;
    listing.push({ ...l, base, linear });
    if (l.kind === "code") {
      if (!lineAt.has(linear)) lineAt.set(linear, l.line);
      if (!addrsOfLine.has(l.line)) addrsOfLine.set(l.line, []);
      addrsOfLine.get(l.line).push(linear);
    }
  }
  const codeBytes = res.listing.filter(l => l.kind === "code").length;
  if (!codeBytes && !errors.length) errors.push({ line: 0, code: "NO_CODE", args: {} });
  return { mode, segments, entry: { cs, ip }, ss, sp, lineAt, addrsOfLine, listing, errors, symbols: syms };
}

class Machine {
  constructor() {
    this.cpu = new CPU();
    this.cpu.intHook = n => this.int(n);
    const readPort = p => (this.ports.has(p & 0xFFFF) ? this.ports.get(p & 0xFFFF) : 0xFF);
    this.cpu.portIn = (port, w) => (w ? readPort(port) | (readPort(port + 1) << 8) : readPort(port));
    this.cpu.portOut = (port, v, w) => {
      this.ports.set(port & 0xFFFF, v & 0xFF);
      if (w) this.ports.set((port + 1) & 0xFFFF, (v >> 8) & 0xFF);
      this.lastPort = { port, v: w ? v & 0xFFFF : v & 0xFF };
    };
    this.ports = new Map();
    this.prog = null;
    this.reset();
  }

  reset() {
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

  load(prog) {
    const c = this.cpu;
    this.prog = prog;
    this.reset();
    this.ports.clear();
    c.mem.fill(0);
    c.r.fill(0);
    c.halted = false;
    c.flags = FLAGS_FIXED | F.IF;
    const psp = LOAD_SEG;
    for (const s of prog.segments) c.mem.set(s.bytes, s.base << 4);
    c.mem[psp << 4] = 0xCD;
    c.mem[(psp << 4) + 1] = 0x20;
    c.mem[(psp << 4) + 2] = TOP_OF_MEMORY_PARA & 0xFF;
    c.mem[(psp << 4) + 3] = TOP_OF_MEMORY_PARA >> 8;
    c.mem[(psp << 4) + 0x81] = 0x0D;
    c.mem[(BIOS_SEG << 4) + 0x49] = 3;
    c.mem[(BIOS_SEG << 4) + 0x4A] = COLS;
    for (let i = 0; i < VIDEO_BYTES; i += 2) { c.mem[VIDEO_LIN + i] = 0x20; c.mem[VIDEO_LIN + i + 1] = DEFAULT_ATTR; }
    c.videoDirty = true;
    c.lastVideo = null;
    c.s[0] = psp; c.s[3] = psp;
    c.s[1] = prog.entry.cs; c.ip = prog.entry.ip;
    c.s[2] = prog.ss; c.r[4] = prog.sp;
    this.ranges = prog.segments.map(s => [s.base << 4, (s.base << 4) + Math.max(s.size, 1)]);
    this.ranges.push([psp << 4, (psp << 4) + 0x100]);
  }

  snapshot() {
    const c = this.cpu;
    return {
      r: c.r.slice(), s: c.s.slice(), ip: c.ip, flags: c.flags, halted: c.halted,
      exited: this.exited, exitCode: this.exitCode, keyPos: this.keyPos,
      lineBuf: this.lineBuf ? this.lineBuf.slice() : null, notice: this.notice, steps: this.steps
    };
  }

  restore(s) {
    const c = this.cpu;
    c.r.set(s.r); c.s.set(s.s); c.ip = s.ip; c.flags = s.flags; c.halted = s.halted;
    this.exited = s.exited; this.exitCode = s.exitCode; this.keyPos = s.keyPos;
    this.lineBuf = s.lineBuf ? s.lineBuf.slice() : null; this.notice = s.notice; this.steps = s.steps;
    this.waiting = false;
  }

  get done() { return this.exited || this.cpu.halted || (this.notice && this.notice.fatal); }
  get lastRecord() { return this.history[this.history.length - 1] || null; }

  inRange(lin) { return this.ranges.some(([a, b]) => lin >= a && lin < b); }

  step(capture) {
    if (this.done) return null;
    const c = this.cpu, snap = this.snapshot(), log = [];
    c.log = log;
    this.waiting = false;
    this.breakHit = false;
    const ins = c.decode();
    if (capture) ins.pre = ins.ops.map(o => c.get(o));
    c.exec(ins);
    if (capture) ins.post = ins.ops.map(o => c.get(o));
    c.log = null;
    if (this.waiting) {
      c.r.set(snap.r); c.s.set(snap.s); c.ip = snap.ip; c.flags = snap.flags;
      for (let i = log.length - 2; i >= 0; i -= 2) c.mem[log[i]] = log[i + 1];
      return ins;
    }
    this.steps++;
    this.history.push({ snap, log, ins });
    if (this.history.length > HISTORY_MAX + HISTORY_TRIM) this.history.splice(0, HISTORY_TRIM);
    if (!this.done && !this.inRange(c.lin(c.s[1], c.ip))) {
      this.notice = { code: "RUNAWAY", args: { ip: `${hex(c.s[1])}:${hex(c.ip)}` }, fatal: true };
    }
    return ins;
  }

  back() {
    const h = this.history.pop();
    if (!h) return false;
    for (let i = h.log.length - 2; i >= 0; i -= 2) this.cpu.mem[h.log[i]] = h.log[i + 1];
    this.cpu.videoDirty = true;
    this.restore(h.snap);
    return true;
  }

  pressKey(ascii, scan = 0) { this.keys.push({ a: ascii & 0xFF, s: scan & 0xFF }); }
  hasKey() { return this.keyPos < this.keys.length; }
  readKey() { return this.keys[this.keyPos++]; }
  waitKey() { this.waiting = true; return true; }

  cursor() { const c = this.cpu; return { row: c.rb(BIOS_SEG, CURSOR_ROW), col: c.rb(BIOS_SEG, CURSOR_COL) }; }
  setCursor(row, col) { this.cpu.wb(BIOS_SEG, CURSOR_ROW, row); this.cpu.wb(BIOS_SEG, CURSOR_COL, col); }
  cell(row, col) { return (row * COLS + col) * 2; }
  put(row, col, ch, attr) {
    const o = this.cell(row, col);
    this.cpu.wb(VIDEO_SEG, o, ch);
    if (attr !== undefined) this.cpu.wb(VIDEO_SEG, o + 1, attr);
  }
  scroll(lines, attr, r0, c0, r1, c1, down = false) {
    const c = this.cpu, h = r1 - r0 + 1;
    if (lines === 0 || lines >= h) lines = h;
    for (let i = 0; i < h; i++) {
      const row = down ? r1 - i : r0 + i, src = down ? row - lines : row + lines;
      for (let col = c0; col <= c1; col++) {
        const o = this.cell(row, col);
        if ((down ? src >= r0 : src <= r1)) {
          const so = this.cell(src, col);
          c.wb(VIDEO_SEG, o, c.rb(VIDEO_SEG, so)); c.wb(VIDEO_SEG, o + 1, c.rb(VIDEO_SEG, so + 1));
        } else { c.wb(VIDEO_SEG, o, 0x20); c.wb(VIDEO_SEG, o + 1, attr); }
      }
    }
  }
  moveTo(row, col) {
    if (col >= COLS) { col = 0; row++; }
    if (row >= ROWS) { this.scroll(1, DEFAULT_ATTR, 0, 0, ROWS - 1, COLS - 1); row = ROWS - 1; }
    this.setCursor(row, col);
  }
  advance() { const { row, col } = this.cursor(); this.moveTo(row, col + 1); }
  tty(ch) {
    let { row, col } = this.cursor();
    if (ch === 13) col = 0;
    else if (ch === 10) row++;
    else if (ch === 8) { if (col > 0) col--; }
    else if (ch === 7) return;
    else if (ch === 9) col = (col + 8) & ~7;
    else { this.put(row, col, ch); col++; }
    this.moveTo(row, col);
  }
  exit(code) { this.exited = true; this.exitCode = code; }

  int(n) {
    const c = this.cpu, ah = c.get8(4), al = c.get8(0);
    const vector = c.rw(0, n * 4) | c.rw(0, n * 4 + 2);
    if (vector && n !== 0x21 && n !== 0x10 && n !== 0x16 && n !== 0x20) return false;
    switch (n) {
      case 0x00:
        for (const ch of "\r\nDivide overflow\r\n") this.tty(ch.charCodeAt(0));
        this.notice = { code: "DIV0", args: {}, fatal: true };
        this.exit(0xFF);
        return true;
      case 0x03:
        this.breakHit = true;
        return true;
      case 0x20: this.exit(0); return true;
      case 0x21: return this.dos(ah, al);
      case 0x10: return this.video(ah, al);
      case 0x16: {
        if (ah === 0x00 || ah === 0x10) {
          if (!this.hasKey()) return this.waitKey();
          const k = this.readKey();
          c.r[0] = (k.s << 8) | k.a;
          return true;
        }
        if (ah === 0x01 || ah === 0x11) {
          if (this.hasKey()) { const k = this.keys[this.keyPos]; c.r[0] = (k.s << 8) | k.a; c.setF(F.ZF, false); }
          else c.setF(F.ZF, true);
          return true;
        }
        if (ah === 0x02) { c.set8(0, 0); return true; }
        break;
      }
      case 0x1A:
        if (ah === 0x00) {
          const t = Math.floor(((Date.now() % 86400000) / 1000) * 18.2065);
          c.r[1] = (t >>> 16) & 0xFFFF; c.r[2] = t & 0xFFFF; c.set8(0, 0);
          return true;
        }
        break;
    }
    this.notice = { code: "UNSUPPORTED_INT", args: { n: hex(n, 2), ah: hex(ah, 2) } };
    return true;
  }

  dos(ah, al) {
    const c = this.cpu;
    switch (ah) {
      case 0x00: this.exit(0); return true;
      case 0x01: case 0x07: case 0x08: {
        if (!this.hasKey()) return this.waitKey();
        const k = this.readKey();
        c.set8(0, k.a);
        if (ah === 0x01) this.tty(k.a);
        return true;
      }
      case 0x02: { const ch = c.get8(2); this.tty(ch); c.set8(0, ch); return true; }
      case 0x06: {
        if (c.get8(2) !== 0xFF) { this.tty(c.get8(2)); c.set8(0, c.get8(2)); return true; }
        if (this.hasKey()) { c.set8(0, this.readKey().a); c.setF(F.ZF, false); } else { c.set8(0, 0); c.setF(F.ZF, true); }
        return true;
      }
      case 0x09: {
        let off = c.r[2];
        for (let i = 0; i < STRING_LIMIT; i++) {
          const ch = c.rb(c.s[3], off);
          if (ch === 0x24) break;
          this.tty(ch);
          off = (off + 1) & 0xFFFF;
        }
        c.set8(0, 0x24);
        return true;
      }
      case 0x0A: {
        const buf = c.r[2], max = c.rb(c.s[3], buf);
        this.lineBuf = this.lineBuf || [];
        while (this.hasKey()) {
          const k = this.readKey();
          if (k.a === 13) {
            const chars = this.lineBuf;
            c.wb(c.s[3], buf + 1, chars.length);
            chars.forEach((ch, i) => c.wb(c.s[3], buf + 2 + i, ch));
            c.wb(c.s[3], buf + 2 + chars.length, 13);
            this.tty(13);
            this.lineBuf = null;
            return true;
          }
          if (k.a === 8) {
            if (this.lineBuf.length) { this.lineBuf.pop(); this.tty(8); this.tty(32); this.tty(8); }
          } else if (k.a >= 32 && this.lineBuf.length < Math.max(0, max - 1)) {
            this.lineBuf.push(k.a);
            this.tty(k.a);
          }
        }
        return this.waitKey();
      }
      case 0x0B: c.set8(0, this.hasKey() ? 0xFF : 0); return true;
      case 0x02C: {
        const d = new Date();
        c.set8(5, d.getHours()); c.set8(1, d.getMinutes()); c.set8(6, d.getSeconds()); c.set8(2, Math.floor(d.getMilliseconds() / 10));
        return true;
      }
      case 0x2A: {
        const d = new Date();
        c.r[1] = d.getFullYear(); c.set8(6, d.getMonth() + 1); c.set8(2, d.getDate()); c.set8(0, d.getDay());
        return true;
      }
      case 0x25: c.ww(0, al * 4, c.r[2]); c.ww(0, al * 4 + 2, c.s[3]); return true;
      case 0x35: c.r[3] = c.rw(0, al * 4); c.s[0] = c.rw(0, al * 4 + 2); return true;
      case 0x30: c.r[0] = 0x0005; return true;
      case 0x4C: this.exit(al); return true;
    }
    this.notice = { code: "UNSUPPORTED_INT", args: { n: "21", ah: hex(ah, 2) } };
    return true;
  }

  video(ah, al) {
    const c = this.cpu;
    switch (ah) {
      case 0x00: this.scroll(0, DEFAULT_ATTR, 0, 0, ROWS - 1, COLS - 1); this.setCursor(0, 0); return true;
      case 0x01: case 0x05: return true;
      case 0x02: this.setCursor(Math.min(c.get8(6), ROWS - 1), Math.min(c.get8(2), COLS - 1)); return true;
      case 0x03: { const { row, col } = this.cursor(); c.set8(6, row); c.set8(2, col); c.r[1] = 0x0607; return true; }
      case 0x06: case 0x07:
        this.scroll(al, c.get8(7), Math.min(c.get8(5), ROWS - 1), Math.min(c.get8(1), COLS - 1), Math.min(c.get8(6), ROWS - 1), Math.min(c.get8(2), COLS - 1), ah === 0x07);
        return true;
      case 0x08: { const { row, col } = this.cursor(), o = this.cell(row, col); c.set8(0, c.rb(VIDEO_SEG, o)); c.set8(4, c.rb(VIDEO_SEG, o + 1)); return true; }
      case 0x09: case 0x0A: {
        const { row, col } = this.cursor();
        for (let i = 0; i < c.r[1] && row * COLS + col + i < COLS * ROWS; i++) {
          const p = row * COLS + col + i;
          this.put(Math.floor(p / COLS), p % COLS, al, ah === 0x09 ? c.get8(3) : undefined);
        }
        return true;
      }
      case 0x0E: this.tty(al); return true;
      case 0x0F: c.set8(0, 3); c.set8(4, COLS); c.set8(7, 0); return true;
      case 0x13: {
        let row = c.get8(6), col = c.get8(2);
        const save = this.cursor();
        this.setCursor(row, col);
        for (let i = 0; i < c.r[1]; i++) {
          const ch = c.rb(c.s[0], c.r[5] + i);
          if (ch === 13 || ch === 10 || ch === 8 || ch === 7) { this.tty(ch); continue; }
          const at = this.cursor();
          this.put(at.row, at.col, ch, c.get8(3));
          this.advance();
        }
        if (!(al & 1)) this.setCursor(save.row, save.col);
        return true;
      }
    }
    this.notice = { code: "UNSUPPORTED_INT", args: { n: "10", ah: hex(ah, 2) } };
    return true;
  }
}

if (typeof module !== "undefined") module.exports = { CPU, Machine, assemble, disasm, formatOp, hex, F, FLAG_NAMES, REG16, REG8, SREG, VIDEO_LIN, COLS, ROWS, BIOS_SEG, CURSOR_ROW, CURSOR_COL, FLAGS_FIXED };

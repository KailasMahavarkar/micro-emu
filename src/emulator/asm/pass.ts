import { COM_ORIGIN, DEFAULT_DOT_STACK, LOAD_SEG, PARAGRAPH, PSP_PARAS } from "../layout.ts";
import { encode, type AsmMode, type EncodeContext } from "./encode.ts";
import { AsmError, fail, type AsmDiagnostic } from "./errors.ts";
import { Expr, constant, type ExprContext, type ExprValue } from "./expr.ts";
import { parseOperand } from "./operand.ts";
import type { SourceLine } from "./preprocess.ts";
import { BUILTIN_DEFINITION, type AsmSymbol, type DataSize, type SymbolTable } from "./symbols.ts";
import { IDENT, splitOperands, stripComment, tokenize } from "./syntax.ts";
import { DATA_SIZE, IGNORED, MNEMONICS, PREFIX, RESERVED_REGISTERS } from "./tables.ts";

export type ListingKind = "code" | "data";
export interface PassSegment { name: string; lc: number; size: number; bytes: Map<number, number>; stack: boolean; base: number }
export interface PassListing { line: number; seg: string; off: number; bytes: number[]; kind: ListingKind }
export interface PassResult {
  segs: PassSegment[];
  errors: AsmDiagnostic[];
  listing: PassListing[];
  entry: string | null;
  firstCode: { seg: string; off: number } | null;
  nextPara: number;
}

const COM_SEGMENT = "PROGRAM";
const CODE_SEGMENT = "_TEXT";
const DATA_SEGMENT = "_DATA";
const STACK_SEGMENT = "STACK";
const LABEL_HEAD = new RegExp(`^(${IDENT})\\s*:(?!\\s*\\[)\\s*`);
const SEG_REGISTERS: ReadonlySet<string> = new Set(["ES", "CS", "SS", "DS"]);
const FAR_WORD = /\bFAR\b/i;
const STACK_WORD = /\bSTACK\b/i;
const DUP_ITEM = /^(.+?)\s+DUP\s*\(([\s\S]*)\)$/i;
const STRING_ITEM = /^(['"])([\s\S]*)\1$/;
const WORD = 0xFFFF;

const imm16 = (v: number): number[] => [v & 0xFF, (v >> 8) & 0xFF];

class Pass {
  readonly segs = new Map<string, PassSegment>();
  readonly order: PassSegment[] = [];
  readonly errors: AsmDiagnostic[] = [];
  readonly listing: PassListing[] = [];
  readonly procs: { name: string; far: boolean }[] = [];
  cur: PassSegment | null = null;
  entry: string | null = null;
  firstCode: { seg: string; off: number } | null = null;
  idx = 0;

  constructor(private readonly mode: AsmMode, private readonly syms: SymbolTable, private readonly final: boolean) {
    if (mode === "com") { this.cur = this.getSeg(COM_SEGMENT); this.cur.lc = COM_ORIGIN; }
    this.encodeContext = {
      final,
      mode,
      here: () => this.needSeg().lc,
      segValue: name => this.segValue(name),
      inFarProc: () => this.procs.at(-1)?.far ?? false
    };
  }

  getSeg(name: string): PassSegment {
    let s = this.segs.get(name);
    if (!s) {
      s = { name, lc: 0, size: 0, bytes: new Map(), stack: false, base: 0 };
      this.segs.set(name, s);
      this.order.push(s);
    }
    return s;
  }

  needSeg(): PassSegment {
    this.cur ??= this.getSeg(CODE_SEGMENT);
    return this.cur;
  }

  segValue(name: string): number {
    const s = this.syms.get(name);
    return s?.kind === "seg" ? s.v ?? 0 : 0;
  }

  readonly exprContext: ExprContext = {
    here: () => this.cur?.lc ?? 0,
    segValue: name => this.segValue(name),
    symbol: name => this.symbol(name)
  };

  readonly encodeContext: EncodeContext;

  symbol(name: string): ExprValue {
    const s = this.syms.get(name);
    if (!s || (s.kind === "seg" && s.v === undefined)) {
      if (this.final) fail("UNKNOWN_SYM", { x: name });
      return constant(0, true);
    }
    const fwd = s.defLine > this.idx;
    switch (s.kind) {
      case "equ": return constant(s.v, fwd);
      case "seg": return constant(s.v ?? 0);
      case "var": return { v: s.off, fwd, regs: [], vars: [s], sym: s };
      case "label": return { v: s.off, fwd, regs: [], vars: [], sym: s };
    }
  }

  define(name: string, info: AsmSymbol): void {
    const key = name.toUpperCase();
    if (RESERVED_REGISTERS.has(key) || MNEMONICS.has(key)) fail("RESERVED_NAME", { x: name });
    const old = this.syms.get(key);
    if (old && old.defLine !== this.idx && old.kind !== "seg") fail("DUP_LABEL", { x: name });
    this.syms.set(key, { ...info, name: key, defLine: this.idx });
  }

  markSegment(name: string): void {
    const old = this.syms.get(name);
    this.syms.set(name, { kind: "seg", name, defLine: BUILTIN_DEFINITION, v: old?.kind === "seg" ? old.v : undefined, seg: name });
  }

  defineAddress(name: string, size: DataSize | null): void {
    const seg = this.needSeg();
    this.define(name, size ? { kind: "var", name, defLine: 0, seg: seg.name, off: seg.lc, size } : { kind: "label", name, defLine: 0, seg: seg.name, off: seg.lc, far: false });
  }

  emit(bytes: number[], kind: ListingKind, line: number): void {
    const s = this.needSeg();
    if (kind === "code" && !this.firstCode) this.firstCode = { seg: s.name, off: s.lc };
    this.listing.push({ line, seg: s.name, off: s.lc, bytes: bytes.slice(), kind });
    bytes.forEach((b, i) => s.bytes.set((s.lc + i) & WORD, b & 0xFF));
    s.lc += bytes.length;
    s.size = Math.max(s.size, s.lc);
  }

  evalExpr(text: string): ExprValue { return new Expr(tokenize(text), this.exprContext, false).parse(); }

  dataItems(kind: string, text: string, out: number[]): void {
    const size = DATA_SIZE[kind] ?? 1;
    for (const item of splitOperands(text)) {
      if (!item) continue;
      const dup = DUP_ITEM.exec(item);
      if (dup) {
        const n = this.evalExpr(dup[1]).v, inner: number[] = [];
        this.dataItems(kind, dup[2], inner);
        for (let i = 0; i < n; i++) out.push(...inner);
        continue;
      }
      if (item === "?") { for (let i = 0; i < size; i++) out.push(0); continue; }
      const str = STRING_ITEM.exec(item);
      if (str && kind === "DB") { for (const ch of str[2]) out.push(ch.charCodeAt(0) & 0xFF); continue; }
      const r = this.evalExpr(item);
      if (kind === "DB") {
        if (!r.fwd && (r.v < -128 || r.v > 255)) fail("IMM_RANGE", { v: item, bits: 8 });
        out.push(r.v & 0xFF);
      } else if (kind === "DW") out.push(...imm16(r.v));
      else out.push(...imm16(r.v), ...imm16(r.sym ? this.segValue(r.sym.seg) : (r.v >>> 16) & WORD));
    }
  }

  instruction(words: string[], rest1: string, line: number): void {
    const prefixes: number[] = [];
    let mnText = words[0], opText = rest1;
    for (let p = PREFIX[mnText.toUpperCase()]; p !== undefined; p = PREFIX[mnText.toUpperCase()]) {
      prefixes.push(p);
      mnText = opText.split(/\s+/)[0];
      opText = opText.slice(mnText.length).trim();
    }
    const mn = mnText.toUpperCase();
    if (!MNEMONICS.has(mn)) fail("UNKNOWN_MN", { x: mnText });
    this.needSeg();
    const ops = opText ? splitOperands(opText).map(o => parseOperand(o, this.exprContext)) : [];
    this.emit(encode(this.encodeContext, mn, ops, prefixes), "code", line);
  }

  statement(text: string, line: number): boolean {
    const words = text.split(/\s+/), w1 = words[0].toUpperCase(), w2 = (words[1] ?? "").toUpperCase();
    const rest1 = words.length > 1 ? text.slice(words[0].length).trim() : "";
    const rest2 = words.length > 2 ? rest1.slice((words[1] ?? "").length).trim() : "";
    const size2 = DATA_SIZE[w2], size1 = DATA_SIZE[w1];
    if (size2 && !MNEMONICS.has(w1)) {
      this.defineAddress(words[0], size2);
      const out: number[] = [];
      this.dataItems(w2, rest2, out);
      this.emit(out, "data", line);
    } else if (w2 === "EQU" || w2 === "=") {
      this.define(words[0], { kind: "equ", name: words[0], defLine: 0, v: this.evalExpr(rest2).v });
    } else if (w2 === "PROC") {
      const seg = this.needSeg(), far = FAR_WORD.test(rest2);
      this.define(words[0], { kind: "label", name: words[0], defLine: 0, seg: seg.name, off: seg.lc, far });
      this.procs.push({ name: words[0].toUpperCase(), far });
    } else if (w2 === "ENDP") {
      this.procs.pop();
    } else if (w2 === "LABEL") {
      const t = rest2.toUpperCase();
      this.defineAddress(words[0], t === "BYTE" ? 1 : t === "WORD" ? 2 : null);
    } else if (w2 === "SEGMENT") {
      if (this.mode === "exe") {
        const name = words[0].toUpperCase();
        this.cur = this.getSeg(name);
        if (STACK_WORD.test(rest2) || name === STACK_SEGMENT) this.cur.stack = true;
        if (this.syms.get(name)?.kind !== "seg") this.syms.set(name, { kind: "seg", name, defLine: BUILTIN_DEFINITION, v: undefined, seg: name });
      }
    } else if (w2 === "ENDS") {
      if (this.mode === "exe") this.cur = null;
    } else if (size1) {
      const out: number[] = [];
      this.dataItems(w1, rest1, out);
      this.emit(out, "data", line);
    } else if (w1 === "ORG") {
      this.needSeg().lc = this.evalExpr(rest1).v & WORD;
    } else if (w1 === ".MODEL" || IGNORED.has(w1)) {
      return true;
    } else if (w1 === ".STACK") {
      if (this.mode === "exe") {
        const s = this.getSeg(STACK_SEGMENT);
        s.stack = true;
        s.size = Math.max(s.size, rest1 ? this.evalExpr(rest1).v : DEFAULT_DOT_STACK);
        this.markSegment(STACK_SEGMENT);
      }
    } else if (w1 === ".DATA" || w1 === ".DATA?") {
      this.enterSimplified(DATA_SEGMENT);
    } else if (w1 === ".CODE") {
      this.enterSimplified(CODE_SEGMENT);
    } else if (w1 === "END") {
      if (rest1) this.entry = rest1.toUpperCase();
      return false;
    } else this.instruction(words, rest1, line);
    return true;
  }

  enterSimplified(name: string): void {
    if (this.mode !== "exe") return;
    this.cur = this.getSeg(name);
    if (!this.syms.has(name)) this.syms.set(name, { kind: "seg", name, defLine: BUILTIN_DEFINITION, v: undefined, seg: name });
  }

  line(L: SourceLine, i: number): boolean {
    this.idx = i;
    let text = stripComment(L.text).trim();
    if (!text || text.startsWith("#")) return true;
    try {
      const head = LABEL_HEAD.exec(text);
      if (head && !SEG_REGISTERS.has(head[1].toUpperCase())) {
        const after = text.slice(head[0].length), first = after.split(/\s+/)[0].toUpperCase();
        this.defineAddress(head[1], DATA_SIZE[first] ?? null);
        text = after;
        if (!text) return true;
      }
      return this.statement(text, L.line);
    } catch (e) {
      if (!(e instanceof AsmError)) throw e;
      if (this.final) this.errors.push({ line: L.line, code: e.code, args: e.args, macro: L.macro });
      return true;
    }
  }

  layout(): number {
    let base = this.mode === "com" ? LOAD_SEG : LOAD_SEG + PSP_PARAS;
    for (const s of this.order) {
      if (this.mode === "com") { s.base = LOAD_SEG; continue; }
      s.base = base;
      base += Math.ceil(s.size / PARAGRAPH);
      this.syms.set(s.name, { kind: "seg", name: s.name, v: s.base, defLine: BUILTIN_DEFINITION, seg: s.name });
    }
    const dataSeg = this.segs.get(DATA_SEGMENT) ?? this.segs.get("DATA");
    if (dataSeg) this.syms.set("@DATA", { kind: "seg", name: "@DATA", v: dataSeg.base, defLine: BUILTIN_DEFINITION, seg: dataSeg.name });
    const codeSeg = this.segs.get(CODE_SEGMENT) ?? this.segs.get("CODE");
    if (codeSeg) this.syms.set("@CODE", { kind: "seg", name: "@CODE", v: codeSeg.base, defLine: BUILTIN_DEFINITION, seg: codeSeg.name });
    return base;
  }

  run(lines: readonly SourceLine[]): PassResult {
    for (let i = 0; i < lines.length; i++) if (!this.line(lines[i], i)) break;
    const nextPara = this.layout();
    return { segs: this.order, errors: this.errors, listing: this.listing, entry: this.entry, firstCode: this.firstCode, nextPara };
  }
}

export const runPass = (lines: readonly SourceLine[], mode: AsmMode, syms: SymbolTable, final: boolean): PassResult =>
  new Pass(mode, syms, final).run(lines);

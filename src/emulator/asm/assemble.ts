import { ADDRESS_MASK, COM_ORIGIN, COM_STACK_TOP, DEFAULT_STACK, LOAD_SEG, WORD_MASK } from "../layout.ts";
import type { AsmMode } from "./encode.ts";
import type { AsmDiagnostic } from "./errors.ts";
import { runPass, type ListingKind, type PassResult } from "./pass.ts";
import { preprocess, type SourceLine } from "./preprocess.ts";
import type { SymbolTable } from "./symbols.ts";
import { IDENT, stripComment } from "./syntax.ts";

export interface ProgramSegment { name: string; base: number; size: number; bytes: Uint8Array; stack: boolean }
export interface ListingEntry { line: number; seg: string; off: number; bytes: number[]; kind: ListingKind; base: number; linear: number }
export interface Program {
  mode: AsmMode;
  segments: ProgramSegment[];
  entry: { cs: number; ip: number };
  ss: number;
  sp: number;
  lineAt: Map<number, number>;
  addrsOfLine: Map<number, number[]>;
  listing: ListingEntry[];
  errors: AsmDiagnostic[];
  symbols: SymbolTable;
}

const MAX_PASSES = 8;
const TINY_MODEL = /^\.MODEL\s+TINY/;
const EXE_MARKER = /^\.(MODEL|CODE|DATA|STACK)\b/;
const SEGMENT_HEADER = new RegExp(`^${IDENT}\\s+SEGMENT\\b`);

const detectMode = (lines: readonly SourceLine[]): AsmMode => {
  const upper = lines.map(L => stripComment(L.text).trim().toUpperCase());
  const tiny = upper.some(t => TINY_MODEL.test(t));
  return !tiny && upper.some(t => EXE_MARKER.test(t) || SEGMENT_HEADER.test(t)) ? "exe" : "com";
};

const symbolSignature = (syms: SymbolTable): string =>
  [...syms.values()].map(s => `${"seg" in s ? s.seg : ""}:${"off" in s ? s.off : ""}:${"v" in s ? String(s.v) : ""}`).join("|");

const finish = (res: PassResult, mode: AsmMode, syms: SymbolTable, lines: readonly SourceLine[]): Program => {
  const errors = res.errors.slice().sort((a, b) => a.line - b.line);
  const segBase = new Map(res.segs.map(s => [s.name, s.base]));
  const baseOf = (name: string): number => segBase.get(name) ?? LOAD_SEG;
  const segments = res.segs.map((s): ProgramSegment => {
    const bytes = new Uint8Array(s.size);
    for (const [off, b] of s.bytes) if (off < s.size) bytes[off] = b;
    return { name: s.name, base: s.base, size: s.size, bytes, stack: s.stack };
  });
  let cs = LOAD_SEG, ip = COM_ORIGIN;
  if (res.entry) {
    const e = syms.get(res.entry);
    if (!e || e.kind === "equ" || e.kind === "seg") {
      errors.push({ line: lines.at(-1)?.line ?? 0, code: "UNKNOWN_SYM", args: { x: res.entry }, macro: null });
    } else {
      cs = baseOf(e.seg);
      ip = e.off;
    }
  } else if (mode === "exe" && res.firstCode) {
    cs = baseOf(res.firstCode.seg);
    ip = res.firstCode.off;
  }
  let ss = LOAD_SEG, sp = COM_STACK_TOP;
  if (mode === "exe") {
    const st = segments.find(s => s.stack);
    if (st) { ss = st.base; sp = st.size & WORD_MASK; }
    else { ss = res.nextPara; sp = DEFAULT_STACK; }
  }
  const lineAt = new Map<number, number>(), addrsOfLine = new Map<number, number[]>(), listing: ListingEntry[] = [];
  for (const l of res.listing) {
    const base = baseOf(l.seg), linear = ((base << 4) + l.off) & ADDRESS_MASK;
    listing.push({ ...l, base, linear });
    if (l.kind !== "code") continue;
    if (!lineAt.has(linear)) lineAt.set(linear, l.line);
    const addrs = addrsOfLine.get(l.line) ?? [];
    addrs.push(linear);
    addrsOfLine.set(l.line, addrs);
  }
  if (!res.listing.some(l => l.kind === "code") && !errors.length) errors.push({ line: 0, code: "NO_CODE", args: {}, macro: null });
  return { mode, segments, entry: { cs, ip }, ss, sp, lineAt, addrsOfLine, listing, errors, symbols: syms };
};

export const assemble = (src: string): Program => {
  const lines = preprocess(src);
  const mode = detectMode(lines);
  const syms: SymbolTable = new Map();
  let prev = "";
  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    runPass(lines, mode, syms, false);
    const sig = symbolSignature(syms);
    if (pass > 1 && sig === prev) break;
    prev = sig;
  }
  return finish(runPass(lines, mode, syms, true), mode, syms, lines);
};

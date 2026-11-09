import { REG16, REG8, SREG } from "../cpu/registers.ts";
import type { Width } from "../cpu/types.ts";
import { Expr, type BaseReg, type ExprContext } from "./expr.ts";
import type { AddressSymbol, DataSize } from "./symbols.ts";
import { tokenize } from "./syntax.ts";
import { PTR_SIZE } from "./tables.ts";

export type Distance = "" | "SHORT" | "NEAR" | "FAR";
export interface RegArg { k: "r"; n: number; w: Width; text: string }
export interface SegArg { k: "s"; n: number; text: string }
export interface MemArg { k: "m"; regs: BaseReg[]; disp: number; fwd: boolean; size: DataSize | 0; seg: number; text: string }
export interface ImmArg { k: "i"; v: number; fwd: boolean; sym: AddressSymbol | null; dist: Distance; text: string }
export type Arg = RegArg | SegArg | MemArg | ImmArg;

export const NO_SEGMENT = -1;
const PTR_PREFIX = /^(BYTE|WORD|DWORD)\s+PTR\s+/i;
const DISTANCE_PREFIX = /^(SHORT|NEAR|FAR)(\s+PTR)?\s+/i;
const SEGMENT_PREFIX = /^(ES|CS|SS|DS)\s*:\s*/i;
const indexIn = (list: readonly string[], name: string): number => list.indexOf(name);

const isDistance = (v: string): v is Exclude<Distance, ""> => v === "SHORT" || v === "NEAR" || v === "FAR";

export const parseOperand = (text: string, ctx: ExprContext): Arg => {
  let s = text.trim(), size: DataSize | 0 = 0, dist: Distance = "";
  let m = PTR_PREFIX.exec(s);
  if (m) { size = PTR_SIZE[m[1].toUpperCase()] ?? 0; s = s.slice(m[0].length); }
  m = DISTANCE_PREFIX.exec(s);
  if (m) { const d = m[1].toUpperCase(); if (isDistance(d)) dist = d; s = s.slice(m[0].length); }
  const up = s.toUpperCase();
  if (indexIn(REG16, up) >= 0) return { k: "r", n: indexIn(REG16, up), w: 1, text: up };
  if (indexIn(REG8, up) >= 0) return { k: "r", n: indexIn(REG8, up), w: 0, text: up };
  if (indexIn(SREG, up) >= 0) return { k: "s", n: indexIn(SREG, up), text: up };
  let seg = NO_SEGMENT;
  m = SEGMENT_PREFIX.exec(s);
  if (m) { seg = indexIn(SREG, m[1].toUpperCase()); s = s.slice(m[0].length); }
  const toks = tokenize(s);
  const bracket = toks.some(t => t.t === "op" && t.v === "[");
  const r = new Expr(toks, ctx, true).parse();
  if (bracket || r.regs.length || r.vars.length || seg >= 0 || (size && !dist)) {
    return { k: "m", regs: r.regs, disp: r.v, fwd: r.fwd, size: size || (r.vars[0]?.size ?? 0), seg, text };
  }
  return { k: "i", v: r.v, fwd: r.fwd, sym: r.sym, dist, text };
};

export const argSize = (o: Arg): number => {
  switch (o.k) {
    case "r": return o.w ? 2 : 1;
    case "m": return o.size;
    case "s": return 2;
    case "i": return 0;
  }
};

export const SHIFT_BY_ONE: ImmArg = { k: "i", v: 1, fwd: false, sym: null, dist: "", text: "1" };

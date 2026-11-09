import { fail } from "./errors.ts";
import type { AddressSymbol, VarSymbol } from "./symbols.ts";
import type { Token } from "./syntax.ts";

export const BASE_REGS = ["BX", "BP", "SI", "DI"] as const;
export type BaseReg = (typeof BASE_REGS)[number];
const NON_BASE_REGS: ReadonlySet<string> = new Set(["AX", "CX", "DX", "SP", "AL", "CL", "DL", "BL", "AH", "CH", "DH", "BH"]);
const isBaseReg = (v: string): v is BaseReg => (BASE_REGS as readonly string[]).includes(v);
const isGeneralReg = (v: string): boolean => NON_BASE_REGS.has(v);

export interface ExprValue {
  v: number;
  fwd: boolean;
  regs: BaseReg[];
  vars: VarSymbol[];
  sym: AddressSymbol | null;
}

export interface ExprContext {
  here(): number;
  segValue(name: string): number;
  symbol(name: string): ExprValue;
}

export const constant = (v: number, fwd = false): ExprValue => ({ v, fwd, regs: [], vars: [], sym: null });

export class Expr {
  private i = 0;

  constructor(private readonly toks: readonly Token[], private readonly ctx: ExprContext, private readonly allowRegs: boolean) {}

  private peek(): Token | undefined { return this.toks[this.i]; }
  private isOp(v: string): boolean {
    const p = this.peek();
    return p !== undefined && (p.t === "op" || p.t === "id") && p.v === v;
  }
  private next(): Token | undefined { return this.toks[this.i++]; }

  parse(): ExprValue {
    const r = this.sum();
    if (this.i < this.toks.length) fail("SYNTAX", { x: this.toks.map(t => t.v).join(" ") });
    return r;
  }

  private sum(): ExprValue {
    let a = this.product();
    while (this.isOp("+") || this.isOp("-")) {
      const minus = this.next()?.v === "-", b = this.product();
      if (minus && b.regs.length) fail("BAD_ADDR", { x: "" });
      a = { v: minus ? a.v - b.v : a.v + b.v, fwd: a.fwd || b.fwd, regs: [...a.regs, ...b.regs], vars: [...a.vars, ...b.vars], sym: null };
    }
    return a;
  }

  private product(): ExprValue {
    let a = this.unary();
    while (this.isOp("*") || this.isOp("/") || this.isOp("MOD")) {
      const op = this.next()?.v, b = this.unary();
      if (a.regs.length || b.regs.length) fail("BAD_ADDR", { x: "" });
      const v = op === "*" ? a.v * b.v : b.v === 0 ? 0 : op === "/" ? Math.trunc(a.v / b.v) : a.v % b.v;
      a = constant(v, a.fwd || b.fwd);
    }
    return a;
  }

  private unary(): ExprValue {
    if (this.isOp("-")) { this.next(); const a = this.unary(); return { ...a, v: -a.v }; }
    if (this.isOp("+")) { this.next(); return this.unary(); }
    if (this.isOp("OFFSET")) { this.next(); return { ...this.unary(), vars: [] }; }
    if (this.isOp("SEG")) {
      this.next();
      const a = this.unary();
      return constant(a.sym ? this.ctx.segValue(a.sym.seg) : 0, a.fwd);
    }
    return this.primary();
  }

  private primary(): ExprValue {
    const tk = this.next();
    if (!tk) return fail("SYNTAX", { x: "" });
    switch (tk.t) {
      case "num": return constant(tk.v);
      case "str":
        if (tk.v.length === 1) return constant(tk.v.charCodeAt(0));
        if (tk.v.length === 2) return constant((tk.v.charCodeAt(0) << 8) | tk.v.charCodeAt(1));
        return fail("SYNTAX", { x: `'${tk.v}'` });
      case "op": {
        if (tk.v !== "(" && tk.v !== "[") return fail("SYNTAX", { x: tk.v });
        const r = this.sum(), close = this.next();
        if (close?.v !== (tk.v === "(" ? ")" : "]")) fail("SYNTAX", { x: "" });
        return r;
      }
      case "id":
        if (isBaseReg(tk.v)) {
          if (!this.allowRegs) fail("OPERANDS", {});
          return { ...constant(0), regs: [tk.v] };
        }
        if (isGeneralReg(tk.v)) return fail(this.allowRegs ? "BAD_ADDR" : "OPERANDS", { x: tk.v });
        if (tk.v === "$") return constant(this.ctx.here());
        return this.ctx.symbol(tk.v);
    }
  }
}

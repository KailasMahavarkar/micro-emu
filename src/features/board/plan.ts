import {
  F, FLAG_NAMES, REG16, REPE, REPNE, SREG, disasm, formatOperand, hex, layout,
  type Cpu, type FlagName, type Instruction, type NoticeCode, type Operand, type OperandValues
} from "../../emulator/index.ts";
import type { BoardNode, Capture, DeviceNode, FlagMark, PlanItem, RegisterNode, ViewState } from "./types.ts";

type MemOperand = Extract<Operand, { kind: "mem" }>;

const ADDRESS_MASK = 0xFFFFF;
const WORD_MASK = 0xFFFF;
const QUEUE_BYTES = 6;
const DOS_STRING_PREVIEW = 24;
const DOS_STRING_LABEL = 14;
const DOLLAR = 0x24;
const PRINTABLE_LOW = 32;
const PRINTABLE_HIGH = 127;
const ALU2: ReadonlySet<string> = new Set(["ADD", "ADC", "SUB", "SBB", "CMP", "AND", "OR", "XOR", "TEST"]);
const ALU1: ReadonlySet<string> = new Set(["INC", "DEC", "NEG", "NOT", "ROL", "ROR", "RCL", "RCR", "SHL", "SHR", "SAR", "SETMO"]);
const ACCUMULATOR_OPS: ReadonlySet<string> = new Set(["CBW", "CWD", "AAA", "AAS", "DAA", "DAS", "AAM", "AAD", "SALC", "XLAT"]);
const FLAG_OPS: ReadonlySet<string> = new Set(["CLC", "STC", "CMC", "CLD", "STD", "CLI", "STI"]);
const STRING_OPS: ReadonlySet<string> = new Set(["MOVS", "LODS", "STOS", "CMPS", "SCAS"]);
const JCC_OPS: ReadonlySet<string> = new Set(["JO", "JNO", "JB", "JAE", "JE", "JNE", "JBE", "JA", "JS", "JNS", "JP", "JNP", "JL", "JGE", "JLE", "JG"]);
const OPSYM: Readonly<Partial<Record<string, string>>> = { ADD: "+", ADC: "+ CF +", SUB: "-", SBB: "- CF -", CMP: "-", AND: "and", OR: "or", XOR: "xor", TEST: "and" };

export interface PlanInput {
  ins: Instruction;
  values: OperandValues | null;
  before: Capture;
  after: Capture;
  cpu: Cpu;
  notice: NoticeCode | null;
  showFetch: boolean;
}

export const flagMark = (f: FlagName): FlagMark => `F${f}`;
const linearOf = (seg: number, off: number): number => ((seg << 4) + off) & ADDRESS_MASK;
const isVideo = (lin: number): boolean => lin >= layout.VIDEO_LIN && lin < layout.VIDEO_LIN + layout.VIDEO_BYTES;
const charText = (c: number): string => (c >= PRINTABLE_LOW && c < PRINTABLE_HIGH ? `'${String.fromCharCode(c)}'` : `${hex(c, 2)}h`);

export const buildPlan = ({ ins, values, before: B, after: A, cpu, notice, showFetch }: PlanInput): PlanItem[] => {
  const H: PlanItem[] = [], mn = ins.mn, o = ins.ops;
  const pre = values?.pre ?? [], post = values?.post ?? [];
  const lin = linearOf(ins.cs, ins.addr);
  const byteArr = Array.from(cpu.mem.slice(lin, lin + ins.len), b => hex(b, 2));
  const bstr = byteArr.join(" "), dis = disasm(ins);
  const add = (from: BoardNode, to: BoardNode, label: string, text: string, apply: ((vs: ViewState) => void) | null = null): void => {
    H.push({ from, to, label, text, apply });
  };
  const note = (text: string): void => { H.push({ from: null, text }); };
  const setReg = (n: RegisterNode) => (vs: ViewState): void => { vs.regs[n] = A.regs[n]; if (B.regs[n] !== A.regs[n]) vs.marks.add(n); };
  const alu = (t: string) => (vs: ViewState): void => { vs.alu = t; };
  const flagsChanged = FLAG_NAMES.filter(f => (B.flags ^ A.flags) & F[f]);
  const flagText = (f: FlagName): string => `${f} = ${A.flags & F[f] ? 1 : 0}`;
  const applyFlags = (vs: ViewState): void => { vs.flags = A.flags; flagsChanged.forEach(f => vs.marks.add(flagMark(f))); };
  const toFlags = (text?: string): void => {
    const label = flagsChanged.length ? flagsChanged.map(f => `${f} ${A.flags & F[f] ? 1 : 0}`).slice(0, 2).join(" ") : "flags";
    const fallback = flagsChanged.length ? `Flags update: ${flagsChanged.map(flagText).join(", ")}` : "The flags are set from the result (no change this time)";
    add("ALU", "FLAGS", label, text ?? fallback, applyFlags);
  };
  const regNode = (op: Operand): RegisterNode => (op.kind === "reg" ? REG16[op.w ? op.n : op.n & 3] : op.kind === "seg" ? SREG[op.n] : "AX");
  const node = (op: Operand): BoardNode => (op.kind === "reg" || op.kind === "seg" ? regNode(op) : "CU");
  const name = (op: Operand): string => formatOperand(op, ins);
  const widthOf = (op: Operand): 0 | 1 => ("w" in op ? op.w : 1);
  const val = (op: Operand, v: number | null | undefined): string =>
    v === null || v === undefined ? "?" : hex(v & (widthOf(op) ? WORD_MASK : 0xFF), widthOf(op) ? 4 : 2);
  const where = (op: MemOperand): { node: DeviceNode; lin: number } => {
    const seg = SREG[op.seg], segv = B.regs[seg], l = linearOf(segv, op.off);
    const dev: DeviceNode = isVideo(l) ? "SCREEN" : "MEM";
    const ea = op.base ? `Address ${op.base}${op.disp ? `${op.disp < 0 ? "-" : "+"}${hex(Math.abs(op.disp), 2)}h` : ""} = ${hex(op.off)}h. ` : "";
    add(seg, "SIGMA", `${seg}:${hex(op.off)}`, `${ea}${seg}:${hex(op.off)} goes to the address adder`, vs => { vs.sigma = hex(l, 5); });
    add("SIGMA", dev, hex(l, 5), `${hex(segv)}0h + ${hex(op.off)}h = ${hex(l, 5)}h goes out on the address bus${dev === "SCREEN" ? ": that address is video memory" : ""}`);
    return { node: dev, lin: l };
  };
  const writeTo = (w: { node: DeviceNode; lin: number }, op: Operand, v: number | null | undefined) => (vs: ViewState): void => {
    vs.memLast = { lin: w.lin, text: val(op, v) };
    vs.marks.add(w.node);
    if (w.node === "SCREEN") vs.monitor = A.monitor;
  };
  const source = (op: Operand): BoardNode => (op.kind === "mem" ? where(op).node : node(op));
  const stackWrite = (srcNode: BoardNode, value: number, what: string, sp = B.regs.SP): number => {
    const off = (sp - 2) & WORD_MASK, l = linearOf(B.regs.SS, off);
    add("SP", "ALU", hex(sp), `${what}: SP = ${hex(sp)}h goes to the ALU`, alu(`${hex(sp)} - 2`));
    add("ALU", "SP", hex(off), `SP - 2 = ${hex(off)}h: the stack grows down`, vs => { vs.regs.SP = off; vs.marks.add("SP"); });
    add("SS", "SIGMA", `SS:${hex(off)}`, `Stack address SS:SP = ${hex(B.regs.SS)}:${hex(off)} goes to the address adder`, vs => { vs.sigma = hex(l, 5); });
    add("SIGMA", "MEM", hex(l, 5), `${hex(B.regs.SS)}0h + ${hex(off)}h = ${hex(l, 5)}h goes out on the address bus`);
    add(srcNode, "MEM", hex(value), `${hex(value)}h travels over the data bus into the stack at ${hex(l, 5)}h`, vs => { vs.memLast = { lin: l, text: hex(value) }; vs.marks.add("MEM"); });
    return off;
  };
  const stackRead = (dest: RegisterNode | "FLAGS" | "ALU", value: number, what: string, sp = B.regs.SP): void => {
    const l = linearOf(B.regs.SS, sp);
    add("SS", "SIGMA", `SS:${hex(sp)}`, `${what}: stack address SS:SP = ${hex(B.regs.SS)}:${hex(sp)} goes to the address adder`, vs => { vs.sigma = hex(l, 5); });
    add("SIGMA", "MEM", hex(l, 5), `${hex(B.regs.SS)}0h + ${hex(sp)}h = ${hex(l, 5)}h goes out on the address bus`);
    const apply = dest === "FLAGS" ? applyFlags : dest === "ALU" ? null : setReg(dest);
    add("MEM", dest, hex(value), `Memory sends ${hex(value)}h back over the data bus into ${dest}`, apply);
  };
  const spUp = (n: number): void => {
    add("SP", "ALU", hex(B.regs.SP), "SP goes to the ALU", alu(`${hex(B.regs.SP)} + ${n}`));
    add("ALU", "SP", hex(A.regs.SP), `SP + ${n} = ${hex(A.regs.SP)}h`, setReg("SP"));
  };
  const regOrCu = (op: Operand | undefined): BoardNode => (op?.kind === "reg" ? node(op) : "CU");
  const jumped = A.regs.IP !== ((ins.addr + ins.len) & WORD_MASK) || A.regs.CS !== B.regs.CS;
  const first = o.at(0), second = o.at(1);

  if (showFetch) {
    add("IP", "SIGMA", `${hex(ins.cs)}:${hex(ins.addr)}`, `Fetch: CS:IP = ${hex(ins.cs)}:${hex(ins.addr)} goes to the address adder`, vs => { vs.sigma = hex(lin, 5); });
    add("SIGMA", "MEM", hex(lin, 5), `${hex(ins.cs)}0h + ${hex(ins.addr)}h = ${hex(lin, 5)}h goes out on the address bus`, vs => { vs.code = { lin, bytes: bstr, tag: "fetch" }; });
    add("MEM", "QUEUE", bstr, `Memory sends the bytes ${bstr} over the data bus into the queue`, vs => { vs.queue = byteArr.slice(0, QUEUE_BYTES); });
    add("QUEUE", "CU", dis, `The decoder reads ${bstr} as ${dis}`, vs => { vs.cu = dis; });
  } else H.push({ instant: vs => { vs.queue = byteArr.slice(0, QUEUE_BYTES); vs.cu = dis; vs.sigma = hex(lin, 5); } });

  if (mn === "MOV" && first && second) {
    const from = source(second);
    if (first.kind === "mem") {
      const w = where(first);
      add(from, w.node, val(first, post[0]), `${name(second)} = ${val(first, post[0])}h is written to ${hex(w.lin, 5)}h`, writeTo(w, first, post[0]));
    } else add(from, node(first), val(first, post[0]), `${name(first)} gets ${val(first, post[0])}h${second.kind === "imm" ? " straight from the instruction" : ` from ${name(second)}`}`, setReg(regNode(first)));
  } else if (ALU2.has(mn) && first && second) {
    const wd = first.kind === "mem" ? where(first) : null, dn = wd ? wd.node : node(first);
    add(dn, "ALU", val(first, pre[0]), `${name(first)} = ${val(first, pre[0])}h goes to the ALU`, alu(val(first, pre[0])));
    const sn = second.kind === "mem" ? where(second).node : node(second);
    add(sn, "ALU", val(second, pre[1]), `${second.kind === "imm" ? "The number" : name(second)} ${val(second, pre[1])}h goes to the ALU`, alu(`${val(first, pre[0])} ${OPSYM[mn] ?? mn} ${val(second, pre[1])}`));
    if (mn !== "CMP" && mn !== "TEST") add("ALU", dn, val(first, post[0]), `The result ${val(first, post[0])}h goes back into ${name(first)}`, wd ? writeTo(wd, first, post[0]) : setReg(regNode(first)));
    toFlags(mn === "CMP" || mn === "TEST" ? `${mn} only sets the flags; nothing is written back.${flagsChanged.length ? ` ${flagsChanged.map(flagText).join(", ")}` : ""}` : undefined);
  } else if (ALU1.has(mn) && first) {
    const wd = first.kind === "mem" ? where(first) : null, dn = wd ? wd.node : node(first);
    add(dn, "ALU", val(first, pre[0]), `${name(first)} = ${val(first, pre[0])}h goes to the ALU`, alu(`${mn} ${val(first, pre[0])}`));
    if (second?.kind === "reg") add("CX", "ALU", hex(pre[1] ?? 0, 2), `The shift count CL = ${pre[1] ?? 0} goes to the ALU`);
    add("ALU", dn, val(first, post[0]), `${mn} gives ${val(first, post[0])}h, back into ${name(first)}`, wd ? writeTo(wd, first, post[0]) : setReg(regNode(first)));
    if (mn !== "NOT") toFlags();
  } else if ((mn === "MUL" || mn === "IMUL" || mn === "DIV" || mn === "IDIV") && first) {
    const w = widthOf(first), mul = mn.endsWith("MUL");
    if (!mul && w) add("DX", "ALU", hex(B.regs.DX), `DX:AX = ${hex(B.regs.DX)}:${hex(B.regs.AX)} is the number to divide`);
    const axText = w ? `AX = ${hex(B.regs.AX)}h goes to the ALU` : mul ? `AL = ${hex(B.regs.AX & 0xFF, 2)}h goes to the ALU` : `AX = ${B.regs.AX} goes to the ALU`;
    add("AX", "ALU", hex(B.regs.AX), axText, alu(`${mul ? hex(w ? B.regs.AX : B.regs.AX & 0xFF, w ? 4 : 2) : hex(B.regs.AX)} ${mul ? "x" : "/"} ?`));
    const sn = first.kind === "mem" ? where(first).node : node(first);
    add(sn, "ALU", val(first, pre[0]), `${name(first)} = ${val(first, pre[0])}h goes to the ALU`, alu(`${mul ? "x" : "/"} ${val(first, pre[0])}`));
    if (notice === "DIV0") note("Divide overflow: the answer doesn't fit, so the CPU raises INT 0 and DOS stops the program");
    else {
      const axResult = mul ? `Result low part ${hex(A.regs.AX)}h (${A.regs.AX}) goes into AX` : w ? `Quotient ${A.regs.AX} goes into AX` : `Quotient ${A.regs.AX & 0xFF} into AL, remainder ${A.regs.AX >> 8} into AH`;
      add("ALU", "AX", hex(A.regs.AX), axResult, setReg("AX"));
      if (w) add("ALU", "DX", hex(A.regs.DX), mul ? `High part ${hex(A.regs.DX)}h goes into DX` : `Remainder ${A.regs.DX} goes into DX`, setReg("DX"));
      if (mul) toFlags(`CF = OF = ${A.flags & F.CF ? 1 : 0}: ${A.flags & F.CF ? "the answer needed the high part too" : "the answer fits in the low part"}`);
    }
  } else if (mn === "PUSH" || mn === "PUSHF") {
    const v = mn === "PUSHF" ? B.flags : first?.kind === "reg" && first.n === 4 ? (B.regs.SP - 2) & WORD_MASK : pre[0] ?? 0;
    let src: BoardNode = mn === "PUSHF" ? "FLAGS" : first ? node(first) : "CU";
    if (mn === "PUSH" && first?.kind === "mem") { const w = where(first); add(w.node, "ALU", hex(v), `The word ${hex(v)}h is read from memory`); src = "ALU"; }
    stackWrite(src, v, mn);
  } else if (mn === "POP" || mn === "POPF") {
    if (mn === "POPF") stackRead("FLAGS", A.flags, "POPF");
    else if (first?.kind === "mem") {
      stackRead("ALU", post[0] ?? 0, "POP");
      const w = where(first);
      add("ALU", w.node, hex(post[0] ?? 0), `The value goes into memory at ${hex(w.lin, 5)}h`, writeTo(w, first, post[0]));
    } else if (first) stackRead(regNode(first), A.regs[regNode(first)], "POP");
    spUp(2);
  } else if (mn === "CALL" || mn === "CALLF") {
    const spAfterCs = mn === "CALLF" ? stackWrite("CS", B.regs.CS, "CALL FAR saves CS") : B.regs.SP;
    stackWrite("IP", (ins.addr + ins.len) & WORD_MASK, "CALL saves the return address", spAfterCs);
    if (mn === "CALLF") add("CU", "CS", hex(A.regs.CS), `CS becomes ${hex(A.regs.CS)}h`, setReg("CS"));
    add(regOrCu(first), "IP", hex(A.regs.IP), `IP jumps to the procedure at ${hex(A.regs.IP)}h`, setReg("IP"));
  } else if (mn === "RET" || mn === "RETF" || mn === "IRET") {
    stackRead("IP", A.regs.IP, mn);
    if (mn !== "RET") stackRead("CS", A.regs.CS, `${mn} also restores CS`, (B.regs.SP + 2) & WORD_MASK);
    if (mn === "IRET") stackRead("FLAGS", A.flags, "IRET restores the flags", (B.regs.SP + 4) & WORD_MASK);
    spUp((A.regs.SP - B.regs.SP) & WORD_MASK);
  } else if (mn === "JMP" || mn === "JMPF") {
    if (mn === "JMPF") add("CU", "CS", hex(A.regs.CS), `CS becomes ${hex(A.regs.CS)}h`, setReg("CS"));
    add(regOrCu(first), "IP", hex(A.regs.IP), `IP becomes ${hex(A.regs.IP)}h: the next instruction comes from there`, setReg("IP"));
  } else if (JCC_OPS.has(mn)) {
    add("FLAGS", "CU", mn, `${mn} checks the flags: ${jumped ? "the condition is true, so jump" : "the condition is false, so carry on"}`);
    if (jumped) add("CU", "IP", hex(A.regs.IP), `IP jumps to ${hex(A.regs.IP)}h`, setReg("IP"));
  } else if (mn === "LOOP" || mn === "LOOPE" || mn === "LOOPNE" || mn === "JCXZ") {
    if (mn === "JCXZ") add("CX", "CU", hex(B.regs.CX), `JCXZ checks CX = ${B.regs.CX}: ${jumped ? "it is 0, so jump" : "not 0, so carry on"}`);
    else {
      add("CX", "ALU", hex(B.regs.CX), `${mn}: CX = ${B.regs.CX} goes to the ALU to count down`, alu(`${hex(B.regs.CX)} - 1`));
      const zf = mn === "LOOP" ? "" : `; ZF = ${B.flags & F.ZF ? 1 : 0}`;
      add("ALU", "CX", hex(A.regs.CX), `CX - 1 = ${A.regs.CX}${zf}, so ${jumped ? "loop again" : "the loop ends"}`, setReg("CX"));
    }
    if (jumped) add("CU", "IP", hex(A.regs.IP), `IP jumps back to ${hex(A.regs.IP)}h`, setReg("IP"));
  } else if (mn === "INT" && first?.kind === "imm") {
    interruptPlan(first.v, { B, A, cpu, add, note, setReg });
  } else if (STRING_OPS.has(mn)) {
    const w = ins.w, segSrc = ins.seg >= 0 ? ins.seg : 3;
    const srcOp: MemOperand = { kind: "mem", seg: segSrc, off: B.regs.SI, w, base: "SI", disp: 0 };
    const dstOp: MemOperand = { kind: "mem", seg: 0, off: B.regs.DI, w, base: "DI", disp: 0 };
    const repName = ins.rep === REPE ? (mn === "CMPS" || mn === "SCAS" ? "REPE" : "REP") : ins.rep === REPNE ? "REPNE" : "";
    const count = repName ? ` (${repName} repeats this; CX was ${B.regs.CX})` : "";
    const rd = (op: MemOperand): number => {
      const seg = B.regs[SREG[op.seg]];
      return cpu.rb(seg, op.off) | (w ? cpu.rb(seg, op.off + 1) << 8 : 0);
    };
    const digits = w ? 4 : 2, acc = w ? B.regs.AX : B.regs.AX & 0xFF;
    if (mn === "LODS") { const s = where(srcOp); add(s.node, "AX", hex(rd(srcOp), digits), `LODS loads the value at DS:SI into ${w ? "AX" : "AL"}${count}`, setReg("AX")); }
    if (mn === "STOS") { const d = where(dstOp); add("AX", d.node, hex(acc, digits), `STOS stores ${w ? "AX" : "AL"} at ES:DI${count}`, writeTo(d, dstOp, B.regs.AX)); }
    if (mn === "MOVS") {
      const s = where(srcOp);
      add(s.node, "ALU", hex(rd(srcOp), digits), `MOVS reads from DS:SI${count}`);
      const d = where(dstOp);
      add("ALU", d.node, hex(rd(srcOp), digits), "and writes it to ES:DI", writeTo(d, dstOp, rd(srcOp)));
    }
    if (mn === "CMPS" || mn === "SCAS") {
      if (mn === "CMPS") { const s = where(srcOp); add(s.node, "ALU", hex(rd(srcOp), digits), `CMPS reads DS:SI${count}`); }
      else add("AX", "ALU", hex(acc, digits), `SCAS compares ${w ? "AX" : "AL"}${count}`);
      const d = where(dstOp);
      add(d.node, "ALU", hex(rd(dstOp), digits), "with the value at ES:DI");
      toFlags();
    }
    const direction = A.flags & F.DF ? "down" : "up";
    if (mn !== "STOS" && mn !== "SCAS") add("ALU", "SI", hex(A.regs.SI), `SI moves ${direction} to ${hex(A.regs.SI)}h`, setReg("SI"));
    if (mn !== "LODS") add("ALU", "DI", hex(A.regs.DI), `DI moves ${direction} to ${hex(A.regs.DI)}h`, setReg("DI"));
    if (ins.rep) add("ALU", "CX", hex(A.regs.CX), `CX counts down to ${A.regs.CX}`, setReg("CX"));
  } else if (mn === "LEA" && first) {
    add("CU", node(first), hex(post[0] ?? 0), `LEA loads the address itself (${hex(post[0] ?? 0)}h), not the value stored there`, setReg(regNode(first)));
  } else if ((mn === "LDS" || mn === "LES") && first && second?.kind === "mem") {
    const w = where(second), seg = mn === "LDS" ? "DS" : "ES";
    add(w.node, node(first), hex(post[0] ?? 0), `${mn} loads the offset ${hex(post[0] ?? 0)}h into ${name(first)}`, setReg(regNode(first)));
    add(w.node, seg, hex(A.regs[seg]), `and the segment ${hex(A.regs[seg])}h into ${seg}`, setReg(seg));
  } else if (mn === "XCHG" && first && second) {
    const wa = first.kind === "mem" ? where(first) : null, na = wa ? wa.node : node(first), nb = node(second);
    add(na, nb, val(first, pre[0]), `${name(first)} = ${val(first, pre[0])}h goes to ${name(second)}`, setReg(regNode(second)));
    add(nb, na, val(second, pre[1]), `and ${name(second)} = ${val(second, pre[1])}h goes to ${name(first)}`, wa ? writeTo(wa, first, pre[1]) : setReg(regNode(first)));
  } else if (mn === "IN" && first) {
    add("IO", "AX", hex(A.regs.AX & (ins.w ? WORD_MASK : 0xFF), ins.w ? 4 : 2), `IN reads I/O port ${hex(pre[1] ?? 0, 2)}h into ${name(first)}`, setReg("AX"));
  } else if (mn === "OUT" && second) {
    add(node(second), "IO", val(second, pre[1]), `OUT sends ${val(second, pre[1])}h to I/O port ${hex(pre[0] ?? 0, 2)}h`, vs => { vs.io = A.io; vs.marks.add("IO"); });
  } else if (ACCUMULATOR_OPS.has(mn)) {
    add("AX", "ALU", hex(B.regs.AX), `${mn} works on AX = ${hex(B.regs.AX)}h`, alu(mn));
    add("ALU", "AX", hex(A.regs.AX), `AX becomes ${hex(A.regs.AX)}h`, setReg("AX"));
    if (mn === "CWD") add("ALU", "DX", hex(A.regs.DX), `DX becomes ${hex(A.regs.DX)}h (the sign of AX)`, setReg("DX"));
    if (flagsChanged.length) toFlags();
  } else if (FLAG_OPS.has(mn)) {
    add("CU", "FLAGS", mn, `${mn} changes one flag: ${flagsChanged.map(flagText).join(", ") || "already set that way"}`, applyFlags);
  } else if (mn === "SAHF") add("AX", "FLAGS", hex(B.regs.AX >> 8, 2), "SAHF copies AH into the low flags", applyFlags);
  else if (mn === "LAHF") add("FLAGS", "AX", hex(A.regs.AX >> 8, 2), "LAHF copies the low flags into AH", setReg("AX"));
  else if (mn === "HLT") note("HLT: the CPU stops here.");
  else if (mn === "NOP") note("NOP: nothing happens, the CPU just moves on.");
  else note(dis);
  return H;
};

interface IntContext {
  B: Capture;
  A: Capture;
  cpu: Cpu;
  add: (from: BoardNode, to: BoardNode, label: string, text: string, apply?: ((vs: ViewState) => void) | null) => void;
  note: (text: string) => void;
  setReg: (n: RegisterNode) => (vs: ViewState) => void;
}

const interruptPlan = (n: number, { B, A, cpu, add, note, setReg }: IntContext): void => {
  const ah = B.regs.AX >> 8, al = B.regs.AX & 0xFF, dl = B.regs.DX & 0xFF;
  const lit = (vs: ViewState): void => { vs.monitor = A.monitor; vs.marks.add("SCREEN"); };
  const keyIn = (vs: ViewState): void => { setReg("AX")(vs); vs.kbd = A.kbd; vs.marks.add("KBD"); };
  const dos = n === 0x21, video = n === 0x10;
  if (dos && ah === 0x02) {
    add("DX", "SCREEN", charText(dl), `INT 21h, AH = 02h: DOS prints DL = ${charText(dl)} on the screen`, lit);
    if (A.regs.AX !== B.regs.AX) add("DX", "AX", hex(A.regs.AX & 0xFF, 2), "DOS also hands the character back in AL", setReg("AX"));
  } else if (dos && ah === 0x09) {
    let s = "";
    for (let i = 0; i < DOS_STRING_PREVIEW; i++) {
      const c = cpu.rb(B.regs.DS, B.regs.DX + i);
      if (c === DOLLAR) break;
      s += c >= PRINTABLE_LOW && c < PRINTABLE_HIGH ? String.fromCharCode(c) : " ";
    }
    add("MEM", "SCREEN", `"${s.trim().slice(0, DOS_STRING_LABEL)}"`, "INT 21h, AH = 09h: DOS copies the text at DS:DX to the screen until '$'", lit);
    if (A.regs.AX !== B.regs.AX) add("CU", "AX", hex(A.regs.AX & 0xFF, 2), "DOS leaves AL = 24h, the '$' that ended the text", setReg("AX"));
  } else if (dos && (ah === 0x01 || ah === 0x07 || ah === 0x08)) {
    add("KBD", "AX", charText(A.regs.AX & 0xFF), `INT 21h, AH = ${hex(ah, 2)}h: DOS reads a key into AL`, keyIn);
    if (ah === 0x01) add("AX", "SCREEN", charText(A.regs.AX & 0xFF), "and echoes it on the screen", lit);
  } else if (dos && ah === 0x0A) add("KBD", "MEM", "line", "INT 21h, AH = 0Ah: DOS stores the typed line at DS:DX", vs => { vs.marks.add("MEM"); vs.monitor = A.monitor; });
  else if ((dos && (ah === 0x4C || ah === 0x00)) || n === 0x20) note(`DOS ends the program${dos && ah === 0x4C ? ` with exit code ${al}` : ""}. Control goes back to DOS.`);
  else if (video && (ah === 0x0E || ah === 0x09 || ah === 0x0A)) add("AX", "SCREEN", charText(al), `INT 10h, AH = ${hex(ah, 2)}h: the BIOS writes ${charText(al)} to the screen`, lit);
  else if (video && ah === 0x02) add("DX", "SCREEN", `${hex(B.regs.DX >> 8, 2)},${hex(dl, 2)}`, `INT 10h, AH = 02h: the cursor moves to row ${B.regs.DX >> 8}, column ${dl}`, lit);
  else if (video) add("CU", "SCREEN", `${hex(ah, 2)}h`, `INT 10h, AH = ${hex(ah, 2)}h: the BIOS updates the screen`, lit);
  else if (n === 0x16 && (ah === 0x00 || ah === 0x10)) add("KBD", "AX", charText(A.regs.AX & 0xFF), "INT 16h: the BIOS reads a key into AL (scan code in AH)", keyIn);
  else note(`INT ${hex(n, 2)}h, AH = ${hex(ah, 2)}h`);
};

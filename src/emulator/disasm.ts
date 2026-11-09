import { hex, hexh } from "./hex.ts";
import { REG16, REG8, S, SREG } from "./cpu/registers.ts";
import { REPE, STRING_OPS, type Instruction, type Mnemonic, type Operand } from "./cpu/types.ts";

const FAR_POINTER_MNEMONICS: ReadonlySet<Mnemonic> = new Set(["CALLF", "JMPF", "LDS", "LES"]);
const LOAD_POINTER_MNEMONICS: ReadonlySet<Mnemonic> = new Set(["LDS", "LES"]);
const COMPARING_STRING_OPS: ReadonlySet<Mnemonic> = new Set(["CMPS", "SCAS"]);
const STRING_MNEMONICS: ReadonlySet<Mnemonic> = new Set(STRING_OPS);
const SMALL_DECIMAL = 9;

const sizePrefix = (o: Operand & { kind: "mem" }, ins: Instruction): string => {
  if (FAR_POINTER_MNEMONICS.has(ins.mn)) return LOAD_POINTER_MNEMONICS.has(ins.mn) ? "" : "DWORD PTR ";
  if (ins.ops.some(x => x.kind === "reg")) return "";
  return o.w ? "WORD PTR " : "BYTE PTR ";
};

export const formatOperand = (o: Operand, ins: Instruction): string => {
  switch (o.kind) {
    case "reg": return o.w ? REG16[o.n] : REG8[o.n];
    case "seg": return SREG[o.n];
    case "imm": return o.w || o.v > SMALL_DECIMAL ? hexh(o.v, o.w ? 4 : 2) : String(o.v);
    case "rel": return hexh(o.target);
    case "far": return `${hex(o.seg)}:${hex(o.off)}`;
    case "mem": {
      const segDefault = o.base.includes("BP") ? S.SS : S.DS;
      const seg = o.seg !== segDefault ? `${SREG[o.seg]}:` : "";
      const disp = o.base ? (o.disp ? (o.disp < 0 ? "-" : "+") + hexh(Math.abs(o.disp), 2) : "") : hexh(o.disp);
      return `${sizePrefix(o, ins)}${seg}[${o.base}${disp}]`;
    }
  }
};

const repPrefix = (ins: Instruction): string => {
  if (!ins.rep) return "";
  if (ins.rep === REPE) return COMPARING_STRING_OPS.has(ins.mn) ? "REPE " : "REP ";
  return "REPNE ";
};

const mnemonicText = (ins: Instruction): string => {
  const farLiteral = ins.ops[0]?.kind === "far";
  if (STRING_MNEMONICS.has(ins.mn)) return ins.mn + (ins.w ? "W" : "B");
  if (ins.mn === "CALLF") return farLiteral ? "CALL FAR" : "CALL";
  if (ins.mn === "JMPF") return farLiteral ? "JMP FAR" : "JMP";
  return ins.mn;
};

export const disasm = (ins: Instruction): string =>
  repPrefix(ins) + mnemonicText(ins) + (ins.ops.length ? ` ${ins.ops.map(o => formatOperand(o, ins)).join(", ")}` : "");

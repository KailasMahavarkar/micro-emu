export type Width = 0 | 1;

export const ALU_OPS = ["ADD", "OR", "ADC", "SBB", "AND", "SUB", "XOR", "CMP"] as const;
export const SHIFT_OPS = ["ROL", "ROR", "RCL", "RCR", "SHL", "SHR", "SETMO", "SAR"] as const;
export const GRP3_OPS = ["TEST", "TEST", "NOT", "NEG", "MUL", "IMUL", "DIV", "IDIV"] as const;
export const GRP5_OPS = ["INC", "DEC", "CALL", "CALLF", "JMP", "JMPF", "PUSH", "PUSH"] as const;
export const JCC = ["JO", "JNO", "JB", "JAE", "JE", "JNE", "JBE", "JA", "JS", "JNS", "JP", "JNP", "JL", "JGE", "JLE", "JG"] as const;
export const STRING_OPS = ["MOVS", "CMPS", "STOS", "LODS", "SCAS"] as const;
export const OTHER_OPS = [
  "INC", "DEC", "PUSH", "POP", "MOV", "XCHG", "ESC", "DAA", "DAS", "AAA", "AAS", "LEA", "NOP", "CBW", "CWD", "WAIT",
  "PUSHF", "POPF", "SAHF", "LAHF", "RET", "RETF", "LES", "LDS", "INT", "INTO", "IRET", "AAM", "AAD", "SALC", "XLAT",
  "LOOPNE", "LOOPE", "LOOP", "JCXZ", "IN", "OUT", "CALL", "JMP", "HLT", "CMC", "CLC", "STC", "CLI", "STI", "CLD", "STD", "BAD"
] as const;

export type AluOp = (typeof ALU_OPS)[number];
export type ShiftOp = (typeof SHIFT_OPS)[number];
export type JccOp = (typeof JCC)[number];
export type StringOp = (typeof STRING_OPS)[number];
export type Mnemonic = AluOp | ShiftOp | JccOp | StringOp | (typeof GRP3_OPS)[number] | (typeof GRP5_OPS)[number] | (typeof OTHER_OPS)[number];

export const EA_TEXT = ["BX+SI", "BX+DI", "BP+SI", "BP+DI", "SI", "DI", "BP", "BX"] as const;
export type EaBase = (typeof EA_TEXT)[number] | "";

export interface RegOperand { kind: "reg"; n: number; w: Width }
export interface SegOperand { kind: "seg"; n: number }
export interface MemOperand { kind: "mem"; seg: number; off: number; w: Width; base: EaBase; disp: number }
export interface ImmOperand { kind: "imm"; v: number; w: Width }
export interface RelOperand { kind: "rel"; target: number }
export interface FarOperand { kind: "far"; seg: number; off: number }
export type Operand = RegOperand | SegOperand | MemOperand | ImmOperand | RelOperand | FarOperand;
export type ValueOperand = RegOperand | SegOperand | MemOperand | ImmOperand;

export const NO_SEGMENT_OVERRIDE = -1;
export const REP_NONE = 0;
export const REPNE = 0xF2;
export const REPE = 0xF3;
export type RepPrefix = typeof REP_NONE | typeof REPNE | typeof REPE;

export interface Instruction {
  cs: number;
  addr: number;
  seg: number;
  rep: RepPrefix;
  op: number;
  mn: Mnemonic;
  w: Width;
  ops: Operand[];
  len: number;
}

export const isValueOperand = (o: Operand): o is ValueOperand => o.kind !== "rel" && o.kind !== "far";

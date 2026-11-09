export const ASM_ERROR_CODES = [
  "SYNTAX", "BAD_ADDR", "OPERANDS", "UNKNOWN_SYM", "RESERVED_NAME", "DUP_LABEL", "SIZE_MISMATCH", "SIZE_UNKNOWN",
  "IMM_RANGE", "OPERAND_COUNT", "JUMP_RANGE", "JUMP_TARGET", "TWO_MEM", "DEST_IMM", "SEG_IMM", "SEG_SEG", "MOV_CS",
  "SEG_ALU", "MUL_IMM", "SHIFT_COUNT", "PUSH_IMM", "PUSH_8", "POP_CS", "IO_ACC", "UNKNOWN_MN", "NO_CODE"
] as const;
export type AsmErrorCode = (typeof ASM_ERROR_CODES)[number];
export type MessageArgs = Readonly<Record<string, string | number>>;

export interface AsmDiagnostic {
  line: number;
  code: AsmErrorCode;
  args: MessageArgs;
  macro: string | null;
}

export class AsmError extends Error {
  constructor(readonly code: AsmErrorCode, readonly args: MessageArgs = {}) {
    super(code);
  }
}

export const fail = (code: AsmErrorCode, args: MessageArgs = {}): never => {
  throw new AsmError(code, args);
};

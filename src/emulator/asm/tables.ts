import type { DataSize } from "./symbols.ts";

type Lookup<T> = Readonly<Partial<Record<string, T>>>;

export const JCC_CODES: Lookup<number> = {
  JO: 0, JNO: 1, JB: 2, JC: 2, JNAE: 2, JAE: 3, JNB: 3, JNC: 3, JE: 4, JZ: 4, JNE: 5, JNZ: 5, JBE: 6, JNA: 6,
  JA: 7, JNBE: 7, JS: 8, JNS: 9, JP: 10, JPE: 10, JNP: 11, JPO: 11, JL: 12, JNGE: 12, JGE: 13, JNL: 13,
  JLE: 14, JNG: 14, JG: 15, JNLE: 15
};
export const LOOP_CODES: Lookup<number> = { LOOPNE: 0xE0, LOOPNZ: 0xE0, LOOPE: 0xE1, LOOPZ: 0xE1, LOOP: 0xE2, JCXZ: 0xE3 };
export const SIMPLE: Lookup<number> = {
  NOP: 0x90, HLT: 0xF4, CLC: 0xF8, STC: 0xF9, CMC: 0xF5, CLD: 0xFC, STD: 0xFD, CLI: 0xFA, STI: 0xFB,
  CBW: 0x98, CWD: 0x99, PUSHF: 0x9C, POPF: 0x9D, SAHF: 0x9E, LAHF: 0x9F, XLAT: 0xD7, XLATB: 0xD7,
  AAA: 0x37, AAS: 0x3F, DAA: 0x27, DAS: 0x2F, WAIT: 0x9B, INTO: 0xCE, IRET: 0xCF,
  MOVSB: 0xA4, MOVSW: 0xA5, CMPSB: 0xA6, CMPSW: 0xA7, STOSB: 0xAA, STOSW: 0xAB,
  LODSB: 0xAC, LODSW: 0xAD, SCASB: 0xAE, SCASW: 0xAF
};
export const PREFIX: Lookup<number> = { REP: 0xF3, REPE: 0xF3, REPZ: 0xF3, REPNE: 0xF2, REPNZ: 0xF2, LOCK: 0xF0 };
export const ALU_INDEX: Lookup<number> = { ADD: 0, OR: 1, ADC: 2, SBB: 3, AND: 4, SUB: 5, XOR: 6, CMP: 7 };
export const GRP3_INDEX: Lookup<number> = { NOT: 2, NEG: 3, MUL: 4, IMUL: 5, DIV: 6, IDIV: 7 };
export const SHIFT_INDEX: Lookup<number> = { ROL: 0, ROR: 1, RCL: 2, RCR: 3, SHL: 4, SAL: 4, SHR: 5, SAR: 7 };
export const RM_CODE: Lookup<number> = { "BX+SI": 0, "BX+DI": 1, "BP+SI": 2, "BP+DI": 3, SI: 4, DI: 5, BP: 6, BX: 7 };
export const POINTER_LOAD: Lookup<number> = { LEA: 0x8D, LDS: 0xC5, LES: 0xC4 };
export const DATA_SIZE: Lookup<DataSize> = { DB: 1, DW: 2, DD: 4 };
export const PTR_SIZE: Lookup<DataSize> = { BYTE: 1, WORD: 2, DWORD: 4 };
export const IGNORED: ReadonlySet<string> = new Set([
  "ASSUME", "NAME", "TITLE", "PUBLIC", "EXTRN", "PAGE", ".8086", ".8087", ".RADIX", "SUBTTL", ".LIST", ".NOLIST", "OPTION"
]);
export const MNEMONICS: ReadonlySet<string> = new Set([
  ...Object.keys(SIMPLE), ...Object.keys(PREFIX), ...Object.keys(ALU_INDEX), ...Object.keys(GRP3_INDEX), ...Object.keys(SHIFT_INDEX),
  ...Object.keys(JCC_CODES), ...Object.keys(LOOP_CODES), "MOV", "TEST", "XCHG", "INC", "DEC", "PUSH", "POP", "LEA", "LDS", "LES",
  "JMP", "CALL", "RET", "RETN", "RETF", "INT", "IN", "OUT", "AAM", "AAD"
]);
export const RESERVED_REGISTERS: ReadonlySet<string> = new Set([
  "AX", "BX", "CX", "DX", "AL", "AH", "BL", "BH", "CL", "CH", "DL", "DH", "SI", "DI", "SP", "BP", "CS", "DS", "ES", "SS"
]);
export const DIRECTIVE_WORDS: ReadonlySet<string> = new Set([
  "ORG", "DB", "DW", "DD", "EQU", "PROC", "ENDP", "SEGMENT", "ENDS", "END", ".MODEL", ".STACK", ".DATA", ".CODE", "INCLUDE",
  "MACRO", "ENDM", "LOCAL", "LABEL", "OFFSET", "PTR", "BYTE", "WORD", "DUP", "SHORT", "NEAR", "FAR", ...IGNORED
]);

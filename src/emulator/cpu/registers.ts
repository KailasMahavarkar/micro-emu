export const REG16 = ["AX", "CX", "DX", "BX", "SP", "BP", "SI", "DI"] as const;
export const REG8 = ["AL", "CL", "DL", "BL", "AH", "CH", "DH", "BH"] as const;
export const SREG = ["ES", "CS", "SS", "DS"] as const;
export type Reg16 = (typeof REG16)[number];
export type Reg8 = (typeof REG8)[number];
export type SegReg = (typeof SREG)[number];

export const R = { AX: 0, CX: 1, DX: 2, BX: 3, SP: 4, BP: 5, SI: 6, DI: 7 } as const satisfies Record<Reg16, number>;
export const S = { ES: 0, CS: 1, SS: 2, DS: 3 } as const satisfies Record<SegReg, number>;
export const R8 = { AL: 0, CL: 1, DL: 2, BL: 3, AH: 4, CH: 5, DH: 6, BH: 7 } as const satisfies Record<Reg8, number>;

export const FLAG_NAMES = ["CF", "PF", "AF", "ZF", "SF", "TF", "IF", "DF", "OF"] as const;
export type FlagName = (typeof FLAG_NAMES)[number];
export const F = {
  CF: 0x0001, PF: 0x0004, AF: 0x0010, ZF: 0x0040, SF: 0x0080, TF: 0x0100, IF: 0x0200, DF: 0x0400, OF: 0x0800
} as const satisfies Record<FlagName, number>;
export const FLAGS_FIXED = 0xF002;
export const FLAGS_WRITABLE = 0x0FD5;
export const SAHF_MASK = 0xD5;
export const FLAGS_RESERVED_ONE = 0x02;
export const LOW_BYTE_FLAGS = 0xFF00;

export const PARITY = Uint8Array.from({ length: 256 }, (_, value) => {
  let bits = value, ones = 0;
  while (bits) { ones += bits & 1; bits >>= 1; }
  return ones % 2 === 0 ? 1 : 0;
});

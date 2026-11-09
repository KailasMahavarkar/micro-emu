const HEX_RADIX = 16;
const LEADING_LETTER = /^[A-F]/;

export const hex = (value: number, digits = 4): string => (value >>> 0).toString(HEX_RADIX).toUpperCase().padStart(digits, "0");

export const hexh = (value: number, digits = 4): string => {
  const text = hex(value, digits);
  return `${LEADING_LETTER.test(text) ? "0" : ""}${text}h`;
};

export const signed8 = (value: number): number => (value << 24) >> 24;
export const signed16 = (value: number): number => (value << 16) >> 16;

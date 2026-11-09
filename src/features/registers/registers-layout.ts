import { F, FLAG_NAMES, R, REG16, S, SREG, hex, type FlagName, type Snapshot } from "../../emulator/index.ts";

export const REGISTER_NAMES = [...REG16, ...SREG, "IP"] as const;
export type RegisterName = (typeof REGISTER_NAMES)[number];
export const REGISTER_GROUPS: readonly { title: string; names: readonly RegisterName[] }[] = [
  { title: "General", names: ["AX", "BX", "CX", "DX"] },
  { title: "Pointers", names: ["IP", "SP", "BP", "SI", "DI"] },
  { title: "Segment", names: ["CS", "DS", "ES", "SS"] }
];
const SPLIT: ReadonlySet<RegisterName> = new Set(["AX", "BX", "CX", "DX"]);

export interface RegisterSource { r: Uint16Array; s: Uint16Array; ip: number; flags: number }
export interface RegisterCell { name: RegisterName; value: string; decimal: string | null; halves: string | null; changed: boolean }
export interface FlagCell { name: FlagName; on: boolean; changed: boolean }

export const registerValues = ({ r, s, ip }: RegisterSource): Record<RegisterName, number> => ({
  AX: r[R.AX], CX: r[R.CX], DX: r[R.DX], BX: r[R.BX], SP: r[R.SP], BP: r[R.BP], SI: r[R.SI], DI: r[R.DI],
  ES: s[S.ES], CS: s[S.CS], SS: s[S.SS], DS: s[S.DS], IP: ip
});

export const registerCell = (name: RegisterName, now: RegisterSource, prev: Snapshot | null): RegisterCell => {
  const v = registerValues(now)[name], before = prev ? registerValues(prev)[name] : v, split = SPLIT.has(name);
  return {
    name,
    value: hex(v),
    decimal: split ? String(v) : null,
    halves: split ? `${name.charAt(0)}H ${hex(v >> 8, 2)}  ${name.charAt(0)}L ${hex(v & 0xFF, 2)}` : null,
    changed: v !== before
  };
};

export const flagCells = (flags: number, prev: Snapshot | null): FlagCell[] =>
  FLAG_NAMES.map(name => ({ name, on: (flags & F[name]) !== 0, changed: prev !== null && ((flags ^ prev.flags) & F[name]) !== 0 }));

export const changeList = (now: RegisterSource, prev: Snapshot | null): string[] | null => {
  if (!prev) return null;
  const a = registerValues(prev), b = registerValues(now);
  return [
    ...REGISTER_NAMES.filter(n => a[n] !== b[n]).map(n => `${n} ${hex(a[n])} → ${hex(b[n])}`),
    ...FLAG_NAMES.filter(f => (prev.flags ^ now.flags) & F[f]).map(f => `${f} ${prev.flags & F[f] ? 1 : 0} → ${now.flags & F[f] ? 1 : 0}`)
  ];
};

export const FLAG_TITLES: Readonly<Record<FlagName, string>> = {
  CF: "Carry", PF: "Parity", AF: "Auxiliary carry", ZF: "Zero", SF: "Sign", TF: "Trap", IF: "Interrupt enable", DF: "Direction", OF: "Overflow"
};

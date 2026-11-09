import { R, S, hex, type Cpu, type Program, type StepRecord } from "../../emulator/index.ts";

export const STACK_FREE_ROWS = 2;
export const STACK_SHOW_ROWS = 14;
export const MEMORY_ROWS = 16;
export const MEMORY_ROW_BYTES = 16;
export const MEMORY_WHEEL_STEP = 64;
const LISTING_BYTES = 6;
const PRINTABLE_LOW = 32;
const PRINTABLE_HIGH = 127;
const COM_DATA_START = 0x100;
const COM_STACK_TOP = 0xFFFE;
const ADDRESS_MASK = 0xFFFFF;
const WORD_MASK = 0xFFFF;
const SEG_OFF = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})h?$/i;
const OFF_ONLY = /^([0-9a-f]{1,4})h?$/i;
const HEX = 16;

export interface Address { seg: number; off: number }
export type StackRole = "sp" | "used" | "free";
export interface StackRow { offset: string; value: string; role: StackRole; changed: boolean }
export interface MemoryByte { text: string; changed: boolean }
export interface MemoryRow { address: string; bytes: MemoryByte[]; ascii: string }
export interface ListingRow { key: string; address: string; bytes: string; source: string; current: boolean }

export const changedAddresses = (record: StepRecord | null): ReadonlySet<number> => {
  const out = new Set<number>();
  if (record) for (let i = 0; i < record.log.length; i += 2) out.add(record.log[i]);
  return out;
};

export const stackRows = (cpu: Cpu, program: Program, changed: ReadonlySet<number>): StackRow[] => {
  const sp = cpu.r[R.SP], ss = cpu.s[S.SS];
  const top = program.mode === "exe" ? (program.sp - 2) & WORD_MASK : COM_STACK_TOP;
  const rows: StackRow[] = [];
  for (let a = Math.max(sp - 2 * STACK_FREE_ROWS, 0), k = 0; a <= Math.max(top, sp) && k < STACK_SHOW_ROWS + STACK_FREE_ROWS; a += 2, k++) {
    const lin = cpu.lin(ss, a);
    rows.push({
      offset: `SS:${hex(a)}`,
      value: hex(cpu.rw(ss, a)),
      role: a === sp ? "sp" : a > sp ? "used" : "free",
      changed: changed.has(lin) || changed.has(lin + 1)
    });
  }
  return rows;
};

export const defaultMemoryStart = (program: Program, ds: number): Address => {
  if (program.mode === "com") return { seg: ds, off: COM_DATA_START };
  const data = program.segments.find(s => s.name.includes("DATA"));
  return { seg: data ? data.base : ds, off: 0 };
};

export const memoryRows = (cpu: Cpu, start: Address, changed: ReadonlySet<number>): MemoryRow[] =>
  Array.from({ length: MEMORY_ROWS }, (_, r) => {
    const off = (start.off + r * MEMORY_ROW_BYTES) & WORD_MASK, lin = cpu.lin(start.seg, off);
    const raw = Array.from({ length: MEMORY_ROW_BYTES }, (_b, i) => (lin + i) & ADDRESS_MASK);
    return {
      address: `${hex(start.seg)}:${hex(off)}`,
      bytes: raw.map(a => ({ text: hex(cpu.mem[a], 2), changed: changed.has(a) })),
      ascii: raw.map(a => cpu.mem[a]).map(b => (b >= PRINTABLE_LOW && b < PRINTABLE_HIGH ? String.fromCharCode(b) : ".")).join("")
    };
  });

export const parseAddress = (text: string, ds: number): Address | null => {
  const v = text.trim(), pair = SEG_OFF.exec(v), single = OFF_ONLY.exec(v);
  if (pair) return { seg: parseInt(pair[1], HEX), off: parseInt(pair[2], HEX) };
  if (single) return { seg: ds, off: parseInt(single[1], HEX) };
  return null;
};

export const listingRows = (program: Program, source: string, ip: number): ListingRow[] => {
  const lines = source.split("\n");
  return program.listing.map((l, i) => ({
    key: `${i}`,
    address: `${hex(l.base)}:${hex(l.off)}`,
    bytes: (l.bytes.slice(0, LISTING_BYTES).map(b => hex(b, 2)).join(" ") + (l.bytes.length > LISTING_BYTES ? " .." : "")).padEnd(LISTING_BYTES * 3 + 2),
    source: (lines[l.line] ?? "").trim(),
    current: l.kind === "code" && l.linear === ip
  }));
};

import { assemble, type Program } from "./asm/assemble.ts";
import { COLS, ROWS, VIDEO_LIN } from "./layout.ts";
import { Machine } from "./machine/machine.ts";

const ENTER_SCAN = 0x1C;
const LETTER_SCAN = 0x10;
const DEFAULT_LIMIT = 100_000;

export const build = (src: string): { m: Machine; p: Program } => {
  const p = assemble(src);
  if (p.errors.length) throw new Error(`asm errors: ${JSON.stringify(p.errors)}`);
  const m = new Machine();
  m.load(p);
  return { m, p };
};

export const run = (m: Machine, limit = DEFAULT_LIMIT): void => {
  for (let n = 0; n < limit && !m.finished(); n++) {
    m.step();
    if (m.isWaiting()) return;
  }
};

export const type = (m: Machine, text: string): void => {
  for (const ch of text) m.pressKey(ch.charCodeAt(0), ch === "\r" ? ENTER_SCAN : LETTER_SCAN);
};

export const screenRows = (m: Machine): string[] =>
  Array.from({ length: ROWS }, (_, r) =>
    String.fromCharCode(...Array.from({ length: COLS }, (_c, c) => m.cpu.mem[VIDEO_LIN + (r * COLS + c) * 2])).trimEnd());

export const attrAt = (m: Machine, row: number, col: number): number => m.cpu.mem[VIDEO_LIN + (row * COLS + col) * 2 + 1];

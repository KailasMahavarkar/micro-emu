import { layout } from "../../emulator/index.ts";

export const CGA_TEXT: readonly string[] = [
  "text-cga-0", "text-cga-1", "text-cga-2", "text-cga-3", "text-cga-4", "text-cga-5", "text-cga-6", "text-cga-7",
  "text-cga-8", "text-cga-9", "text-cga-10", "text-cga-11", "text-cga-12", "text-cga-13", "text-cga-14", "text-cga-15"
];
export const CGA_BACKGROUND: readonly string[] = ["", "bg-cga-1", "bg-cga-2", "bg-cga-3", "bg-cga-4", "bg-cga-5", "bg-cga-6", "bg-cga-7"];
export const CP437 = Array.from(" ☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼" +
  " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~⌂" +
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ");

export const CRT_CHAR_RATIO = 0.602;
export const CRT_LINE = 1.25;
export const CRT_FONT_MIN = 8;
export const CRT_FONT_MAX = 15;
export const MINI_ROWS = 9;
export const MINI_COLS = 40;
const FOREGROUND_MASK = 0x0F;
const BACKGROUND_MASK = 0x07;
const ROW_BYTES = layout.COLS * 2;

export interface ScreenRun { text: string; className: string }
export interface Cursor { row: number; col: number }

const runClass = (attr: number): string => `${CGA_TEXT[attr & FOREGROUND_MASK]} ${CGA_BACKGROUND[(attr >> 4) & BACKGROUND_MASK]}`.trim();

export const screenRuns = (mem: Uint8Array, firstRow: number, lastRow: number, cols: number): ScreenRun[][] =>
  Array.from({ length: lastRow - firstRow }, (_, k) => {
    const runs: ScreenRun[] = [];
    let attr = -1;
    for (let c = 0; c < cols; c++) {
      const o = layout.VIDEO_LIN + (firstRow + k) * ROW_BYTES + c * 2, a = mem[o + 1], ch = CP437[mem[o]] ?? " ";
      const last = runs.at(-1);
      if (a === attr && last) last.text += ch;
      else {
        runs.push({ text: ch, className: runClass(a) });
        attr = a;
      }
    }
    return runs;
  });

export const cursorOf = (mem: Uint8Array): Cursor => ({
  row: mem[(layout.BIOS_SEG << 4) + layout.CURSOR_ROW],
  col: mem[(layout.BIOS_SEG << 4) + layout.CURSOR_COL]
});

export const focusRow = (mem: Uint8Array, lastVideo: number | null): number =>
  lastVideo === null ? cursorOf(mem).row : Math.floor((lastVideo - layout.VIDEO_LIN) / ROW_BYTES);

export const miniWindowStart = (row: number): number => Math.max(0, Math.min(layout.ROWS - MINI_ROWS, row - MINI_ROWS + 3));

export const fitFontSize = (width: number, height: number | null): number => {
  const byWidth = (width - 24) / (layout.COLS * CRT_CHAR_RATIO), byHeight = height === null ? Number.POSITIVE_INFINITY : (height - 16) / (layout.ROWS * CRT_LINE);
  return Math.max(CRT_FONT_MIN, Math.min(CRT_FONT_MAX, byWidth, byHeight));
};

const SPECIAL_KEYS: Readonly<Partial<Record<string, [number, number]>>> = {
  Enter: [13, 0x1C], Backspace: [8, 0x0E], Escape: [27, 0x01], Tab: [9, 0x0F], ArrowUp: [0, 0x48], ArrowDown: [0, 0x50],
  ArrowLeft: [0, 0x4B], ArrowRight: [0, 0x4D], Delete: [0, 0x53], Home: [0, 0x47], End: [0, 0x4F]
};
const LATIN1_LIMIT = 256;

export interface KeyLike { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }

export const keyCode = (e: KeyLike): [number, number] | null => {
  const special = SPECIAL_KEYS[e.key];
  if (special) return special;
  if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return null;
  const c = e.key.charCodeAt(0);
  return c < LATIN1_LIMIT ? [c, 0] : null;
};

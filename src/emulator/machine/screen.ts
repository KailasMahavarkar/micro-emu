import type { Cpu } from "../cpu/cpu.ts";
import { BIOS_SEG, BLANK_CHAR, COLS, CURSOR_COL, CURSOR_ROW, DEFAULT_ATTR, ROWS, VIDEO_SEG } from "../layout.ts";

export interface Cursor { row: number; col: number }

const CR = 13;
const LF = 10;
const BS = 8;
const BEL = 7;
const TAB = 9;
const TAB_STOP = 8;

export class TextScreen {
  constructor(private readonly cpu: Cpu) {}

  cursor(): Cursor { return { row: this.cpu.rb(BIOS_SEG, CURSOR_ROW), col: this.cpu.rb(BIOS_SEG, CURSOR_COL) }; }
  setCursor(row: number, col: number): void { this.cpu.wb(BIOS_SEG, CURSOR_ROW, row); this.cpu.wb(BIOS_SEG, CURSOR_COL, col); }
  cell(row: number, col: number): number { return (row * COLS + col) * 2; }

  put(row: number, col: number, ch: number, attr?: number): void {
    const o = this.cell(row, col);
    this.cpu.wb(VIDEO_SEG, o, ch);
    if (attr !== undefined) this.cpu.wb(VIDEO_SEG, o + 1, attr);
  }

  read(row: number, col: number): { ch: number; attr: number } {
    const o = this.cell(row, col);
    return { ch: this.cpu.rb(VIDEO_SEG, o), attr: this.cpu.rb(VIDEO_SEG, o + 1) };
  }

  scroll(count: number, attr: number, r0: number, c0: number, r1: number, c1: number, down = false): void {
    const c = this.cpu, h = r1 - r0 + 1, lines = count === 0 || count >= h ? h : count;
    for (let i = 0; i < h; i++) {
      const row = down ? r1 - i : r0 + i, src = down ? row - lines : row + lines;
      for (let col = c0; col <= c1; col++) {
        const o = this.cell(row, col);
        if (down ? src >= r0 : src <= r1) {
          const so = this.cell(src, col);
          c.wb(VIDEO_SEG, o, c.rb(VIDEO_SEG, so));
          c.wb(VIDEO_SEG, o + 1, c.rb(VIDEO_SEG, so + 1));
        } else {
          c.wb(VIDEO_SEG, o, BLANK_CHAR);
          c.wb(VIDEO_SEG, o + 1, attr);
        }
      }
    }
  }

  clear(): void { this.scroll(0, DEFAULT_ATTR, 0, 0, ROWS - 1, COLS - 1); }

  moveTo(row: number, col: number): void {
    let r = row, c = col;
    if (c >= COLS) { c = 0; r++; }
    if (r >= ROWS) { this.scroll(1, DEFAULT_ATTR, 0, 0, ROWS - 1, COLS - 1); r = ROWS - 1; }
    this.setCursor(r, c);
  }

  advance(): void { const { row, col } = this.cursor(); this.moveTo(row, col + 1); }

  tty(ch: number): void {
    let { row, col } = this.cursor();
    switch (ch) {
      case CR: col = 0; break;
      case LF: row++; break;
      case BS: if (col > 0) col--; break;
      case BEL: return;
      case TAB: col = (col + TAB_STOP) & ~(TAB_STOP - 1); break;
      default: this.put(row, col, ch); col++;
    }
    this.moveTo(row, col);
  }

  print(text: string): void { for (const ch of text) this.tty(ch.charCodeAt(0)); }
}

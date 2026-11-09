import { hex } from "../hex.ts";
import { COLS, ROWS, TEXT_MODE } from "../layout.ts";
import { F, R, R8, S } from "../cpu/registers.ts";
import type { MachineHost } from "./types.ts";

const INT_DIVIDE = 0x00;
const INT_BREAKPOINT = 0x03;
const INT_VIDEO = 0x10;
const INT_KEYBOARD = 0x16;
const INT_TIMER = 0x1A;
const INT_TERMINATE = 0x20;
const INT_DOS = 0x21;
const NATIVE_EVEN_IF_HOOKED: ReadonlySet<number> = new Set([INT_DOS, INT_VIDEO, INT_KEYBOARD, INT_TERMINATE]);
const VECTOR_SIZE = 4;
const DOLLAR = 0x24;
const CR = 13;
const BS = 8;
const SPACE = 32;
const STRING_LIMIT = 4096;
const DOS_VERSION = 0x0005;
const DIRECT_INPUT = 0xFF;
const CURSOR_SHAPE = 0x0607;
const DIVIDE_EXIT_CODE = 0xFF;
const MS_PER_DAY = 86_400_000;
const TICKS_PER_SECOND = 18.2065;
const CENTISECOND_MS = 10;
const DIVIDE_MESSAGE = "\r\nDivide overflow\r\n";
const ROLLOVER_FLAG = 0;

const unsupported = (m: MachineHost, n: number, ah: number): true => {
  m.notice = { code: "UNSUPPORTED_INT", args: { n: hex(n, 2), ah: hex(ah, 2) }, fatal: false };
  return true;
};

const readLine = (m: MachineHost): true => {
  const c = m.cpu, buf = c.r[R.DX], ds = c.s[S.DS], max = c.rb(ds, buf);
  const line = m.lineBuf ?? [];
  m.lineBuf = line;
  while (m.hasKey()) {
    const k = m.readKey();
    if (k.a === CR) {
      c.wb(ds, buf + 1, line.length);
      line.forEach((ch, i) => { c.wb(ds, buf + 2 + i, ch); });
      c.wb(ds, buf + 2 + line.length, CR);
      m.screen.tty(CR);
      m.lineBuf = null;
      return true;
    }
    if (k.a === BS) {
      if (line.length) { line.pop(); m.screen.tty(BS); m.screen.tty(SPACE); m.screen.tty(BS); }
    } else if (k.a >= SPACE && line.length < Math.max(0, max - 1)) {
      line.push(k.a);
      m.screen.tty(k.a);
    }
  }
  return m.waitKey();
};

const dos = (m: MachineHost, ah: number, al: number): boolean => {
  const c = m.cpu;
  switch (ah) {
    case 0x00: m.exit(0); return true;
    case 0x01: case 0x07: case 0x08: {
      if (!m.hasKey()) return m.waitKey();
      const k = m.readKey();
      c.set8(R8.AL, k.a);
      if (ah === 0x01) m.screen.tty(k.a);
      return true;
    }
    case 0x02: { const ch = c.get8(R8.DL); m.screen.tty(ch); c.set8(R8.AL, ch); return true; }
    case 0x06: {
      const dl = c.get8(R8.DL);
      if (dl !== DIRECT_INPUT) { m.screen.tty(dl); c.set8(R8.AL, dl); return true; }
      if (m.hasKey()) { c.set8(R8.AL, m.readKey().a); c.setF(F.ZF, false); }
      else { c.set8(R8.AL, 0); c.setF(F.ZF, true); }
      return true;
    }
    case 0x09: {
      let off = c.r[R.DX];
      for (let i = 0; i < STRING_LIMIT; i++) {
        const ch = c.rb(c.s[S.DS], off);
        if (ch === DOLLAR) break;
        m.screen.tty(ch);
        off = (off + 1) & 0xFFFF;
      }
      c.set8(R8.AL, DOLLAR);
      return true;
    }
    case 0x0A: return readLine(m);
    case 0x0B: c.set8(R8.AL, m.hasKey() ? 0xFF : 0); return true;
    case 0x2C: {
      const d = new Date();
      c.set8(R8.CH, d.getHours()); c.set8(R8.CL, d.getMinutes()); c.set8(R8.DH, d.getSeconds());
      c.set8(R8.DL, Math.floor(d.getMilliseconds() / CENTISECOND_MS));
      return true;
    }
    case 0x2A: {
      const d = new Date();
      c.r[R.CX] = d.getFullYear(); c.set8(R8.DH, d.getMonth() + 1); c.set8(R8.DL, d.getDate()); c.set8(R8.AL, d.getDay());
      return true;
    }
    case 0x25: c.ww(0, al * VECTOR_SIZE, c.r[R.DX]); c.ww(0, al * VECTOR_SIZE + 2, c.s[S.DS]); return true;
    case 0x35: c.r[R.BX] = c.rw(0, al * VECTOR_SIZE); c.s[S.ES] = c.rw(0, al * VECTOR_SIZE + 2); return true;
    case 0x30: c.r[R.AX] = DOS_VERSION; return true;
    case 0x4C: m.exit(al); return true;
  }
  return unsupported(m, INT_DOS, ah);
};

const clampRow = (v: number): number => Math.min(v, ROWS - 1);
const clampCol = (v: number): number => Math.min(v, COLS - 1);

const writeString = (m: MachineHost, al: number): true => {
  const c = m.cpu, s = m.screen, save = s.cursor();
  s.setCursor(c.get8(R8.DH), c.get8(R8.DL));
  for (let i = 0; i < c.r[R.CX]; i++) {
    const ch = c.rb(c.s[S.ES], c.r[R.BP] + i);
    if (ch === 13 || ch === 10 || ch === 8 || ch === 7) { s.tty(ch); continue; }
    const at = s.cursor();
    s.put(at.row, at.col, ch, c.get8(R8.BL));
    s.advance();
  }
  if (!(al & 1)) s.setCursor(save.row, save.col);
  return true;
};

const video = (m: MachineHost, ah: number, al: number): boolean => {
  const c = m.cpu, s = m.screen;
  switch (ah) {
    case 0x00: s.clear(); s.setCursor(0, 0); return true;
    case 0x01: case 0x05: return true;
    case 0x02: s.setCursor(clampRow(c.get8(R8.DH)), clampCol(c.get8(R8.DL))); return true;
    case 0x03: { const { row, col } = s.cursor(); c.set8(R8.DH, row); c.set8(R8.DL, col); c.r[R.CX] = CURSOR_SHAPE; return true; }
    case 0x06: case 0x07:
      s.scroll(al, c.get8(R8.BH), clampRow(c.get8(R8.CH)), clampCol(c.get8(R8.CL)), clampRow(c.get8(R8.DH)), clampCol(c.get8(R8.DL)), ah === 0x07);
      return true;
    case 0x08: { const { row, col } = s.cursor(), cell = s.read(row, col); c.set8(R8.AL, cell.ch); c.set8(R8.AH, cell.attr); return true; }
    case 0x09: case 0x0A: {
      const { row, col } = s.cursor();
      for (let i = 0; i < c.r[R.CX] && row * COLS + col + i < COLS * ROWS; i++) {
        const p = row * COLS + col + i;
        s.put(Math.floor(p / COLS), p % COLS, al, ah === 0x09 ? c.get8(R8.BL) : undefined);
      }
      return true;
    }
    case 0x0E: s.tty(al); return true;
    case 0x0F: c.set8(R8.AL, TEXT_MODE); c.set8(R8.AH, COLS); c.set8(R8.BH, 0); return true;
    case 0x13: return writeString(m, al);
  }
  return unsupported(m, INT_VIDEO, ah);
};

const keyboard = (m: MachineHost, ah: number): boolean | null => {
  const c = m.cpu;
  if (ah === 0x00 || ah === 0x10) {
    if (!m.hasKey()) return m.waitKey();
    const k = m.readKey();
    c.r[R.AX] = (k.s << 8) | k.a;
    return true;
  }
  if (ah === 0x01 || ah === 0x11) {
    const k = m.peekKey();
    if (k) { c.r[R.AX] = (k.s << 8) | k.a; c.setF(F.ZF, false); }
    else c.setF(F.ZF, true);
    return true;
  }
  if (ah === 0x02) { c.set8(R8.AL, 0); return true; }
  return null;
};

const timer = (m: MachineHost, ah: number): boolean | null => {
  if (ah !== 0x00) return null;
  const c = m.cpu, t = Math.floor(((Date.now() % MS_PER_DAY) / 1000) * TICKS_PER_SECOND);
  c.r[R.CX] = (t >>> 16) & 0xFFFF;
  c.r[R.DX] = t & 0xFFFF;
  c.set8(R8.AL, ROLLOVER_FLAG);
  return true;
};

export const serviceInterrupt = (m: MachineHost, n: number): boolean => {
  const c = m.cpu, ah = c.get8(R8.AH), al = c.get8(R8.AL);
  const hooked = (c.rw(0, n * VECTOR_SIZE) | c.rw(0, n * VECTOR_SIZE + 2)) !== 0;
  if (hooked && !NATIVE_EVEN_IF_HOOKED.has(n)) return false;
  switch (n) {
    case INT_DIVIDE:
      m.screen.print(DIVIDE_MESSAGE);
      m.notice = { code: "DIV0", args: {}, fatal: true };
      m.exit(DIVIDE_EXIT_CODE);
      return true;
    case INT_BREAKPOINT: m.breakHit = true; return true;
    case INT_TERMINATE: m.exit(0); return true;
    case INT_DOS: return dos(m, ah, al);
    case INT_VIDEO: return video(m, ah, al);
    case INT_KEYBOARD: { const r = keyboard(m, ah); if (r !== null) return r; break; }
    case INT_TIMER: { const r = timer(m, ah); if (r !== null) return r; break; }
  }
  return unsupported(m, n, ah);
};

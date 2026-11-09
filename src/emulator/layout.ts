export const MEMORY_SIZE = 0x100000;
export const ADDRESS_MASK = 0xFFFFF;
export const WORD_MASK = 0xFFFF;
export const BYTE_MASK = 0xFF;
export const PARAGRAPH = 16;

export const LOAD_SEG = 0x0700;
export const PSP_PARAS = 0x10;
export const PSP_SIZE = 0x100;
export const PSP_TOP_OF_MEMORY = 2;
export const PSP_COMMAND_TAIL_END = 0x81;
export const TOP_OF_MEMORY_PARA = 0xA000;
export const COM_ORIGIN = 0x100;
export const COM_STACK_TOP = 0xFFFE;
export const DEFAULT_STACK = 0x100;
export const DEFAULT_DOT_STACK = 1024;

export const VIDEO_SEG = 0xB800;
export const VIDEO_LIN = VIDEO_SEG << 4;
export const COLS = 80;
export const ROWS = 25;
export const VIDEO_BYTES = COLS * ROWS * 2;
export const DEFAULT_ATTR = 0x07;
export const BLANK_CHAR = 0x20;
export const TEXT_MODE = 3;

export const BIOS_SEG = 0x40;
export const BIOS_VIDEO_MODE = 0x49;
export const BIOS_COLUMNS = 0x4A;
export const CURSOR_COL = 0x50;
export const CURSOR_ROW = 0x51;

export const linear = (seg: number, off: number): number => ((seg << 4) + (off & WORD_MASK)) & ADDRESS_MASK;
export const isVideoAddress = (address: number): boolean => address >= VIDEO_LIN && address < VIDEO_LIN + VIDEO_BYTES;

import { DIRECTIVE_WORDS, MNEMONICS, REG16, REG8, SREG } from "../../emulator/index.ts";
import type { SyntaxKind, SyntaxToken } from "./types.ts";

const TOKEN = /(;.*$)|('[^']*'?|"[^"]*"?)|(\b[0-9][0-9A-Fa-f]*[hH]\b|\b0[xX][0-9A-Fa-f]+\b|\b[01]+[bB]\b|\b[0-9]+\b)|([A-Za-z_@?.$#][\w@?.$#]*)/g;
const REGISTERS: ReadonlySet<string> = new Set<string>([...REG16, ...REG8, ...SREG]);
const HELPER_MACRO = /^(DEFINE_|PRINTN?$|PUTC$|GOTOXY$)/;
const NAMING_DIRECTIVE = /^(DB|DW|DD|EQU|PROC|ENDP|SEGMENT|ENDS|MACRO|LABEL)\b/i;

const wordKind = (word: string, after: string, first: boolean): SyntaxKind | null => {
  const up = word.toUpperCase();
  if (REGISTERS.has(up)) return "reg";
  if (first && after.startsWith(":")) return "label";
  if (MNEMONICS.has(up)) return "op";
  if (DIRECTIVE_WORDS.has(up) || up.startsWith(".") || up.startsWith("#") || HELPER_MACRO.test(up)) return "dir";
  if (first && NAMING_DIRECTIVE.test(after)) return "label";
  return null;
};

export const highlightLine = (line: string): SyntaxToken[] => {
  const out: SyntaxToken[] = [];
  let last = 0, first = true;
  for (const m of line.matchAll(TOKEN)) {
    const start = m.index;
    if (start > last) out.push({ text: line.slice(last, start), kind: null });
    last = start + m[0].length;
    let kind: SyntaxKind | null;
    if (m[1]) kind = "comment";
    else if (m[2]) kind = "string";
    else if (m[3]) kind = "number";
    else {
      kind = wordKind(m[0], line.slice(last).trimStart(), first);
      first = false;
    }
    out.push({ text: m[0], kind });
  }
  if (last < line.length) out.push({ text: line.slice(last), kind: null });
  return out;
};

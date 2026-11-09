import { fail } from "./errors.ts";

export const IDENT = "[A-Za-z_@?.$][\\w@?.$]*";
const IDENT_START = new RegExp(`^${IDENT}`);
const HEX_RADIX = 16;
const OCTAL_RADIX = 8;
const BINARY_RADIX = 2;
const DECIMAL_RADIX = 10;
const OPERATORS = "+-*/()[]:";

const isQuote = (c: string): boolean => c === "'" || c === '"';

export const stripComment = (line: string): string => {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line.charAt(i);
    if (quote) { if (c === quote) quote = null; }
    else if (isQuote(c)) quote = c;
    else if (c === ";") return line.slice(0, i);
  }
  return line;
};

export const splitOperands = (text: string): string[] => {
  const out: string[] = [];
  let depth = 0, quote: string | null = null, cur = "";
  for (const c of text) {
    if (quote) { cur += c; if (c === quote) quote = null; continue; }
    if (isQuote(c)) { quote = c; cur += c; continue; }
    if (c === "(" || c === "[") depth++;
    if (c === ")" || c === "]") depth--;
    if (c === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim() || out.length) out.push(cur.trim());
  return out;
};

export const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type Token =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "id"; v: string }
  | { t: "op"; v: string };

const NUMBER_FORMS: readonly { re: RegExp; parse: (m: string) => number }[] = [
  { re: /^[0-9][0-9A-Fa-f]*[Hh](?!\w)/, parse: m => parseInt(m.slice(0, -1), HEX_RADIX) },
  { re: /^0[xX][0-9A-Fa-f]+/, parse: m => parseInt(m.slice(2), HEX_RADIX) },
  { re: /^[01]+[Bb](?!\w)/, parse: m => parseInt(m.slice(0, -1), BINARY_RADIX) },
  { re: /^[0-7]+[OoQq](?!\w)/, parse: m => parseInt(m.slice(0, -1), OCTAL_RADIX) },
  { re: /^[0-9]+[Dd]?(?!\w)/, parse: m => parseInt(m, DECIMAL_RADIX) }
];

const readNumber = (rest: string, whole: string): [number, number] => {
  for (const form of NUMBER_FORMS) {
    const m = form.re.exec(rest);
    if (m) return [form.parse(m[0]), m[0].length];
  }
  return fail("SYNTAX", { x: whole });
};

export const tokenize = (s: string): Token[] => {
  const toks: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s.charAt(i), rest = s.slice(i);
    if (/\s/.test(c)) { i++; continue; }
    if (isQuote(c)) {
      const j = s.indexOf(c, i + 1);
      if (j < 0) fail("SYNTAX", { x: s });
      toks.push({ t: "str", v: s.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c)) {
      const [v, length] = readNumber(rest, s);
      toks.push({ t: "num", v });
      i += length;
      continue;
    }
    const id = IDENT_START.exec(rest);
    if (id) { toks.push({ t: "id", v: id[0].toUpperCase() }); i += id[0].length; continue; }
    if (OPERATORS.includes(c)) { toks.push({ t: "op", v: c }); i++; continue; }
    fail("SYNTAX", { x: s });
  }
  return toks;
};

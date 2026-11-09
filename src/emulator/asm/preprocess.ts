import { EMU8086_INC, type MacroDef } from "./emu8086-inc.ts";
import { IDENT, escapeRegExp, splitOperands, stripComment } from "./syntax.ts";

export interface SourceLine {
  text: string;
  line: number;
  macro: string | null;
}

const MAX_MACRO_DEPTH = 8;
const MACRO_HEADER = new RegExp(`^(${IDENT})\\s+MACRO\\b(.*)$`, "i");
const MACRO_END = /^\s*ENDM\b/i;
const INCLUDE = /^INCLUDE\b/i;
const EMU8086_INCLUDE = /emu8086\.inc/i;
const MACRO_CALL = new RegExp(`^(?:(${IDENT})\\s*:\\s*)?(${IDENT})(?:\\s+(.*))?$`);
const LOCAL_LINE = /^\s*LOCAL\s+(.*)$/i;

const wholeWord = (word: string): RegExp => new RegExp(`(?<![\\w@?.$])${escapeRegExp(word)}(?![\\w@?.$])`, "gi");

const collect = (raw: readonly SourceLine[]): { macros: Map<string, MacroDef>; body: SourceLine[]; include: boolean } => {
  const macros = new Map<string, MacroDef>(), body: SourceLine[] = [];
  let include = false;
  for (let k = 0; k < raw.length; k++) {
    const t = stripComment(raw[k].text).trim();
    const header = MACRO_HEADER.exec(t);
    if (header) {
      const params = header[2].split(",").map(p => p.trim().toUpperCase()).filter(Boolean), lines: string[] = [];
      for (k++; k < raw.length && !MACRO_END.test(stripComment(raw[k].text)); k++) lines.push(raw[k].text);
      macros.set(header[1].toUpperCase(), { params, body: lines });
      continue;
    }
    if (INCLUDE.test(t)) { if (EMU8086_INCLUDE.test(t)) include = true; continue; }
    body.push(raw[k]);
  }
  return { macros, body, include };
};

export const preprocess = (src: string): SourceLine[] => {
  const raw = src.replace(/\r/g, "").split("\n").map((text, line): SourceLine => ({ text, line, macro: null }));
  const { macros, body, include } = collect(raw);
  if (include) for (const [name, def] of EMU8086_INC) if (!macros.has(name)) macros.set(name, def);
  const out: SourceLine[] = [];
  let uid = 0;
  const expand = (lines: readonly SourceLine[], depth: number): void => {
    for (const L of lines) {
      const call = MACRO_CALL.exec(stripComment(L.text).trim());
      const def = call ? macros.get(call[2].toUpperCase()) : undefined;
      if (!call || !def || depth > MAX_MACRO_DEPTH) { out.push(L); continue; }
      const name = call[2].toUpperCase();
      if (call[1]) out.push({ text: `${call[1]}:`, line: L.line, macro: L.macro });
      const args = splitOperands(call.at(3) ?? ""), id = ++uid, locals: string[] = [], kept: string[] = [];
      for (const b of def.body) {
        const local = LOCAL_LINE.exec(stripComment(b));
        if (local) locals.push(...local[1].split(",").map(s => s.trim()).filter(Boolean));
        else kept.push(b);
      }
      const expanded = kept.map((b): SourceLine => {
        let s = b;
        def.params.forEach((p, j) => { s = s.replace(wholeWord(p), args.at(j) ?? ""); });
        locals.forEach(lc => { s = s.replace(wholeWord(lc), `${lc}??${id}`); });
        return { text: s, line: L.line, macro: name };
      });
      expand(expanded, depth + 1);
    }
  };
  expand(body, 0);
  return out;
};

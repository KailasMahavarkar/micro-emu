import { MNEMONICS, type MessageArgs } from "../emulator/index.ts";
import { MESSAGES, type MessageText, type ProblemCode } from "./messages.ts";
import type { Lang } from "./types.ts";

const MAX_SUGGESTION_DISTANCE = 3;
const PLACEHOLDER = /\{(\w+?)(_l)?\}/g;
const SIZE_WORDS: Readonly<Record<number, string>> = { 1: "8-bit", 2: "16-bit", 4: "32-bit" };
const RANGE_BY_BITS: Readonly<Record<number, string>> = { 8: "-128 to 255", 16: "-32768 to 65535" };
const SUGGEST: Record<Lang, (mn: string) => string> = {
  en: mn => ` Did you mean ${mn}?`,
  hi: mn => ` Kya aapka matlab ${mn} tha?`
};

export const editDistance = (a: string, b: string): number => {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row.push(Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    prev = row;
  }
  return prev[b.length];
};

const closestMnemonic = (word: string): string | null => {
  let best: string | null = null, bestDistance = MAX_SUGGESTION_DISTANCE;
  for (const mn of MNEMONICS) {
    const d = editDistance(word.toUpperCase(), mn);
    if (d < bestDistance) { bestDistance = d; best = mn; }
  }
  return best;
};

const argText = (key: string, args: MessageArgs, lang: Lang): string | undefined => {
  const v = args[key];
  if (key === "sa" || key === "sb") return typeof v === "number" ? SIZE_WORDS[v] : undefined;
  if (key === "range") return typeof args.bits === "number" ? RANGE_BY_BITS[args.bits] : undefined;
  if (key === "sugg") {
    const best = typeof args.x === "string" ? closestMnemonic(args.x) : null;
    return best ? SUGGEST[lang](best) : "";
  }
  return v === undefined ? undefined : String(v);
};

export const describeProblem = (code: ProblemCode, args: MessageArgs, lang: Lang): MessageText => {
  const text = MESSAGES[code][lang];
  const fill = (s: string): string => s.replace(PLACEHOLDER, (_m, key: string, lower: string | undefined) => {
    const v = argText(key, args, lang);
    if (v === undefined) return "";
    return lower ? v.toLowerCase() : v;
  });
  return { what: fill(text.what), why: fill(text.why), fix: fill(text.fix) };
};

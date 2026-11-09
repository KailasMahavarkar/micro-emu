import type { Lang } from "./types.ts";

export interface Copy {
  line: string;
  more: string;
  pressKey: string;
  waitingHint: string;
  screenMode: string;
  waitingStatus: string;
  fixFirst: string;
  finished: (code: number) => string;
  halted: string;
  stopped: string;
  next: string;
  linkCopied: string;
  linkInBar: string;
  insideMacro: (name: string) => string;
}

export const COPY: Readonly<Record<Lang, Copy>> = {
  en: {
    line: "Line",
    more: "Also:",
    pressKey: "Press a key",
    waitingHint: "Waiting for a key: click here and type",
    screenMode: "80 x 25 text mode",
    waitingStatus: "Waiting for a key",
    fixFirst: "Fix the problem above to run the program.",
    finished: code => `Program finished (exit code ${code}). Press Reset to run it again.`,
    halted: "HLT: the CPU stopped. Press Reset to run again.",
    stopped: "Stopped. Press Reset to run again.",
    next: "Next",
    linkCopied: "Link copied",
    linkInBar: "Link is in the address bar",
    insideMacro: name => ` (inside ${name})`
  },
  hi: {
    line: "Line",
    more: "Aur bhi:",
    pressKey: "Key dabao",
    waitingHint: "Key ka intezaar: yahan click karke type karo",
    screenMode: "80 x 25 text mode",
    waitingStatus: "Key ka intezaar",
    fixFirst: "Upar wali problem theek karo, phir program chalega.",
    finished: code => `Program khatam hua (exit code ${code}). Dobara chalane ke liye Reset dabao.`,
    halted: "HLT: CPU ruk gaya. Dobara chalane ke liye Reset dabao.",
    stopped: "Ruk gaya. Dobara chalane ke liye Reset dabao.",
    next: "Agla",
    linkCopied: "Link copy ho gaya",
    linkInBar: "Link address bar mein hai",
    insideMacro: name => ` (${name} ke andar)`
  }
};

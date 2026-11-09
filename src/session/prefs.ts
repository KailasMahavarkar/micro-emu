import { create } from "zustand";
import { persist } from "zustand/middleware";
import { LANGS, type Lang } from "../i18n/types.ts";
import { DEFAULT_SPEED } from "./constants.ts";
import { SPEEDS, type ProgramId, type Speed } from "./types.ts";

export const BOARD_SPEED = { min: 0.25, max: 3, step: 0.25, initial: 1 } as const;
const STORAGE_KEY = "lab8086.prefs";
const PREFS_VERSION = 1;
const PREVIOUS_DEFAULT_SPEED: Speed = "fast";

interface PrefsData {
  lang: Lang;
  speed: Speed;
  boardSpeed: number;
  showFetch: boolean;
  drafts: Partial<Record<ProgramId, string>>;
}

interface PrefsState extends PrefsData {
  setLang: (lang: Lang) => void;
  setSpeed: (speed: Speed) => void;
  setBoardSpeed: (value: number) => void;
  setShowFetch: (on: boolean) => void;
  saveDraft: (id: ProgramId, src: string) => void;
}

const DEFAULTS: PrefsData = { lang: "en", speed: DEFAULT_SPEED, boardSpeed: BOARD_SPEED.initial, showFetch: true, drafts: {} };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGS as readonly string[]).includes(v);
const isSpeed = (v: unknown): v is Speed => typeof v === "string" && (SPEEDS as readonly string[]).includes(v);

const draftsOf = (v: unknown): PrefsData["drafts"] =>
  isRecord(v) ? Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === "string")) : {};

export const readPrefs = (raw: unknown, version: number): PrefsData => {
  if (!isRecord(raw)) return DEFAULTS;
  const speed = isSpeed(raw.speed) && !(version < PREFS_VERSION && raw.speed === PREVIOUS_DEFAULT_SPEED) ? raw.speed : DEFAULT_SPEED;
  return {
    lang: isLang(raw.lang) ? raw.lang : DEFAULTS.lang,
    speed,
    boardSpeed: typeof raw.boardSpeed === "number" ? raw.boardSpeed : DEFAULTS.boardSpeed,
    showFetch: typeof raw.showFetch === "boolean" ? raw.showFetch : DEFAULTS.showFetch,
    drafts: draftsOf(raw.drafts)
  };
};

export const usePrefs = create<PrefsState>()(persist(set => ({
  ...DEFAULTS,
  setLang: lang => { set({ lang }); },
  setSpeed: speed => { set({ speed }); },
  setBoardSpeed: boardSpeed => { set({ boardSpeed }); },
  setShowFetch: showFetch => { set({ showFetch }); },
  saveDraft: (id, src) => { set(s => ({ drafts: { ...s.drafts, [id]: src } })); }
}), {
  name: STORAGE_KEY,
  version: PREFS_VERSION,
  partialize: ({ lang, speed, boardSpeed, showFetch, drafts }): PrefsData => ({ lang, speed, boardSpeed, showFetch, drafts }),
  migrate: (raw, version) => readPrefs(raw, version)
}));

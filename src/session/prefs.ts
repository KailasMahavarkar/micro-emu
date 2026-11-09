import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Lang } from "../i18n/types.ts";
import type { ProgramId, Speed } from "./types.ts";

export const BOARD_SPEED = { min: 0.25, max: 3, step: 0.25, initial: 1 } as const;
const STORAGE_KEY = "lab8086.prefs";

interface PrefsState {
  lang: Lang;
  speed: Speed;
  boardSpeed: number;
  showFetch: boolean;
  drafts: Partial<Record<ProgramId, string>>;
  setLang: (lang: Lang) => void;
  setSpeed: (speed: Speed) => void;
  setBoardSpeed: (value: number) => void;
  setShowFetch: (on: boolean) => void;
  saveDraft: (id: ProgramId, src: string) => void;
}

export const usePrefs = create<PrefsState>()(persist(set => ({
  lang: "en",
  speed: "fast",
  boardSpeed: BOARD_SPEED.initial,
  showFetch: true,
  drafts: {},
  setLang: lang => { set({ lang }); },
  setSpeed: speed => { set({ speed }); },
  setBoardSpeed: boardSpeed => { set({ boardSpeed }); },
  setShowFetch: showFetch => { set({ showFetch }); },
  saveDraft: (id, src) => { set(s => ({ drafts: { ...s.drafts, [id]: src } })); }
}), { name: STORAGE_KEY }));

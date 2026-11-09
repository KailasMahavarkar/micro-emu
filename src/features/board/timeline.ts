import type { AnimationPace } from "../../session/types.ts";

export const HOP_MS = 560;
export const HOP_GAP_MS = 80;
export const PAUSE_MS = 280;
export const CAPTION_ONLY_MS = 700;

export type SlotKind = "hop" | "note";
export interface Slot { start: number; travel: number }
export interface Timeline { slots: Slot[]; end: number; pause: number }

const stepTimeline = (kinds: readonly SlotKind[], boardSpeed: number): Timeline => {
  const travel = HOP_MS / boardSpeed, gap = HOP_GAP_MS / boardSpeed, note = CAPTION_ONLY_MS / boardSpeed;
  let t = 0;
  const slots = kinds.map(kind => {
    const slot = { start: t, travel: kind === "hop" ? travel : 0 };
    t += kind === "hop" ? travel + gap : note;
    return slot;
  });
  return { slots, end: t, pause: PAUSE_MS / boardSpeed };
};

const runTimeline = (kinds: readonly SlotKind[], msPerInstruction: number): Timeline => {
  const share = msPerInstruction / Math.max(1, kinds.length);
  return {
    slots: kinds.map((kind, i) => ({ start: i * share, travel: kind === "hop" ? share : 0 })),
    end: msPerInstruction,
    pause: 0
  };
};

export const timeline = (kinds: readonly SlotKind[], pace: AnimationPace, boardSpeed: number): Timeline =>
  pace.kind === "run" ? runTimeline(kinds, pace.msPerInstruction) : stepTimeline(kinds, boardSpeed);

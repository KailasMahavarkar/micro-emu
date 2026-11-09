import type { Speed } from "./types.ts";

export const SPEED_PLAN: Readonly<Record<Speed, { delay: number; perTick: number; label: string; animated: boolean }>> = {
  every5s: { delay: 5000, perTick: 1, label: "1 every 5 sec", animated: true },
  every2s: { delay: 2000, perTick: 1, label: "1 every 2 sec", animated: true },
  one: { delay: 1000, perTick: 1, label: "1 / sec", animated: true },
  slow: { delay: 500, perTick: 1, label: "2 / sec", animated: true },
  normal: { delay: 100, perTick: 1, label: "10 / sec", animated: true },
  medium: { delay: 50, perTick: 1, label: "20 / sec", animated: true },
  fast: { delay: 16, perTick: 3, label: "200 / sec", animated: false },
  max: { delay: 0, perTick: Number.POSITIVE_INFINITY, label: "Full speed", animated: false }
};

export const DEFAULT_SPEED: Speed = "medium";
export const ASSEMBLE_DEBOUNCE_MS = 250;
export const TICK_BUDGET_MS = 12;
export const RENDER_EVERY_MS = 120;
export const TOAST_MS = 1800;
export const DEFAULT_FILE_NAME = "program.asm";
export const ENTER_SCAN = 0x1C;

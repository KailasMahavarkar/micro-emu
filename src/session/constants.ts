import type { Speed } from "./types.ts";

export const SPEED_PLAN: Readonly<Record<Speed, { delay: number; perTick: number; label: string }>> = {
  slow: { delay: 500, perTick: 1, label: "2 / sec" },
  normal: { delay: 100, perTick: 1, label: "10 / sec" },
  medium: { delay: 50, perTick: 1, label: "20 / sec" },
  fast: { delay: 16, perTick: 3, label: "200 / sec" },
  max: { delay: 0, perTick: Number.POSITIVE_INFINITY, label: "Full speed" }
};

export const DEFAULT_SPEED: Speed = "medium";
export const ASSEMBLE_DEBOUNCE_MS = 250;
export const TICK_BUDGET_MS = 12;
export const RENDER_EVERY_MS = 120;
export const TOAST_MS = 1800;
export const DEFAULT_FILE_NAME = "program.asm";
export const ENTER_SCAN = 0x1C;

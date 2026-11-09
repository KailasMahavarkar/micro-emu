import type { ExampleId } from "../examples/index.ts";

export const SPEEDS = ["slow", "normal", "fast", "max"] as const;
export type Speed = (typeof SPEEDS)[number];
export const CUSTOM_PROGRAM = "custom";
export type ProgramId = ExampleId | typeof CUSTOM_PROGRAM;
export const VIEWS = ["panels", "board"] as const;
export type View = (typeof VIEWS)[number];
export const INSPECTOR_TABS = ["stack", "memory", "listing"] as const;
export type InspectorTab = (typeof INSPECTOR_TABS)[number];
export type RunMode = "instant" | "animated";
export type RunState = "problems" | "waiting" | "running" | "finished" | "stopped" | "paused" | "ready";

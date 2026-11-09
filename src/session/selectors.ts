import { layout, peek, type Instruction, type Program } from "../emulator/index.ts";
import { ipLinear, isRunnable, machine } from "./store.ts";
import type { RunState } from "./types.ts";

export const currentLine = (program: Program): number | null => {
  if (!isRunnable(program) || machine.finished()) return null;
  return program.lineAt.get(ipLinear()) ?? null;
};

export const peekNext = (): Instruction => peek(machine.cpu);

export const runState = (program: Program, running: boolean): RunState => {
  if (!isRunnable(program)) return "problems";
  if (machine.isWaiting()) return "waiting";
  if (running) return "running";
  if (machine.exited) return "finished";
  if (machine.finished()) return "stopped";
  return machine.steps ? "paused" : "ready";
};

export const programBytes = (program: Program): number => {
  const total = program.segments.reduce((sum, s) => sum + s.size, 0);
  return Math.max(0, total - (program.mode === "com" ? layout.COM_ORIGIN : 0));
};

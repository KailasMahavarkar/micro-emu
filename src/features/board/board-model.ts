import { F, FLAG_NAMES, R, S, hex, layout, type Machine, type Program } from "../../emulator/index.ts";
import { registerValues } from "../registers/registers-layout.ts";
import { focusRow, MINI_COLS, MINI_ROWS, miniWindowStart, screenRuns } from "../screen/screen-layout.ts";
import { REGISTER_NODES } from "./geometry.ts";
import { flagMark } from "./plan.ts";
import type { Capture, PlanItem, StackCell, ViewState } from "./types.ts";

const STACK_CELLS = 3;
const CODE_PREVIEW_BYTES = 6;
const STACK_END_COM = 0x10000;

export const capture = (m: Machine, program: Program, nextLength: number | null): Capture => {
  const c = m.cpu, stack: StackCell[] = [];
  const top = program.mode === "exe" ? program.sp : STACK_END_COM;
  for (let a = c.r[R.SP], k = 0; k < STACK_CELLS && a + 1 < top; a += 2, k++) stack.push({ off: a, lin: c.lin(c.s[S.SS], a), v: c.rw(c.s[S.SS], a) });
  const start = miniWindowStart(focusRow(c.mem, c.lastVideo));
  const lin = c.lin(c.s[S.CS], c.ip), lastKey = m.keyPos > 0 ? m.keys.at(m.keyPos - 1) : undefined;
  return {
    regs: registerValues(c),
    flags: c.flags,
    stack,
    monitor: screenRuns(c.mem, start, start + MINI_ROWS, MINI_COLS),
    code: nextLength === null ? null : { lin, bytes: Array.from(c.mem.slice(lin, lin + Math.min(nextLength, CODE_PREVIEW_BYTES)), b => hex(b, 2)).join(" "), tag: "next" },
    kbd: lastKey?.a ?? null,
    io: m.lastPort ? { ...m.lastPort } : null
  };
};

export const viewState = (cap: Capture): ViewState => ({
  ...cap, regs: { ...cap.regs }, sigma: "", queue: [], cu: "", alu: "", marks: new Set(), memLast: null
});

export const isHop = (item: PlanItem): item is Extract<PlanItem, { from: string }> => "from" in item && item.from !== null;

export const finalView = (plan: readonly PlanItem[], B: Capture, A: Capture): ViewState => {
  const vs = viewState(B);
  for (const item of plan) {
    if ("instant" in item) item.instant(vs);
    else if (isHop(item)) item.apply?.(vs);
  }
  Object.assign(vs, { regs: { ...A.regs }, flags: A.flags, stack: A.stack, monitor: A.monitor, kbd: A.kbd, io: A.io });
  for (const r of REGISTER_NODES) if (A.regs[r] !== B.regs[r]) vs.marks.add(r);
  for (const f of FLAG_NAMES) if ((A.flags ^ B.flags) & F[f]) vs.marks.add(flagMark(f));
  if (A.code) vs.code = { ...A.code };
  return vs;
};

export const KEY_LABELS: Readonly<Partial<Record<number, string>>> = { 13: "Enter", 8: "Bksp", 27: "Esc", 32: "Space" };
export const keyLabel = (a: number): string => KEY_LABELS[a] ?? (a >= 33 && a < 127 ? String.fromCharCode(a) : hex(a, 2));
export const VIDEO_TITLE = `Video RAM at ${hex(layout.VIDEO_SEG)}h`;

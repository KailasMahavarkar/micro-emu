import { create } from "zustand";
import { disasm, peek, type Instruction } from "../../emulator/index.ts";
import { usePrefs } from "../../session/prefs.ts";
import { machine, registerAnimator, useSession } from "../../session/store.ts";
import { capture, finalView, isHop, viewState } from "./board-model.ts";
import { pathD, route } from "./geometry.ts";
import { buildPlan } from "./plan.ts";
import { PAUSE_MS, timeline } from "./timeline.ts";
import type { AnimationPace } from "../../session/types.ts";
import type { BoardNode, Capture, PlanItem, ViewState } from "./types.ts";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const REDUCED_MOTION_PAUSE_MS = 2 * PAUSE_MS;

export interface ActiveHop { id: number; label: string; d: string; ms: number }
export interface Caption { count: string; text: string }
export interface LastPlan { plan: PlanItem[]; before: Capture; after: Capture; ins: Instruction; steps: number }

interface BoardState {
  live: ViewState | null;
  hop: ActiveHop | null;
  hit: { node: BoardNode; id: number } | null;
  caption: Caption | null;
  trails: string[];
  last: LastPlan | null;
}

let timers: ReturnType<typeof setTimeout>[] = [];
let sequence = 0;

const snapshotOf = (vs: ViewState): ViewState => ({ ...vs, regs: { ...vs.regs }, marks: new Set(vs.marks), queue: [...vs.queue] });
const nextLength = (): number | null => (machine.finished() ? null : peek(machine.cpu).len);
const reducedMotion = (): boolean => window.matchMedia(REDUCED_MOTION).matches;

export const useBoard = create<BoardState>()(() => ({ live: null, hop: null, hit: null, caption: null, trails: [], last: null }));

const cancel = (): void => {
  timers.forEach(clearTimeout);
  timers = [];
  useBoard.setState({ live: null, hop: null, caption: null });
};

const play = (advance: () => ReturnType<typeof machine.step>, done: () => void, pace: AnimationPace): void => {
  cancel();
  const program = useSession.getState().program, prefs = usePrefs.getState();
  const before = capture(machine, program, nextLength());
  const record = advance();
  if (!record || machine.isWaiting()) { done(); return; }
  const after = capture(machine, program, nextLength());
  const plan = buildPlan({ ins: record.ins, values: record.values, before, after, cpu: machine.cpu, notice: machine.notice?.code ?? null, showFetch: prefs.showFetch });
  const later = (at: number, fn: () => void): void => { timers.push(setTimeout(fn, at)); };
  useBoard.setState({ last: { plan, before, after, ins: record.ins, steps: machine.steps }, trails: [] });
  const steps = plan.filter(item => !("instant" in item));
  const { slots, end, pause } = timeline(steps.map(item => (isHop(item) ? "hop" : "note")), pace, prefs.boardSpeed);

  if (reducedMotion()) {
    useBoard.setState({ trails: plan.filter(isHop).map(h => pathD(route(h.from, h.to))) });
    later(pace.kind === "run" ? end : REDUCED_MOTION_PAUSE_MS, done);
    return;
  }

  const vs = viewState(before);
  plan.forEach(item => { if ("instant" in item) item.instant(vs); });
  useBoard.setState({ live: snapshotOf(vs) });
  steps.forEach((item, i) => {
    const count = `${i + 1}/${steps.length}`, { start, travel } = slots[i];
    if (!isHop(item)) {
      if ("text" in item) later(start, () => { useBoard.setState({ caption: { count, text: item.text } }); });
      return;
    }
    const d = pathD(route(item.from, item.to)), id = ++sequence;
    later(start, () => { useBoard.setState({ caption: { count, text: item.text }, hop: { id, label: item.label, d, ms: travel } }); });
    later(start + travel, () => {
      item.apply?.(vs);
      useBoard.setState(s => ({ hop: null, live: snapshotOf(vs), trails: [...s.trails, d], hit: { node: item.to, id } }));
    });
  });
  later(end, () => {
    useBoard.setState({ live: null, hop: null, caption: null });
    if (pause > 0) later(pause, done);
    else done();
  });
};

registerAnimator({ play, cancel });

export const staticView = (program: Parameters<typeof capture>[1], last: LastPlan | null): { view: ViewState; fresh: boolean } => {
  if (last && last.steps === machine.steps && machine.steps > 0) return { view: finalView(last.plan, last.before, last.after), fresh: true };
  return { view: viewState(capture(machine, program, nextLength())), fresh: false };
};

export const lastCaption = (last: LastPlan): Caption => {
  const moves = last.plan.filter(isHop).length;
  const text = [...last.plan].reverse().find((item): item is Extract<PlanItem, { text: string }> => "text" in item)?.text ?? "";
  return { count: `${moves} moves`, text: `${disasm(last.ins)}: ${text}` };
};

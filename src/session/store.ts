import { create } from "zustand";
import { EXAMPLES, isExampleId } from "../examples/index.ts";
import { Machine, S, assemble, type Program, type StepRecord } from "../emulator/index.ts";
import { ASSEMBLE_DEBOUNCE_MS, DEFAULT_FILE_NAME, RENDER_EVERY_MS, SPEED_PLAN, TICK_BUDGET_MS, TOAST_MS } from "./constants.ts";
import { usePrefs } from "./prefs.ts";
import { CUSTOM_PROGRAM, type ProgramId, type RunMode } from "./types.ts";

export const machine = new Machine();

export interface Animator {
  play: (advance: () => StepRecord | null, done: () => void) => void;
  cancel: () => void;
}

const DEFAULT_EXAMPLE = "factorial";

export interface SessionState {
  programId: ProgramId;
  fileName: string;
  source: string;
  program: Program;
  assembled: number;
  tick: number;
  running: boolean;
  pendingStep: boolean;
  breakpoints: ReadonlySet<number>;
  toast: string | null;
  reveal: { line: number; id: number } | null;
}

interface SessionActions {
  open: (id: ProgramId, source: string, fileName: string) => void;
  chooseProgram: (id: ProgramId) => void;
  editSource: (source: string) => void;
  toggleBreakpoint: (line: number) => void;
  runToggle: (mode: RunMode) => void;
  stop: () => void;
  step: (mode: RunMode) => void;
  back: () => void;
  reset: () => void;
  pressKey: (ascii: number, scan: number) => void;
  showToast: (text: string) => void;
  revealLine: (line: number) => void;
}

export type Session = SessionState & SessionActions;

let assembleTimer: ReturnType<typeof setTimeout> | null = null;
let runTimer: ReturnType<typeof setTimeout> | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let animator: Animator | null = null;
let runMode: RunMode = "instant";
let stepMode: RunMode = "instant";
let skipBreak = false;
let lastRender = 0;

export const registerAnimator = (a: Animator): void => { animator = a; };

const fileNameOf = (id: ProgramId): string => (isExampleId(id) ? EXAMPLES[id].file : DEFAULT_FILE_NAME);
const sourceOf = (id: ProgramId): string => usePrefs.getState().drafts[id] ?? (isExampleId(id) ? EXAMPLES[id].src : EXAMPLES[DEFAULT_EXAMPLE].src);
export const isRunnable = (p: Program): boolean => p.errors.length === 0;
export const ipLinear = (): number => machine.cpu.lin(machine.cpu.s[S.CS], machine.cpu.ip);

const breakpointAddresses = (p: Program, lines: ReadonlySet<number>): Set<number> => {
  const out = new Set<number>();
  for (const line of lines) for (const a of p.addrsOfLine.get(line) ?? []) out.add(a);
  return out;
};

const clearRunTimer = (): void => {
  if (runTimer) clearTimeout(runTimer);
  runTimer = null;
};

export const useSession = create<Session>()((set, get) => {
  const bump = (patch: Partial<SessionState> = {}): void => {
    lastRender = performance.now();
    set(s => ({ ...patch, tick: s.tick + 1 }));
  };

  const halt = (): void => {
    clearRunTimer();
    animator?.cancel();
  };

  const assembleNow = (): Program => {
    halt();
    const program = assemble(get().source);
    if (isRunnable(program)) machine.load(program);
    bump({ program, assembled: get().assembled + 1, running: false, pendingStep: false });
    return program;
  };

  const ready = (): boolean => {
    let { program } = get();
    if (assembleTimer) { clearTimeout(assembleTimer); assembleTimer = null; program = assembleNow(); }
    if (!isRunnable(program)) return false;
    if (machine.finished()) machine.load(program);
    return true;
  };

  const atBreakpoint = (): boolean => {
    const hit = !skipBreak && breakpointAddresses(get().program, get().breakpoints).has(ipLinear());
    skipBreak = false;
    return hit;
  };

  const advance = (): StepRecord | null => {
    const record = machine.step(true);
    bump({ pendingStep: !get().running && machine.isWaiting() });
    return record;
  };

  const instantTick = (): void => {
    runTimer = null;
    if (!get().running) return;
    const plan = SPEED_PLAN[usePrefs.getState().speed], started = performance.now();
    let running = true;
    for (let n = 0; n < plan.perTick; n++) {
      if (machine.finished() || atBreakpoint()) { running = false; break; }
      machine.step();
      if (machine.isWaiting() || machine.breakHit) { running = !machine.breakHit; break; }
      if (performance.now() - started > TICK_BUDGET_MS) break;
    }
    if (machine.finished()) running = false;
    if (running && !machine.isWaiting()) runTimer = setTimeout(instantTick, plan.delay);
    const throttled = running && !machine.isWaiting() && plan.perTick === Number.POSITIVE_INFINITY && performance.now() - lastRender < RENDER_EVERY_MS;
    if (!throttled) bump({ running });
  };

  const animatedTick = (): void => {
    runTimer = null;
    if (!get().running) return;
    if (!animator || machine.finished() || atBreakpoint()) { bump({ running: false }); return; }
    animator.play(advance, () => {
      if (!get().running || machine.isWaiting()) return;
      if (machine.breakHit || machine.finished()) { bump({ running: false }); return; }
      runTimer = setTimeout(animatedTick, 0);
    });
  };

  const resume = (): void => {
    clearRunTimer();
    runTimer = setTimeout(runMode === "animated" ? animatedTick : instantTick, 0);
  };

  const initial = DEFAULT_EXAMPLE;
  return {
    programId: initial,
    fileName: fileNameOf(initial),
    source: EXAMPLES[initial].src,
    program: assemble(EXAMPLES[initial].src),
    assembled: 0,
    tick: 0,
    running: false,
    pendingStep: false,
    breakpoints: new Set(),
    toast: null,
    reveal: null,

    open: (programId, source, fileName) => {
      halt();
      set({ programId, source, fileName, breakpoints: new Set() });
      usePrefs.getState().saveDraft(programId, source);
      assembleNow();
    },

    chooseProgram: id => { get().open(id, sourceOf(id), fileNameOf(id)); },

    editSource: source => {
      set({ source });
      usePrefs.getState().saveDraft(get().programId, source);
      if (assembleTimer) clearTimeout(assembleTimer);
      assembleTimer = setTimeout(() => { assembleTimer = null; assembleNow(); }, ASSEMBLE_DEBOUNCE_MS);
    },

    toggleBreakpoint: line => {
      const next = new Set(get().breakpoints);
      if (next.has(line)) next.delete(line); else next.add(line);
      set({ breakpoints: next });
    },

    runToggle: mode => {
      if (get().running) { get().stop(); return; }
      if (!ready()) { bump(); return; }
      halt();
      runMode = mode;
      skipBreak = true;
      set({ running: true, pendingStep: false });
      resume();
      bump();
    },

    stop: () => {
      halt();
      bump({ running: false });
    },

    step: mode => {
      if (get().running || !ready()) return;
      halt();
      stepMode = mode;
      if (mode === "animated" && animator) animator.play(advance, () => { bump(); });
      else advance();
    },

    back: () => {
      if (get().running) return;
      halt();
      machine.back();
      bump({ pendingStep: false });
    },

    reset: () => {
      halt();
      const { program } = get();
      if (isRunnable(program)) machine.load(program);
      bump({ running: false, pendingStep: false });
    },

    pressKey: (ascii, scan) => {
      machine.pressKey(ascii, scan);
      const { running, pendingStep } = get();
      if (running && machine.isWaiting()) { resume(); return; }
      if (pendingStep) { set({ pendingStep: false }); get().step(stepMode); return; }
      bump();
    },

    showToast: text => {
      if (toastTimer) clearTimeout(toastTimer);
      set({ toast: text });
      toastTimer = setTimeout(() => { set({ toast: null }); }, TOAST_MS);
    },

    revealLine: line => { set(s => ({ reveal: { line, id: (s.reveal?.id ?? 0) + 1 } })); }
  };
});

export const initSession = (id: ProgramId, shared: string | null): void => {
  const s = useSession.getState();
  if (shared !== null) s.open(CUSTOM_PROGRAM, shared, DEFAULT_FILE_NAME);
  else s.chooseProgram(id);
};

import { CircuitBoardIcon, DashboardSquare01Icon } from "@hugeicons/core-free-icons";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import { BoardPanel } from "../features/board/board-panel.tsx";
import { EditorPanel } from "../features/editor/editor-panel.tsx";
import { InspectorPanel } from "../features/inspector/inspector-panel.tsx";
import { RegistersPanel } from "../features/registers/registers-panel.tsx";
import { keyCode } from "../features/screen/screen-layout.ts";
import { ScreenPanel } from "../features/screen/screen-panel.tsx";
import { StatusBar } from "../features/status/status-bar.tsx";
import { Toolbar } from "../features/toolbar/toolbar.tsx";
import { usePrefs } from "../session/prefs.ts";
import { machine, useSession } from "../session/store.ts";
import type { RunMode, Speed, View } from "../session/types.ts";
import { Segmented, cn } from "../ui/index.ts";

const VIEW_OPTIONS = [
  { value: "panels" as const, label: "Panels", icon: DashboardSquare01Icon },
  { value: "board" as const, label: "Board", icon: CircuitBoardIcon }
];
const RIGHT_ROWS: Record<View, string> = {
  panels: "grid-rows-[auto_auto_minmax(0,0.8fr)_minmax(0,1.25fr)]",
  board: "grid-rows-[auto_minmax(0,1fr)]"
};
const ANIMATED_RUN_SPEEDS: ReadonlySet<Speed> = new Set(["slow", "normal"]);

const runModeFor = (view: View): RunMode =>
  view === "board" && ANIMATED_RUN_SPEEDS.has(usePrefs.getState().speed) ? "animated" : "instant";
const stepModeFor = (view: View): RunMode => (view === "board" ? "animated" : "instant");

const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement || (target instanceof HTMLElement && target.closest("[data-crt]") !== null);

export function App() {
  const { view } = useSearch({ from: "__root__" });
  const navigate = useNavigate();
  const assembled = useSession(s => s.assembled);
  const onRun = (): void => { useSession.getState().runToggle(runModeFor(view)); };
  const onStep = (): void => { useSession.getState().step(stepModeFor(view)); };
  const onBack = (): void => { useSession.getState().back(); };
  const onSpeed = (speed: Speed): void => {
    usePrefs.getState().setSpeed(speed);
    useSession.getState().applySpeed(runModeFor(view));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = useSession.getState(), ok = s.program.errors.length === 0;
      if (!isTypingTarget(e.target) && (machine.isWaiting() || s.pendingStep)) {
        const k = keyCode(e);
        if (k) { e.preventDefault(); s.pressKey(k[0], k[1]); return; }
      }
      if (e.key === "F5") { e.preventDefault(); if (ok) s.runToggle(runModeFor(view)); }
      else if (e.key === "F10" && e.shiftKey) { e.preventDefault(); if (ok) s.back(); }
      else if (e.key === "F10") { e.preventDefault(); if (ok) s.step(stepModeFor(view)); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); };
  }, [view]);

  const setView = (next: View): void => {
    useSession.getState().stop();
    void navigate({ to: "/", search: old => ({ ...old, view: next }) });
  };

  return (
    <div className="grid h-dvh grid-cols-1 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden max-[960px]:h-auto max-[960px]:overflow-visible">
      <Toolbar onRun={onRun} onStep={onStep} onBack={onBack} onSpeed={onSpeed} />
      <main className="grid min-h-0 grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-3 px-4 pb-3 max-[960px]:grid-cols-1">
        <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)] max-[960px]:h-[70vh]">
          <EditorPanel />
        </div>
        <div className={cn("grid min-h-0 min-w-0 gap-3", RIGHT_ROWS[view])}>
          <div className="flex items-center gap-3">
            <Segmented mode="tabs" label="Machine view" options={VIEW_OPTIONS} value={view} onChange={setView} />
          </div>
          {view === "board" ? <BoardPanel /> : (
            <>
              <RegistersPanel />
              <InspectorPanel key={assembled} />
              <ScreenPanel />
            </>
          )}
        </div>
      </main>
      <StatusBar />
    </div>
  );
}

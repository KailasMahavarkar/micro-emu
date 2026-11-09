import type { ReactNode } from "react";
import { S, hex } from "../../emulator/index.ts";
import { COPY } from "../../i18n/copy.ts";
import { usePrefs } from "../../session/prefs.ts";
import { currentLine, programBytes, runState } from "../../session/selectors.ts";
import { machine, useSession } from "../../session/store.ts";
import type { RunState } from "../../session/types.ts";
import { cn } from "../../ui/index.ts";

const WAIT_BADGE = "rounded px-1.5 bg-mark font-semibold text-on-mark";
const TOAST_VISIBILITY = { true: "opacity-100", false: "opacity-0" } as const;

export function StatusBar() {
  const program = useSession(s => s.program);
  const running = useSession(s => s.running);
  const breakpoints = useSession(s => s.breakpoints);
  const toast = useSession(s => s.toast);
  const lang = usePrefs(s => s.lang);
  useSession(s => s.tick);
  const state = runState(program, running), line = currentLine(program), cpu = machine.cpu;
  const problems = program.errors.length;

  const STATE_TEXT: Record<RunState, ReactNode> = {
    problems: <b>{problems} problem{problems > 1 ? "s" : ""}</b>,
    waiting: <span className={WAIT_BADGE}>{COPY[lang].waitingStatus}</span>,
    running: <b>Running</b>,
    finished: <><b>Finished</b>, exit code {machine.exitCode}</>,
    stopped: <b>Stopped</b>,
    paused: <b>Paused</b>,
    ready: <b>Ready</b>
  };

  const items: ReactNode[] = [
    STATE_TEXT[state],
    line !== null && <>Line <b>{line + 1}</b></>,
    <>CS:IP <b>{hex(cpu.s[S.CS])}:{hex(cpu.ip)}</b></>,
    <>Steps <b>{machine.steps.toLocaleString()}</b></>,
    state !== "problems" && <><b>{program.mode.toUpperCase()}</b>, {programBytes(program)} bytes</>,
    breakpoints.size > 0 && <>Breakpoints <b>{breakpoints.size}</b></>
  ];

  return (
    <>
      <footer className="flex min-h-7.5 items-center gap-5 overflow-hidden border-t border-line bg-panel px-4 text-xs whitespace-nowrap text-muted [&_b]:font-semibold [&_b]:text-ink">
        {items.filter(Boolean).map((item, i) => <span key={i}>{item}</span>)}
      </footer>
      <div role="status" className={cn("pointer-events-none fixed bottom-11 left-1/2 z-60 -translate-x-1/2 rounded-full bg-ink px-3.5 py-2 text-[13px] text-paper transition-opacity duration-200", TOAST_VISIBILITY[`${toast !== null}`])}>
        {toast}
      </div>
    </>
  );
}

import { CircuitBoardIcon } from "@hugeicons/core-free-icons";
import type { Lang } from "../../i18n/types.ts";
import { BOARD_SPEED, usePrefs } from "../../session/prefs.ts";
import { runState } from "../../session/selectors.ts";
import { useSession } from "../../session/store.ts";
import type { RunState } from "../../session/types.ts";
import { Panel, PanelHeader } from "../../ui/index.ts";
import { lastCaption, staticView, useBoard, type Caption } from "./board-store.ts";
import { BoardView } from "./board-view.tsx";

const IDLE: Record<Lang, Record<"problems" | "waiting" | "done" | "ready", string>> = {
  en: {
    problems: "Fix the problem to watch data move across the board.",
    waiting: "Waiting for a key: open the screen and type.",
    done: "The program has finished. Press Reset to run it again.",
    ready: "Press Step to watch the next instruction travel across the board."
  },
  hi: {
    problems: "Problem theek karo, phir data ko board pe chalte dekho.",
    waiting: "Key ka intezaar: screen pe click karke type karo.",
    done: "Program khatam. Reset dabao.",
    ready: "Step dabao aur dekho agla instruction board pe kaise chalta hai."
  }
};
const IDLE_KEY: Record<RunState, keyof (typeof IDLE)["en"]> = {
  problems: "problems", waiting: "waiting", finished: "done", stopped: "done", running: "ready", paused: "ready", ready: "ready"
};

export function BoardPanel() {
  const program = useSession(s => s.program);
  const running = useSession(s => s.running);
  useSession(s => s.tick);
  const { lang, boardSpeed, setBoardSpeed, showFetch, setShowFetch } = usePrefs();
  const { live, hop, hit, caption, trails, last } = useBoard();
  const still = staticView(program, last);
  const view = live ?? still.view;
  const shown: Caption = caption ?? (still.fresh && last ? lastCaption(last) : { count: "", text: IDLE[lang][IDLE_KEY[runState(program, running)]] });

  return (
    <Panel>
      <PanelHeader icon={CircuitBoardIcon} title="Board">
        <span className="ml-auto flex items-center gap-3 text-xs font-normal text-muted [&_label]:inline-flex [&_label]:cursor-pointer [&_label]:items-center [&_label]:gap-2">
          <label title="How fast values travel">Speed
            <input type="range" min={BOARD_SPEED.min} max={BOARD_SPEED.max} step={BOARD_SPEED.step} value={boardSpeed}
              onChange={e => { setBoardSpeed(Number(e.target.value)); }} className="w-24 accent-primary" />
          </label>
          <label>
            <input type="checkbox" checked={showFetch} onChange={e => { setShowFetch(e.target.checked); }} className="size-4 accent-primary" /> Show fetch
          </label>
        </span>
      </PanelHeader>
      <BoardView vs={view} trails={live || still.fresh ? trails : []} hop={hop} hit={hit} />
      <div data-caption="" className="flex min-h-11 flex-none items-center gap-3 overflow-hidden border-t border-line bg-panel px-4 text-[13px]">
        <span className="flex-none font-mono text-xs font-medium text-muted">{shown.count}</span>
        <span className="truncate">{shown.text}</span>
      </div>
    </Panel>
  );
}

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { layout } from "../../emulator/index.ts";
import { COPY } from "../../i18n/copy.ts";
import { usePrefs } from "../../session/prefs.ts";
import { machine, useSession } from "../../session/store.ts";
import { cn } from "../../ui/index.ts";
import { CRT_CHAR_RATIO, CRT_FONT_MAX, CRT_LINE, cursorOf, fitFontSize, focusRow, keyCode, screenRuns } from "./screen-layout.ts";

export type CrtFit = "panel" | "modal";
const CONTROL_KEYS: ReadonlySet<string> = new Set(["F5", "F10"]);
const MODAL_WIDTH_SHARE = 0.9;
const MODAL_HEIGHT_SHARE = 0.82;
const PADDING_X = 12;
const PADDING_Y = 8;
const FIT_CLASS: Record<CrtFit, string> = { panel: "flex-1 overflow-auto", modal: "flex-none overflow-hidden rounded-control" };
const WAITING_RING = { true: "shadow-[inset_0_0_0_2px_var(--color-glow)]", false: "" } as const;

export interface CrtProps {
  fit: CrtFit;
  onEscape?: () => void;
  label: string;
}

const modalBox = (font: number): { width: number; height: number } => ({
  width: layout.COLS * CRT_CHAR_RATIO * font + 26,
  height: layout.ROWS * CRT_LINE * font + 18
});

export function Crt({ fit, onEscape, label }: CrtProps) {
  useSession(s => s.tick);
  const pressKey = useSession(s => s.pressKey);
  const lang = usePrefs(s => s.lang);
  const ref = useRef<HTMLDivElement>(null);
  const [font, setFont] = useState(() =>
    fit === "modal" ? fitFontSize(window.innerWidth * MODAL_WIDTH_SHARE, window.innerHeight * MODAL_HEIGHT_SHARE) : CRT_FONT_MAX);
  const waiting = machine.isWaiting();
  const mem = machine.cpu.mem, cursor = cursorOf(mem), rows = screenRuns(mem, 0, layout.ROWS, layout.COLS);
  const followRow = focusRow(mem, machine.cpu.lastVideo);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (fit === "modal") {
      el.focus();
      return undefined;
    }
    const observer = new ResizeObserver(() => { setFont(fitFontSize(el.clientWidth, null)); });
    observer.observe(el);
    return () => { observer.disconnect(); };
  }, [fit]);

  useEffect(() => {
    const el = ref.current;
    if (!el || fit !== "panel") return;
    const y = followRow * font * CRT_LINE;
    if (y < el.scrollTop || y > el.scrollTop + el.clientHeight - font * 2.5) el.scrollTop = Math.max(0, y - el.clientHeight / 2);
  }, [followRow, font, fit]);

  useEffect(() => {
    if (waiting && !(document.activeElement instanceof HTMLTextAreaElement)) ref.current?.focus({ preventScroll: true });
  }, [waiting]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "Escape" && onEscape && !waiting) { onEscape(); return; }
    if (CONTROL_KEYS.has(e.key)) return;
    const k = keyCode(e);
    if (!k) return;
    e.preventDefault();
    e.stopPropagation();
    pressKey(k[0], k[1]);
  };

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="textbox"
      aria-label={label}
      onKeyDown={onKeyDown}
      data-crt=""
      className={cn(
        "relative min-h-0 bg-black px-3 py-2 font-crt leading-tight whitespace-pre text-crt-ink outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-glow",
        "after:pointer-events-none after:absolute after:inset-0 after:bg-[repeating-linear-gradient(to_bottom,rgb(255_255_255/0.025)_0_1px,transparent_1px_3px)] after:content-['']",
        FIT_CLASS[fit], WAITING_RING[`${waiting}`]
      )}
      style={{ fontSize: font, lineHeight: CRT_LINE, ...(fit === "modal" ? modalBox(font) : {}) }}
    >
      {waiting && (
        <span className="absolute top-1.5 right-2 z-1 rounded-full bg-glow px-2 py-0.5 font-sans text-xs font-semibold text-on-mark">{COPY[lang].pressKey}</span>
      )}
      {rows.map((runs, r) => (
        <div key={r}>
          {runs.map((run, i) => <span key={i} className={run.className}>{run.text}</span>)}
        </div>
      ))}
      <span
        className="absolute h-[0.2em] w-[1ch] animate-blink bg-crt-cursor motion-reduce:animate-none"
        style={{ left: `calc(${cursor.col}ch + ${PADDING_X}px)`, top: `calc(${cursor.row * CRT_LINE + 1.05}em + ${PADDING_Y}px)` }}
      />
    </div>
  );
}

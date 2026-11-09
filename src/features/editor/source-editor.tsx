import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import { currentLine } from "../../session/selectors.ts";
import { useSession } from "../../session/store.ts";
import { cn } from "../../ui/index.ts";
import { BREAKPOINT_DOT, CURRENT_MARK, EDITOR_PADDING, GUTTER_NUMBER, LINE_BACKGROUND, LINE_HEIGHT, SYNTAX_CLASS, TAB_SPACES } from "./constants.ts";
import { highlightLine } from "./highlight.ts";
import type { LineState } from "./types.ts";

const TAB_WIDTH = 8;
const WIDTH_PADDING_CH = 4;
const WIDTH_PADDING_PX = 32;

const lineState = (i: number, current: number | null, errors: ReadonlySet<number>): LineState =>
  i === current ? "current" : errors.has(i) ? "error" : "plain";

export function SourceEditor() {
  const source = useSession(s => s.source);
  const program = useSession(s => s.program);
  const breakpoints = useSession(s => s.breakpoints);
  const reveal = useSession(s => s.reveal);
  const editSource = useSession(s => s.editSource);
  const toggleBreakpoint = useSession(s => s.toggleBreakpoint);
  useSession(s => s.tick);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const lines = useMemo(() => source.split("\n"), [source]);
  const tokens = useMemo(() => lines.map(highlightLine), [lines]);
  const errors = useMemo(() => new Set(program.errors.map(e => e.line)), [program]);
  const widest = useMemo(() => lines.reduce((w, l) => Math.max(w, l.replaceAll("\t", " ".repeat(TAB_WIDTH)).length), 0), [lines]);
  const current = currentLine(program);

  useEffect(() => {
    const box = scrollRef.current;
    if (current === null || !box || document.activeElement === textRef.current) return;
    const top = current * LINE_HEIGHT + EDITOR_PADDING;
    if (top < box.scrollTop + LINE_HEIGHT || top > box.scrollTop + box.clientHeight - 2 * LINE_HEIGHT) box.scrollTop = Math.max(0, top - box.clientHeight / 3);
  }, [current]);

  useEffect(() => {
    const area = textRef.current, box = scrollRef.current;
    if (!reveal || !area || !box) return;
    const start = area.value.split("\n").slice(0, reveal.line).reduce((sum, l) => sum + l.length + 1, 0);
    area.focus();
    area.setSelectionRange(start, start + (area.value.split("\n")[reveal.line]?.length ?? 0));
    box.scrollTop = Math.max(0, reveal.line * LINE_HEIGHT - box.clientHeight / 3);
  }, [reveal]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key !== "Tab" || e.shiftKey) return;
    e.preventDefault();
    const area = e.currentTarget;
    area.setRangeText(TAB_SPACES, area.selectionStart, area.selectionEnd, "end");
    editSource(area.value);
  };

  return (
    <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto">
      <div className="grid min-h-full w-max min-w-full grid-cols-[64px_auto]">
        <div className="sticky left-0 z-2 bg-panel py-2 font-mono text-[13px] leading-line select-none">
          {lines.map((_, i) => {
            const state = lineState(i, current, errors), on = breakpoints.has(i);
            return (
              <div key={i} className="grid h-line grid-cols-[24px_1fr] items-center">
                <button
                  type="button"
                  tabIndex={-1}
                  aria-pressed={on}
                  aria-label={`Breakpoint on line ${i + 1}`}
                  onClick={() => { toggleBreakpoint(i); }}
                  className={cn(
                    "grid h-line w-6 cursor-pointer place-items-center before:size-2.5 before:rounded-full before:border-[1.5px] before:content-['']",
                    BREAKPOINT_DOT[on ? "on" : "off"]
                  )}
                />
                <span className={cn("pr-3 text-right", GUTTER_NUMBER[state])}>{state === "current" ? CURRENT_MARK : i + 1}</span>
              </div>
            );
          })}
        </div>
        <div
          className="relative min-w-full font-mono text-[13.5px] leading-line"
          style={{ width: `calc(${widest + WIDTH_PADDING_CH}ch + ${WIDTH_PADDING_PX}px)`, height: lines.length * LINE_HEIGHT + 2 * EDITOR_PADDING }}
        >
          <pre aria-hidden="true" className="pointer-events-none relative m-0 min-w-full overflow-hidden py-2 pr-6 pl-2 [tab-size:8] whitespace-pre">
            {tokens.map((line, i) => (
              <span key={i} className={cn("-ml-2 block h-line pl-2", LINE_BACKGROUND[lineState(i, current, errors)])}>
                {line.length ? line.map((t, j) => <span key={j} className={t.kind ? SYNTAX_CLASS[t.kind] : undefined}>{t.text}</span>) : " "}
              </span>
            ))}
          </pre>
          <textarea
            ref={textRef}
            value={source}
            onChange={e => { editSource(e.target.value); }}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            wrap="off"
            aria-label="Assembly source code"
            className="absolute inset-0 m-0 size-full resize-none overflow-hidden border-0 bg-transparent py-2 pr-6 pl-2 text-transparent caret-ink outline-none [tab-size:8] whitespace-pre selection:bg-primary/28 selection:text-transparent"
          />
        </div>
      </div>
    </div>
  );
}

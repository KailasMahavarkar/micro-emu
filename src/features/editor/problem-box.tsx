import { Alert02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { COPY } from "../../i18n/copy.ts";
import { describeProblem } from "../../i18n/describe.ts";
import { usePrefs } from "../../session/prefs.ts";
import { machine, useSession } from "../../session/store.ts";
import { cn } from "../../ui/index.ts";
import { SYNTAX_CLASS } from "./constants.ts";
import { highlightLine } from "./highlight.ts";

type Severity = "error" | "warn";
const MAX_LINK_ERRORS = 8;
const BOX: Record<Severity, string> = { error: "bg-error-bg", warn: "bg-warn-bg" };
const ACCENT: Record<Severity, string> = { error: "text-error", warn: "text-warn" };

export function ProblemBox() {
  const program = useSession(s => s.program);
  const revealLine = useSession(s => s.revealLine);
  const lang = usePrefs(s => s.lang);
  useSession(s => s.tick);
  const copy = COPY[lang];
  const first = program.errors.at(0), notice = machine.notice;
  const problem = first
    ? { severity: "error" as const, text: describeProblem(first.code, first.args, lang), prefix: `${copy.line} ${first.line + 1}: `, suffix: first.macro ? copy.insideMacro(first.macro) : "" }
    : notice
      ? { severity: notice.fatal ? ("error" as const) : ("warn" as const), text: describeProblem(notice.code, notice.args, lang), prefix: "", suffix: "" }
      : null;
  if (!problem) return null;
  const others = program.errors.slice(1, MAX_LINK_ERRORS);
  const hidden = program.errors.length - 1 - others.length;

  return (
    <div role="alert" className={cn("flex max-h-[45%] flex-none gap-3 overflow-auto border-t border-line px-4 py-3", BOX[problem.severity])}>
      <HugeiconsIcon icon={Alert02Icon} size={22} className={cn("flex-none", ACCENT[problem.severity])} />
      <div className="min-w-0">
        <p className={cn("mb-1 font-semibold", ACCENT[problem.severity])}>{problem.prefix}{problem.text.what}{problem.suffix}</p>
        {problem.text.why && <p className="mb-1">{problem.text.why}</p>}
        {problem.text.fix && (
          <pre className="mt-1 font-mono text-[13px] leading-relaxed whitespace-pre-wrap">
            {problem.text.fix.split("\n").map((line, i) => (
              <span key={i} className="block">
                {highlightLine(line).map((t, j) => <span key={j} className={t.kind ? SYNTAX_CLASS[t.kind] : undefined}>{t.text}</span>)}
              </span>
            ))}
          </pre>
        )}
        {others.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted">
            <span>{copy.more}</span>
            {others.map(e => (
              <button key={`${e.line}:${e.code}`} type="button" onClick={() => { revealLine(e.line); }}
                className="min-h-6 cursor-pointer rounded-chip border border-control px-2 text-xs">
                {copy.line} {e.line + 1}
              </button>
            ))}
            {hidden > 0 && <span>+{hidden}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

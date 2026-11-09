import { disasm } from "../../emulator/index.ts";
import { COPY } from "../../i18n/copy.ts";
import { usePrefs } from "../../session/prefs.ts";
import { peekNext } from "../../session/selectors.ts";
import { ipLinear, isRunnable, machine, useSession } from "../../session/store.ts";

const commentOf = (line: string | undefined): string => (line ?? "").split(";").slice(1).join(";").trim();

export function NextBar() {
  const program = useSession(s => s.program);
  const source = useSession(s => s.source);
  const lang = usePrefs(s => s.lang);
  useSession(s => s.tick);
  const copy = COPY[lang];

  const content = (() => {
    if (!isRunnable(program)) return copy.fixFirst;
    if (machine.exited) return copy.finished(machine.exitCode);
    if (machine.cpu.halted) return copy.halted;
    if (machine.finished()) return copy.stopped;
    const line = program.lineAt.get(ipLinear()), comment = line === undefined ? "" : commentOf(source.split("\n")[line]);
    return (
      <>
        {copy.next} <code className="font-mono font-semibold text-ink">{disasm(peekNext())}</code>
        {comment && <span className="truncate">· {comment}</span>}
      </>
    );
  })();

  return (
    <div className="flex min-h-10 flex-none items-center gap-2 overflow-hidden border-t border-line bg-sunk px-4 whitespace-nowrap text-muted">
      {content}
    </div>
  );
}

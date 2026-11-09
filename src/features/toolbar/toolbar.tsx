import { Book02Icon, CpuIcon, DashboardSpeed01Icon, LanguageSkillIcon, NextIcon, PauseIcon, PlayIcon, PreviousIcon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { EXAMPLES, EXAMPLE_IDS } from "../../examples/index.ts";
import { LANGS, type Lang } from "../../i18n/types.ts";
import { SPEED_PLAN } from "../../session/constants.ts";
import { usePrefs } from "../../session/prefs.ts";
import { isRunnable, machine, useSession } from "../../session/store.ts";
import { CUSTOM_PROGRAM, SPEEDS, type ProgramId, type Speed } from "../../session/types.ts";
import { Button, Segmented, SelectField } from "../../ui/index.ts";

const PROGRAM_OPTIONS: readonly { value: ProgramId; label: string }[] = [
  ...EXAMPLE_IDS.map(id => ({ value: id, label: EXAMPLES[id].title })),
  { value: CUSTOM_PROGRAM, label: "My program" }
];
const SPEED_OPTIONS = SPEEDS.map(s => ({ value: s, label: SPEED_PLAN[s].label }));
const LANG_LABEL: Record<Lang, string> = { en: "English", hi: "Hinglish" };
const LANG_OPTIONS = LANGS.map(l => ({ value: l, label: LANG_LABEL[l] }));
const KBD = "font-mono text-[11px] text-muted max-[1440px]:hidden";
const LABEL = "max-[1300px]:hidden";

export interface ToolbarProps {
  onRun: () => void;
  onStep: () => void;
  onBack: () => void;
  onSpeed: (speed: Speed) => void;
}

export function Toolbar({ onRun, onStep, onBack, onSpeed }: ToolbarProps) {
  const programId = useSession(s => s.programId);
  const program = useSession(s => s.program);
  const running = useSession(s => s.running);
  const chooseProgram = useSession(s => s.chooseProgram);
  const reset = useSession(s => s.reset);
  useSession(s => s.tick);
  const { speed, lang, setLang } = usePrefs();
  const ok = isRunnable(program);

  return (
    <header className="flex items-center gap-3 px-4 py-3 max-[960px]:flex-wrap">
      <div className="flex items-center gap-2 font-bold tracking-tight whitespace-nowrap">
        <span className="grid size-8 place-items-center rounded-control bg-ink text-paper"><HugeiconsIcon icon={CpuIcon} size={18} /></span>
        <span className="max-[1180px]:hidden">8086 Lab</span>
      </div>
      <SelectField icon={Book02Icon} aria-label="Example program" value={programId} options={PROGRAM_OPTIONS} onChange={chooseProgram} className="min-w-57.5 max-[1300px]:min-w-50 max-[1180px]:min-w-0" />
      <div className="flex gap-2 max-[960px]:flex-wrap">
        <Button variant="primary" icon={running ? PauseIcon : PlayIcon} disabled={!ok} onClick={onRun} aria-label={running ? "Pause" : "Run"}>
          {running ? "Pause" : "Run"} <kbd className={`${KBD} text-inherit opacity-80`}>F5</kbd>
        </Button>
        <Button icon={NextIcon} disabled={!ok || running} onClick={onStep} aria-label="Step" title="Step (F10)">
          <span className={LABEL}>Step</span> <kbd className={KBD}>F10</kbd>
        </Button>
        <Button icon={PreviousIcon} disabled={!ok || running || machine.history.length === 0} onClick={onBack} aria-label="Step back" title="Step back (Shift F10)">
          <span className={LABEL}>Step back</span> <kbd className={KBD}>Shift F10</kbd>
        </Button>
        <Button icon={RefreshIcon} onClick={reset} aria-label="Reset" title="Reset">
          <span className={LABEL}>Reset</span>
        </Button>
      </div>
      <SelectField icon={DashboardSpeed01Icon} aria-label="Run speed" title="Run speed" value={speed} options={SPEED_OPTIONS} onChange={onSpeed} />
      <div className="flex-1" />
      <Segmented label="Explanation language" icon={LanguageSkillIcon} options={LANG_OPTIONS} value={lang} onChange={setLang} />
    </header>
  );
}

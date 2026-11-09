import { CpuIcon } from "@hugeicons/core-free-icons";
import { machine, useSession } from "../../session/store.ts";
import { MARK_CLASS as MARK, Panel, PanelHeader, cn } from "../../ui/index.ts";
import { FLAG_TITLES, REGISTER_GROUPS, changeList, flagCells, registerCell } from "./registers-layout.ts";

const FLAG_VALUE = { on: "font-bold text-ink", off: "text-muted" } as const;
const NOTHING_RUN = "Nothing has run yet. Press Step to run one instruction.";
const NOTHING_CHANGED = "The last step changed no registers or flags.";

export function RegistersPanel() {
  useSession(s => s.tick);
  const cpu = machine.cpu, prev = machine.lastRecord?.snap ?? null;
  const changes = changeList(cpu, prev);

  return (
    <Panel>
      <PanelHeader icon={CpuIcon} title="Registers and flags">
        <span className="ml-auto flex items-center gap-1 text-xs font-normal whitespace-nowrap text-muted">
          <span className={cn("font-mono text-xs font-medium", MARK)}>003C</span>&nbsp; changed on the last step
        </span>
      </PanelHeader>
      <div className="grid gap-1 px-3 pt-2">
        {REGISTER_GROUPS.map(group => (
          <div key={group.title} className="grid gap-1" style={{ gridTemplateColumns: `64px repeat(${group.names.length}, minmax(0, 1fr))` }}>
            <span className="self-center text-[11px] leading-tight text-muted">{group.title}</span>
            {group.names.map(name => {
              const c = registerCell(name, cpu, prev);
              return (
                <div key={name} className="min-w-0 px-2 py-1" data-register={name}>
                  <div className="flex items-baseline gap-2">
                    <span className="w-4.5 text-[11px] text-muted">{name}</span>
                    <span className={cn("font-mono text-[15px] leading-snug font-medium", c.changed && MARK)}>{c.value}</span>
                    {c.decimal && <span className="ml-auto font-mono text-[11px] text-muted">{c.decimal}</span>}
                  </div>
                  {c.halves && <div className="truncate font-mono text-[11px] leading-tight whitespace-pre text-muted">{c.halves}</div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[64px_repeat(9,minmax(0,1fr))] gap-1 px-3 py-2">
        <span className="self-center text-[11px] leading-tight text-muted">Flags</span>
        {flagCells(cpu.flags, prev).map(f => (
          <div key={f.name} title={`${FLAG_TITLES[f.name]} flag`} className="flex items-baseline justify-center gap-1.5 py-0.5">
            <span className="text-[11px] text-muted">{f.name}</span>
            <span className={cn("font-mono text-sm leading-snug", FLAG_VALUE[f.on ? "on" : "off"], f.changed && MARK)}>{f.on ? 1 : 0}</span>
          </div>
        ))}
      </div>
      <div className="flex min-h-8.5 flex-none items-center gap-2 overflow-hidden border-t border-line bg-sunk px-4 text-xs whitespace-nowrap text-muted">
        {changes === null ? NOTHING_RUN : changes.length === 0 ? NOTHING_CHANGED : (
          <>Last step changed {changes.map((c, i) => <code key={c} className="font-mono text-ink">{i ? " · " : ""}{c}</code>)}</>
        )}
      </div>
    </Panel>
  );
}

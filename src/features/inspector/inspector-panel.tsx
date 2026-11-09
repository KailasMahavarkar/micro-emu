import { Database01Icon, Layers01Icon, LeftToRightListBulletIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState, type RefObject, type WheelEvent } from "react";
import { S, hex } from "../../emulator/index.ts";
import { ipLinear, isRunnable, machine, useSession } from "../../session/store.ts";
import type { InspectorTab } from "../../session/types.ts";
import { MARK_CLASS, Panel, cn, type Icon } from "../../ui/index.ts";
import {
  MEMORY_WHEEL_STEP, changedAddresses, defaultMemoryStart, listingRows, memoryRows, parseAddress, stackRows, type Address, type StackRole
} from "./inspector-layout.ts";

const TABS: readonly { id: InspectorTab; label: string; icon: Icon }[] = [
  { id: "stack", label: "Stack", icon: Layers01Icon },
  { id: "memory", label: "Memory", icon: Database01Icon },
  { id: "listing", label: "Listing", icon: LeftToRightListBulletIcon }
];
const TAB_STATE = { true: "border-ink font-semibold text-ink", false: "border-transparent text-muted" } as const;
const STACK_LABEL: Record<StackRole, string> = { sp: "◂ SP", used: "", free: "free" };
const STACK_LABEL_CLASS: Record<StackRole, string> = { sp: "font-bold text-primary", used: "text-muted", free: "text-muted" };
const STACK_VALUE_CLASS: Record<StackRole, string> = { sp: "", used: "", free: "text-muted" };
const ROW = "flex gap-4 rounded-chip px-2 whitespace-pre";
const TAB_OVERFLOW: Record<InspectorTab, string> = { stack: "overflow-auto", memory: "overflow-hidden", listing: "overflow-auto" };
const LISTING_SOURCE = { true: "text-ink", false: "text-muted" } as const;
const LISTING_ROW_HEIGHT = 22;
const FIX_FIRST = "Fix the problems to see the machine code.";

function StackView() {
  const program = useSession(s => s.program);
  useSession(s => s.tick);
  const rows = stackRows(machine.cpu, program, changedAddresses(machine.lastRecord));
  return rows.map(r => (
    <div key={r.offset} className={ROW}>
      <span className="text-muted">{r.offset}</span>
      <span className={cn(STACK_VALUE_CLASS[r.role], r.changed && MARK_CLASS)}>{r.value}</span>
      <span className={STACK_LABEL_CLASS[r.role]}>{STACK_LABEL[r.role]}</span>
    </div>
  ));
}

function MemoryView({ start }: { start: Address }) {
  useSession(s => s.tick);
  return memoryRows(machine.cpu, start, changedAddresses(machine.lastRecord)).map(r => (
    <div key={r.address} className={ROW}>
      <span className="text-muted">{r.address}</span>
      <span>{r.bytes.map((b, i) => <span key={i}><span className={cn("rounded-[3px] px-px", b.changed && MARK_CLASS)}>{b.text}</span>{i < r.bytes.length - 1 ? " " : ""}</span>)}</span>
      <span className="text-muted">{r.ascii}</span>
    </div>
  ));
}

function ListingView({ scrollRef }: { scrollRef: RefObject<HTMLDivElement | null> }) {
  const program = useSession(s => s.program);
  const source = useSession(s => s.source);
  useSession(s => s.tick);
  const rows = isRunnable(program) ? listingRows(program, source, ipLinear()) : [];
  const current = rows.findIndex(r => r.current);
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => LISTING_ROW_HEIGHT });
  useEffect(() => { if (current >= 0) virtual.scrollToIndex(current, { align: "auto" }); }, [current, virtual]);
  if (!isRunnable(program)) return <div className={ROW}><span className="text-muted">{FIX_FIRST}</span></div>;
  return (
    <div className="relative" style={{ height: virtual.getTotalSize() }}>
      {virtual.getVirtualItems().map(item => {
        const r = rows[item.index];
        return (
          <div key={r.key} className={cn(ROW, "absolute inset-x-0", r.current && "bg-active-line")} style={{ top: item.start, height: LISTING_ROW_HEIGHT }}>
            <span className="text-muted">{r.address}</span>
            <span>{r.bytes}</span>
            <span className={LISTING_SOURCE[`${r.current}`]}>{r.source}</span>
          </div>
        );
      })}
    </div>
  );
}

export function InspectorPanel() {
  const program = useSession(s => s.program);
  const [tab, setTab] = useState<InspectorTab>("stack");
  const [start, setStart] = useState<Address>(() => defaultMemoryStart(program, machine.cpu.s[S.DS]));
  const [draft, setDraft] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const onWheel = (e: WheelEvent<HTMLDivElement>): void => {
    if (tab !== "memory") return;
    setStart(s => ({ seg: s.seg, off: (s.off + Math.sign(e.deltaY) * MEMORY_WHEEL_STEP) & 0xFFFF }));
  };

  return (
    <Panel>
      <div role="tablist" className="flex flex-none items-center gap-1 border-b border-line px-3">
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); }}
            className={cn("inline-flex min-h-10 cursor-pointer items-center gap-2 border-b-2 px-3 text-[13px]", TAB_STATE[`${tab === t.id}`])}>
            <HugeiconsIcon icon={t.icon} size={16} />{t.label}
          </button>
        ))}
        {tab === "memory" && (
          <input
            aria-label="Memory address"
            spellCheck={false}
            value={draft ?? `${hex(start.seg)}:${hex(start.off)}`}
            onChange={e => { setDraft(e.target.value); }}
            onBlur={() => { setDraft(null); }}
            onKeyDown={e => {
              if (e.key !== "Enter") return;
              const next = parseAddress(e.currentTarget.value, machine.cpu.s[S.DS]);
              if (next) setStart(next);
              setDraft(null);
            }}
            className="ml-auto min-h-7 w-26 rounded-chip border border-control bg-panel px-2 font-mono text-xs"
          />
        )}
      </div>
      <div ref={scrollRef} role="tabpanel" onWheel={onWheel}
        className={cn("relative min-h-0 flex-1 px-3 py-2 font-mono text-[12.5px] leading-[22px]", TAB_OVERFLOW[tab])}>
        {tab === "stack" && <StackView />}
        {tab === "memory" && <MemoryView start={start} />}
        {tab === "listing" && <ListingView scrollRef={scrollRef} />}
      </div>
    </Panel>
  );
}

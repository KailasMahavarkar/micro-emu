import { useEffect, useRef, useState, type ReactNode } from "react";
import { F, FLAG_NAMES, hex } from "../../emulator/index.ts";
import { cn } from "../../ui/index.ts";
import { VIDEO_TITLE, keyLabel } from "./board-model.ts";
import type { ActiveHop } from "./board-store.ts";
import { BOARD, REGISTER_NODES, STATIC_WIRES, UNIT_BOXES, UNIT_NODES, boxOf, isUnitNode, type NodeKind } from "./geometry.ts";
import { flagMark } from "./plan.ts";
import type { BoardNode, MarkKey, UnitNode, ViewState } from "./types.ts";

const QUEUE_CELLS = 6;
const NODE_KIND: Record<NodeKind, string> = {
  register: "border-chip-line bg-node",
  unit: "border-inner-wire bg-unit",
  flags: "border-chip-line bg-node",
  device: "justify-start border-device-line bg-linear-to-b from-device to-device-low shadow-[0_6px_14px_rgb(0_0_0/0.4)] before:absolute before:inset-x-2.5 before:top-0 before:h-1 before:bg-[repeating-linear-gradient(90deg,var(--color-pin)_0_5px,transparent_5px_11px)] before:opacity-70 before:content-['']",
  monitor: "justify-start rounded-panel border-monitor-line bg-linear-to-b from-monitor to-monitor-low p-1.5",
  later: "border-chip-line bg-node opacity-60"
};
const MARK = "rounded-[3px_7px_4px_8px/7px_3px_8px_4px] bg-glow px-1.25 -mx-1.25 text-on-mark";
const VALUE = "self-start font-mono text-sm leading-snug font-medium whitespace-nowrap";
const LABEL = "text-[11px] leading-tight whitespace-nowrap text-chip-muted";
const LATER_TITLES: Readonly<Partial<Record<UnitNode, string>>> = { T8253: "8253 timer", P8259: "8259 PIC" };
const kindOf = (n: BoardNode): NodeKind => (isUnitNode(n) ? UNIT_BOXES[n].kind : "register");

function NodeBody({ id, vs }: { id: BoardNode; vs: ViewState }): ReactNode {
  const marked = (k: MarkKey): string | false => vs.marks.has(k) && MARK;
  switch (id) {
    case "SIGMA": return <><span className={LABEL}>Address adder Σ</span><span className={VALUE}>{vs.sigma || "-"}</span></>;
    case "QUEUE": return (
      <><span className={LABEL}>Instruction queue</span>
        <span className="flex gap-0.5">{Array.from({ length: QUEUE_CELLS }, (_, i) => <span key={i} className="w-5.25 rounded bg-chip-cell text-center font-mono text-xs leading-5 font-medium">{vs.queue[i] ?? ""}</span>)}</span></>
    );
    case "CU": return <><span className={LABEL}>Decoder</span><span className={cn(VALUE, "max-w-full truncate")}>{vs.cu || "-"}</span></>;
    case "ALU": return <><span className={LABEL}>ALU</span><span className={VALUE}>{vs.alu || "-"}</span></>;
    case "FLAGS": return (
      <span className="flex justify-between">
        {FLAG_NAMES.map(f => (
          <span key={f} className="text-center font-mono text-[11px] leading-tight text-chip-muted">{f}
            <b className={cn("block text-[13px] font-normal", vs.flags & F[f] && "font-bold text-chip-ink", marked(flagMark(f)))}>{vs.flags & F[f] ? 1 : 0}</b>
          </span>
        ))}
      </span>
    );
    case "MEM": return (
      <><span className={LABEL}>Memory, 1 MB</span>
        <div className="mt-1 font-mono text-[11.5px] leading-[17px] [&>div]:flex [&>div]:gap-2 [&>div]:whitespace-nowrap">
          {vs.code && <div><span className="text-chip-muted">{hex(vs.code.lin, 5)}</span><span>{vs.code.bytes}</span><span className="text-chip-muted">{vs.code.tag}</span></div>}
          {vs.memLast && <div><span className="text-chip-muted">{hex(vs.memLast.lin, 5)}</span><span className={MARK}>{vs.memLast.text}</span><span className="text-chip-muted">written</span></div>}
          {vs.stack.map((s, i) => <div key={s.off}><span className="text-chip-muted">{hex(s.lin, 5)}</span><span>{hex(s.v)}</span><span className="text-chip-muted">{i === 0 ? "◂ SP" : ""}</span></div>)}
          {vs.stack.length === 0 && <div><span className="text-chip-muted">stack is empty</span></div>}
        </div></>
    );
    case "SCREEN": return (
      <><span className={cn(LABEL, "mx-0.5 mb-0.75")}>{VIDEO_TITLE}</span>
        <div className={cn("relative flex-1 overflow-hidden rounded-chip bg-black px-1.25 py-1 font-crt text-[7.5px] leading-[11px] whitespace-pre shadow-[inset_0_0_18px_rgb(120_200_255/0.08)]", vs.marks.has("SCREEN") && "ring-2 ring-glow")}>
          {vs.monitor.map((runs, r) => <div key={r}>{runs.map((run, i) => <span key={i} className={run.className}>{run.text}</span>)}</div>)}
        </div></>
    );
    case "KBD": return (
      <><span className={LABEL}>Keyboard</span>
        <span className={cn("mt-2 grid h-9.5 min-w-9.5 place-items-center self-center rounded-[7px] bg-linear-to-b from-keycap to-keycap-low px-2 font-mono text-[15px] font-semibold shadow-[0_3px_0_var(--color-chip)]",
          vs.marks.has("KBD") && "from-glow to-glow text-on-mark shadow-[0_3px_0_var(--color-keycap-glow-shadow)]")}>
          {vs.kbd === null ? "-" : keyLabel(vs.kbd)}
        </span></>
    );
    case "IO": return <><span className={LABEL}>I/O ports</span><span className={cn(VALUE, "text-xs", marked("IO"))}>{vs.io ? `${hex(vs.io.port, 2)}h: ${hex(vs.io.v, 2)}` : "-"}</span></>;
    case "T8253": case "P8259": return <><span className={LABEL}>{LATER_TITLES[id]}</span><span className="text-[11px] text-chip-muted">coming soon</span></>;
    default: return <><span className={LABEL}>{id}</span><span className={cn(VALUE, marked(id))}>{hex(vs.regs[id])}</span></>;
  }
}

export interface BoardViewProps {
  vs: ViewState;
  trails: readonly string[];
  hop: ActiveHop | null;
  hit: { node: BoardNode; id: number } | null;
}

export function BoardView({ vs, trails, hop, hit }: BoardViewProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, x: 0, y: 0 });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const observer = new ResizeObserver(() => {
      const scale = Math.min(stage.clientWidth / BOARD.W, stage.clientHeight / BOARD.H);
      setFit({ scale, x: (stage.clientWidth - BOARD.W * scale) / 2, y: (stage.clientHeight - BOARD.H * scale) / 2 });
    });
    observer.observe(stage);
    return () => { observer.disconnect(); };
  }, []);

  return (
    <div ref={stageRef} className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(rgb(255_255_255/0.05)_1px,transparent_1.2px),radial-gradient(ellipse_at_28%_18%,var(--color-pcb-hi),var(--color-pcb)_72%)] bg-size-[14px_14px,auto] max-[960px]:min-h-105">
      <div className="absolute top-0 left-0 origin-top-left text-chip-ink" style={{ width: BOARD.W, height: BOARD.H, transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})` }}>
        <div className="absolute top-2 left-2 h-75 w-156 rounded-panel border border-chip-line bg-linear-to-b from-chip-hi to-chip shadow-[0_10px_24px_rgb(0_0_0/0.45),inset_0_1px_0_rgb(255_255_255/0.05)] before:absolute before:inset-x-8 before:-top-2 before:h-1.75 before:rounded-t-xs before:bg-[repeating-linear-gradient(90deg,var(--color-pin)_0_7px,transparent_7px_15px)] before:opacity-85 before:content-[''] after:absolute after:inset-x-8 after:-bottom-2 after:h-1.75 after:rounded-b-xs after:bg-[repeating-linear-gradient(90deg,var(--color-pin)_0_7px,transparent_7px_15px)] after:opacity-85 after:content-['']">
          <span className="absolute top-33 -left-px h-7 w-3.5 rounded-r-full border border-l-0 border-chip-line bg-pcb" />
        </div>
        <div className="absolute top-5.5 left-4 h-69.5 w-74 rounded-control border border-dashed border-die-line bg-white/2.5" />
        <div className="absolute top-5.5 left-82 h-69.5 w-74 rounded-control border border-dashed border-die-line bg-white/2.5" />
        <svg viewBox={`0 0 ${BOARD.W} ${BOARD.H}`} width={BOARD.W} height={BOARD.H} aria-hidden="true" className="absolute inset-0 overflow-visible fill-none">
          <path d={STATIC_WIRES.internalBus} className="stroke-inner-bus" strokeWidth={3} strokeLinecap="round" />
          {STATIC_WIRES.internal.map(d => <path key={d} d={d} className="stroke-inner-wire" strokeWidth={1.4} />)}
          {STATIC_WIRES.buses.map(d => <g key={d}><path d={d} className="stroke-copper-deep" strokeWidth={6} strokeLinecap="round" /><path d={d} className="stroke-copper" strokeWidth={3} strokeLinecap="round" /></g>)}
          {STATIC_WIRES.copper.map(d => <path key={d} d={d} className="stroke-copper-wire" strokeWidth={1.6} />)}
          {STATIC_WIRES.later.map(d => <path key={d} d={d} className="stroke-later-wire" strokeWidth={1.4} strokeDasharray="4 4" />)}
          {trails.map((d, i) => <path key={i} d={d} className="stroke-glow opacity-85" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />)}
          {hop && (
            <path key={hop.id} d={hop.d} pathLength={1} strokeDasharray="1" className="animate-trace stroke-glow drop-shadow-[0_0_4px_rgb(255_228_92/0.9)]"
              strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" style={{ animationDuration: `${hop.ms}ms`, strokeDashoffset: 1 }} />
          )}
        </svg>
        <span className="absolute top-6.5 left-6 text-[10.5px] leading-tight whitespace-nowrap text-chip-muted"><b className="font-semibold text-chip-ink">BIU</b> bus interface unit</span>
        <span className="absolute top-6.5 left-84 text-[10.5px] leading-tight whitespace-nowrap text-chip-muted"><b className="font-semibold text-chip-ink">EU</b> execution unit</span>
        <span className="absolute top-37.5 left-138 text-[10.5px] leading-tight whitespace-nowrap text-chip-muted">internal bus</span>
        <span className="absolute top-6 left-143.5 font-mono text-[13px] font-semibold tracking-[0.08em]">8086</span>
        <span className="absolute left-107.5 text-[11px] leading-tight whitespace-nowrap text-silk-muted" style={{ top: BOARD.ABUS - 16 }}><b className="font-semibold text-silk">address bus</b> 20-bit</span>
        <span className="absolute left-107.5 text-[11px] leading-tight whitespace-nowrap text-silk-muted" style={{ top: BOARD.DBUS + 4 }}><b className="font-semibold text-silk">data bus</b> 16-bit</span>
        {[...REGISTER_NODES, ...UNIT_NODES].map(id => {
          const b = boxOf(id);
          return (
            <div key={id} data-node={id} className={cn("absolute flex flex-col justify-center gap-px overflow-hidden rounded-[7px] border px-2 py-1", NODE_KIND[kindOf(id)])}
              style={{ left: b.x, top: b.y, width: b.w, height: b.h }}>
              <NodeBody id={id} vs={vs} />
              {hit?.node === id && <span key={hit.id} className="pointer-events-none absolute inset-0 animate-hit rounded-[7px]" />}
            </div>
          );
        })}
        {hop && (
          <div key={hop.id} className="pointer-events-none absolute top-0 left-0 z-9 animate-travel rounded-full bg-glow px-2.25 py-1 font-mono text-[11px] leading-none font-semibold whitespace-nowrap text-on-mark shadow-[0_0_0_3px_rgb(255_228_92/0.22),0_0_18px_rgb(255_228_92/0.75)] [offset-rotate:0deg]"
            style={{ offsetPath: `path('${hop.d}')`, animationDuration: `${hop.ms}ms` }}>
            {hop.label}
          </div>
        )}
      </div>
    </div>
  );
}

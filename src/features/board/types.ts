import type { PortWrite } from "../../emulator/index.ts";
import type { RegisterName } from "../registers/registers-layout.ts";
import type { ScreenRun } from "../screen/screen-layout.ts";

export type RegisterNode = RegisterName;
export type DeviceNode = "MEM" | "SCREEN" | "KBD" | "IO";
export type UnitNode = "SIGMA" | "QUEUE" | "CU" | "ALU" | "FLAGS" | DeviceNode | "T8253" | "P8259";
export type BoardNode = RegisterNode | UnitNode;
export type FlagMark = `F${"CF" | "PF" | "AF" | "ZF" | "SF" | "TF" | "IF" | "DF" | "OF"}`;
export type MarkKey = BoardNode | FlagMark;

export interface StackCell { off: number; lin: number; v: number }
export interface CodeLine { lin: number; bytes: string; tag: "next" | "fetch" }

export interface Capture {
  regs: Record<RegisterNode, number>;
  flags: number;
  stack: StackCell[];
  monitor: ScreenRun[][];
  code: CodeLine | null;
  kbd: number | null;
  io: PortWrite | null;
}

export interface ViewState extends Capture {
  sigma: string;
  queue: string[];
  cu: string;
  alu: string;
  marks: Set<MarkKey>;
  memLast: { lin: number; text: string } | null;
}

export type Apply = (vs: ViewState) => void;
export interface Hop { from: BoardNode; to: BoardNode; label: string; text: string; apply: Apply | null }
export interface Note { from: null; text: string }
export interface Instant { instant: Apply }
export type PlanItem = Hop | Note | Instant;

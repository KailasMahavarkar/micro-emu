import type { MessageArgs } from "../asm/errors.ts";
import type { Cpu } from "../cpu/cpu.ts";
import type { TextScreen } from "./screen.ts";

export const NOTICE_CODES = ["RUNAWAY", "DIV0", "UNSUPPORTED_INT"] as const;
export type NoticeCode = (typeof NOTICE_CODES)[number];
export interface Notice { code: NoticeCode; args: MessageArgs; fatal: boolean }

export interface Key { a: number; s: number }

export interface MachineHost {
  readonly cpu: Cpu;
  readonly screen: TextScreen;
  notice: Notice | null;
  lineBuf: number[] | null;
  breakHit: boolean;
  hasKey(): boolean;
  peekKey(): Key | null;
  readKey(): Key;
  waitKey(): true;
  exit(code: number): void;
}

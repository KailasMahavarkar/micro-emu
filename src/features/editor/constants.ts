import type { LineState, SyntaxKind } from "./types.ts";

export const LINE_HEIGHT = 24;
export const EDITOR_PADDING = 8;
export const TAB_SPACES = "    ";
export const CURRENT_MARK = "▸";

export const SYNTAX_CLASS: Record<SyntaxKind, string> = {
  op: "font-bold",
  reg: "text-syntax-reg",
  number: "text-syntax-num",
  string: "text-syntax-num",
  comment: "text-muted",
  label: "font-bold",
  dir: "font-semibold text-syntax-dir"
};

export const LINE_BACKGROUND: Record<LineState, string> = {
  current: "bg-active-line",
  error: "bg-error-bg",
  plain: ""
};

export const GUTTER_NUMBER: Record<LineState, string> = {
  current: "font-bold text-primary",
  error: "font-bold text-error",
  plain: "text-muted"
};

export const BREAKPOINT_DOT: Record<"on" | "off", string> = {
  on: "before:border-error before:bg-error",
  off: "before:border-transparent hover:before:border-control"
};

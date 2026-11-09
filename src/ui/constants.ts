import type { ButtonSize, ButtonVariant, PanelTone } from "./types.ts";

export const MARK_CLASS = "rounded-[3px_7px_4px_8px/7px_3px_8px_4px] bg-mark px-1.25 -mx-1.25 text-on-mark";
export const ICON_SIZE = 18;
export const ICON_SIZE_SMALL = 16;

export const BUTTON_BASE =
  "inline-flex items-center gap-2 whitespace-nowrap rounded-control border cursor-pointer transition-transform duration-100 active:enabled:scale-97 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  default: "border-control bg-panel text-ink",
  primary: "border-primary bg-primary text-on-primary font-semibold min-w-27",
  ghost: "border-transparent bg-transparent text-muted hover:bg-sunk hover:text-ink",
  "dark-ghost": "border-transparent bg-transparent text-dos-muted hover:bg-dos-hover hover:text-dos-ink"
};

export const BUTTON_SIZE: Record<ButtonSize, string> = {
  md: "min-h-10 pl-3 pr-4",
  icon: "min-h-8 min-w-8 justify-center px-2"
};

export const PANEL_TONE: Record<PanelTone, string> = {
  light: "border-line bg-panel",
  dark: "border-dos-line bg-dos"
};

export const PANEL_HEADER_TONE: Record<PanelTone, string> = {
  light: "border-line text-ink [&_svg]:text-muted",
  dark: "border-dos-line text-dos-ink [&_svg]:text-dos-muted"
};

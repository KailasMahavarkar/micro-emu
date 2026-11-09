import type { IconSvgElement } from "@hugeicons/react";

export type ButtonVariant = "default" | "primary" | "ghost" | "dark-ghost";
export type ButtonSize = "md" | "icon";
export type PanelTone = "light" | "dark";
export type Icon = IconSvgElement;

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: Icon;
}

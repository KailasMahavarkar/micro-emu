import { HugeiconsIcon } from "@hugeicons/react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.ts";
import { ICON_SIZE_SMALL, PANEL_HEADER_TONE, PANEL_TONE } from "./constants.ts";
import type { Icon, PanelTone } from "./types.ts";

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  tone?: PanelTone;
}

export function Panel({ tone = "light", className, ...rest }: PanelProps) {
  return <section className={cn("flex min-h-0 flex-col overflow-hidden rounded-panel border", PANEL_TONE[tone], className)} {...rest} />;
}

export interface PanelHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: PanelTone;
  icon?: Icon;
  title: ReactNode;
  children?: ReactNode;
}

export function PanelHeader({ tone = "light", icon, title, children, className, ...rest }: PanelHeaderProps) {
  return (
    <div
      className={cn("flex min-h-10 flex-none items-center gap-2 border-b pr-2 pl-4 text-[13px] font-semibold", PANEL_HEADER_TONE[tone], className)}
      {...rest}
    >
      {icon && <HugeiconsIcon icon={icon} size={ICON_SIZE_SMALL} />}
      {title}
      {children}
    </div>
  );
}

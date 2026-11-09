import { HugeiconsIcon } from "@hugeicons/react";
import type { HTMLAttributes } from "react";
import { cn } from "./cn.ts";
import { ICON_SIZE_SMALL } from "./constants.ts";
import type { Icon, SegmentOption } from "./types.ts";

export interface SegmentedProps<T extends string> extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  icon?: Icon;
  mode?: "toggle" | "tabs";
}

const SELECTED = { true: "bg-ink text-paper", false: "text-muted hover:text-ink" } as const;

export function Segmented<T extends string>({ options, value, onChange, label, icon, mode = "toggle", className, ...rest }: SegmentedProps<T>) {
  return (
    <div
      role={mode === "tabs" ? "tablist" : "group"}
      aria-label={label}
      className={cn("inline-flex items-center gap-1 rounded-control border border-control bg-panel p-1", className)}
      {...rest}
    >
      {icon && <HugeiconsIcon icon={icon} size={ICON_SIZE_SMALL} className="mx-1 ml-2 text-muted" />}
      {options.map(o => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role={mode === "tabs" ? "tab" : undefined}
            aria-selected={mode === "tabs" ? selected : undefined}
            aria-pressed={mode === "toggle" ? selected : undefined}
            onClick={() => { onChange(o.value); }}
            className={cn("inline-flex min-h-7.5 cursor-pointer items-center gap-2 rounded-chip px-3", SELECTED[`${selected}`])}
          >
            {o.icon && <HugeiconsIcon icon={o.icon} size={ICON_SIZE_SMALL} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

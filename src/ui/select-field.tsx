import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SelectHTMLAttributes } from "react";
import { cn } from "./cn.ts";
import { ICON_SIZE_SMALL } from "./constants.ts";
import type { Icon } from "./types.ts";

export interface SelectFieldProps<T extends string> extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value"> {
  icon: Icon;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}

export function SelectField<T extends string>({ icon, value, options, onChange, className, ...rest }: SelectFieldProps<T>) {
  return (
    <label className="relative flex items-center">
      <HugeiconsIcon icon={icon} size={ICON_SIZE_SMALL} className="pointer-events-none absolute left-3 text-muted" />
      <select
        value={value}
        onChange={e => {
          const next = options.find(o => o.value === e.target.value);
          if (next) onChange(next.value);
        }}
        className={cn("min-h-10 cursor-pointer appearance-none rounded-control border border-control bg-panel pr-9 pl-9.5", className)}
        {...rest}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <HugeiconsIcon icon={ArrowDown01Icon} size={ICON_SIZE_SMALL} className="pointer-events-none absolute right-3 text-muted" />
    </label>
  );
}

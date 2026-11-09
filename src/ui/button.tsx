import { HugeiconsIcon } from "@hugeicons/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.ts";
import { BUTTON_BASE, BUTTON_SIZE, BUTTON_VARIANT, ICON_SIZE, ICON_SIZE_SMALL } from "./constants.ts";
import type { ButtonSize, ButtonVariant, Icon } from "./types.ts";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: Icon;
  children?: ReactNode;
}

export function Button({ variant = "default", size = "md", icon, children, className, ...rest }: ButtonProps) {
  return (
    <button type="button" className={cn(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className)} {...rest}>
      {icon && <HugeiconsIcon icon={icon} size={size === "icon" ? ICON_SIZE_SMALL : ICON_SIZE} />}
      {children}
    </button>
  );
}

import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "outline" | "secondary" | "ghost" | "destructive";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  default: "bg-slate-950 text-white hover:bg-sky-700",
  outline: "border border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:text-sky-700",
  secondary: "border border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:text-slate-950",
  ghost: "bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-950",
  destructive: "border border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:text-rose-800",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 rounded-2xl px-3 text-xs font-semibold",
  md: "h-11 rounded-2xl px-4 text-sm font-semibold",
  lg: "h-12 rounded-2xl px-5 text-sm font-semibold",
  icon: "h-10 w-10 rounded-2xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "default", size = "md", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
});

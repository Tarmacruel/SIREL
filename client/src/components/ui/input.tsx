import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, error = false, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "flex h-11 w-full rounded-[18px] border bg-white/96 px-3.5 py-2.5 text-sm text-[var(--color-neutral-900)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none transition placeholder:text-[var(--color-neutral-400)] disabled:cursor-not-allowed disabled:bg-[var(--color-neutral-50)]",
        error
          ? "border-rose-300 focus:border-rose-400"
          : "border-[rgba(209,213,219,0.92)] focus:border-[rgba(65,105,225,0.52)]",
        className,
      )}
      {...props}
    />
  );
});

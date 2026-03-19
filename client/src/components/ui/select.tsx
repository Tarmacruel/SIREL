import { forwardRef, type SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, error = false, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        "flex h-11 w-full rounded-[18px] border bg-white/96 px-3.5 py-2.5 text-sm text-[var(--color-neutral-900)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none transition disabled:cursor-not-allowed disabled:bg-[var(--color-neutral-50)]",
        error
          ? "border-rose-300 focus:border-rose-400"
          : "border-[rgba(209,213,219,0.92)] focus:border-[rgba(65,105,225,0.52)]",
        className,
      )}
      {...props}
    />
  );
});

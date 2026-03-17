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
        "flex h-11 w-full rounded-2xl border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400 disabled:cursor-not-allowed disabled:bg-slate-50",
        error ? "border-rose-300 focus:border-rose-400" : "border-slate-200",
        className,
      )}
      {...props}
    />
  );
});

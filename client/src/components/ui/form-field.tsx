import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface FormFieldProps {
  label: string;
  description?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}

export function FormField({ label, description, error, className, children }: FormFieldProps) {
  return (
    <label className={cn("block space-y-2 text-sm font-semibold text-[var(--color-neutral-700)]", className)}>
      <span className="font-[var(--font-heading)] tracking-[0.01em]">{label}</span>
      {children}
      {description ? <span className="block text-xs font-normal leading-5 text-[var(--color-neutral-500)]">{description}</span> : null}
      {error ? <span className="block text-xs font-semibold text-rose-700">{error}</span> : null}
    </label>
  );
}

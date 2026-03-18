import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {}

export function Checkbox({ className, ...props }: CheckboxProps) {
  return <input type="checkbox" className={cn("h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500", className)} {...props} />;
}

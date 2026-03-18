import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AlertVariant = "info" | "success" | "warning" | "error";

const variantMap: Record<AlertVariant, { wrapper: string; icon: ReactNode }> = {
  info: { wrapper: "border-sky-200 bg-sky-50 text-sky-900", icon: <Info className="h-4 w-4" /> },
  success: { wrapper: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: <CheckCircle2 className="h-4 w-4" /> },
  warning: { wrapper: "border-amber-200 bg-amber-50 text-amber-900", icon: <TriangleAlert className="h-4 w-4" /> },
  error: { wrapper: "border-rose-200 bg-rose-50 text-rose-800", icon: <AlertCircle className="h-4 w-4" /> },
};

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Alert({ variant = "info", title, children, className }: AlertProps) {
  return (
    <div className={cn("rounded-2xl border px-4 py-3 text-sm", variantMap[variant].wrapper, className)}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{variantMap[variant].icon}</div>
        <div className="space-y-1">
          {title ? <p className="font-semibold">{title}</p> : null}
          <div className="leading-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

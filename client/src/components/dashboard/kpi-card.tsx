import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";

interface KpiCardProps {
  title: string;
  value: string;
  hint: string;
  icon: ReactNode;
}

export function KpiCard({ title, value, hint, icon }: KpiCardProps) {
  return (
    <Card className="rounded-[28px] border-[rgba(204,225,255,0.9)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(230,240,255,0.72))]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-[var(--font-heading)] text-xs font-bold uppercase tracking-[0.25em] text-[var(--color-primary-700)]">{title}</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[var(--color-primary-900)]">{value}</p>
          <p className="mt-2 text-sm leading-6 text-[var(--color-neutral-600)]">{hint}</p>
        </div>
        <div className="rounded-[20px] bg-[linear-gradient(135deg,var(--color-primary-100),rgba(255,255,255,0.96))] p-3 text-[var(--color-primary-700)] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">{icon}</div>
      </div>
    </Card>
  );
}

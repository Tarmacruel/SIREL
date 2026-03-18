import type { ReactNode } from "react";

interface KpiCardProps {
  title: string;
  value: string;
  hint: string;
  icon: ReactNode;
}

export function KpiCard({ title, value, hint, icon }: KpiCardProps) {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-sky-700">{title}</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{value}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{hint}</p>
        </div>
        <div className="rounded-2xl bg-sky-50 p-3 text-sky-700">{icon}</div>
      </div>
    </article>
  );
}

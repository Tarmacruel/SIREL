import { theme } from "@/styles/theme";

interface SimpleLineChartItem {
  label: string;
  value: number;
}

export function SimpleLineChart({ items }: { items: SimpleLineChartItem[] }) {
  if (!items.length) {
    return <div className="rounded-3xl border border-dashed border-[rgba(204,225,255,0.9)] bg-[var(--color-primary-50)] px-4 py-8 text-center text-sm text-[var(--color-neutral-500)]">Sem dados para o período selecionado.</div>;
  }

  const width = 520;
  const height = 200;
  const padding = 24;
  const max = Math.max(...items.map((item) => item.value), 1);
  const stepX = items.length > 1 ? (width - padding * 2) / (items.length - 1) : 0;
  const points = items.map((item, index) => {
    const x = padding + stepX * index;
    const y = height - padding - ((item.value / max) * (height - padding * 2));
    return { ...item, x, y };
  });

  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");

  return (
    <div className="space-y-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible rounded-3xl bg-[linear-gradient(180deg,rgba(230,240,255,0.72),rgba(255,255,255,0.95))] p-2">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke={theme.colors.neutral[300]} strokeWidth="1.5" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke={theme.colors.neutral[300]} strokeWidth="1.5" />
        <path d={path} fill="none" stroke={theme.colors.primary[500]} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r="5" fill={theme.colors.primary[800]} />
            <title>{`${point.label}: ${point.value.toLocaleString("pt-BR")}`}</title>
          </g>
        ))}
      </svg>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className="rounded-2xl border border-[rgba(204,225,255,0.85)] bg-white px-4 py-3 text-sm">
            <p className="font-semibold text-[var(--color-neutral-700)]">{item.label}</p>
            <p className="mt-1 text-lg font-black text-[var(--color-primary-900)]">{item.value.toLocaleString("pt-BR")}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

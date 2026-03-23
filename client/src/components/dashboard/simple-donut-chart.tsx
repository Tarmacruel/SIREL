import { chartPalette } from "@/styles/theme";

const palette = [...chartPalette];

interface SimpleDonutChartItem {
  id?: number | string | null;
  label: string;
  value: number;
}

export function SimpleDonutChart({
  items,
  onSliceClick,
  selected,
}: {
  items: SimpleDonutChartItem[];
  onSliceClick?: (item: SimpleDonutChartItem) => void;
  selected?: number | string | null;
}) {
  const total = items.reduce((acc, item) => acc + item.value, 0);
  if (!total) {
    return <div className="rounded-3xl border border-dashed border-[rgba(204,225,255,0.9)] bg-[var(--color-primary-50)] px-4 py-8 text-center text-sm text-[var(--color-neutral-500)]">Sem dados para exibir.</div>;
  }

  let accumulated = 0;
  const gradientStops = items
    .map((item, index) => {
      const start = (accumulated / total) * 100;
      accumulated += item.value;
      const end = (accumulated / total) * 100;
      const color = palette[index % palette.length];
      return `${color} ${start}% ${end}%`;
    })
    .join(", ");

  return (
    <div className="grid gap-4 md:grid-cols-[180px_1fr] md:items-center">
      <div className="mx-auto flex h-44 w-44 items-center justify-center rounded-full" style={{ background: `conic-gradient(${gradientStops})` }}>
        <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-white text-center shadow-inner">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-neutral-500)]">Total</span>
          <span className="mt-1 text-2xl font-black text-[var(--color-primary-900)]">{total.toLocaleString("pt-BR")}</span>
        </div>
      </div>
      <div className="space-y-3">
        {items.map((item, index) => {
          const percentage = total ? (item.value / total) * 100 : 0;
          const isSelected = selected !== undefined && selected !== null && item.id === selected;
          return (
            <button
              key={`${item.label}-${index}`}
              type="button"
              onClick={() => onSliceClick?.(item)}
              className={`w-full rounded-2xl border px-4 py-3 text-left transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${isSelected ? "border-indigo-500 bg-indigo-50 shadow-sm" : "border-[rgba(204,225,255,0.85)] bg-white hover:border-[rgba(65,105,225,0.45)] hover:bg-slate-50"}`}
            >
              <div className="flex items-center justify-between gap-3 text-sm">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: palette[index % palette.length] }} />
                  <span className="truncate font-medium text-[var(--color-neutral-700)]">{item.label}</span>
                </div>
                <span className="font-black text-[var(--color-primary-900)]">{item.value.toLocaleString("pt-BR")}</span>
              </div>
              <div className="mt-1 text-xs text-[var(--color-neutral-500)]">{percentage.toFixed(1).replace(".", ",")}%</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface SimpleBarChartItem {
  label: string;
  value: number;
}

export function SimpleBarChart({ items }: { items: SimpleBarChartItem[] }) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const width = `${Math.max(8, (item.value / max) * 100)}%`;
        return (
          <div key={`${item.label}-${index}`} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-medium text-slate-700">{item.label}</span>
              <span className="font-bold text-slate-950">{item.value.toLocaleString("pt-BR")}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-sky-600" style={{ width }} title={`${item.label}: ${item.value.toLocaleString("pt-BR")}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

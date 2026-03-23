import { chartPalette } from "@/styles/theme";

interface SimpleBarChartItem {
  label: string;
  value: number;
  id?: number | string | null;
}

export function SimpleBarChart({
  items,
  onBarClick,
  selected,
}: {
  items: SimpleBarChartItem[];
  onBarClick?: (item: SimpleBarChartItem) => void;
  selected?: number | string | null;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const width = `${Math.max(8, (item.value / max) * 100)}%`;
        const isSelected = selected !== undefined && selected !== null && item.id === selected;
        return (
          <button
            key={`${item.label}-${index}`}
            type="button"
            onClick={() => onBarClick?.(item)}
            className={`w-full rounded-2xl border px-3 py-2 text-left transition ${isSelected ? "border-blue-500 bg-blue-50" : "border-[rgba(204,225,255,0.85)] bg-white hover:border-[rgba(65,105,225,0.45)]"}`}
          >
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-medium text-[var(--color-neutral-700)]">{item.label}</span>
              <span className="font-bold text-[var(--color-primary-900)]">{item.value.toLocaleString("pt-BR")}</span>
            </div>
            <div className="mt-1 h-3 overflow-hidden rounded-full bg-[rgba(204,225,255,0.45)]">
              <div className="h-full rounded-full" style={{ width, backgroundColor: chartPalette[index % chartPalette.length] }} title={`${item.label}: ${item.value.toLocaleString("pt-BR")}`} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

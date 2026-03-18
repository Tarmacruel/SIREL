import { useMemo, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface TabItem {
  value: string;
  label: string;
  content: ReactNode;
}

interface TabsProps {
  items: TabItem[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}

export function Tabs({ items, defaultValue, value, onValueChange, className }: TabsProps) {
  const fallbackValue = useMemo(() => defaultValue ?? items[0]?.value ?? "", [defaultValue, items]);
  const [internalValue, setInternalValue] = useState(fallbackValue);
  const activeValue = value ?? internalValue;
  const activeTab = items.find((item) => item.value === activeValue) ?? items[0];

  function handleSelect(nextValue: string) {
    if (value === undefined) {
      setInternalValue(nextValue);
    }
    onValueChange?.(nextValue);
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="inline-flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1">
        {items.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => handleSelect(item.value)}
            className={cn(
              "rounded-2xl px-4 py-2 text-sm font-semibold transition",
              item.value === activeTab?.value ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-950",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div>{activeTab?.content}</div>
    </div>
  );
}

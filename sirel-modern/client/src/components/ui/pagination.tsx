import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function buildPaginationItems(page: number, totalPages: number) {
  const safeTotal = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotal);
  if (safeTotal <= 7) return Array.from({ length: safeTotal }, (_, index) => index + 1);

  const pages = new Set<number>([1, safePage - 1, safePage, safePage + 1, safeTotal]);
  return Array.from(pages)
    .filter((value) => value >= 1 && value <= safeTotal)
    .sort((a, b) => a - b)
    .reduce<Array<number | "ellipsis">>((acc, value, index, source) => {
      if (index > 0 && value - source[index - 1] > 1) acc.push("ellipsis");
      acc.push(value);
      return acc;
    }, []);
}

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({ page, totalPages, onPageChange, className }: PaginationProps) {
  const items = buildPaginationItems(page, totalPages);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button variant="outline" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
        <ChevronLeft className="h-4 w-4" />
        Anterior
      </Button>
      {items.map((item, index) =>
        item === "ellipsis" ? (
          <span key={`ellipsis-${index}`} className="inline-flex h-9 w-9 items-center justify-center text-slate-400">
            <MoreHorizontal className="h-4 w-4" />
          </span>
        ) : (
          <Button
            key={item}
            variant={item === page ? "default" : "outline"}
            size="sm"
            className="min-w-9 px-0"
            onClick={() => onPageChange(item)}
          >
            {item}
          </Button>
        ),
      )}
      <Button variant="outline" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
        Proxima
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

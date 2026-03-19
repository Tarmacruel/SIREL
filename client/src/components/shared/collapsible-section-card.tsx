import { useState, type PropsWithChildren, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/section-card";

interface CollapsibleSectionCardProps extends PropsWithChildren {
  title: string;
  description?: string;
  action?: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (nextOpen: boolean) => void;
  collapsedSummary?: ReactNode;
}

export function CollapsibleSectionCard({
  title,
  description,
  action,
  defaultOpen = false,
  open,
  onToggle,
  collapsedSummary,
  children,
}: CollapsibleSectionCardProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = typeof open === "boolean";
  const expanded = isControlled ? open : internalOpen;

  function handleToggle() {
    const next = !expanded;
    if (!isControlled) {
      setInternalOpen(next);
    }
    onToggle?.(next);
  }

  return (
    <SectionCard
      title={title}
      description={description}
      action={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {action}
          <Button type="button" variant="outline" size="sm" onClick={handleToggle}>
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            {expanded ? "Ocultar seção" : "Exibir seção"}
          </Button>
        </div>
      }
    >
      {expanded ? children : collapsedSummary ? <div>{collapsedSummary}</div> : null}
    </SectionCard>
  );
}


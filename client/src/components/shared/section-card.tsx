import type { PropsWithChildren, ReactNode } from "react";

import { Card } from "@/components/ui/card";

interface SectionCardProps extends PropsWithChildren {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function SectionCard({ title, description, action, children }: SectionCardProps) {
  return (
    <Card
      title={title}
      action={action}
      contentClassName="p-5"
      className="rounded-[28px] border-[rgba(209,213,219,0.86)] bg-white/95"
    >
      {description ? <p className="mb-4 text-sm leading-6 text-[var(--color-neutral-600)]">{description}</p> : null}
      {children}
    </Card>
  );
}

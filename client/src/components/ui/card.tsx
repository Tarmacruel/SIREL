import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  action?: ReactNode;
  contentClassName?: string;
}

export function Card({ children, className, title, action, contentClassName, ...props }: CardProps) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[26px] border border-[rgba(209,213,219,0.88)] bg-white/95 shadow-[0_14px_32px_-22px_rgba(15,26,109,0.28)] backdrop-blur",
        className,
      )}
      {...props}
    >
      {title || action ? (
        <header className="flex flex-col gap-3 border-b border-[rgba(229,231,235,0.9)] bg-[linear-gradient(180deg,rgba(230,240,255,0.9),rgba(255,255,255,0.96))] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title ? <h3 className="font-[var(--font-heading)] text-lg font-bold tracking-tight text-[var(--color-primary-900)]">{title}</h3> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div className={cn("p-5", contentClassName)}>{children}</div>
    </section>
  );
}

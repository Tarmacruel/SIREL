import type { PropsWithChildren, ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps extends PropsWithChildren {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  actions?: ReactNode;
  size?: "md" | "lg" | "xl";
}

const sizeClasses: Record<NonNullable<ModalProps["size"]>, string> = {
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
};

export function Modal({ open, title, description, onClose, actions, size = "lg", children }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" onClick={onClose} className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" aria-label="Fechar modal" />
      <div className={["relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl", sizeClasses[size]].join(" ")}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h3 className="text-xl font-black tracking-tight text-slate-950">{title}</h3>
            {description ? <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-6 py-5">{children}</div>
        {actions ? <div className="border-t border-slate-200 px-6 py-4">{actions}</div> : null}
      </div>
    </div>
  );
}

import { useEffect, type PropsWithChildren, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
      <button
        type="button"
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm"
        aria-label="Fechar modal"
      />
      <div className="relative flex min-h-full items-start justify-center md:items-center">
        <div
          className={[
            "relative z-10 flex max-h-[calc(100vh-3rem)] w-full flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl",
            sizeClasses[size],
          ].join(" ")}
        >
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
    </div>,
    document.body,
  );
}

import { BellRing, CheckCheck } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "wouter";

import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatShortDateTimeBR } from "@/lib/formatters";
import { trpc } from "@/lib/trpc";

const notificationTypeLabels = {
  PRAZO: "Prazo",
  MOVIMENTACAO: "Movimentação",
  DOCUMENTO: "Documento",
  SISTEMA: "Sistema",
} as const;

const priorityLabels = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  URGENTE: "Urgente",
} as const;

export function NotificacoesPage() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"" | keyof typeof notificationTypeLabels>("");
  const [priority, setPriority] = useState<"" | keyof typeof priorityLabels>("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const deferredSearch = useDeferredValue(search.trim());

  const queryInput = useMemo(
    () => ({
      search: deferredSearch || undefined,
      type: type || undefined,
      priority: priority || undefined,
      unreadOnly: unreadOnly || undefined,
      page,
      pageSize,
    }),
    [deferredSearch, page, pageSize, priority, type, unreadOnly],
  );

  const notificationsQuery = trpc.notificacoes.list.useQuery(queryInput, { retry: false, placeholderData: (previous) => previous });
  const markReadMutation = trpc.notificacoes.markRead.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.notificacoes.list.invalidate(), utils.dashboard.summary.invalidate()]);
    },
  });
  const markAllMutation = trpc.notificacoes.markAllRead.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.notificacoes.list.invalidate(), utils.dashboard.summary.invalidate()]);
    },
  });

  const data = notificationsQuery.data;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Central de Notificações"
        description="Acompanhe prazos, documentos e movimentações sem sobrecarregar o dashboard inicial."
        action={
          <div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-sky-800">
            <BellRing className="h-4 w-4" />
            Monitoramento persistido
          </div>
        }
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,0.7fr))]">
          <FormField label="Busca textual">
            <Input
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
              placeholder="Processo, título ou mensagem"
            />
          </FormField>
          <FormField label="Tipo">
            <Select value={type} onChange={(event) => { setPage(1); setType(event.target.value as "" | keyof typeof notificationTypeLabels); }}>
              <option value="">Todos</option>
              {Object.entries(notificationTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Prioridade">
            <Select value={priority} onChange={(event) => { setPage(1); setPriority(event.target.value as "" | keyof typeof priorityLabels); }}>
              <option value="">Todas</option>
              {Object.entries(priorityLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Por página">
            <Select value={String(pageSize)} onChange={(event) => { setPage(1); setPageSize(Number(event.target.value)); }}>
              {[12, 20, 30].map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
          </FormField>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3">
          <label className="inline-flex items-center gap-3 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(event) => {
                setPage(1);
                setUnreadOnly(event.target.checked);
              }}
              className="h-4 w-4 rounded border-slate-300 text-sky-600"
            />
            Mostrar somente notificações não lidas
          </label>
          <Button variant="outline" size="sm" onClick={() => void markAllMutation.mutateAsync()} disabled={markAllMutation.isPending || !data?.summary.unread}>
            <CheckCheck className="h-4 w-4" />
            Marcar todas como lidas
          </Button>
        </div>
      </SectionCard>

      {notificationsQuery.error ? <Alert variant="error">Falha ao carregar a Central de Notificações.</Alert> : null}

      <div className="grid gap-4 md:grid-cols-3">
        {[{ label: "Pendentes", value: data?.summary.unread ?? 0 }, { label: "Altas e urgentes", value: data?.summary.urgent ?? 0 }, { label: "Geradas hoje", value: data?.summary.today ?? 0 }].map((item) => (
          <article key={item.label} className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
            {notificationsQuery.isLoading ? <Skeleton className="mt-3 h-10 w-20" /> : <p className="mt-2 text-3xl font-black text-slate-950">{item.value}</p>}
          </article>
        ))}
      </div>

      <SectionCard title="Fila de notificações" description="Lista persistida com leitura, prioridade e atalho para a ação relacionada.">
        <div className="space-y-3">
          {notificationsQuery.isLoading
            ? Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-24 w-full rounded-[24px]" />)
            : data?.items.map((item) => (
                <article key={item.id} className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-sky-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-sky-800">{notificationTypeLabels[item.type as keyof typeof notificationTypeLabels] ?? item.type}</span>
                        <span className={["rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em]", item.priority === "URGENTE" ? "bg-rose-100 text-rose-800" : item.priority === "ALTA" ? "bg-amber-100 text-amber-800" : item.priority === "MEDIA" ? "bg-cyan-100 text-cyan-800" : "bg-slate-100 text-slate-700"].join(" ")}>{priorityLabels[item.priority as keyof typeof priorityLabels] ?? item.priority}</span>
                        {item.read ? <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-700">Lida</span> : null}
                      </div>
                      <div>
                        <p className="text-base font-black text-slate-950">{item.title}</p>
                        <p className="mt-1 text-sm text-slate-600">{item.message}</p>
                        <p className="mt-2 text-xs text-slate-500">Atualizada em {formatShortDateTimeBR(item.updatedAt)}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      {item.href ? (
                        <Link href={item.href}>
                          <Button size="sm" variant="outline" onClick={() => { if (!item.read) void markReadMutation.mutateAsync({ notificationId: item.id }); }}>
                            Abrir
                          </Button>
                        </Link>
                      ) : null}
                      {!item.read ? (
                        <Button size="sm" onClick={() => void markReadMutation.mutateAsync({ notificationId: item.id })} disabled={markReadMutation.isPending}>
                          Marcar como lida
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}

          {!notificationsQuery.isLoading && !data?.items.length ? <Alert variant="info">Nenhuma notificação encontrada com os filtros atuais.</Alert> : null}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            Total localizado: <span className="font-bold text-slate-950">{data?.total ?? 0}</span>
          </p>
          <Pagination page={page} totalPages={data?.totalPages ?? 1} onPageChange={setPage} />
        </div>
      </SectionCard>
    </div>
  );
}


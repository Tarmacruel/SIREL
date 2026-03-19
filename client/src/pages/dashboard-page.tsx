import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  BriefcaseBusiness,
  CalendarClock,
  FileClock,
  FolderOpenDot,
  Landmark,
} from "lucide-react";
import { Link } from "wouter";

import { KpiCard } from "@/components/dashboard/kpi-card";
import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { formatCurrencyBRL, formatShortDateBR, formatShortDateTimeBR } from "@/lib/formatters";
import { trpc } from "@/lib/trpc";

const notificationTypeLabels = {
  PRAZO: "Prazo",
  MOVIMENTACAO: "Movimentação",
  DOCUMENTO: "Documento",
  SISTEMA: "Sistema",
} as const;

export function DashboardPage() {
  const utils = trpc.useUtils();
  const summaryQuery = trpc.dashboard.summary.useQuery(undefined, {
    retry: false,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const recentProcesses = trpc.processos.list.useQuery(
    { page: 1, pageSize: 6 },
    { retry: false, refetchInterval: 30_000, refetchOnWindowFocus: true },
  );
  const catalogos = trpc.cadastros.formOptions.useQuery(undefined, { retry: false });
  const markReadMutation = trpc.dashboard.markNotificationRead.useMutation({
    onSuccess: async () => {
      await utils.dashboard.summary.invalidate();
    },
  });
  const markAllMutation = trpc.dashboard.markAllNotificationsRead.useMutation({
    onSuccess: async () => {
      await utils.dashboard.summary.invalidate();
    },
  });

  const data =
    summaryQuery.data ?? {
      processosAtivos: 0,
      contratosVigentes: 0,
      valorGlobalEstimado: 0,
      prazosHoje: 0,
      prazos48h: 0,
      prazosAtrasados: 0,
      prazosSemana: 0,
      notificacoesPendentes: 0,
      porModulo: [],
      agendaHoje: [],
      notifications: [],
    };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiCard
          title="Processos ativos"
          value={String(data.processosAtivos)}
          hint="Processos em andamento na base Beta 2.0."
          icon={<FolderOpenDot className="h-5 w-5" />}
        />
        <KpiCard
          title="Contratos vigentes"
          value={String(data.contratosVigentes)}
          hint="Contratos vinculados a processos já formalizados."
          icon={<BriefcaseBusiness className="h-5 w-5" />}
        />
        <KpiCard
          title="Prazos hoje"
          value={String(data.prazosHoje)}
          hint="Eventos processuais que vencem hoje."
          icon={<CalendarClock className="h-5 w-5" />}
        />
        <KpiCard
          title="Próximas 48h"
          value={String(data.prazos48h)}
          hint="Prazos pendentes ou críticos no curto prazo."
          icon={<FileClock className="h-5 w-5" />}
        />
        <KpiCard
          title="Em atraso"
          value={String(data.prazosAtrasados)}
          hint="Prazos que exigem atuação imediata."
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <KpiCard
          title="Notificações"
          value={String(data.notificacoesPendentes)}
          hint="Alertas e movimentações recentes priorizadas."
          icon={<BellRing className="h-5 w-5" />}
        />
        <KpiCard
          title="Valor global"
          value={formatCurrencyBRL(data.valorGlobalEstimado)}
          hint="Soma dos valores estimados cadastrados."
          icon={<Landmark className="h-5 w-5" />}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard
          title="Painel operacional"
          description="Acompanhe a distribuição da carga por módulo e execute as ações mais recorrentes."
          action={
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">
              <BellRing className="h-4 w-4" />
              Atualização a cada 30s
            </div>
          }
        >
          {summaryQuery.error ? (
            <Alert variant="warning">Não foi possível carregar os indicadores em tempo real.</Alert>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-3">
              {[
                { label: "Secretarias", value: catalogos.data?.secretarias.length ?? 0 },
                { label: "Modalidades", value: catalogos.data?.modalidades.length ?? 0 },
                { label: "Pessoas", value: catalogos.data?.pessoas.length ?? 0 },
              ].map((item) => (
                  <article key={item.label} className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                    {catalogos.isLoading ? <Skeleton className="mt-3 h-10 w-20" /> : <p className="mt-2 text-2xl font-black text-slate-950">{item.value}</p>}
                  </article>
                ))}
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <article className="rounded-[28px] border border-slate-200 bg-white px-5 py-5">
                  <p className="text-sm font-semibold text-slate-900">Roteiro rápido de validação</p>
                  <ol className="mt-3 space-y-2 text-sm text-slate-600">
                    <li>1. Cadastre um processo novo no módulo de Processos.</li>
                    <li>2. Conclua DFD, ETP, cotações e TR no Planejamento.</li>
                    <li>3. Movimente o processo no Workflow até a Licitação.</li>
                    <li>4. Controle cronograma, documentos e atos no módulo de Licitação.</li>
                  </ol>
                </article>

                <article className="rounded-[28px] border border-slate-200 bg-white px-5 py-5">
                  <p className="text-sm font-semibold text-slate-900">Distribuição por módulo</p>
                  {summaryQuery.isLoading ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={index} className="h-20 w-full" />
                      ))}
                    </div>
                  ) : data.porModulo.length ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {data.porModulo.map((item) => (
                        <div key={item.modulo} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">{item.modulo}</p>
                          <p className="mt-2 text-2xl font-black text-slate-950">{item.total}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Alert variant="info" className="mt-3">
                      Nenhum processo em workflow no momento.
                    </Alert>
                  )}
                </article>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/processos">
                  <Button>
                    Ir para Processos
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/prazos">
                  <Button variant="outline">
                    Ir para Prazos
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/relatorios">
                  <Button variant="outline">
                    Ir para Relatórios
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/auditoria">
                  <Button variant="outline">
                    Ir para Auditoria
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </>
          )}
        </SectionCard>

        <SectionCard
          title="Notificações em tempo real"
          description="Feed operacional com prazos críticos, movimentações recentes e novos documentos."
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => void markAllMutation.mutateAsync()}
              disabled={markAllMutation.isPending || !data.notifications.some((item) => !item.read)}
            >
              Marcar todas como lidas
            </Button>
          }
        >
          <div className="space-y-3">
            {summaryQuery.isLoading
              ? Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-24 w-full rounded-[24px]" />)
              : data.notifications.map((item) => (
                  <article key={item.id} className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={[
                              "rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em]",
                              item.priority === "URGENTE" || item.priority === "ALTA"
                                ? "bg-rose-100 text-rose-800"
                                : item.priority === "MEDIA"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-sky-100 text-sky-800",
                            ].join(" ")}
                          >
                            {notificationTypeLabels[item.type as keyof typeof notificationTypeLabels] ?? item.type}
                          </span>
                          {item.read ? (
                            <span className="rounded-full bg-slate-200 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-700">
                              Lida
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-3 text-sm font-bold text-slate-950">{item.title}</p>
                        <p className="mt-1 text-sm text-slate-600">{item.message}</p>
                        <p className="mt-2 text-xs text-slate-500">{formatShortDateTimeBR(item.createdAt)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link href={item.href ?? "/"}>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (!item.read) {
                                void markReadMutation.mutateAsync({ notificationId: item.id });
                              }
                            }}
                          >
                            Abrir
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </Link>
                        {!item.read ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void markReadMutation.mutateAsync({ notificationId: item.id })}
                            disabled={markReadMutation.isPending}
                          >
                            Marcar como lida
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}

            {!summaryQuery.isLoading && !data.notifications.length ? (
              <Alert variant="info">Nenhuma notificação pendente no momento.</Alert>
            ) : null}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="Agenda crítica da operação" description="Prazos que vencem hoje ou dentro das próximas 48 horas.">
          <div className="overflow-hidden rounded-[28px] border border-slate-200">
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>Processo</TableHeaderCell>
                  <TableHeaderCell>Prazo</TableHeaderCell>
                  <TableHeaderCell>Data prevista</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {summaryQuery.isLoading
                  ? Array.from({ length: 4 }).map((_, index) => (
                      <TableRow key={index}>
                        <TableCell colSpan={4}>
                          <Skeleton className="h-12 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  : data.agendaHoje.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-bold text-slate-950">{item.numeroSirel}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-slate-900">{item.titulo}</div>
                          <div className="text-xs text-slate-500">{item.tipo}</div>
                        </TableCell>
                        <TableCell>{formatShortDateBR(item.dataPrevista)}</TableCell>
                        <TableCell>{item.status}</TableCell>
                      </TableRow>
                    ))}
                {!summaryQuery.isLoading && !data.agendaHoje.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-slate-500">
                      Nenhum prazo crítico na janela monitorada.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </SectionCard>

        <SectionCard title="Processos recentes" description="Amostra operacional dos últimos processos cadastrados ou atualizados.">
          <div className="overflow-hidden rounded-[28px] border border-slate-200">
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>Processo</TableHeaderCell>
                  <TableHeaderCell>Módulo</TableHeaderCell>
                  <TableHeaderCell>Valor estimado</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {recentProcesses.isLoading
                  ? Array.from({ length: 5 }).map((_, index) => (
                      <TableRow key={index}>
                        <TableCell colSpan={3}>
                          <Skeleton className="h-12 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  : recentProcesses.data?.items.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="font-bold text-slate-950">{row.numeroSirel}</div>
                          <div className="text-xs text-slate-500">{row.secretaria}</div>
                        </TableCell>
                        <TableCell>{row.moduloAtual ?? "Sem workflow"}</TableCell>
                        <TableCell>{row.valorEstimado ? formatCurrencyBRL(Number(row.valorEstimado)) : "-"}</TableCell>
                      </TableRow>
                    ))}
                {!recentProcesses.isLoading && !recentProcesses.data?.items.length ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-slate-500">
                      Nenhum processo criado ainda na base Beta 2.0.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

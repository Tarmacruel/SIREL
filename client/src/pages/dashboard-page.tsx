import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BellRing,
  BriefcaseBusiness,
  CalendarClock,
  CheckSquare,
  Clock3,
  FolderOpenDot,
  GitCompareArrows,
  Landmark,
  Search,
} from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";

import { KpiCard } from "@/components/dashboard/kpi-card";
import { ProcessoCreateModal } from "@/components/processos/processo-create-modal";
import { SimpleBarChart } from "@/components/dashboard/simple-bar-chart";
import { SimpleDonutChart } from "@/components/dashboard/simple-donut-chart";
import { SimpleLineChart } from "@/components/dashboard/simple-line-chart";
import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { formatCurrencyBRL, formatShortDateBR, formatShortDateTimeBR } from "@/lib/formatters";
import { trpc } from "@/lib/trpc";

const dashboardAgendaTypeLabels = {
  PRAZO: "Prazo",
  MOVIMENTACAO: "Movimentação",
  DOCUMENTO: "Documento",
  SISTEMA: "Sistema",
} as const;

const dashboardPriorityLabels = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  URGENTE: "Urgente",
} as const;

function buildDashboardSearchHref(row: { id: number; moduloAtual: string }) {
  if (row.moduloAtual === "LICITACAO") {
    return `/licitacao/${row.id}`;
  }
  return `/processos/${row.id}`;
}

export function DashboardPage() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchStatusId, setSearchStatusId] = useState("");
  const [searchModalidadeId, setSearchModalidadeId] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const deferredSearch = useDeferredValue(searchTerm.trim());

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

  const quickSearchInput = useMemo(
    () => ({
      termo: deferredSearch || undefined,
      statusId: searchStatusId ? Number(searchStatusId) : undefined,
      modalidadeId: searchModalidadeId ? Number(searchModalidadeId) : undefined,
      pagina: 1,
      limite: 5,
    }),
    [deferredSearch, searchModalidadeId, searchStatusId],
  );

  const quickSearchQuery = trpc.consultas.search.useQuery(quickSearchInput, {
    retry: false,
    enabled: Boolean(deferredSearch || searchStatusId || searchModalidadeId),
    placeholderData: (previous) => previous,
  });

  const data =
    summaryQuery.data ?? {
      processosAtivos: 0,
      contratosVigentes: 0,
      valorGlobalEstimado: 0,
      prazosHoje: 0,
      prazos24h: 0,
      prazos48h: 0,
      prazosAtrasados: 0,
      tarefasPendentesUsuario: 0,
      movimentacoesUltimas24h: 0,
      porModulo: [],
      processosPorSecretaria: [],
      modalidadesMaisUtilizadas: [],
      evolucaoMensal: [],
      minhaAgenda: [],
      agendaCritica: [],
      ultimasMovimentacoes: [],
    };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Alertas críticos de prazo"
        description="Prazos do dia e da janela de 48 horas que precisam ficar visíveis logo na abertura do sistema."
        action={
          <Link href="/prazos">
            <Button variant="outline" size="sm">
              Abrir painel de prazos
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[repeat(4,minmax(0,0.75fr))_minmax(0,1.3fr)]">
          <KpiCard title="Vencendo hoje" value={String(data.prazosHoje)} hint="Eventos que exigem atuação hoje." icon={<CalendarClock className="h-5 w-5" />} />
          <KpiCard title="Próximas 24h" value={String(data.prazos24h)} hint="Prazos com virada operacional imediata." icon={<Clock3 className="h-5 w-5" />} />
          <KpiCard title="Até 48h" value={String(data.prazos48h)} hint="Janela curta para alinhamento das equipes." icon={<Clock3 className="h-5 w-5" />} />
          <KpiCard title="Em atraso" value={String(data.prazosAtrasados)} hint="Ocorrências que pedem correção prioritária." icon={<AlertTriangle className="h-5 w-5" />} />

          <div className="rounded-[28px] border border-[rgba(204,225,255,0.95)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(230,240,255,0.8))] p-5 shadow-[0_14px_32px_-24px_rgba(15,26,109,0.3)]">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Fila crítica</p>
            <div className="mt-4 space-y-3">
              {summaryQuery.isLoading
                ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-16 w-full rounded-2xl" />)
                : data.agendaCritica.slice(0, 4).map((item) => (
                    <div key={item.id} className="rounded-2xl border border-[rgba(204,225,255,0.85)] bg-white/95 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-black text-[var(--color-primary-900)]">{item.numeroSirel}</p>
                          <p className="text-sm font-semibold text-[var(--color-neutral-700)]">{item.titulo}</p>
                        </div>
                        <span className={["rounded-full px-3 py-1 text-xs font-bold", item.status === "EM_ATRASO" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"].join(" ")}>{item.status === "EM_ATRASO" ? "Em atraso" : "Pendente"}</span>
                      </div>
                      <p className="mt-2 text-xs text-[var(--color-neutral-500)]">{formatShortDateBR(item.dataPrevista)} · {item.objeto.length > 90 ? `${item.objeto.slice(0, 87)}...` : item.objeto}</p>
                    </div>
                  ))}
              {!summaryQuery.isLoading && !data.agendaCritica.length ? <Alert variant="info">Nenhum prazo crítico na janela monitorada.</Alert> : null}
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiCard title="Processos ativos hoje" value={String(data.processosAtivos)} hint="Processos em andamento na base Beta 2.0." icon={<FolderOpenDot className="h-5 w-5" />} />
        <KpiCard title="Contratos vigentes" value={String(data.contratosVigentes)} hint="Contratos vinculados a processos formalizados." icon={<BriefcaseBusiness className="h-5 w-5" />} />
        <KpiCard title="Tarefas pendentes" value={String(data.tarefasPendentesUsuario)} hint="Notificações ainda não tratadas pelo usuário." icon={<CheckSquare className="h-5 w-5" />} />
        <KpiCard title="Movimentações do time" value={String(data.movimentacoesUltimas24h)} hint="Eventos registrados nas últimas 24 horas." icon={<GitCompareArrows className="h-5 w-5" />} />
        <KpiCard title="Valor global" value={formatCurrencyBRL(data.valorGlobalEstimado)} hint="Soma dos valores estimados cadastrados." icon={<Landmark className="h-5 w-5" />} />
        <KpiCard title="Notificações pendentes" value={String(data.tarefasPendentesUsuario)} hint="Consulte o detalhe na Central de Notificações." icon={<BellRing className="h-5 w-5" />} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard
          title="Busca global inteligente"
          description="Localize processos por número SIREL, objeto, fornecedor e filtros rápidos de status ou modalidade."
          action={
            <Link href="/consultas">
              <Button variant="outline" size="sm">
                Ir para Consultas
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          }
        >
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_repeat(2,minmax(0,0.7fr))]">
            <FormField label="Busca textual">
              <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Número SIREL, objeto ou fornecedor" />
            </FormField>
            <FormField label="Status">
              <Select value={searchStatusId} onChange={(event) => setSearchStatusId(event.target.value)}>
                <option value="">Todos</option>
                {catalogos.data?.statusProcesso.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
              </Select>
            </FormField>
            <FormField label="Modalidade">
              <Select value={searchModalidadeId} onChange={(event) => setSearchModalidadeId(event.target.value)}>
                <option value="">Todas</option>
                {catalogos.data?.modalidades.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
              </Select>
            </FormField>
          </div>

          <div className="mt-4 space-y-3">
            {quickSearchQuery.isLoading && (deferredSearch || searchStatusId || searchModalidadeId)
              ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-20 w-full rounded-[24px]" />)
              : quickSearchQuery.data?.dados.map((row) => (
                  <Link key={row.id} href={buildDashboardSearchHref(row)}>
                    <button type="button" className="w-full rounded-[24px] border border-[rgba(204,225,255,0.85)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(230,240,255,0.66))] px-4 py-4 text-left transition hover:border-[rgba(65,105,225,0.45)] hover:bg-white">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[var(--color-primary-900)] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white">{row.numeroSirel}</span>
                        <span className="rounded-full bg-[var(--color-primary-100)] px-3 py-1 text-xs font-bold text-[var(--color-primary-800)]">{row.modalidade}</span>
                        <span className="rounded-full bg-[var(--color-neutral-100)] px-3 py-1 text-xs font-bold text-[var(--color-neutral-700)]">{row.status}</span>
                      </div>
                      <p className="mt-3 text-sm font-bold text-[var(--color-primary-900)]">{row.objetoResumo}</p>
                      <p className="mt-1 text-xs text-[var(--color-neutral-500)]">{row.secretariaNome} · módulo: {row.moduloAtual} · documentos: {row.documentos}</p>
                    </button>
                  </Link>
                ))}

            {!quickSearchQuery.isLoading && !quickSearchQuery.data?.dados.length && (deferredSearch || searchStatusId || searchModalidadeId) ? (
              <Alert variant="info">Nenhum processo localizado com os filtros informados.</Alert>
            ) : null}

            {!deferredSearch && !searchStatusId && !searchModalidadeId ? (
              <Alert variant="info">Digite um termo ou aplique filtros para receber sugestões rápidas com debounce automático.</Alert>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard
          title="Minha agenda"
          description="Próximas tarefas do usuário, prazos críticos do dia e atalhos frequentes para operação." 
          action={
            <Link href="/notificacoes">
              <Button variant="outline" size="sm">
                Central de Notificações
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          }
        >
          <div className="space-y-3">
            {summaryQuery.isLoading
              ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-20 w-full rounded-[24px]" />)
              : data.minhaAgenda.map((item) => (
                  <div key={item.id} className="rounded-[24px] border border-[rgba(204,225,255,0.82)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(230,240,255,0.58))] px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[var(--color-primary-100)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-800)]">{dashboardAgendaTypeLabels[item.type as keyof typeof dashboardAgendaTypeLabels] ?? item.type}</span>
                      <span className={["rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em]", item.priority === "URGENTE" ? "bg-rose-100 text-rose-800" : item.priority === "ALTA" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"].join(" ")}>{dashboardPriorityLabels[item.priority as keyof typeof dashboardPriorityLabels] ?? item.priority}</span>
                    </div>
                    <p className="mt-3 font-black text-[var(--color-primary-900)]">{item.title}</p>
                    <p className="mt-1 text-sm text-[var(--color-neutral-600)]">{item.message}</p>
                    <p className="mt-2 text-xs text-[var(--color-neutral-500)]">{formatShortDateTimeBR(item.createdAt)}</p>
                  </div>
                ))}

            {!summaryQuery.isLoading && !data.minhaAgenda.length ? <Alert variant="info">Nenhuma tarefa pendente no momento.</Alert> : null}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button size="sm" onClick={() => setCreateModalOpen(true)}>Novo processo</Button>
            <Link href="/prazos"><Button size="sm" variant="outline">Abrir prazos</Button></Link>
            <Link href="/relatorios"><Button size="sm" variant="outline">Gerar relatório</Button></Link>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard title="Processos por secretaria" description="Distribuição atual dos processos ativos por secretaria.">
          {summaryQuery.isLoading ? <Skeleton className="h-72 w-full rounded-[28px]" /> : <SimpleDonutChart items={data.processosPorSecretaria.map((item) => ({ label: item.secretaria, value: item.total }))} />}
        </SectionCard>
        <SectionCard title="Evolução mensal" description="Quantidade de processos criados nos últimos meses.">
          {summaryQuery.isLoading ? <Skeleton className="h-72 w-full rounded-[28px]" /> : <SimpleLineChart items={data.evolucaoMensal.map((item) => ({ label: item.mes, value: item.total }))} />}
        </SectionCard>
        <SectionCard title="Modalidades mais utilizadas" description="Volume recente por modalidade cadastrada.">
          {summaryQuery.isLoading ? <Skeleton className="h-72 w-full rounded-[28px]" /> : <SimpleBarChart items={data.modalidadesMaisUtilizadas.map((item) => ({ label: item.modalidade, value: item.total }))} />}
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard title="Últimas movimentações do time" description="Feed operacional recente do workflow para acompanhamento gerencial.">
          <div className="space-y-3">
            {summaryQuery.isLoading
              ? Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-20 w-full rounded-[24px]" />)
              : data.ultimasMovimentacoes.map((item) => (
                  <article key={item.id} className="rounded-[24px] border border-[rgba(204,225,255,0.88)] bg-white px-4 py-4 shadow-[0_12px_24px_-22px_rgba(15,26,109,0.2)]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-[var(--color-primary-900)]">{item.numeroSirel}</p>
                        <p className="mt-1 text-sm font-semibold text-[var(--color-neutral-700)]">{item.descricao}</p>
                        <p className="mt-2 text-xs text-[var(--color-neutral-500)]">{formatShortDateTimeBR(item.criadoEm)}</p>
                      </div>
                      <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-700)]">{item.moduloDestino}</span>
                    </div>
                  </article>
                ))}

            {!summaryQuery.isLoading && !data.ultimasMovimentacoes.length ? <Alert variant="info">Sem movimentações recentes registradas.</Alert> : null}
          </div>
        </SectionCard>

        <SectionCard title="Processos recentes" description="Amostra operacional dos últimos processos cadastrados ou atualizados.">
          <div className="overflow-hidden rounded-[28px] border border-slate-200">
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>Processo</TableHeaderCell>
                  <TableHeaderCell>Objeto</TableHeaderCell>
                  <TableHeaderCell>Módulo</TableHeaderCell>
                  <TableHeaderCell>Valor estimado</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {recentProcesses.isLoading
                  ? Array.from({ length: 5 }).map((_, index) => (
                      <TableRow key={index}>
                        <TableCell colSpan={4}><Skeleton className="h-12 w-full" /></TableCell>
                      </TableRow>
                    ))
                  : recentProcesses.data?.items.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="font-bold text-slate-950">{row.numeroSirel}</div>
                          <div className="text-xs text-slate-500">{row.secretaria}</div>
                        </TableCell>
                        <TableCell className="max-w-[320px]">{row.objeto}</TableCell>
                        <TableCell>{row.moduloAtual ?? "Sem workflow"}</TableCell>
                        <TableCell>{row.valorEstimado ? formatCurrencyBRL(Number(row.valorEstimado)) : "-"}</TableCell>
                      </TableRow>
                    ))}
                {!recentProcesses.isLoading && !recentProcesses.data?.items.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-slate-500">Nenhum processo criado ainda na base Beta 2.0.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      </div>

      <ProcessoCreateModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={(created) => {
          setLocation(`/processos/${created.id}`);
        }}
      />
    </div>
  );
}



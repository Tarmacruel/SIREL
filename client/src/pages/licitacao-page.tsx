import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Search } from "lucide-react";

import { licitacaoStatusLabels, licitacaoStatusOptions } from "@sirel/shared/const";
import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { formatShortDateTimeBR } from "@/lib/formatters";
import { trpc } from "@/lib/trpc";

function statusBadgeClass(status: string) {
  switch (status) {
    case "HOMOLOGACAO":
    case "CONTRATACAO":
      return "bg-emerald-100 text-emerald-800";
    case "RECURSOS":
      return "bg-amber-100 text-amber-800";
    case "FRACASSADA":
    case "CANCELADA":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-[var(--color-primary-100)] text-[var(--color-primary-800)]";
  }
}

export function LicitacaoPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | (typeof licitacaoStatusOptions)[number]>("");

  const deferredSearch = useDeferredValue(search.trim());
  const filters = useMemo(
    () => ({
      page,
      pageSize,
      search: deferredSearch || undefined,
      statusLicitacao: statusFilter || undefined,
    }),
    [deferredSearch, page, pageSize, statusFilter],
  );

  const summaryQuery = trpc.licitacao.summary.useQuery(undefined, { retry: false });
  const listQuery = trpc.licitacao.list.useQuery(filters, { retry: false, placeholderData: (previous) => previous });
  const rows = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-4">
        <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(230,240,255,0.78))] px-5 py-5 shadow-[0_12px_24px_-22px_rgba(15,26,109,0.2)]"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Em Licitação</p><p className="mt-2 text-3xl font-black text-[var(--color-primary-900)]">{summaryQuery.data?.total ?? 0}</p><p className="mt-2 text-sm text-[var(--color-neutral-600)]">Processos ativos dentro do módulo de Licitação.</p></article>
        <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(230,240,255,0.78))] px-5 py-5 shadow-[0_12px_24px_-22px_rgba(15,26,109,0.2)]"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Publicados</p><p className="mt-2 text-3xl font-black text-[var(--color-primary-900)]">{summaryQuery.data?.publicados ?? 0}</p><p className="mt-2 text-sm text-[var(--color-neutral-600)]">Com edital numerado e cronograma oficial em andamento.</p></article>
        <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(230,240,255,0.78))] px-5 py-5 shadow-[0_12px_24px_-22px_rgba(15,26,109,0.2)]"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Aguardando publicidade</p><p className="mt-2 text-3xl font-black text-[var(--color-primary-900)]">{summaryQuery.data?.aguardandoPublicacao ?? 0}</p><p className="mt-2 text-sm text-[var(--color-neutral-600)]">Com fase interna pendente ou cronograma ainda não fechado.</p></article>
        <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(230,240,255,0.78))] px-5 py-5 shadow-[0_12px_24px_-22px_rgba(15,26,109,0.2)]"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Recursos pendentes</p><p className="mt-2 text-3xl font-black text-[var(--color-primary-900)]">{summaryQuery.data?.recursosPendentes ?? 0}</p><p className="mt-2 text-sm text-[var(--color-neutral-600)]">Demandas recursais ainda sem decisão registrada.</p></article>
      </div>

      <SectionCard
        title="Módulo de Licitação"
        description="Fila operacional do módulo. Cada processo abre em tela própria para trabalhar a fase interna, os documentos do processo e a publicação com mais espaço."
      >
        <div className="mb-4 grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_220px_160px]">
          <FormField label="Buscar processo">
            <div className="flex items-center gap-2 rounded-[18px] border border-[rgba(209,213,219,0.92)] bg-white px-3 py-2">
              <Search className="h-4 w-4 text-[var(--color-neutral-400)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Processo, objeto, edital ou secretaria"
                className="w-full border-none bg-transparent text-sm text-[var(--color-neutral-700)] outline-none placeholder:text-[var(--color-neutral-400)]"
              />
            </div>
          </FormField>
          <FormField label="Status da Licitação">
            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "" | (typeof licitacaoStatusOptions)[number])}>
              <option value="">Todos</option>
              {licitacaoStatusOptions.map((item) => <option key={item} value={item}>{licitacaoStatusLabels[item]}</option>)}
            </Select>
          </FormField>
          <FormField label="Por página">
            <Select value={String(pageSize)} onChange={(event) => setPageSize(Number(event.target.value))}>
              {[12, 24, 48].map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
          </FormField>
        </div>

        {listQuery.isLoading ? (
          <div className="space-y-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-20 rounded-[24px]" />)}</div>
        ) : rows.length ? (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white shadow-[0_12px_24px_-24px_rgba(15,26,109,0.22)]">
              <Table className="min-w-[980px]">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Processo</TableHeaderCell>
                    <TableHeaderCell>Secretaria</TableHeaderCell>
                    <TableHeaderCell>Etapa</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Edital</TableHeaderCell>
                    <TableHeaderCell>Atualizado em</TableHeaderCell>
                    <TableHeaderCell className="text-right">Ações</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.processoId} className="transition hover:bg-[rgba(230,240,255,0.45)]">
                      <TableCell>
                        <div className="font-bold text-[var(--color-primary-900)]">{row.numeroSirel}</div>
                        <div className="text-xs text-[var(--color-neutral-500)]">{row.modalidade ?? "Licitação"}</div>
                      </TableCell>
                      <TableCell>{row.secretaria}</TableCell>
                      <TableCell>
                        <div className="font-semibold text-[var(--color-primary-900)]">{row.etapaAtual}</div>
                        <div className="text-xs text-[var(--color-neutral-500)]">{row.condutorNome ?? "Condutor definido apenas na publicação"}</div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusBadgeClass(row.statusLicitacao)}`}>{licitacaoStatusLabels[row.statusLicitacao]}</span>
                      </TableCell>
                      <TableCell>{row.numeroEdital ?? "Ainda não publicado"}</TableCell>
                      <TableCell>{formatShortDateTimeBR(row.atualizadoEm)}</TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/licitacao/${row.processoId}`}
                          className="inline-flex items-center gap-2 rounded-2xl border border-[rgba(47,84,196,0.28)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-primary-700)] shadow-[0_10px_24px_-22px_rgba(15,26,109,0.52)] transition hover:border-[rgba(47,84,196,0.45)] hover:bg-[var(--color-primary-50)] hover:text-[var(--color-primary-800)]"
                        >
                          Abrir fase
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary-100)] text-[var(--color-primary-700)]">
                            <ArrowRight className="h-4 w-4" />
                          </span>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[var(--color-neutral-600)]">Exibindo <span className="font-bold text-[var(--color-primary-900)]">{rows.length}</span> de <span className="font-bold text-[var(--color-primary-900)]">{total}</span> processos em Licitação.</p>
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </div>
        ) : listQuery.error ? (
          <Alert variant="error">Falha ao carregar a fila da Licitação.</Alert>
        ) : (
          <Alert variant="info">Nenhum processo está atualmente no módulo de Licitação.</Alert>
        )}
      </SectionCard>
    </div>
  );
}

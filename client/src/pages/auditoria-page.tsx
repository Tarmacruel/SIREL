import { History, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { Modal } from "@/components/shared/modal";
import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { formatShortDateTimeBR } from "@/lib/formatters";
import { trpc } from "@/lib/trpc";

function prettyJson(value: unknown) {
  if (value === null || value === undefined) return "Sem dados.";
  return JSON.stringify(value, null, 2);
}

export function AuditoriaPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [search, setSearch] = useState("");
  const [tabela, setTabela] = useState("");
  const [acao, setAcao] = useState<"" | "CREATE" | "UPDATE" | "DELETE">("");
  const [processoId, setProcessoId] = useState("");
  const [documentoId, setDocumentoId] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);

  const listFilters = useMemo(
    () => ({
      page,
      pageSize,
      search: search.trim() || undefined,
      tabela: tabela.trim() || undefined,
      acao: acao || undefined,
      processoId: processoId.trim() ? Number(processoId) : undefined,
      documentoId: documentoId.trim() ? Number(documentoId) : undefined,
    }),
    [acao, documentoId, page, pageSize, processoId, search, tabela],
  );

  const summaryQuery = trpc.auditoria.summary.useQuery(undefined, {
    retry: false,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const listQuery = trpc.auditoria.list.useQuery(listFilters, {
    retry: false,
    placeholderData: (previous) => previous,
  });

  const items = listQuery.data?.items ?? [];
  const selectedEntry = items.find((item) => item.id === selectedEntryId) ?? null;
  const totalPages = Math.max(1, Math.ceil((listQuery.data?.total ?? 0) / pageSize));

  return (
    <div className="space-y-6">
      <SectionCard
        title="Auditoria de alterações"
        description="Acompanhe o histórico rastreável de processos, documentos, workflow e demais entidades críticas."
        action={
          <div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-sky-800">
            <ShieldCheck className="h-4 w-4" />
            Rastreabilidade ativa
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {summaryQuery.isLoading
            ? Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-24 w-full rounded-[24px]" />)
            : [
                { label: "Eventos totais", value: summaryQuery.data?.total ?? 0 },
                { label: "Hoje", value: summaryQuery.data?.hoje ?? 0 },
                { label: "Processos", value: summaryQuery.data?.processos ?? 0 },
                { label: "Documentos", value: summaryQuery.data?.documentos ?? 0 },
                { label: "Alterações rastreáveis", value: summaryQuery.data?.alteracoesRastreaveis ?? 0 },
              ].map((item) => (
                <article key={item.label} className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                  <p className="mt-2 text-2xl font-black text-slate-950">{item.value.toLocaleString("pt-BR")}</p>
                </article>
              ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Filtros de auditoria"
        description="Refine a trilha por processo, documento, entidade e texto operacional."
        action={
          <Button variant="outline" size="sm" onClick={() => {
            setPage(1);
            setSearch("");
            setTabela("");
            setAcao("");
            setProcessoId("");
            setDocumentoId("");
          }}>
            Limpar filtros
          </Button>
        }
      >
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_repeat(5,minmax(0,0.72fr))]">
          <FormField label="Busca textual">
            <Input
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
              placeholder="Descrição, tabela ou usuário"
            />
          </FormField>
          <FormField label="Entidade">
            <Input
              value={tabela}
              onChange={(event) => {
                setPage(1);
                setTabela(event.target.value);
              }}
              placeholder="Ex.: processos"
            />
          </FormField>
          <FormField label="Ação">
            <Select
              value={acao}
              onChange={(event) => {
                setPage(1);
                setAcao(event.target.value as "" | "CREATE" | "UPDATE" | "DELETE");
              }}
            >
              <option value="">Todas</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
            </Select>
          </FormField>
          <FormField label="ID do processo">
            <Input
              value={processoId}
              onChange={(event) => {
                setPage(1);
                setProcessoId(event.target.value);
              }}
              placeholder="Número interno"
            />
          </FormField>
          <FormField label="ID do documento">
            <Input
              value={documentoId}
              onChange={(event) => {
                setPage(1);
                setDocumentoId(event.target.value);
              }}
              placeholder="Número interno"
            />
          </FormField>
          <FormField label="Listagem">
            <Select
              value={String(pageSize)}
              onChange={(event) => {
                setPage(1);
                setPageSize(Number(event.target.value));
              }}
            >
              {[10, 15, 25, 50].map((option) => (
                <option key={option} value={option}>
                  {option} por página
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      </SectionCard>

      {listQuery.error ? <Alert variant="error">Falha ao carregar a trilha de auditoria.</Alert> : null}

      <SectionCard
        title="Trilha detalhada"
        description="Cada linha mostra o contexto operacional e permite abrir o diff detalhado."
      >
        <div className="overflow-auto rounded-[28px] border border-slate-200">
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Data</TableHeaderCell>
                <TableHeaderCell>Entidade</TableHeaderCell>
                <TableHeaderCell>Ação</TableHeaderCell>
                <TableHeaderCell>Descrição</TableHeaderCell>
                <TableHeaderCell>Contexto</TableHeaderCell>
                <TableHeaderCell>Ações</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {listQuery.isLoading
                ? Array.from({ length: 6 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-12 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{formatShortDateTimeBR(item.criadoEm)}</TableCell>
                      <TableCell>
                        <div className="font-semibold text-slate-900">{item.tabela}</div>
                        <div className="text-xs text-slate-500">Registro #{item.registroId}</div>
                      </TableCell>
                      <TableCell>{item.acao}</TableCell>
                      <TableCell className="max-w-[320px]">
                        <div className="text-sm text-slate-700">{item.descricao ?? "Sem descrição adicional."}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.usuarioNome ?? "Sistema"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-slate-700">{item.processoNumeroSirel ?? "-"}</div>
                        <div className="text-xs text-slate-500">{item.documentoTitulo ?? item.prazoTitulo ?? "Sem documento/prazo vinculado"}</div>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => setSelectedEntryId(item.id)}>
                          <History className="h-4 w-4" />
                          Ver detalhe
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              {!listQuery.isLoading && !items.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-slate-500">
                    Nenhum evento de auditoria encontrado com os filtros informados.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            Total auditado: <span className="font-bold text-slate-950">{listQuery.data?.total ?? 0}</span>
          </p>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      </SectionCard>

      <SectionCard title="Últimas alterações rastreáveis" description="Resumo rápido dos eventos recentes com impacto operacional.">
        <div className="space-y-3">
          {summaryQuery.isLoading
            ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-20 w-full rounded-[24px]" />)
            : summaryQuery.data?.recent.map((item) => (
                <article key={item.id} className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-950">{item.tabela} · {item.acao}</p>
                      <p className="mt-1 text-sm text-slate-700">{item.descricao ?? "Sem descrição adicional."}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.usuarioNome ?? "Sistema"}</p>
                    </div>
                    <p className="text-xs text-slate-500">{formatShortDateTimeBR(item.criadoEm)}</p>
                  </div>
                </article>
              ))}
        </div>
      </SectionCard>

      <Modal
        open={Boolean(selectedEntry)}
        title="Detalhe da auditoria"
        description="Comparativo dos dados anteriores e atuais para apoiar análise técnica e rastreabilidade."
        onClose={() => setSelectedEntryId(null)}
        size="xl"
      >
        {selectedEntry ? (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Entidade</p>
                <p className="mt-2 font-bold text-slate-950">{selectedEntry.tabela}</p>
              </article>
              <article className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Ação</p>
                <p className="mt-2 font-bold text-slate-950">{selectedEntry.acao}</p>
              </article>
              <article className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Processo</p>
                <p className="mt-2 font-bold text-slate-950">{selectedEntry.processoNumeroSirel ?? "-"}</p>
              </article>
              <article className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Registrado em</p>
                <p className="mt-2 font-bold text-slate-950">{formatShortDateTimeBR(selectedEntry.criadoEm)}</p>
              </article>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
              <p className="text-sm font-semibold text-slate-900">Descrição operacional</p>
              <p className="mt-2 text-sm text-slate-700">{selectedEntry.descricao ?? "Sem descrição adicional."}</p>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <article className="rounded-[24px] border border-slate-200 bg-slate-950 px-4 py-4 text-white">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-300">Dados anteriores</p>
                <pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs leading-6 text-slate-100">{prettyJson(selectedEntry.dadosAnteriores)}</pre>
              </article>
              <article className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Dados novos</p>
                <pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs leading-6 text-slate-700">{prettyJson(selectedEntry.dadosNovos)}</pre>
              </article>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

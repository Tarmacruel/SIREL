import { useDeferredValue, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRightLeft, Search, Workflow } from "lucide-react";
import { Link } from "wouter";

import { workflowModuleOptions, workflowSituacaoOptions } from "@sirel/shared/const";
import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { validateWorkflowMoveForm } from "@/features/workflow/form";
import { formatCurrencyBRL, formatShortDateBR, formatShortDateTimeBR } from "@/lib/formatters";
import { trpc } from "@/lib/trpc";
import { mapZodFieldErrors } from "@/lib/zod-errors";

function toOptionalId(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function WorkflowPage() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [search, setSearch] = useState("");
  const [moduloAtual, setModuloAtual] = useState("");
  const [situacao, setSituacao] = useState("");
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null);
  const [moveForm, setMoveForm] = useState({
    moduloDestino: "PLANEJAMENTO",
    situacao: "RASCUNHO",
    etapaAtual: "Cadastro inicial",
    statusId: "",
    descricao: "",
    observacao: "",
  });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const deferredSearch = useDeferredValue(search.trim());
  const filters = useMemo(
    () => ({
      page,
      pageSize,
      search: deferredSearch || undefined,
      moduloAtual: moduloAtual || undefined,
      situacao: situacao || undefined,
    }),
    [deferredSearch, moduloAtual, page, pageSize, situacao],
  );

  const summaryQuery = trpc.workflow.summary.useQuery(undefined, { retry: false });
  const catalogQuery = trpc.cadastros.formOptions.useQuery(undefined, { retry: false });
  const listQuery = trpc.workflow.list.useQuery(filters, { retry: false, placeholderData: (previous) => previous });
  const rows = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, moduloAtual, pageSize, situacao]);

  useEffect(() => {
    if (!rows.length) {
      setSelectedProcessId(null);
      return;
    }
    if (!selectedProcessId || !rows.some((row) => row.processoId === selectedProcessId)) {
      setSelectedProcessId(rows[0].processoId);
    }
  }, [rows, selectedProcessId]);

  const detailQuery = trpc.workflow.byProcesso.useQuery(
    { processoId: selectedProcessId ?? 0 },
    { enabled: Boolean(selectedProcessId), retry: false },
  );

  useEffect(() => {
    const detail = detailQuery.data;
    if (!detail?.estado) return;

    setMoveForm((current) => ({
      ...current,
      moduloDestino: detail.estado.moduloAtual,
      situacao: detail.estado.situacao,
      etapaAtual: detail.estado.etapaAtual,
      descricao: current.descricao || `Processo movido para ${detail.estado.moduloAtual}`,
    }));
  }, [detailQuery.data]);

  const moveMutation = trpc.workflow.move.useMutation({
    onSuccess: async (_, variables) => {
      await Promise.all([
        utils.workflow.summary.invalidate(),
        utils.workflow.list.invalidate(),
        utils.workflow.byProcesso.invalidate({ processoId: variables.processoId }),
        utils.processos.list.invalidate(),
        utils.processos.overview.invalidate({ processoId: variables.processoId }),
        utils.dashboard.summary.invalidate(),
      ]);
      setFeedback(`Workflow do processo atualizado para ${variables.moduloDestino}.`);
      setErrorMessage(null);
      setFieldErrors({});
    },
    onError: (error) => {
      setFeedback(null);
      setErrorMessage(error.message);
    },
  });

  async function handleMoveProcesso(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProcessId) return;

    setFeedback(null);
    setErrorMessage(null);

    const parsed = validateWorkflowMoveForm({
      processoId: selectedProcessId,
      moduloDestino: moveForm.moduloDestino,
      situacao: moveForm.situacao,
      etapaAtual: moveForm.etapaAtual.trim(),
      statusId: toOptionalId(moveForm.statusId),
      descricao: moveForm.descricao.trim() || undefined,
      observacao: moveForm.observacao.trim() || undefined,
    });

    if (!parsed.success) {
      setFieldErrors(mapZodFieldErrors(parsed.error));
      setErrorMessage("Revise os dados da movimentação antes de registrar.");
      return;
    }

    setFieldErrors({});
    await moveMutation.mutateAsync(parsed.data);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-4">
        <article className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Workflows</p>
          <p className="mt-2 text-3xl font-black text-slate-950">{summaryQuery.data?.total ?? 0}</p>
          <p className="mt-2 text-sm text-slate-600">Processos com rastreabilidade ativa.</p>
        </article>
        <article className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Atualizados em 7 dias</p>
          <p className="mt-2 text-3xl font-black text-slate-950">{summaryQuery.data?.atualizadosUltimos7Dias ?? 0}</p>
          <p className="mt-2 text-sm text-slate-600">Movimentação recente.</p>
        </article>
        <article className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Em andamento</p>
          <p className="mt-2 text-3xl font-black text-slate-950">
            {summaryQuery.data?.porSituacao.find((item) => item.situacao === "EM_ANDAMENTO")?.total ?? 0}
          </p>
          <p className="mt-2 text-sm text-slate-600">Fluxos em execução.</p>
        </article>
        <article className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Aguardando</p>
          <p className="mt-2 text-3xl font-black text-slate-950">
            {summaryQuery.data?.porSituacao.find((item) => item.situacao === "AGUARDANDO")?.total ?? 0}
          </p>
          <p className="mt-2 text-sm text-slate-600">Dependentes de outro setor.</p>
        </article>
      </div>

      <SectionCard
        title="Workflow operacional"
        description="Fila consolidada com filtros, linha do tempo e movimentação manual entre módulos."
        action={
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px_150px]">
            <FormField label="Buscar" className="min-w-[240px]">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Processo, objeto ou secretaria"
                  className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                />
              </div>
            </FormField>
            <FormField label="Módulo">
              <Select value={moduloAtual} onChange={(event) => setModuloAtual(event.target.value)}>
                <option value="">Todos os módulos</option>
                {summaryQuery.data?.porModulo.map((item) => (
                  <option key={item.modulo} value={item.modulo}>
                    {item.modulo}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Situação">
              <Select value={situacao} onChange={(event) => setSituacao(event.target.value)}>
                <option value="">Todas as situações</option>
                {summaryQuery.data?.porSituacao.map((item) => (
                  <option key={item.situacao} value={item.situacao}>
                    {item.situacao}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Por página">
              <Select value={String(pageSize)} onChange={(event) => setPageSize(Number(event.target.value))}>
                {[12, 24, 48, 96].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        }
      >
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.95fr]">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white">
              <Table>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Processo</TableHeaderCell>
                    <TableHeaderCell>Etapa</TableHeaderCell>
                    <TableHeaderCell>Situação</TableHeaderCell>
                    <TableHeaderCell>Módulo</TableHeaderCell>
                    <TableHeaderCell>Última movimentação</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {rows.map((row) => {
                    const active = row.processoId === selectedProcessId;

                    return (
                      <TableRow
                        key={row.processoId}
                        onClick={() => setSelectedProcessId(row.processoId)}
                        className={["cursor-pointer transition", active ? "bg-sky-50/80" : "hover:bg-slate-50"].join(" ")}
                      >
                        <TableCell className="align-top">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-bold text-slate-950">{row.numeroSirel}</div>
                            {row.foraDoFluxo ? (
                              <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800">
                                Fora do fluxo
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-slate-500">{row.secretaria}</div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="font-semibold text-slate-950">{row.etapaAtual}</div>
                          <div className="text-xs text-slate-500">{row.statusProcesso ?? "Sem status"}</div>
                        </TableCell>
                        <TableCell className="align-top">
                          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                            {row.situacao}
                          </span>
                        </TableCell>
                        <TableCell className="align-top">{row.moduloAtual}</TableCell>
                        <TableCell className="align-top text-xs text-slate-600">
                          {row.ultimaMovimentacao ? (
                            <>
                              <div className="font-semibold text-slate-950">{row.ultimaMovimentacao.descricao}</div>
                              <div>{formatShortDateTimeBR(row.ultimaMovimentacao.criadoEm)}</div>
                            </>
                          ) : (
                            "Sem movimentação registrada"
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!rows.length ? (
                    <TableRow>
                      <TableCell className="py-8 text-center text-slate-500" colSpan={5}>
                        {listQuery.isFetching ? "Carregando workflows..." : "Nenhum workflow encontrado."}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600">
                Exibindo <span className="font-bold text-slate-950">{rows.length}</span> de{" "}
                <span className="font-bold text-slate-950">{total}</span> workflows.
              </p>
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </div>

          <div className="space-y-4">
            <SectionCard
              title="Painel do fluxo"
              description="Resumo do processo selecionado, com linha do tempo e movimentação manual."
              action={
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white">
                  <Workflow className="h-4 w-4" />
                  Operação guiada
                </div>
              }
            >
              {!selectedProcessId ? (
                <Alert variant="info">Selecione um workflow para visualizar o detalhe.</Alert>
              ) : detailQuery.isLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2, 3].map((item) => (
                    <Skeleton key={item} className="h-20" />
                  ))}
                </div>
              ) : detailQuery.error ? (
                <Alert variant="warning">Falha ao carregar o detalhe do workflow.</Alert>
              ) : (
                <div className="space-y-4">
                  <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Processo</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <h4 className="text-xl font-black text-slate-950">{detailQuery.data?.processo?.numeroSirel}</h4>
                          {detailQuery.data?.processo?.foraDoFluxo ? (
                            <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800">
                              Fora do fluxo
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-slate-600">{detailQuery.data?.processo?.secretaria}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-950 p-3 text-white">
                        <Workflow className="h-5 w-5" />
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-700">{detailQuery.data?.processo?.objeto}</p>
                  </article>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Módulo atual</p>
                      <p className="mt-2 text-lg font-black text-slate-950">{detailQuery.data?.estado?.moduloAtual ?? "-"}</p>
                      <p className="mt-1 text-sm text-slate-600">Etapa: {detailQuery.data?.estado?.etapaAtual ?? "-"}</p>
                    </article>
                    <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Publicidade</p>
                      <p className="mt-2 text-lg font-black text-slate-950">{detailQuery.data?.processo?.numeroEdital ?? "Edital ainda não gerado"}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {detailQuery.data?.processo?.condutorProcesso?.nome ?? "Condutor definido apenas na publicação"}
                      </p>
                    </article>
                    <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Valor estimado</p>
                      <p className="mt-2 text-lg font-black text-slate-950">{formatCurrencyBRL(detailQuery.data?.processo?.valorEstimado)}</p>
                      <p className="mt-1 text-sm text-slate-600">Abertura: {formatShortDateBR(detailQuery.data?.processo?.dataAbertura)}</p>
                    </article>
                    <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Documentos</p>
                      <p className="mt-2 text-lg font-black text-slate-950">{detailQuery.data?.documentos ?? 0}</p>
                      <p className="mt-1 text-sm text-slate-600">Itens já registrados para este processo.</p>
                    </article>
                  </div>

                  <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4">
                    <div className="mb-4 flex items-center gap-2">
                      <ArrowRightLeft className="h-4 w-4 text-sky-700" />
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Movimentar processo</p>
                    </div>

                    <form className="space-y-4" onSubmit={handleMoveProcesso}>
                      <div className="grid gap-3 md:grid-cols-2">
                        <FormField label="Destino" error={fieldErrors.moduloDestino}>
                          <Select
                            value={moveForm.moduloDestino}
                            error={Boolean(fieldErrors.moduloDestino)}
                            onChange={(event) => setMoveForm((current) => ({ ...current, moduloDestino: event.target.value }))}
                          >
                            {workflowModuleOptions.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </Select>
                        </FormField>
                        <FormField label="Situação" error={fieldErrors.situacao}>
                          <Select
                            value={moveForm.situacao}
                            error={Boolean(fieldErrors.situacao)}
                            onChange={(event) => setMoveForm((current) => ({ ...current, situacao: event.target.value }))}
                          >
                            {workflowSituacaoOptions.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </Select>
                        </FormField>
                      </div>

                      {moveForm.moduloDestino === "LICITACAO" ? (
                        <Alert variant="info">
                          Ao entrar em Licitação, o processo passa a ser operado no módulo específico da fase. O condutor e o número do edital continuam sendo definidos apenas no ato de publicação.
                        </Alert>
                      ) : null}

                      <FormField label="Etapa atual" error={fieldErrors.etapaAtual}>
                        <Input
                          value={moveForm.etapaAtual}
                          error={Boolean(fieldErrors.etapaAtual)}
                          onChange={(event) => setMoveForm((current) => ({ ...current, etapaAtual: event.target.value }))}
                        />
                      </FormField>

                      <div className="grid gap-3 md:grid-cols-2">
                        <FormField label="Status do processo" error={fieldErrors.statusId}>
                          <Select
                            value={moveForm.statusId}
                            error={Boolean(fieldErrors.statusId)}
                            onChange={(event) => setMoveForm((current) => ({ ...current, statusId: event.target.value }))}
                          >
                            <option value="">Manter atual</option>
                            {catalogQuery.data?.statusProcesso.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.nome}
                              </option>
                            ))}
                          </Select>
                        </FormField>
                        <FormField label="Descrição da movimentação" error={fieldErrors.descricao}>
                          <Input
                            value={moveForm.descricao}
                            error={Boolean(fieldErrors.descricao)}
                            onChange={(event) => setMoveForm((current) => ({ ...current, descricao: event.target.value }))}
                          />
                        </FormField>
                      </div>

                      <FormField label="Observação operacional" error={fieldErrors.observacao}>
                        <Textarea
                          rows={4}
                          error={Boolean(fieldErrors.observacao)}
                          value={moveForm.observacao}
                          onChange={(event) => setMoveForm((current) => ({ ...current, observacao: event.target.value }))}
                        />
                      </FormField>

                      {feedback ? <Alert variant="success">{feedback}</Alert> : null}
                      {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}

                      <Button type="submit" disabled={moveMutation.isPending}>
                        {moveMutation.isPending ? "Atualizando workflow..." : "Registrar movimentação"}
                      </Button>
                    </form>
                  </article>

                  {detailQuery.data?.estado?.moduloAtual === "LICITACAO" ? (
                    <Alert variant="info" title="Etapas específicas da Licitação">
                      Quando o processo chegar à Licitação, a publicidade, o condutor e a geração automática do edital passam a ser tratados no módulo de Licitação.
                      <div className="mt-4">
                        <Link
                          href="/licitacao"
                          className="inline-flex items-center justify-center rounded-2xl border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-800 transition hover:border-sky-300 hover:text-sky-900"
                        >
                          Abrir módulo de Licitação
                        </Link>
                      </div>
                    </Alert>
                  ) : null}

                  <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Linha do tempo</p>
                    <div className="mt-4 space-y-3">
                      {detailQuery.data?.historico.length ? (
                        detailQuery.data.historico.map((item) => (
                          <div key={item.id} className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-slate-950">{item.descricao}</p>
                                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  {item.moduloOrigem || "Entrada"} para {item.moduloDestino}
                                </p>
                              </div>
                              <span className="text-xs text-slate-500">{formatShortDateTimeBR(item.criadoEm)}</span>
                            </div>
                            {item.observacao ? <p className="mt-3 text-sm leading-6 text-slate-600">{item.observacao}</p> : null}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                          Nenhuma movimentação registrada para este processo.
                        </div>
                      )}
                    </div>
                  </article>
                </div>
              )}
            </SectionCard>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

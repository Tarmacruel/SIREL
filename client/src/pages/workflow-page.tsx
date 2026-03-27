import { useDeferredValue, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRightLeft, Edit, FileStack, Search, Workflow } from "lucide-react";
import { Link } from "wouter";

import { workflowModuleOptions, workflowSituacaoOptions } from "@sirel/shared/const";
import { Modal } from "@/components/shared/modal";
import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { validateWorkflowMoveForm } from "@/features/workflow/form";
import {
  formatCurrencyBRL,
  formatShortDateBR,
  formatShortDateTimeBR,
  maskCurrencyInputBR,
  normalizeCurrencyInputBR,
} from "@/lib/formatters";
import { resolveServerAssetUrl } from "@/lib/document-upload";
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
  const [openDocumentsModal, setOpenDocumentsModal] = useState(false);
  const [openEditDataModal, setOpenEditDataModal] = useState(false);
  const [editDataForm, setEditDataForm] = useState({
    numeroAdministrativo: "",
    numeroEdital: "",
    dataAbertura: "",
    secretariaId: "",
    modalidadeId: "",
    statusId: "",
    autoridadeCompetenteId: "",
    condutorProcessoId: "",
    objeto: "",
    valorEstimado: "",
    criterioJulgamento: "",
    modoDisputa: "",
    escopoDisputa: "",
    tipoObjeto: "",
    tipoContratacao: "",
    foraDoFluxo: false,
  });
  const [editDataErrors, setEditDataErrors] = useState<Record<string, string>>({});
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
  const displayedRows = selectedProcessId ? rows.filter((row) => row.processoId === selectedProcessId) : rows;
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
    if (selectedProcessId && rows.length && !rows.some((row) => row.processoId === selectedProcessId)) {
      setSelectedProcessId(null);
    }
  }, [rows, selectedProcessId]);

  const detailQuery = trpc.workflow.byProcesso.useQuery(
    { processoId: selectedProcessId ?? 0 },
    { enabled: Boolean(selectedProcessId), retry: false },
  );
  const documentosQuery = trpc.documentos.listByProcesso.useQuery(
    { processoId: selectedProcessId ?? 0 },
    { enabled: openDocumentsModal && Boolean(selectedProcessId), retry: false },
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

    // Preencher formulário de edição de dados
    // @ts-ignore - tipo será atualizado após compilação do servidor
    setEditDataForm((current) => ({
      ...current,
      numeroAdministrativo: detail.processo?.numeroAdministrativo ?? "",
      numeroEdital: detail.processo?.numeroEdital ?? "",
      dataAbertura: detail.processo?.dataAbertura ?? "",
      secretariaId: String(detail.processo?.secretariaId ?? ""),
      modalidadeId: String(detail.processo?.modalidadeId ?? ""),
      autoridadeCompetenteId: String(detail.processo?.autoridadeCompetenteId ?? ""),
      condutorProcessoId: String(detail.processo?.condutorProcessoId ?? ""),
      objeto: detail.processo?.objeto ?? "",
      valorEstimado: detail.processo?.valorEstimado
        ? formatCurrencyBRL(detail.processo.valorEstimado)
        : "",
      criterioJulgamento: detail.processo?.criterioJulgamento ?? "",
      modoDisputa: detail.processo?.modoDisputa ?? "",
      escopoDisputa: detail.processo?.escopoDisputa ?? "",
      tipoObjeto: detail.processo?.tipoObjeto ?? "",
      tipoContratacao: detail.processo?.tipoContratacao ?? "",
      foraDoFluxo: Boolean(detail.processo?.foraDoFluxo),
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
  const setAtivoMutation = trpc.processos.setAtivo.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.processos.summary.invalidate(),
        utils.processos.list.invalidate(),
        utils.processos.overview.invalidate({ processoId: result.id }),
        utils.workflow.summary.invalidate(),
        utils.workflow.list.invalidate(),
        utils.workflow.byProcesso.invalidate({ processoId: result.id }),
        utils.dashboard.summary.invalidate(),
        utils.consultas.search.invalidate(),
      ]);
      setFeedback(`Processo ${result.numeroSirel} ${result.ativo ? "reativado" : "inativado"} com sucesso.`);
      setErrorMessage(null);
    },
    onError: (error) => {
      setFeedback(null);
      setErrorMessage(error.message);
    },
  });

  const updateDataMutation = trpc.processos.updateData.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.processos.overview.invalidate({ processoId: result.id }),
        utils.workflow.byProcesso.invalidate({ processoId: result.id }),
        utils.processos.list.invalidate(),
        utils.workflow.list.invalidate(),
        utils.workflow.summary.invalidate(),
        utils.dashboard.summary.invalidate(),
      ]);
      setFeedback("Dados do processo atualizados com sucesso.");
      setErrorMessage(null);
      setEditDataErrors({});
      setOpenEditDataModal(false);
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

  async function handleEditData(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProcessId) return;

    setFeedback(null);
    setErrorMessage(null);
    setEditDataErrors({});

    const updatePayload: any = {
      processoId: selectedProcessId,
      foraDoFluxo: Boolean(editDataForm.foraDoFluxo),
    };

    if (editDataForm.numeroAdministrativo?.trim()) updatePayload.numeroAdministrativo = editDataForm.numeroAdministrativo.trim();
    if (editDataForm.numeroEdital?.trim()) updatePayload.numeroEdital = editDataForm.numeroEdital.trim();
    if (editDataForm.dataAbertura) updatePayload.dataAbertura = editDataForm.dataAbertura;
    if (editDataForm.secretariaId) updatePayload.secretariaId = Number(editDataForm.secretariaId);
    if (editDataForm.modalidadeId) updatePayload.modalidadeId = Number(editDataForm.modalidadeId);
    if (editDataForm.tipoObjeto) updatePayload.tipoObjeto = editDataForm.tipoObjeto as "PRODUTO" | "SERVICO" | "OBRA" | "SERVICO_ENG";
    if (editDataForm.tipoContratacao) updatePayload.tipoContratacao = editDataForm.tipoContratacao as "AQUISICAO" | "REGISTRO_PRECO" | "AQUISICAO_PARCELADA";
    if (editDataForm.autoridadeCompetenteId) updatePayload.autoridadeCompetenteId = Number(editDataForm.autoridadeCompetenteId);
    if (editDataForm.condutorProcessoId) updatePayload.condutorProcessoId = Number(editDataForm.condutorProcessoId);
    if (editDataForm.objeto?.trim()) updatePayload.objeto = editDataForm.objeto.trim();
    if (editDataForm.valorEstimado?.trim()) {
      const valorEstimado = normalizeCurrencyInputBR(editDataForm.valorEstimado);
      if (valorEstimado === undefined) {
        setEditDataErrors((current) => ({
          ...current,
          valorEstimado: "Informe um valor válido em reais (R$).",
        }));
        setErrorMessage("Revise o valor estimado antes de salvar.");
        return;
      }
      updatePayload.valorEstimado = valorEstimado;
    }
    if (editDataForm.criterioJulgamento?.trim()) updatePayload.criterioJulgamento = editDataForm.criterioJulgamento.trim();
    if (editDataForm.modoDisputa) updatePayload.modoDisputa = editDataForm.modoDisputa;
    if (editDataForm.escopoDisputa) updatePayload.escopoDisputa = editDataForm.escopoDisputa;

    await updateDataMutation.mutateAsync(updatePayload);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-4">
        <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(230,240,255,0.78))] px-5 py-5 shadow-[0_12px_24px_-22px_rgba(15,26,109,0.2)]">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Workflows</p>
          <p className="mt-2 text-3xl font-black text-[var(--color-primary-900)]">{summaryQuery.data?.total ?? 0}</p>
          <p className="mt-2 text-sm text-[var(--color-neutral-600)]">Processos com rastreabilidade ativa.</p>
        </article>
        <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(230,240,255,0.78))] px-5 py-5 shadow-[0_12px_24px_-22px_rgba(15,26,109,0.2)]">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Atualizados em 7 dias</p>
          <p className="mt-2 text-3xl font-black text-[var(--color-primary-900)]">{summaryQuery.data?.atualizadosUltimos7Dias ?? 0}</p>
          <p className="mt-2 text-sm text-[var(--color-neutral-600)]">Movimentação recente.</p>
        </article>
        <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(230,240,255,0.78))] px-5 py-5 shadow-[0_12px_24px_-22px_rgba(15,26,109,0.2)]">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Em andamento</p>
          <p className="mt-2 text-3xl font-black text-[var(--color-primary-900)]">
            {summaryQuery.data?.porSituacao.find((item) => item.situacao === "EM_ANDAMENTO")?.total ?? 0}
          </p>
          <p className="mt-2 text-sm text-[var(--color-neutral-600)]">Fluxos em execução.</p>
        </article>
        <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(230,240,255,0.78))] px-5 py-5 shadow-[0_12px_24px_-22px_rgba(15,26,109,0.2)]">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Aguardando</p>
          <p className="mt-2 text-3xl font-black text-[var(--color-primary-900)]">
            {summaryQuery.data?.porSituacao.find((item) => item.situacao === "AGUARDANDO")?.total ?? 0}
          </p>
          <p className="mt-2 text-sm text-[var(--color-neutral-600)]">Dependentes de outro setor.</p>
        </article>
      </div>

      <SectionCard
        title="Workflow operacional"
        description="Fila consolidada com filtros, linha do tempo e movimentação manual entre módulos."
      >
        <div className="mb-4 grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_220px_220px_150px]">
          <FormField label="Buscar" className="w-full">
            <div className="flex items-center gap-2 rounded-[18px] border border-[rgba(209,213,219,0.92)] bg-white px-3 py-2">
              <Search className="h-4 w-4 text-[var(--color-neutral-400)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Processo, objeto, etapa ou secretaria"
                className="w-full border-none bg-transparent text-sm text-[var(--color-neutral-700)] outline-none placeholder:text-[var(--color-neutral-400)]"
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

        <div className="space-y-4">
          <div className="overflow-x-auto rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white shadow-[0_12px_24px_-24px_rgba(15,26,109,0.22)]">
              <Table className="min-w-[820px]">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Processo</TableHeaderCell>
                    <TableHeaderCell>Etapa</TableHeaderCell>
                    <TableHeaderCell>Situação</TableHeaderCell>
                    <TableHeaderCell>Módulo</TableHeaderCell>
                    <TableHeaderCell>Última movimentação</TableHeaderCell>
                    <TableHeaderCell className="text-right">Documentos</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {displayedRows.map((row) => {
                    const active = row.processoId === selectedProcessId;

                    return (
                      <TableRow
                        key={row.processoId}
                        onClick={() =>
                          setSelectedProcessId((current) => (current === row.processoId ? null : row.processoId))
                        }
                        className={["cursor-pointer transition", active ? "bg-[var(--color-primary-50)]" : "hover:bg-[rgba(230,240,255,0.45)]"].join(" ")}
                      >
                        <TableCell className="align-top">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-bold text-[var(--color-primary-900)]">{row.numeroSirel}</div>
                            {row.foraDoFluxo ? (
                              <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800">
                                Fora do fluxo
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-[var(--color-neutral-500)]">{row.secretaria}</div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="font-semibold text-[var(--color-primary-900)]">{row.etapaAtual}</div>
                          <div className="text-xs text-[var(--color-neutral-500)]">{row.statusProcesso ?? "Sem status"}</div>
                        </TableCell>
                        <TableCell className="align-top">
                          <span className="inline-flex rounded-full bg-[var(--color-primary-50)] px-3 py-1 text-xs font-bold text-[var(--color-primary-700)]">
                            {row.situacao}
                          </span>
                        </TableCell>
                        <TableCell className="align-top">{row.moduloAtual}</TableCell>
                        <TableCell className="align-top text-xs text-[var(--color-neutral-600)]">
                          {row.ultimaMovimentacao ? (
                            <>
                              <div className="font-semibold text-[var(--color-primary-900)]">{row.ultimaMovimentacao.descricao}</div>
                              <div>{formatShortDateTimeBR(row.ultimaMovimentacao.criadoEm)}</div>
                            </>
                          ) : (
                            "Sem movimentação registrada"
                          )}
                        </TableCell>
                        <TableCell className="align-top text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedProcessId(row.processoId);
                              setOpenDocumentsModal(true);
                            }}
                          >
                            <FileStack className="mr-2 h-4 w-4" />
                            Documentos
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!displayedRows.length ? (
                    <TableRow>
                      <TableCell className="py-8 text-center text-[var(--color-neutral-500)]" colSpan={6}>
                        {listQuery.isFetching ? "Carregando workflows..." : "Nenhum workflow encontrado."}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--color-neutral-600)]">
              {selectedProcessId ? (
                <>
                  Exibindo <span className="font-bold text-[var(--color-primary-900)]">1</span> workflow selecionado de{" "}
                  <span className="font-bold text-[var(--color-primary-900)]">{total}</span>.
                </>
              ) : (
                <>
                  Exibindo <span className="font-bold text-[var(--color-primary-900)]">{displayedRows.length}</span> de{" "}
                  <span className="font-bold text-[var(--color-primary-900)]">{total}</span> workflows.
                </>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {selectedProcessId ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedProcessId(null)}>
                  Limpar seleção
                </Button>
              ) : null}
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </div>
        </div>

        {selectedProcessId ? (
          <SectionCard
            title="Painel do fluxo"
            description="Resumo do processo selecionado, com linha do tempo e movimentação manual em largura total."
            action={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setOpenDocumentsModal(true)}>
                  <FileStack className="mr-2 h-4 w-4" />
                  Documentos do processo
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setOpenEditDataModal(true)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Editar dados do processo
                </Button>
                {detailQuery.data?.processo ? (
                  <Button
                    type="button"
                    size="sm"
                    variant={detailQuery.data.processo.ativo ? "destructive" : "secondary"}
                    disabled={setAtivoMutation.isPending}
                    onClick={() =>
                      void setAtivoMutation.mutateAsync({
                        processoId: detailQuery.data!.processo!.id,
                        ativo: !detailQuery.data!.processo!.ativo,
                      })
                    }
                  >
                    {detailQuery.data.processo.ativo ? "Inativar processo" : "Reativar processo"}
                  </Button>
                ) : null}
                <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedProcessId(null)}>
                  Mostrar todos
                </Button>
                <div className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary-900)] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white">
                  <Workflow className="h-4 w-4" />
                  Operação guiada
                </div>
              </div>
            }
          >
            {detailQuery.isLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2, 3].map((item) => (
                    <Skeleton key={item} className="h-20" />
                  ))}
                </div>
              ) : detailQuery.error ? (
                <Alert variant="warning">Falha ao carregar o detalhe do workflow.</Alert>
              ) : (
                <div className="space-y-4">
                  <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(230,240,255,0.78))] px-5 py-5 shadow-[0_12px_24px_-24px_rgba(15,26,109,0.2)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Processo</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <h4 className="text-xl font-black text-[var(--color-primary-900)]">{detailQuery.data?.processo?.numeroSirel}</h4>
                          {detailQuery.data?.processo?.foraDoFluxo ? (
                            <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800">
                              Fora do fluxo
                            </span>
                          ) : null}
                          <span
                            className={[
                              "inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em]",
                              detailQuery.data?.processo?.ativo
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-[var(--color-neutral-100)] text-[var(--color-neutral-700)]",
                            ].join(" ")}
                          >
                            {detailQuery.data?.processo?.ativo ? "Ativo" : "Inativo"}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-[var(--color-neutral-600)]">{detailQuery.data?.processo?.secretaria}</p>
                      </div>
                      <div className="rounded-2xl bg-[var(--color-primary-900)] p-3 text-white">
                        <Workflow className="h-5 w-5" />
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[var(--color-neutral-700)]">{detailQuery.data?.processo?.objeto}</p>
                  </article>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4 shadow-[0_12px_24px_-26px_rgba(15,26,109,0.22)]">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Módulo atual</p>
                      <p className="mt-2 text-lg font-black text-[var(--color-primary-900)]">{detailQuery.data?.estado?.moduloAtual ?? "-"}</p>
                      <p className="mt-1 text-sm text-[var(--color-neutral-600)]">Etapa: {detailQuery.data?.estado?.etapaAtual ?? "-"}</p>
                    </article>
                    <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4 shadow-[0_12px_24px_-26px_rgba(15,26,109,0.22)]">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Publicidade</p>
                      <p className="mt-2 text-lg font-black text-[var(--color-primary-900)]">{detailQuery.data?.processo?.numeroEdital ?? "Edital ainda não gerado"}</p>
                      <p className="mt-1 text-sm text-[var(--color-neutral-600)]">
                        {detailQuery.data?.processo?.condutorProcesso?.nome ?? "Condutor definido apenas na publicação"}
                      </p>
                    </article>
                    <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4 shadow-[0_12px_24px_-26px_rgba(15,26,109,0.22)]">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Valor estimado</p>
                      <p className="mt-2 text-lg font-black text-[var(--color-primary-900)]">{formatCurrencyBRL(detailQuery.data?.processo?.valorEstimado)}</p>
                      <p className="mt-1 text-sm text-[var(--color-neutral-600)]">Abertura: {formatShortDateBR(detailQuery.data?.processo?.dataAbertura)}</p>
                    </article>
                    <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4 shadow-[0_12px_24px_-26px_rgba(15,26,109,0.22)]">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Documentos</p>
                      <p className="mt-2 text-lg font-black text-[var(--color-primary-900)]">{detailQuery.data?.documentos ?? 0}</p>
                      <p className="mt-1 text-sm text-[var(--color-neutral-600)]">Acervo já vinculado ao processo.</p>
                      <Button type="button" size="sm" variant="outline" className="mt-4" onClick={() => setOpenDocumentsModal(true)}>
                        <FileStack className="mr-2 h-4 w-4" />
                        Abrir documentos
                      </Button>
                    </article>
                  </div>

                  <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4 shadow-[0_12px_24px_-26px_rgba(15,26,109,0.22)]">
                    <div className="mb-4 flex items-center gap-2">
                      <ArrowRightLeft className="h-4 w-4 text-[var(--color-primary-700)]" />
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Movimentar processo</p>
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
                          href={selectedProcessId ? `/licitacao/${selectedProcessId}` : "/licitacao"}
                          className="inline-flex items-center justify-center rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-2.5 text-sm font-semibold text-[var(--color-primary-800)] transition hover:border-[rgba(65,105,225,0.35)] hover:text-[var(--color-primary-900)]"
                        >
                          Abrir fase da Licitação
                        </Link>
                      </div>
                    </Alert>
                  ) : null}

                  <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4 shadow-[0_12px_24px_-26px_rgba(15,26,109,0.22)]">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Linha do tempo</p>
                    <div className="mt-4 space-y-3">
                      {detailQuery.data?.historico.length ? (
                        detailQuery.data.historico.map((item) => (
                          <div key={item.id} className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-[var(--color-primary-900)]">{item.descricao}</p>
                                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--color-neutral-500)]">
                                  {item.moduloOrigem || "Entrada"} para {item.moduloDestino}
                                </p>
                              </div>
                              <span className="text-xs text-[var(--color-neutral-500)]">{formatShortDateTimeBR(item.criadoEm)}</span>
                            </div>
                            {item.observacao ? <p className="mt-3 text-sm leading-6 text-[var(--color-neutral-600)]">{item.observacao}</p> : null}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[28px] border border-dashed border-[rgba(65,105,225,0.22)] bg-[var(--color-primary-50)] px-4 py-6 text-sm text-[var(--color-neutral-500)]">
                          Nenhuma movimentação registrada para este processo.
                        </div>
                      )}
                    </div>
                  </article>
                </div>
              )}
            </SectionCard>
        ) : (
          <Alert variant="info">
            Selecione um processo na fila para centralizar o fluxo operacional na tela. Ao clicar novamente no mesmo processo, a lista completa volta a ser exibida.
          </Alert>
        )}
      </SectionCard>

      <Modal
        open={openDocumentsModal}
        onClose={() => setOpenDocumentsModal(false)}
        title={`Documentos do processo ${detailQuery.data?.processo?.numeroSirel ?? ""}`.trim()}
        description="Todos os documentos vinculados ao processo, em ordem de inclusão, para facilitar a conferência entre os setores."
        size="xl"
        actions={
          <div className="flex justify-end">
            <Button type="button" onClick={() => setOpenDocumentsModal(false)}>
              Fechar
            </Button>
          </div>
        }
      >
        {documentosQuery.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-16 w-full rounded-[24px]" />
            ))}
          </div>
        ) : documentosQuery.error ? (
          <Alert variant="error">Falha ao carregar os documentos do processo.</Alert>
        ) : !documentosQuery.data?.length ? (
          <Alert variant="info">Este processo ainda não possui documentos vinculados.</Alert>
        ) : (
          <div className="overflow-x-auto rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white shadow-[0_12px_24px_-24px_rgba(15,26,109,0.22)]">
            <Table className="min-w-[980px]">
              <TableHead>
                <tr>
                  <TableHeaderCell>#</TableHeaderCell>
                  <TableHeaderCell>Título</TableHeaderCell>
                  <TableHeaderCell>Tipo</TableHeaderCell>
                  <TableHeaderCell>Categoria</TableHeaderCell>
                  <TableHeaderCell>Data de referência</TableHeaderCell>
                  <TableHeaderCell>Adicionado em</TableHeaderCell>
                  <TableHeaderCell className="text-right">Arquivo</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {documentosQuery.data.map((item, index) => (
                  <TableRow key={item.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>
                      <div className="font-semibold text-[var(--color-primary-900)]">{item.titulo}</div>
                      <div className="text-xs text-[var(--color-neutral-500)]">Versão {item.versao}</div>
                    </TableCell>
                    <TableCell>{item.tipo}</TableCell>
                    <TableCell>{item.categoria ?? "-"}</TableCell>
                    <TableCell>{formatShortDateBR(item.dataReferencia)}</TableCell>
                    <TableCell>{formatShortDateTimeBR(item.criadoEm)}</TableCell>
                    <TableCell className="text-right">
                      {item.arquivoUrl ? (
                        <a href={resolveServerAssetUrl(item.arquivoUrl) ?? "#"} target="_blank" rel="noreferrer">
                          <Button type="button" size="sm" variant="outline">
                            Abrir
                          </Button>
                        </a>
                      ) : (
                        <span className="text-sm text-[var(--color-neutral-400)]">Sem arquivo</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Modal>

      <Modal
        open={openEditDataModal}
        onClose={() => setOpenEditDataModal(false)}
        title="Editar dados do processo"
        description="Atualize informações do processo como secretaria responsável, autoridade competente e outros dados operacionais."
        size="xl"
      >
        <form className="space-y-4" onSubmit={handleEditData}>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Secretaria responsável" error={editDataErrors.secretariaId}>
              <Select
                value={editDataForm.secretariaId}
                error={Boolean(editDataErrors.secretariaId)}
                onChange={(event) => setEditDataForm((current) => ({ ...current, secretariaId: event.target.value }))}
              >
                <option value="">Selecione</option>
                {catalogQuery.data?.secretarias.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sigla} - {item.nome}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Autoridade competente" error={editDataErrors.autoridadeCompetenteId}>
              <Select
                value={editDataForm.autoridadeCompetenteId}
                error={Boolean(editDataErrors.autoridadeCompetenteId)}
                onChange={(event) => setEditDataForm((current) => ({ ...current, autoridadeCompetenteId: event.target.value }))}
              >
                <option value="">Selecione</option>
                {catalogQuery.data?.pessoas.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                    {item.cargo ? ` - ${item.cargo}` : ""}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Modalidade">
              <Select
                value={editDataForm.modalidadeId}
                onChange={(event) => setEditDataForm((current) => ({ ...current, modalidadeId: event.target.value }))}
              >
                <option value="">Selecione</option>
                {catalogQuery.data?.modalidades.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Condutor do processo">
              <Select
                value={editDataForm.condutorProcessoId}
                onChange={(event) => setEditDataForm((current) => ({ ...current, condutorProcessoId: event.target.value }))}
              >
                <option value="">Selecione</option>
                {catalogQuery.data?.pessoas.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                    {item.cargo ? ` - ${item.cargo}` : ""}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <FormField label="Número administrativo">
              <Input
                value={editDataForm.numeroAdministrativo}
                onChange={(event) => setEditDataForm((current) => ({ ...current, numeroAdministrativo: event.target.value }))}
              />
            </FormField>
            <FormField label="Número do edital">
              <Input
                value={editDataForm.numeroEdital}
                onChange={(event) => setEditDataForm((current) => ({ ...current, numeroEdital: event.target.value }))}
              />
            </FormField>
            <FormField label="Data da sessão / abertura">
              <input
                type="date"
                value={editDataForm.dataAbertura}
                onChange={(event) => setEditDataForm((current) => ({ ...current, dataAbertura: event.target.value }))}
                className="w-full rounded-[10px] border border-[rgba(209,213,219,0.92)] bg-white px-3 py-2 text-sm outline-none"
              />
            </FormField>
          </div>

          <div className="rounded-3xl border border-[rgba(204,225,255,0.88)] bg-[var(--color-primary-50)] px-4 py-4">
            <label className="flex items-start gap-3">
              <Checkbox
                checked={editDataForm.foraDoFluxo}
                onChange={(event) =>
                  setEditDataForm((current) => ({
                    ...current,
                    foraDoFluxo: event.target.checked,
                  }))
                }
                className="mt-1"
              />
              <span className="space-y-1">
                <span className="block text-sm font-semibold text-[var(--color-primary-900)]">
                  Processo fora do fluxo
                </span>
                <span className="block text-sm text-[var(--color-neutral-600)]">
                  Marque para classificar este processo como excepcional e fora
                  do fluxo regular.
                </span>
              </span>
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Tipo de contratação">
              <Select
                value={editDataForm.tipoContratacao}
                onChange={(event) => setEditDataForm((current) => ({ ...current, tipoContratacao: event.target.value }))}
              >
                <option value="">Selecione</option>
                <option value="AQUISICAO">Aquisição</option>
                <option value="REGISTRO_PRECO">Registro de preço</option>
                <option value="AQUISICAO_PARCELADA">Aquisição parcelada</option>
              </Select>
            </FormField>
            <FormField label="Tipo de objeto">
              <Select
                value={editDataForm.tipoObjeto}
                onChange={(event) => setEditDataForm((current) => ({ ...current, tipoObjeto: event.target.value }))}
              >
                <option value="">Selecione</option>
                <option value="PRODUTO">Produto</option>
                <option value="SERVICO">Serviço</option>
                <option value="OBRA">Obra</option>
                <option value="SERVICO_ENG">Serviço de engenharia</option>
              </Select>
            </FormField>
          </div>

          <FormField label="Objeto do processo" error={editDataErrors.objeto}>
            <Textarea
              rows={4}
              value={editDataForm.objeto}
              error={Boolean(editDataErrors.objeto)}
              onChange={(event) => setEditDataForm((current) => ({ ...current, objeto: event.target.value }))}
            />
          </FormField>

          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Valor estimado" error={editDataErrors.valorEstimado}>
              <Input
                value={editDataForm.valorEstimado}
                error={Boolean(editDataErrors.valorEstimado)}
                placeholder="R$ 0,00"
                onChange={(event) =>
                  setEditDataForm((current) => ({
                    ...current,
                    valorEstimado: maskCurrencyInputBR(event.target.value),
                  }))
                }
              />
            </FormField>
            <FormField label="Critério de julgamento" error={editDataErrors.criterioJulgamento}>
              <Input
                value={editDataForm.criterioJulgamento}
                error={Boolean(editDataErrors.criterioJulgamento)}
                onChange={(event) => setEditDataForm((current) => ({ ...current, criterioJulgamento: event.target.value }))}
              />
            </FormField>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Modo de disputa" error={editDataErrors.modoDisputa}>
              <Select
                value={editDataForm.modoDisputa}
                error={Boolean(editDataErrors.modoDisputa)}
                onChange={(event) => setEditDataForm((current) => ({ ...current, modoDisputa: event.target.value }))}
              >
                <option value="">Selecione</option>
                {catalogQuery.data?.modoDisputa.map((item) => (
                  <option key={item.codigo} value={item.codigo}>
                    {item.nome}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Escopo da disputa" error={editDataErrors.escopoDisputa}>
              <Select
                value={editDataForm.escopoDisputa}
                error={Boolean(editDataErrors.escopoDisputa)}
                onChange={(event) => setEditDataForm((current) => ({ ...current, escopoDisputa: event.target.value }))}
              >
                <option value="">Selecione</option>
                <option value="GLOBAL">Global</option>
                <option value="LOTE">Lote</option>
                <option value="ITEM">Item</option>
              </Select>
            </FormField>
          </div>

          {feedback ? <Alert variant="success">{feedback}</Alert> : null}
          {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}

          <div className="flex justify-end gap-3 border-t border-[rgba(204,225,255,0.92)] pt-4">
            <Button type="button" variant="outline" onClick={() => setOpenEditDataModal(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={updateDataMutation.isPending}>
              {updateDataMutation.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}




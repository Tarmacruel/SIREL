import { useDeferredValue, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRightLeft, ChevronLeft, ChevronRight, Search, Workflow } from "lucide-react";
import { Link } from "wouter";

import { workflowModuleOptions, workflowSituacaoOptions } from "@sirel/shared/const";
import { SectionCard } from "@/components/shared/section-card";
import { trpc } from "@/lib/trpc";

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : dateTimeFormatter.format(date);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

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

  const deferredSearch = useDeferredValue(search.trim());
  const filters = useMemo(() => ({ page, pageSize, search: deferredSearch || undefined, moduloAtual: moduloAtual || undefined, situacao: situacao || undefined }), [deferredSearch, moduloAtual, page, pageSize, situacao]);

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

  const detailQuery = trpc.workflow.byProcesso.useQuery({ processoId: selectedProcessId ?? 0 }, { enabled: Boolean(selectedProcessId), retry: false });

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

    await moveMutation.mutateAsync({
      processoId: selectedProcessId,
      moduloDestino: moveForm.moduloDestino as (typeof workflowModuleOptions)[number],
      situacao: moveForm.situacao as (typeof workflowSituacaoOptions)[number],
      etapaAtual: moveForm.etapaAtual.trim(),
      statusId: toOptionalId(moveForm.statusId),
      descricao: moveForm.descricao.trim() || undefined,
      observacao: moveForm.observacao.trim() || undefined,
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-4">
        <article className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Workflows</p><p className="mt-2 text-3xl font-black text-slate-950">{summaryQuery.data?.total ?? 0}</p><p className="mt-2 text-sm text-slate-600">Processos com rastreabilidade ativa.</p></article>
        <article className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Atualizados em 7 dias</p><p className="mt-2 text-3xl font-black text-slate-950">{summaryQuery.data?.atualizadosUltimos7Dias ?? 0}</p><p className="mt-2 text-sm text-slate-600">Movimentacao recente.</p></article>
        <article className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Em andamento</p><p className="mt-2 text-3xl font-black text-slate-950">{summaryQuery.data?.porSituacao.find((item) => item.situacao === "EM_ANDAMENTO")?.total ?? 0}</p><p className="mt-2 text-sm text-slate-600">Fluxos em execucao.</p></article>
        <article className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Aguardando</p><p className="mt-2 text-3xl font-black text-slate-950">{summaryQuery.data?.porSituacao.find((item) => item.situacao === "AGUARDANDO")?.total ?? 0}</p><p className="mt-2 text-sm text-slate-600">Dependentes de outro setor.</p></article>
      </div>

      <SectionCard title="Workflow operacional" description="Fila consolidada com filtros, linha do tempo e movimentacao manual entre modulos." action={<div className="flex flex-wrap items-center gap-3"><label className="flex min-w-[240px] items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por processo, objeto ou secretaria" className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" /></label><select value={moduloAtual} onChange={(event) => setModuloAtual(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"><option value="">Todos os modulos</option>{summaryQuery.data?.porModulo.map((item) => <option key={item.modulo} value={item.modulo}>{item.modulo}</option>)}</select><select value={situacao} onChange={(event) => setSituacao(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"><option value="">Todas as situacoes</option>{summaryQuery.data?.porSituacao.map((item) => <option key={item.situacao} value={item.situacao}>{item.situacao}</option>)}</select><select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none">{[12, 24, 48, 96].map((option) => <option key={option} value={option}>{option} por pagina</option>)}</select></div>}>
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.95fr]">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.18em] text-slate-500"><tr><th className="px-4 py-3">Processo</th><th className="px-4 py-3">Etapa</th><th className="px-4 py-3">Situacao</th><th className="px-4 py-3">Modulo</th><th className="px-4 py-3">Ultima movimentacao</th></tr></thead>
                <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                  {rows.map((row) => {
                    const active = row.processoId === selectedProcessId;
                    return (
                      <tr key={row.processoId} onClick={() => setSelectedProcessId(row.processoId)} className={["cursor-pointer transition", active ? "bg-sky-50/80" : "hover:bg-slate-50"].join(" ")}>
                        <td className="px-4 py-3 align-top"><div className="flex flex-wrap items-center gap-2"><div className="font-bold text-slate-950">{row.numeroSirel}</div>{row.foraDoFluxo ? <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800">Fora do fluxo</span> : null}</div><div className="text-xs text-slate-500">{row.secretaria}</div></td>
                        <td className="px-4 py-3 align-top"><div className="font-semibold text-slate-950">{row.etapaAtual}</div><div className="text-xs text-slate-500">{row.statusProcesso ?? "Sem status"}</div></td>
                        <td className="px-4 py-3 align-top"><span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{row.situacao}</span></td>
                        <td className="px-4 py-3 align-top">{row.moduloAtual}</td>
                        <td className="px-4 py-3 align-top text-xs text-slate-600">{row.ultimaMovimentacao ? <><div className="font-semibold text-slate-950">{row.ultimaMovimentacao.descricao}</div><div>{formatDateTime(row.ultimaMovimentacao.criadoEm)}</div></> : "Sem movimentacao registrada"}</td>
                      </tr>
                    );
                  })}
                  {!rows.length && <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={5}>{listQuery.isFetching ? "Carregando workflows..." : "Nenhum workflow encontrado. Cadastre um processo para iniciar os testes."}</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600">Exibindo <span className="font-bold text-slate-950">{rows.length}</span> de <span className="font-bold text-slate-950">{total}</span> workflows.</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-45"><ChevronLeft className="h-4 w-4" />Anterior</button>
                <div className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">Pagina {page} de {totalPages}</div>
                <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-45">Proxima<ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <SectionCard title="Painel do fluxo" description="Resumo do processo selecionado, com linha do tempo e movimentacao manual." action={<div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white"><Workflow className="h-4 w-4" />Operacao guiada</div>}>
              {!selectedProcessId ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">Selecione um workflow para visualizar o detalhe.</div>
              ) : detailQuery.isLoading ? (
                <div className="space-y-3">{[0, 1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-3xl bg-slate-100" />)}</div>
              ) : detailQuery.error ? (
                <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">Falha ao carregar o detalhe do workflow.</div>
              ) : (
                <div className="space-y-4">
                  <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Processo</p><div className="mt-2 flex flex-wrap items-center gap-2"><h4 className="text-xl font-black text-slate-950">{detailQuery.data?.processo?.numeroSirel}</h4>{detailQuery.data?.processo?.foraDoFluxo ? <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800">Fora do fluxo</span> : null}</div><p className="mt-1 text-sm text-slate-600">{detailQuery.data?.processo?.secretaria}</p></div><div className="rounded-2xl bg-slate-950 p-3 text-white"><Workflow className="h-5 w-5" /></div></div><p className="mt-3 text-sm leading-6 text-slate-700">{detailQuery.data?.processo?.objeto}</p></article>
                  <div className="grid gap-3 sm:grid-cols-2"><article className="rounded-3xl border border-slate-200 bg-white px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Modulo atual</p><p className="mt-2 text-lg font-black text-slate-950">{detailQuery.data?.estado?.moduloAtual ?? "-"}</p><p className="mt-1 text-sm text-slate-600">Etapa: {detailQuery.data?.estado?.etapaAtual ?? "-"}</p></article><article className="rounded-3xl border border-slate-200 bg-white px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Publicidade</p><p className="mt-2 text-lg font-black text-slate-950">{detailQuery.data?.processo?.numeroEdital ?? "Edital ainda nao gerado"}</p><p className="mt-1 text-sm text-slate-600">{detailQuery.data?.processo?.condutorProcesso?.nome ?? "Condutor definido apenas na publicacao"}</p></article></div>
                  <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4">
                    <div className="mb-4 flex items-center gap-2"><ArrowRightLeft className="h-4 w-4 text-sky-700" /><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Movimentar processo</p></div>
                    <form className="space-y-4" onSubmit={handleMoveProcesso}>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Destino</span><select value={moveForm.moduloDestino} onChange={(event) => setMoveForm((current) => ({ ...current, moduloDestino: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400">{workflowModuleOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                        <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Situacao</span><select value={moveForm.situacao} onChange={(event) => setMoveForm((current) => ({ ...current, situacao: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400">{workflowSituacaoOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                      </div>

                      {moveForm.moduloDestino === "LICITACAO" ? (
                        <div className="rounded-3xl border border-sky-100 bg-sky-50 px-4 py-4 text-sm text-sky-900">
                          <p className="font-semibold">Entrada em Licitacao</p>
                          <p className="mt-1 leading-6 text-sky-800">Ao entrar em Licitacao, o processo passa a ser operado no modulo de Licitacao. O condutor e o numero do edital continuam sendo definidos apenas no ato de publicacao.</p>
                        </div>
                      ) : null}

                      <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Etapa atual</span><input required value={moveForm.etapaAtual} onChange={(event) => setMoveForm((current) => ({ ...current, etapaAtual: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400" /></label>

                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Status do processo</span><select value={moveForm.statusId} onChange={(event) => setMoveForm((current) => ({ ...current, statusId: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400"><option value="">Manter atual</option>{catalogQuery.data?.statusProcesso.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
                        <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Descricao da movimentacao</span><input value={moveForm.descricao} onChange={(event) => setMoveForm((current) => ({ ...current, descricao: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400" /></label>
                      </div>

                      <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Observacao operacional</span><textarea rows={4} value={moveForm.observacao} onChange={(event) => setMoveForm((current) => ({ ...current, observacao: event.target.value }))} className="w-full rounded-3xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 outline-none transition focus:border-sky-400" /></label>

                      {feedback ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{feedback}</div> : null}
                      {errorMessage ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{errorMessage}</div> : null}

                      <button type="submit" disabled={moveMutation.isPending} className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">{moveMutation.isPending ? "Atualizando workflow..." : "Registrar movimentacao"}</button>
                    </form>
                  </article>

                  {detailQuery.data?.estado?.moduloAtual === "LICITACAO" ? (
                    <article className="rounded-3xl border border-sky-100 bg-sky-50 px-4 py-4 text-sm text-sky-900">
                      <p className="font-semibold">Etapas especificas da Licitacao</p>
                      <p className="mt-1 leading-6 text-sky-800">Quando o processo chegar a Licitacao, a publicidade, o condutor e a geracao automatica do edital passam a ser tratados no modulo de Licitacao, separado do cadastro geral de processos.</p>
                      <div className="mt-4">
                        <Link href="/licitacao" className="inline-flex items-center justify-center rounded-2xl border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-800 transition hover:border-sky-300 hover:text-sky-900">
                          Abrir modulo de Licitacao
                        </Link>
                      </div>
                    </article>
                  ) : null}

                  <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Linha do tempo</p>
                    <div className="mt-4 space-y-3">
                      {detailQuery.data?.historico.length ? detailQuery.data.historico.map((item) => <div key={item.id} className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-950">{item.descricao}</p><p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{item.moduloOrigem || "Entrada"} para {item.moduloDestino}</p></div><span className="text-xs text-slate-500">{formatDateTime(item.criadoEm)}</span></div>{item.observacao ? <p className="mt-3 text-sm leading-6 text-slate-600">{item.observacao}</p> : null}</div>) : <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">Nenhuma movimentacao registrada para este processo.</div>}
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

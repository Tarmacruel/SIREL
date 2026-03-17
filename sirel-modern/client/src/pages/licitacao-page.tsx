import { useDeferredValue, useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Megaphone, Search, ScrollText } from "lucide-react";

import { SectionCard } from "@/components/shared/section-card";
import { trpc } from "@/lib/trpc";

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : dateTimeFormatter.format(date);
}

function toOptionalId(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function LicitacaoPage() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [search, setSearch] = useState("");
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null);
  const [publishForm, setPublishForm] = useState({
    statusId: "",
    condutorProcessoId: "",
    descricao: "",
    observacao: "",
  });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const deferredSearch = useDeferredValue(search.trim());
  const filters = useMemo(
    () => ({
      page,
      pageSize,
      search: deferredSearch || undefined,
      moduloAtual: "LICITACAO" as const,
    }),
    [deferredSearch, page, pageSize],
  );

  const catalogQuery = trpc.cadastros.formOptions.useQuery(undefined, { retry: false });
  const listQuery = trpc.workflow.list.useQuery(filters, { retry: false, placeholderData: (previous) => previous });
  const rows = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const publicados = rows.filter((row) => row.publicado).length;
  const aguardandoPublicacao = rows.filter((row) => !row.publicado).length;

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, pageSize]);

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
    if (!detail?.processo) return;
    setPublishForm((current) => ({
      ...current,
      condutorProcessoId: detail.processo?.condutorProcesso?.id ? String(detail.processo.condutorProcesso.id) : current.condutorProcessoId,
      descricao: current.descricao || "Processo publicado",
    }));
  }, [detailQuery.data]);

  const publishMutation = trpc.workflow.publish.useMutation({
    onSuccess: async (_, variables) => {
      await Promise.all([
        utils.workflow.summary.invalidate(),
        utils.workflow.list.invalidate(),
        utils.workflow.byProcesso.invalidate({ processoId: variables.processoId }),
        utils.processos.list.invalidate(),
        utils.processos.overview.invalidate({ processoId: variables.processoId }),
        utils.dashboard.summary.invalidate(),
      ]);
      setFeedback("Processo publicado com sucesso.");
      setErrorMessage(null);
    },
    onError: (error) => {
      setFeedback(null);
      setErrorMessage(error.message);
    },
  });

  async function handlePublishProcesso(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProcessId) return;
    setFeedback(null);
    setErrorMessage(null);

    await publishMutation.mutateAsync({
      processoId: selectedProcessId,
      condutorProcessoId: Number(publishForm.condutorProcessoId),
      statusId: toOptionalId(publishForm.statusId),
      descricao: publishForm.descricao.trim() || undefined,
      observacao: publishForm.observacao.trim() || undefined,
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-4">
        <article className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Em Licitação</p><p className="mt-2 text-3xl font-black text-slate-950">{total}</p><p className="mt-2 text-sm text-slate-600">Processos atualmente dentro da fase licitatória.</p></article>
        <article className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Publicados</p><p className="mt-2 text-3xl font-black text-slate-950">{publicados}</p><p className="mt-2 text-sm text-slate-600">Com condutor e número de edital já definidos.</p></article>
        <article className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Aguardando publicidade</p><p className="mt-2 text-3xl font-black text-slate-950">{aguardandoPublicacao}</p><p className="mt-2 text-sm text-slate-600">Processos em Licitação que ainda não foram publicados.</p></article>
        <article className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Operação do módulo</p><p className="mt-2 text-3xl font-black text-slate-950">Fase</p><p className="mt-2 text-sm text-slate-600">Publicidade, edital e controle específico da licitação.</p></article>
      </div>

      <SectionCard
        title="Módulo de Licitação"
        description="Esta tela não substitui o cadastro geral de Processos. Aqui ficam apenas as etapas específicas da fase licitatória."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 sm:min-w-[260px] sm:flex-1">
              <Search className="h-4 w-4 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por processo, objeto ou secretaria" className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" />
            </label>
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none">
              {[12, 24, 48].map((option) => <option key={option} value={option}>{option} por página</option>)}
            </select>
          </div>
        }
      >
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.95fr]">
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white">
              <table className="min-w-[820px] divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Processo</th>
                    <th className="px-4 py-3">Secretaria</th>
                    <th className="px-4 py-3">Etapa</th>
                    <th className="px-4 py-3">Publicidade</th>
                    <th className="px-4 py-3">Última movimentação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                  {rows.map((row) => {
                    const active = row.processoId === selectedProcessId;
                    return (
                      <tr key={row.processoId} onClick={() => setSelectedProcessId(row.processoId)} className={["cursor-pointer transition", active ? "bg-sky-50/80" : "hover:bg-slate-50"].join(" ")}>
                        <td className="px-4 py-3 align-top">
                          <div className="font-bold text-slate-950">{row.numeroSirel}</div>
                          <div className="text-xs text-slate-500">{row.modalidade ?? "Modalidade não definida"}</div>
                        </td>
                        <td className="px-4 py-3 align-top">{row.secretaria}</td>
                        <td className="px-4 py-3 align-top">
                          <div className="font-semibold text-slate-950">{row.etapaAtual}</div>
                          <div className="text-xs text-slate-500">{row.statusProcesso ?? "Sem status"}</div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className={["inline-flex rounded-full px-3 py-1 text-xs font-bold", row.publicado ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"].join(" ")}>
                            {row.publicado ? "Publicado" : "Pendente"}
                          </span>
                          <div className="mt-2 text-xs text-slate-500">{row.numeroEdital ?? "Edital ainda não gerado"}</div>
                        </td>
                        <td className="px-4 py-3 align-top text-xs text-slate-600">
                          {row.ultimaMovimentacao ? (
                            <>
                              <div className="font-semibold text-slate-950">{row.ultimaMovimentacao.descricao}</div>
                              <div>{formatDateTime(row.ultimaMovimentacao.criadoEm)}</div>
                            </>
                          ) : (
                            "Sem movimentação registrada"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!rows.length ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-slate-500" colSpan={5}>
                        {listQuery.isFetching ? "Carregando processos da Licitação..." : "Nenhum processo está na fase de Licitação. Use o Workflow para mover um processo para este módulo."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600">Exibindo <span className="font-bold text-slate-950">{rows.length}</span> de <span className="font-bold text-slate-950">{total}</span> processos em Licitação.</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-45"><ChevronLeft className="h-4 w-4" />Anterior</button>
                <div className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">Página {page} de {totalPages}</div>
                <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-45">Próxima<ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <SectionCard
              title="Painel da fase"
              description="Controle da publicidade e do edital apenas para o processo selecionado em Licitação."
              action={<div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white"><ScrollText className="h-4 w-4" />Operação específica</div>}
            >
              {!selectedProcessId ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">Selecione um processo da fase de Licitação para operar.</div>
              ) : detailQuery.isLoading ? (
                <div className="space-y-3">{[0, 1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-3xl bg-slate-100" />)}</div>
              ) : detailQuery.error ? (
                <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">Falha ao carregar o detalhe da Licitação.</div>
              ) : (
                <div className="space-y-4">
                  <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Processo em Licitação</p>
                        <h4 className="mt-2 text-xl font-black text-slate-950">{detailQuery.data?.processo?.numeroSirel}</h4>
                        <p className="mt-1 text-sm text-slate-600">{detailQuery.data?.processo?.secretaria}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-950 p-3 text-white">
                        <Megaphone className="h-5 w-5" />
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-700">{detailQuery.data?.processo?.objeto}</p>
                  </article>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Etapa atual</p><p className="mt-2 text-lg font-black text-slate-950">{detailQuery.data?.estado?.etapaAtual ?? "-"}</p><p className="mt-1 text-sm text-slate-600">{detailQuery.data?.processo?.modalidade ?? "Modalidade não definida"}</p></article>
                    <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Publicidade</p><p className="mt-2 text-lg font-black text-slate-950">{detailQuery.data?.processo?.numeroEdital ?? "Não publicado"}</p><p className="mt-1 text-sm text-slate-600">{detailQuery.data?.processo?.condutorProcesso?.nome ?? "Condutor ainda não definido"}</p></article>
                  </div>

                  {detailQuery.data?.processo?.publicado ? (
                    <article className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
                      <p className="font-semibold">Processo publicado</p>
                      <p className="mt-1 leading-6">Edital: {detailQuery.data.processo.numeroEdital ?? "-"}</p>
                      <p className="mt-1 leading-6">Condutor: {detailQuery.data.processo.condutorProcesso?.nome ?? "-"}</p>
                      <p className="mt-1 leading-6">As demais etapas específicas da Licitação podem continuar a partir desta base.</p>
                    </article>
                  ) : (
                    <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4">
                      <div className="mb-4 flex items-center gap-2"><Megaphone className="h-4 w-4 text-sky-700" /><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Publicidade do processo</p></div>
                      <form className="space-y-4" onSubmit={handlePublishProcesso}>
                        <div className="rounded-3xl border border-sky-100 bg-sky-50 px-4 py-4 text-sm text-sky-900">
                          <p className="font-semibold">Regra da publicação</p>
                          <p className="mt-1 leading-6 text-sky-800">Ao publicar, o sistema exige o condutor e gera automaticamente o número do edital no padrão da modalidade, por exemplo `PE-001-2026`.</p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Condutor do processo</span><select value={publishForm.condutorProcessoId} onChange={(event) => setPublishForm((current) => ({ ...current, condutorProcessoId: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400"><option value="">Selecione</option>{catalogQuery.data?.pessoas.map((item) => <option key={item.id} value={item.id}>{item.nome} {item.cargo ? `- ${item.cargo}` : ""}</option>)}</select></label>
                          <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Status do processo</span><select value={publishForm.statusId} onChange={(event) => setPublishForm((current) => ({ ...current, statusId: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400"><option value="">Manter atual</option>{catalogQuery.data?.statusProcesso.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
                        </div>
                        <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Descrição da publicação</span><input value={publishForm.descricao} onChange={(event) => setPublishForm((current) => ({ ...current, descricao: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400" /></label>
                        <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Observação da publicação</span><textarea rows={3} value={publishForm.observacao} onChange={(event) => setPublishForm((current) => ({ ...current, observacao: event.target.value }))} className="w-full rounded-3xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 outline-none transition focus:border-sky-400" /></label>

                        {feedback ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{feedback}</div> : null}
                        {errorMessage ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{errorMessage}</div> : null}

                        <button type="submit" disabled={publishMutation.isPending || !publishForm.condutorProcessoId} className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">{publishMutation.isPending ? "Publicando processo..." : "Publicar processo"}</button>
                      </form>
                    </article>
                  )}

                  <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Linha do tempo da fase</p>
                    <div className="mt-4 space-y-3">
                      {detailQuery.data?.historico.length ? detailQuery.data.historico.map((item) => <div key={item.id} className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-950">{item.descricao}</p><p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{item.moduloOrigem || "Entrada"} para {item.moduloDestino}</p></div><span className="text-xs text-slate-500">{formatDateTime(item.criadoEm)}</span></div>{item.observacao ? <p className="mt-3 text-sm leading-6 text-slate-600">{item.observacao}</p> : null}</div>) : <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">Nenhuma movimentação registrada para este processo.</div>}
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

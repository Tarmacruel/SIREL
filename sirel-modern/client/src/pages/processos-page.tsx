import { useDeferredValue, useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Filter, PlusCircle, Search } from "lucide-react";

import { workflowModuleOptions } from "@sirel/shared/const";
import { SectionCard } from "@/components/shared/section-card";
import { trpc } from "@/lib/trpc";

const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

const initialProcessoForm = {
  numeroAdministrativo: "",
  anoReferencia: String(new Date().getFullYear()),
  secretariaId: "",
  modalidadeId: "",
  statusId: "",
  autoridadeCompetenteId: "",
  objeto: "",
  valorEstimado: "",
  escopoDisputa: "GLOBAL",
  criterioJulgamento: "MENOR PRECO",
  modoDisputa: "NAO_SE_APLICA",
  tipoObjeto: "PRODUTO",
  tipoContratacao: "AQUISICAO",
  dataAbertura: "",
  foraDoFluxo: false,
  moduloInicial: "DOCUMENTOS",
};

function formatCurrency(value: string | null) {
  if (!value) return "-";
  const amount = Number(value);
  return Number.isFinite(amount) ? currencyFormatter.format(amount) : "-";
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function toOptionalId(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function toOptionalNumber(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function ProcessosPage() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [search, setSearch] = useState("");
  const [secretariaId, setSecretariaId] = useState("");
  const [statusId, setStatusId] = useState("");
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null);
  const [form, setForm] = useState(initialProcessoForm);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const deferredSearch = useDeferredValue(search.trim());
  const filters = useMemo(
    () => ({
      page,
      pageSize,
      search: deferredSearch || undefined,
      secretariaId: toOptionalId(secretariaId),
      statusId: toOptionalId(statusId),
    }),
    [deferredSearch, page, pageSize, secretariaId, statusId],
  );

  const catalogQuery = trpc.cadastros.formOptions.useQuery(undefined, { retry: false });
  const query = trpc.processos.list.useQuery(filters, { retry: false, placeholderData: (previous) => previous });
  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, pageSize, secretariaId, statusId]);

  useEffect(() => {
    const catalogs = catalogQuery.data;
    if (!catalogs) return;
    setForm((current) => ({
      ...current,
      secretariaId: current.secretariaId || String(catalogs.secretarias[0]?.id ?? ""),
      modalidadeId: current.modalidadeId || String(catalogs.modalidades[0]?.id ?? ""),
      statusId: current.statusId || String(catalogs.statusProcesso[0]?.id ?? ""),
      autoridadeCompetenteId: current.autoridadeCompetenteId || String(catalogs.pessoas[0]?.id ?? ""),
      moduloInicial: current.moduloInicial || String(catalogs.workflowModules.find((item) => item !== "PLANEJAMENTO") ?? "DOCUMENTOS"),
    }));
    setSecretariaId((current) => current || String(catalogs.secretarias[0]?.id ?? ""));
  }, [catalogQuery.data]);

  useEffect(() => {
    if (!rows.length) {
      setSelectedProcessId(null);
      return;
    }
    if (!selectedProcessId || !rows.some((row) => row.id === selectedProcessId)) {
      setSelectedProcessId(rows[0].id);
    }
  }, [rows, selectedProcessId]);

  const overviewQuery = trpc.processos.overview.useQuery(
    { processoId: selectedProcessId ?? 0 },
    { enabled: Boolean(selectedProcessId), retry: false },
  );

  const createMutation = trpc.processos.create.useMutation({
    onSuccess: async (created) => {
      await Promise.all([
        utils.processos.list.invalidate(),
        utils.dashboard.summary.invalidate(),
        utils.workflow.list.invalidate(),
        utils.workflow.summary.invalidate(),
      ]);
      setSelectedProcessId(created.id);
      setForm((current) => ({
        ...initialProcessoForm,
        anoReferencia: current.anoReferencia,
        secretariaId: current.secretariaId,
        modalidadeId: current.modalidadeId,
        statusId: current.statusId,
        autoridadeCompetenteId: current.autoridadeCompetenteId,
        moduloInicial: current.moduloInicial,
      }));
      setFormError(null);
      setFormMessage(`Processo ${created.numeroSirel} criado. Agora a DFD pode ser iniciada no Planejamento e o edital sera gerado na publicidade.`);
    },
    onError: (error) => {
      setFormMessage(null);
      setFormError(error.message);
    },
  });

  const selectedProcess = rows.find((row) => row.id === selectedProcessId) ?? rows[0] ?? null;

  async function handleCreateProcesso(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormMessage(null);
    setFormError(null);

    await createMutation.mutateAsync({
      numeroAdministrativo: form.numeroAdministrativo.trim() || undefined,
      anoReferencia: Number(form.anoReferencia),
      secretariaId: Number(form.secretariaId),
      modalidadeId: toOptionalId(form.modalidadeId),
      statusId: toOptionalId(form.statusId),
      autoridadeCompetenteId: toOptionalId(form.autoridadeCompetenteId),
      objeto: form.objeto.trim(),
      valorEstimado: toOptionalNumber(form.valorEstimado),
      escopoDisputa: form.escopoDisputa as "ITEM" | "LOTE" | "GLOBAL",
      criterioJulgamento: form.criterioJulgamento.trim() || undefined,
      modoDisputa: form.modoDisputa as "NAO_SE_APLICA" | "ABERTO" | "FECHADO" | "ABERTO_FECHADO" | "FECHADO_ABERTO",
      tipoObjeto: form.tipoObjeto as "PRODUTO" | "SERVICO" | "OBRA" | "SERVICO_ENG",
      tipoContratacao: form.tipoContratacao as "AQUISICAO" | "REGISTRO_PRECO" | "AQUISICAO_PARCELADA",
      dataAbertura: form.dataAbertura || undefined,
      foraDoFluxo: form.foraDoFluxo,
      moduloInicial: form.foraDoFluxo ? (form.moduloInicial as (typeof workflowModuleOptions)[number]) : undefined,
    });
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Processos"
        description="Cadastro mestre dos processos. O fluxo nasce no Planejamento, o Workflow move entre modulos e a Licitacao cuida apenas das etapas especificas da fase licitatoria."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex min-w-[260px] items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por numero, objeto ou secretaria" className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" />
            </label>
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              <Filter className="h-4 w-4" />
              <span>Por pagina</span>
              <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 outline-none">
                {[12, 24, 48, 96].map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          </div>
        }
      >
        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.95fr]">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Registros</p><p className="mt-2 text-2xl font-black text-slate-950">{total}</p><p className="mt-1 text-sm text-slate-600">Processos recriados no beta.</p></article>
              <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Secretarias</p><p className="mt-2 text-2xl font-black text-slate-950">{catalogQuery.data?.secretarias.length ?? 0}</p><p className="mt-1 text-sm text-slate-600">Catalogo base importado.</p></article>
              <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Modalidades</p><p className="mt-2 text-2xl font-black text-slate-950">{catalogQuery.data?.modalidades.length ?? 0}</p><p className="mt-1 text-sm text-slate-600">Lista canonica controlada.</p></article>
              <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Pessoas</p><p className="mt-2 text-2xl font-black text-slate-950">{catalogQuery.data?.pessoas.length ?? 0}</p><p className="mt-1 text-sm text-slate-600">Autoridades disponiveis.</p></article>
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-[28px] border border-slate-200 bg-white px-4 py-4">
              <select value={secretariaId} onChange={(event) => setSecretariaId(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none">
                <option value="">Todas as secretarias</option>
                {catalogQuery.data?.secretarias.map((item) => <option key={item.id} value={item.id}>{item.sigla} - {item.nome}</option>)}
              </select>
              <select value={statusId} onChange={(event) => setStatusId(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none">
                <option value="">Todos os status</option>
                {catalogQuery.data?.statusProcesso.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
              </select>
              <div className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">Pagina {page} de {totalPages}</div>
            </div>

            <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500"><tr><th className="px-4 py-3">Processo</th><th className="px-4 py-3">Secretaria</th><th className="px-4 py-3">Modalidade</th><th className="px-4 py-3">Modulo</th><th className="px-4 py-3">Abertura</th><th className="px-4 py-3 text-right">Valor estimado</th></tr></thead>
                <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                  {rows.map((row) => {
                    const active = row.id === selectedProcessId;
                    return (
                      <tr key={row.id} onClick={() => setSelectedProcessId(row.id)} className={["cursor-pointer transition", active ? "bg-sky-50/80" : "hover:bg-slate-50"].join(" ")}>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-bold text-slate-950">{row.numeroSirel}</div>
                            {row.foraDoFluxo ? <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800">Fora do fluxo</span> : null}
                          </div>
                          <div className="text-xs text-slate-500">{row.numeroEdital ?? "Edital ainda nao gerado"}</div>
                        </td>
                        <td className="px-4 py-3 align-top">{row.secretaria}</td>
                        <td className="px-4 py-3 align-top">{row.modalidade ?? "Nao informada"}</td>
                        <td className="px-4 py-3 align-top"><span className="inline-flex rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white">{row.moduloAtual ?? "Sem workflow"}</span></td>
                        <td className="px-4 py-3 align-top">{formatDate(row.dataAbertura)}</td>
                        <td className="px-4 py-3 text-right align-top font-semibold text-slate-950">{formatCurrency(row.valorEstimado)}</td>
                      </tr>
                    );
                  })}
                  {!rows.length && (
                    <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={6}>{query.isFetching ? "Carregando processos..." : "Nenhum processo cadastrado ainda. Use o formulario ao lado para iniciar os testes."}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600">Exibindo <span className="font-bold text-slate-950">{rows.length}</span> de <span className="font-bold text-slate-950">{total}</span> processos.</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-45"><ChevronLeft className="h-4 w-4" />Anterior</button>
                <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-45">Proxima<ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <SectionCard title="Cadastro rapido" description="O processo nasce no Planejamento. Em casos excepcionais, ative a tag de fora do fluxo e escolha o modulo inicial." action={<div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-sky-800"><PlusCircle className="h-4 w-4" />Beta operacional</div>}>
              <form className="space-y-4" onSubmit={handleCreateProcesso}>
                <div className="rounded-3xl border border-sky-100 bg-sky-50 px-4 py-4 text-sm text-sky-900">
                  <p className="font-semibold">Regras automaticas</p>
                  <ul className="mt-2 space-y-1 text-sm leading-6 text-sky-800"><li>Numero SIREL gerado automaticamente.</li><li>Numero do edital gerado apenas na publicidade, dentro do modulo de Licitacao.</li><li>Condutor definido apenas na publicacao do processo.</li></ul>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Ano de referencia</span><input required type="number" min={2020} max={2100} value={form.anoReferencia} onChange={(event) => setForm((current) => ({ ...current, anoReferencia: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400" /></label>
                  <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Numero administrativo</span><input value={form.numeroAdministrativo} onChange={(event) => setForm((current) => ({ ...current, numeroAdministrativo: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400" /></label>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Secretaria</span><select required value={form.secretariaId} onChange={(event) => setForm((current) => ({ ...current, secretariaId: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400"><option value="">Selecione</option>{catalogQuery.data?.secretarias.map((item) => <option key={item.id} value={item.id}>{item.sigla} - {item.nome}</option>)}</select></label>
                  <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Modalidade</span><select value={form.modalidadeId} onChange={(event) => setForm((current) => ({ ...current, modalidadeId: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400"><option value="">Selecione</option>{catalogQuery.data?.modalidades.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Status inicial</span><select value={form.statusId} onChange={(event) => setForm((current) => ({ ...current, statusId: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400"><option value="">Selecione</option>{catalogQuery.data?.statusProcesso.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
                  <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Valor estimado</span><input value={form.valorEstimado} onChange={(event) => setForm((current) => ({ ...current, valorEstimado: event.target.value }))} placeholder="0,00" className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400" /></label>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Autoridade competente</span><select value={form.autoridadeCompetenteId} onChange={(event) => setForm((current) => ({ ...current, autoridadeCompetenteId: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400"><option value="">Selecione</option>{catalogQuery.data?.pessoas.map((item) => <option key={item.id} value={item.id}>{item.nome} {item.cargo ? `- ${item.cargo}` : ""}</option>)}</select></label>
                  <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Modo de disputa</span><select value={form.modoDisputa} onChange={(event) => setForm((current) => ({ ...current, modoDisputa: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400">{catalogQuery.data?.modoDisputa.map((item) => <option key={item.codigo} value={item.codigo}>{item.nome}</option>)}</select></label>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Escopo</span><select value={form.escopoDisputa} onChange={(event) => setForm((current) => ({ ...current, escopoDisputa: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400"><option value="GLOBAL">Global</option><option value="LOTE">Lote</option><option value="ITEM">Item</option></select></label>
                  <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Tipo de objeto</span><select value={form.tipoObjeto} onChange={(event) => setForm((current) => ({ ...current, tipoObjeto: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400"><option value="PRODUTO">Produto</option><option value="SERVICO">Servico</option><option value="OBRA">Obra</option><option value="SERVICO_ENG">Servico de engenharia</option></select></label>
                  <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Tipo de contratacao</span><select value={form.tipoContratacao} onChange={(event) => setForm((current) => ({ ...current, tipoContratacao: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400"><option value="AQUISICAO">Aquisicao</option><option value="REGISTRO_PRECO">Registro de preco</option><option value="AQUISICAO_PARCELADA">Aquisicao parcelada</option></select></label>
                </div>

                <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Criterio de julgamento</span><input value={form.criterioJulgamento} onChange={(event) => setForm((current) => ({ ...current, criterioJulgamento: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400" /></label>
                <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Objeto</span><textarea required rows={5} value={form.objeto} onChange={(event) => setForm((current) => ({ ...current, objeto: event.target.value }))} placeholder="Descreva o objeto do processo com clareza suficiente para iniciar os testes da Beta 2.0." className="w-full rounded-3xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 outline-none transition focus:border-sky-400" /></label>
                <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Data prevista de abertura</span><div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5"><CalendarDays className="h-4 w-4 text-slate-400" /><input type="date" value={form.dataAbertura} onChange={(event) => setForm((current) => ({ ...current, dataAbertura: event.target.value }))} className="w-full border-none bg-transparent text-sm outline-none" /></div></label>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <label className="flex items-start gap-3">
                    <input type="checkbox" checked={form.foraDoFluxo} onChange={(event) => setForm((current) => ({ ...current, foraDoFluxo: event.target.checked }))} className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                    <span className="space-y-1"><span className="block text-sm font-semibold text-slate-800">Processo fora do fluxo</span><span className="block text-sm text-slate-600">Use apenas para casos excepcionais criados em outro departamento. O processo recebera a tag de fora do fluxo.</span></span>
                  </label>
                </div>

                {form.foraDoFluxo ? (
                  <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Modulo inicial excepcional</span><select value={form.moduloInicial} onChange={(event) => setForm((current) => ({ ...current, moduloInicial: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400">{catalogQuery.data?.workflowModules.filter((item) => item !== "PLANEJAMENTO").map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                ) : null}

                {formMessage ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{formMessage}</div> : null}
                {formError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{formError}</div> : null}

                <div className="flex flex-wrap gap-3">
                  <button type="submit" disabled={createMutation.isPending} className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">{createMutation.isPending ? "Salvando processo..." : "Salvar processo"}</button>
                  <button type="button" onClick={() => { setForm((current) => ({ ...initialProcessoForm, anoReferencia: current.anoReferencia, secretariaId: current.secretariaId, modalidadeId: current.modalidadeId, statusId: current.statusId, autoridadeCompetenteId: current.autoridadeCompetenteId, moduloInicial: current.moduloInicial })); setFormMessage(null); setFormError(null); }} className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700">Limpar formulario</button>
                </div>
              </form>
            </SectionCard>

            <SectionCard title="Visao geral do processo" description="Resumo rapido do processo selecionado para conferencia durante os testes.">
              {!selectedProcess ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">Nenhum processo disponivel para detalhamento.</div>
              ) : overviewQuery.isLoading ? (
                <div className="space-y-3">{[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-3xl bg-slate-100" />)}</div>
              ) : overviewQuery.error ? (
                <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">Falha ao carregar o resumo do processo selecionado.</div>
              ) : (
                <div className="space-y-4">
                  <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-xl font-black text-slate-950">{selectedProcess.numeroSirel}</h4>
                      {overviewQuery.data?.processo?.foraDoFluxo ? <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800">Fora do fluxo</span> : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{overviewQuery.data?.processo?.objeto ?? selectedProcess.objeto}</p>
                  </article>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Workflow</p><p className="mt-2 text-lg font-black text-slate-950">{overviewQuery.data?.workflow?.moduloAtual ?? selectedProcess.moduloAtual ?? "Sem definicao"}</p><p className="mt-1 text-sm text-slate-600">Etapa: {overviewQuery.data?.workflow?.etapaAtual ?? "Cadastro inicial"}</p></article>
                    <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Edital</p><p className="mt-2 text-lg font-black text-slate-950">{overviewQuery.data?.processo?.numeroEdital ?? "Ainda nao gerado"}</p><p className="mt-1 text-sm text-slate-600">Geracao automatica apenas na publicacao no modulo de Licitacao.</p></article>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Documentos</p><p className="mt-2 text-2xl font-black text-slate-950">{overviewQuery.data?.documentos ?? 0}</p></article>
                    <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Contratos ativos</p><p className="mt-2 text-2xl font-black text-slate-950">{overviewQuery.data?.contratosAtivos ?? 0}</p></article>
                  </div>

                  <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Parametros</p>
                    <dl className="mt-3 grid gap-3 text-sm text-slate-700">
                      <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2"><dt className="text-slate-500">Autoridade competente</dt><dd className="font-semibold text-slate-950">{overviewQuery.data?.processo?.autoridadeCompetente?.nome ?? "Nao definida"}</dd></div>
                      <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2"><dt className="text-slate-500">Condutor do processo</dt><dd className="font-semibold text-slate-950">{overviewQuery.data?.processo?.condutorProcesso?.nome ?? "Sera definido na publicacao"}</dd></div>
                      <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2"><dt className="text-slate-500">Valor estimado</dt><dd className="font-semibold text-slate-950">{formatCurrency(overviewQuery.data?.processo?.valorEstimado ?? selectedProcess.valorEstimado ?? null)}</dd></div>
                      <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">Abertura</dt><dd className="font-semibold text-slate-950">{formatDate(overviewQuery.data?.processo?.dataAbertura ?? selectedProcess.dataAbertura ?? null)}</dd></div>
                    </dl>
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

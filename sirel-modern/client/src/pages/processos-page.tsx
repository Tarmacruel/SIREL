import { useDeferredValue, useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, ChevronLeft, Filter, PlusCircle, Search } from "lucide-react";

import { workflowModuleOptions } from "@sirel/shared/const";
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
import { buildProcessoPayload, type ProcessoFormState, validateProcessoForm } from "@/features/processos/form";
import { trpc } from "@/lib/trpc";
import { mapZodFieldErrors } from "@/lib/zod-errors";

const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

const initialProcessoForm: ProcessoFormState = {
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

export function ProcessosPage() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [search, setSearch] = useState("");
  const [secretariaId, setSecretariaId] = useState("");
  const [statusId, setStatusId] = useState("");
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null);
  const [form, setForm] = useState<ProcessoFormState>(initialProcessoForm);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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

  const overviewQuery = trpc.processos.overview.useQuery({ processoId: selectedProcessId ?? 0 }, { enabled: Boolean(selectedProcessId), retry: false });

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
      setFieldErrors({});
      setFormError(null);
      setFormMessage(`Processo ${created.numeroSirel} criado. Agora a DFD pode ser iniciada no Planejamento e o edital será gerado na publicidade.`);
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

    const parsed = validateProcessoForm(form);
    if (!parsed.success) {
      setFieldErrors(mapZodFieldErrors(parsed.error));
      setFormError("Revise os campos destacados antes de salvar o processo.");
      return;
    }

    setFieldErrors({});
    await createMutation.mutateAsync(parsed.data);
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Processos"
        description="Cadastro mestre dos processos. O fluxo nasce no Planejamento, o Workflow move entre módulos e a Licitação cuida apenas das etapas específicas da fase licitatória."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:min-w-[260px] sm:flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por numero, objeto ou secretaria" className="pl-9" />
            </div>
            <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              <Filter className="h-4 w-4" />
              <span>Por página</span>
              <Select value={String(pageSize)} onChange={(event) => setPageSize(Number(event.target.value))} className="h-8 w-auto rounded-xl px-2 py-1 text-xs font-bold">
                {[12, 24, 48, 96].map((option) => <option key={option} value={option}>{option}</option>)}
              </Select>
            </div>
          </div>
        }
      >
        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.95fr]">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Registros</p><p className="mt-2 text-2xl font-black text-slate-950">{total}</p><p className="mt-1 text-sm text-slate-600">Processos recriados no beta.</p></article>
              <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Secretarias</p><p className="mt-2 text-2xl font-black text-slate-950">{catalogQuery.data?.secretarias.length ?? 0}</p><p className="mt-1 text-sm text-slate-600">Catálogo base importado.</p></article>
              <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Modalidades</p><p className="mt-2 text-2xl font-black text-slate-950">{catalogQuery.data?.modalidades.length ?? 0}</p><p className="mt-1 text-sm text-slate-600">Lista canônica controlada.</p></article>
              <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Pessoas</p><p className="mt-2 text-2xl font-black text-slate-950">{catalogQuery.data?.pessoas.length ?? 0}</p><p className="mt-1 text-sm text-slate-600">Autoridades disponíveis.</p></article>
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-[28px] border border-slate-200 bg-white px-4 py-4">
              <Select value={secretariaId} onChange={(event) => setSecretariaId(event.target.value)} className="max-w-[320px]">
                <option value="">Todas as secretarias</option>
                {catalogQuery.data?.secretarias.map((item) => <option key={item.id} value={item.id}>{item.sigla} - {item.nome}</option>)}
              </Select>
              <Select value={statusId} onChange={(event) => setStatusId(event.target.value)} className="max-w-[260px]">
                <option value="">Todos os status</option>
                {catalogQuery.data?.statusProcesso.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
              </Select>
              <div className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">Página {page} de {totalPages}</div>
            </div>

            <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white">
              <Table className="min-w-[840px]">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Processo</TableHeaderCell>
                    <TableHeaderCell>Secretaria</TableHeaderCell>
                    <TableHeaderCell>Modalidade</TableHeaderCell>
                    <TableHeaderCell>Modulo</TableHeaderCell>
                    <TableHeaderCell>Abertura</TableHeaderCell>
                    <TableHeaderCell className="text-right">Valor estimado</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {query.isLoading ? Array.from({ length: 6 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={6}><Skeleton className="h-12 w-full" /></TableCell>
                    </TableRow>
                  )) : rows.map((row) => {
                    const active = row.id === selectedProcessId;
                    return (
                      <TableRow key={row.id} onClick={() => setSelectedProcessId(row.id)} className={active ? "cursor-pointer bg-sky-50/80" : "cursor-pointer transition hover:bg-slate-50"}>
                        <TableCell className="align-top">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-bold text-slate-950">{row.numeroSirel}</div>
                            {row.foraDoFluxo ? <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800">Fora do fluxo</span> : null}
                          </div>
                          <div className="text-xs text-slate-500">{row.numeroEdital ?? "Edital ainda não gerado"}</div>
                        </TableCell>
                        <TableCell className="align-top">{row.secretaria}</TableCell>
                        <TableCell className="align-top">{row.modalidade ?? "Não informada"}</TableCell>
                        <TableCell className="align-top"><span className="inline-flex rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white">{row.moduloAtual ?? "Sem workflow"}</span></TableCell>
                        <TableCell className="align-top">{formatDate(row.dataAbertura)}</TableCell>
                        <TableCell className="text-right align-top font-semibold text-slate-950">{formatCurrency(row.valorEstimado)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {!query.isLoading && !rows.length ? <TableRow><TableCell className="text-center text-slate-500" colSpan={6}>Nenhum processo cadastrado ainda. Use o formulário ao lado para iniciar os testes.</TableCell></TableRow> : null}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600">Exibindo <span className="font-bold text-slate-950">{rows.length}</span> de <span className="font-bold text-slate-950">{total}</span> processos.</p>
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </div>

          <div className="space-y-4">
            <SectionCard title="Cadastro rápido" description="O processo nasce no Planejamento. Em casos excepcionais, ative a tag de fora do fluxo e escolha o módulo inicial." action={<div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-sky-800"><PlusCircle className="h-4 w-4" />Beta operacional</div>}>
              <form className="space-y-4" onSubmit={handleCreateProcesso}>
                <Alert variant="info" title="Regras automáticas">
                  <ul className="space-y-1">
                    <li>Número SIREL gerado automaticamente.</li>
                    <li>Número do edital gerado apenas na publicidade, dentro do módulo de Licitação.</li>
                    <li>Condutor definido apenas na publicação do processo.</li>
                  </ul>
                </Alert>

                <div className="grid gap-3 md:grid-cols-2">
                  <FormField label="Ano de referência" error={fieldErrors.anoReferencia}>
                    <Input required type="number" min={2020} max={2100} value={form.anoReferencia} error={Boolean(fieldErrors.anoReferencia)} onChange={(event) => setForm((current) => ({ ...current, anoReferencia: event.target.value }))} />
                  </FormField>
                  <FormField label="Número administrativo" error={fieldErrors.numeroAdministrativo}>
                    <Input value={form.numeroAdministrativo} error={Boolean(fieldErrors.numeroAdministrativo)} onChange={(event) => setForm((current) => ({ ...current, numeroAdministrativo: event.target.value }))} />
                  </FormField>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <FormField label="Secretaria" error={fieldErrors.secretariaId}>
                    <Select required value={form.secretariaId} error={Boolean(fieldErrors.secretariaId)} onChange={(event) => setForm((current) => ({ ...current, secretariaId: event.target.value }))}>
                      <option value="">Selecione</option>
                      {catalogQuery.data?.secretarias.map((item) => <option key={item.id} value={item.id}>{item.sigla} - {item.nome}</option>)}
                    </Select>
                  </FormField>
                  <FormField label="Modalidade" error={fieldErrors.modalidadeId}>
                    <Select value={form.modalidadeId} error={Boolean(fieldErrors.modalidadeId)} onChange={(event) => setForm((current) => ({ ...current, modalidadeId: event.target.value }))}>
                      <option value="">Selecione</option>
                      {catalogQuery.data?.modalidades.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
                    </Select>
                  </FormField>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <FormField label="Status inicial" error={fieldErrors.statusId}>
                    <Select value={form.statusId} error={Boolean(fieldErrors.statusId)} onChange={(event) => setForm((current) => ({ ...current, statusId: event.target.value }))}>
                      <option value="">Selecione</option>
                      {catalogQuery.data?.statusProcesso.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
                    </Select>
                  </FormField>
                  <FormField label="Valor estimado" error={fieldErrors.valorEstimado}>
                    <Input value={form.valorEstimado} error={Boolean(fieldErrors.valorEstimado)} placeholder="0,00" onChange={(event) => setForm((current) => ({ ...current, valorEstimado: event.target.value }))} />
                  </FormField>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <FormField label="Autoridade competente" error={fieldErrors.autoridadeCompetenteId}>
                    <Select value={form.autoridadeCompetenteId} error={Boolean(fieldErrors.autoridadeCompetenteId)} onChange={(event) => setForm((current) => ({ ...current, autoridadeCompetenteId: event.target.value }))}>
                      <option value="">Selecione</option>
                      {catalogQuery.data?.pessoas.map((item) => <option key={item.id} value={item.id}>{item.nome} {item.cargo ? `- ${item.cargo}` : ""}</option>)}
                    </Select>
                  </FormField>
                  <FormField label="Modo de disputa" error={fieldErrors.modoDisputa}>
                    <Select value={form.modoDisputa} error={Boolean(fieldErrors.modoDisputa)} onChange={(event) => setForm((current) => ({ ...current, modoDisputa: event.target.value }))}>
                      {catalogQuery.data?.modoDisputa.map((item) => <option key={item.codigo} value={item.codigo}>{item.nome}</option>)}
                    </Select>
                  </FormField>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <FormField label="Escopo" error={fieldErrors.escopoDisputa}>
                    <Select value={form.escopoDisputa} error={Boolean(fieldErrors.escopoDisputa)} onChange={(event) => setForm((current) => ({ ...current, escopoDisputa: event.target.value }))}>
                      <option value="GLOBAL">Global</option>
                      <option value="LOTE">Lote</option>
                      <option value="ITEM">Item</option>
                    </Select>
                  </FormField>
                  <FormField label="Tipo de objeto" error={fieldErrors.tipoObjeto}>
                    <Select value={form.tipoObjeto} error={Boolean(fieldErrors.tipoObjeto)} onChange={(event) => setForm((current) => ({ ...current, tipoObjeto: event.target.value }))}>
                      <option value="PRODUTO">Produto</option>
                      <option value="SERVICO">Serviço</option>
                      <option value="OBRA">Obra</option>
                      <option value="SERVICO_ENG">Serviço de engenharia</option>
                    </Select>
                  </FormField>
                  <FormField label="Tipo de contratação" error={fieldErrors.tipoContratacao}>
                    <Select value={form.tipoContratacao} error={Boolean(fieldErrors.tipoContratacao)} onChange={(event) => setForm((current) => ({ ...current, tipoContratacao: event.target.value }))}>
                      <option value="AQUISICAO">Aquisição</option>
                      <option value="REGISTRO_PRECO">Registro de preço</option>
                      <option value="AQUISICAO_PARCELADA">Aquisição parcelada</option>
                    </Select>
                  </FormField>
                </div>

                <FormField label="Critério de julgamento" error={fieldErrors.criterioJulgamento}>
                  <Input value={form.criterioJulgamento} error={Boolean(fieldErrors.criterioJulgamento)} onChange={(event) => setForm((current) => ({ ...current, criterioJulgamento: event.target.value }))} />
                </FormField>

                <FormField label="Objeto" error={fieldErrors.objeto}>
                  <Textarea required rows={5} value={form.objeto} error={Boolean(fieldErrors.objeto)} placeholder="Descreva o objeto do processo com clareza suficiente para iniciar os testes da Beta 2.0." onChange={(event) => setForm((current) => ({ ...current, objeto: event.target.value }))} />
                </FormField>

                <FormField label="Data prevista de abertura" error={fieldErrors.dataAbertura}>
                  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                    <CalendarDays className="h-4 w-4 text-slate-400" />
                    <input type="date" value={form.dataAbertura} onChange={(event) => setForm((current) => ({ ...current, dataAbertura: event.target.value }))} className="w-full border-none bg-transparent text-sm outline-none" />
                  </div>
                </FormField>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <label className="flex items-start gap-3">
                    <Checkbox checked={form.foraDoFluxo} onChange={(event) => setForm((current) => ({ ...current, foraDoFluxo: event.target.checked }))} className="mt-1" />
                    <span className="space-y-1"><span className="block text-sm font-semibold text-slate-800">Processo fora do fluxo</span><span className="block text-sm text-slate-600">Use apenas para casos excepcionais criados em outro departamento. O processo receberá a tag de fora do fluxo.</span></span>
                  </label>
                </div>

                {form.foraDoFluxo ? (
                  <FormField label="Módulo inicial excepcional" error={fieldErrors.moduloInicial}>
                    <Select value={form.moduloInicial} error={Boolean(fieldErrors.moduloInicial)} onChange={(event) => setForm((current) => ({ ...current, moduloInicial: event.target.value }))}>
                      {catalogQuery.data?.workflowModules.filter((item) => item !== "PLANEJAMENTO").map((item) => <option key={item} value={item}>{item}</option>)}
                    </Select>
                  </FormField>
                ) : null}

                {formMessage ? <Alert variant="success">{formMessage}</Alert> : null}
                {formError ? <Alert variant="error">{formError}</Alert> : null}

                <div className="flex flex-wrap gap-3">
                  <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Salvando processo..." : "Salvar processo"}</Button>
                  <Button type="button" variant="outline" onClick={() => { setForm((current) => ({ ...initialProcessoForm, anoReferencia: current.anoReferencia, secretariaId: current.secretariaId, modalidadeId: current.modalidadeId, statusId: current.statusId, autoridadeCompetenteId: current.autoridadeCompetenteId, moduloInicial: current.moduloInicial })); setFieldErrors({}); setFormMessage(null); setFormError(null); }}>Limpar formulário</Button>
                </div>
              </form>
            </SectionCard>

            <SectionCard title="Visão geral do processo" description="Resumo rápido do processo selecionado para conferência durante os testes.">
              {!selectedProcess ? (
                <Alert variant="info">Nenhum processo disponivel para detalhamento.</Alert>
              ) : overviewQuery.isLoading ? (
                <div className="space-y-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-16" />)}</div>
              ) : overviewQuery.error ? (
                <Alert variant="warning">Falha ao carregar o resumo do processo selecionado.</Alert>
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
                    <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Workflow</p><p className="mt-2 text-lg font-black text-slate-950">{overviewQuery.data?.workflow?.moduloAtual ?? selectedProcess.moduloAtual ?? "Sem definição"}</p><p className="mt-1 text-sm text-slate-600">Etapa: {overviewQuery.data?.workflow?.etapaAtual ?? "Cadastro inicial"}</p></article>
                    <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Edital</p><p className="mt-2 text-lg font-black text-slate-950">{overviewQuery.data?.processo?.numeroEdital ?? "Ainda não gerado"}</p><p className="mt-1 text-sm text-slate-600">Geração automática apenas na publicação no módulo de Licitação.</p></article>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Documentos</p><p className="mt-2 text-2xl font-black text-slate-950">{overviewQuery.data?.documentos ?? 0}</p></article>
                    <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Contratos ativos</p><p className="mt-2 text-2xl font-black text-slate-950">{overviewQuery.data?.contratosAtivos ?? 0}</p></article>
                  </div>

                  <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Parâmetros</p>
                    <dl className="mt-3 grid gap-3 text-sm text-slate-700">
                      <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2"><dt className="text-slate-500">Autoridade competente</dt><dd className="font-semibold text-slate-950">{overviewQuery.data?.processo?.autoridadeCompetente?.nome ?? "Não definida"}</dd></div>
                      <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2"><dt className="text-slate-500">Condutor do processo</dt><dd className="font-semibold text-slate-950">{overviewQuery.data?.processo?.condutorProcesso?.nome ?? "Será definido na publicação"}</dd></div>
                      <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2"><dt className="text-slate-500">Valor estimado</dt><dd className="font-semibold text-slate-950">{formatCurrency(overviewQuery.data?.processo?.valorEstimado ?? null)}</dd></div>
                      <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">Data de abertura</dt><dd className="font-semibold text-slate-950">{formatDate(overviewQuery.data?.processo?.dataAbertura ?? null)}</dd></div>
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

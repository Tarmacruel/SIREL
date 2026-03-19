import { useDeferredValue, useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, PlusCircle, Search, TimerReset } from "lucide-react";

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
import { formatCurrencyBRL, formatShortDateBR, formatShortDateTimeBR } from "@/lib/formatters";
import { trpc } from "@/lib/trpc";
import { mapZodFieldErrors } from "@/lib/zod-errors";

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

function toOptionalId(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function statusColor(status: string) {
  if (status === "CONCLUIDO") return "bg-emerald-100 text-emerald-800";
  if (status === "EM_ANDAMENTO") return "bg-sky-100 text-sky-800";
  if (status === "PENDENTE") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-600";
}

export function ProcessosPage() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [search, setSearch] = useState("");
  const [secretariaId, setSecretariaId] = useState("");
  const [statusId, setStatusId] = useState("");
  const [moduloAtual, setModuloAtual] = useState("");
  const [origemFluxo, setOrigemFluxo] = useState<"" | "fluxo" | "fora">("");
  const [somenteParados, setSomenteParados] = useState(false);
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
      moduloAtual: moduloAtual || undefined,
      foraDoFluxo: origemFluxo === "" ? undefined : origemFluxo === "fora",
      paradosHaMaisDeSeteDias: somenteParados || undefined,
    }),
    [deferredSearch, moduloAtual, origemFluxo, page, pageSize, secretariaId, somenteParados, statusId],
  );

  const catalogQuery = trpc.cadastros.formOptions.useQuery(undefined, { retry: false });
  const summaryQuery = trpc.processos.summary.useQuery(undefined, { retry: false });
  const listQuery = trpc.processos.list.useQuery(filters, { retry: false, placeholderData: (previous) => previous });
  const rows = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, moduloAtual, origemFluxo, pageSize, secretariaId, somenteParados, statusId]);

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
        utils.processos.summary.invalidate(),
        utils.processos.list.invalidate(),
        utils.processos.overview.invalidate(),
        utils.dashboard.summary.invalidate(),
        utils.workflow.summary.invalidate(),
        utils.workflow.list.invalidate(),
      ]);
      setSelectedProcessId(created.id);
      setFieldErrors({});
      setFormError(null);
      setFormMessage(`Processo ${created.numeroSirel} criado. O fluxo segue a partir do Planejamento ou do módulo excepcional definido.`);
    },
    onError: (error) => {
      setFormMessage(null);
      setFormError(error.message);
    },
  });

  async function handleCreateProcesso(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormMessage(null);
    setFormError(null);
    const payload = buildProcessoPayload(form);
    const parsed = validateProcessoForm(form);
    if (!parsed.success) {
      setFieldErrors(mapZodFieldErrors(parsed.error));
      setFormError("Revise os campos destacados antes de salvar o processo.");
      return;
    }
    setFieldErrors({});
    await createMutation.mutateAsync(payload);
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Processos" description="Visão gerencial do fluxo, incluindo localização atual, tempo parado, fases concluídas e criação de processos regulares ou fora do fluxo.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {[
            { label: "Total", value: summaryQuery.data?.total },
            { label: "No fluxo", value: summaryQuery.data?.emFluxo },
            { label: "Fora do fluxo", value: summaryQuery.data?.foraDoFluxo },
            { label: "Publicados", value: summaryQuery.data?.publicados },
            { label: "Parados > 7 dias", value: summaryQuery.data?.paradosHaMaisDeSeteDias },
            { label: "Média de paralisação", value: summaryQuery.data ? `${summaryQuery.data.mediaDiasParado} dias` : undefined },
          ].map((card) => (
            <article key={card.label} className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{card.label}</p>
              {summaryQuery.isLoading ? <Skeleton className="mt-3 h-10 w-20" /> : <p className="mt-3 text-3xl font-black text-slate-950">{card.value ?? 0}</p>}
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Criar novo processo" description="Use esta área para criar processos regulares do fluxo ou registros excepcionais fora do fluxo.">
        <form className="space-y-4" onSubmit={handleCreateProcesso}>
          <Alert variant="info" title="Regras automáticas">
            <ul className="space-y-1">
              <li>Número SIREL gerado automaticamente.</li>
              <li>Número do edital definido apenas na fase de publicidade.</li>
              <li>Condutor do processo definido apenas quando o processo for publicado.</li>
            </ul>
          </Alert>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <FormField label="Ano de referência" error={fieldErrors.anoReferencia}><Input required type="number" min={2020} max={2100} value={form.anoReferencia} error={Boolean(fieldErrors.anoReferencia)} onChange={(event) => setForm((current) => ({ ...current, anoReferencia: event.target.value }))} /></FormField>
            <FormField label="Número administrativo" error={fieldErrors.numeroAdministrativo}><Input value={form.numeroAdministrativo} error={Boolean(fieldErrors.numeroAdministrativo)} onChange={(event) => setForm((current) => ({ ...current, numeroAdministrativo: event.target.value }))} /></FormField>
            <FormField label="Secretaria" error={fieldErrors.secretariaId}><Select required value={form.secretariaId} error={Boolean(fieldErrors.secretariaId)} onChange={(event) => setForm((current) => ({ ...current, secretariaId: event.target.value }))}><option value="">Selecione</option>{catalogQuery.data?.secretarias.map((item) => <option key={item.id} value={item.id}>{item.sigla} - {item.nome}</option>)}</Select></FormField>
            <FormField label="Modalidade" error={fieldErrors.modalidadeId}><Select value={form.modalidadeId} error={Boolean(fieldErrors.modalidadeId)} onChange={(event) => setForm((current) => ({ ...current, modalidadeId: event.target.value }))}><option value="">Selecione</option>{catalogQuery.data?.modalidades.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</Select></FormField>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <FormField label="Status inicial" error={fieldErrors.statusId}><Select value={form.statusId} error={Boolean(fieldErrors.statusId)} onChange={(event) => setForm((current) => ({ ...current, statusId: event.target.value }))}><option value="">Selecione</option>{catalogQuery.data?.statusProcesso.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</Select></FormField>
            <FormField label="Valor estimado" error={fieldErrors.valorEstimado}><Input value={form.valorEstimado} error={Boolean(fieldErrors.valorEstimado)} placeholder="0,00" onChange={(event) => setForm((current) => ({ ...current, valorEstimado: event.target.value }))} /></FormField>
            <FormField label="Autoridade competente" error={fieldErrors.autoridadeCompetenteId}><Select value={form.autoridadeCompetenteId} error={Boolean(fieldErrors.autoridadeCompetenteId)} onChange={(event) => setForm((current) => ({ ...current, autoridadeCompetenteId: event.target.value }))}><option value="">Selecione</option>{catalogQuery.data?.pessoas.map((item) => <option key={item.id} value={item.id}>{item.nome} {item.cargo ? `- ${item.cargo}` : ""}</option>)}</Select></FormField>
            <FormField label="Modo de disputa" error={fieldErrors.modoDisputa}><Select value={form.modoDisputa} error={Boolean(fieldErrors.modoDisputa)} onChange={(event) => setForm((current) => ({ ...current, modoDisputa: event.target.value }))}>{catalogQuery.data?.modoDisputa.map((item) => <option key={item.codigo} value={item.codigo}>{item.nome}</option>)}</Select></FormField>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <FormField label="Escopo" error={fieldErrors.escopoDisputa}><Select value={form.escopoDisputa} error={Boolean(fieldErrors.escopoDisputa)} onChange={(event) => setForm((current) => ({ ...current, escopoDisputa: event.target.value }))}><option value="GLOBAL">Global</option><option value="LOTE">Lote</option><option value="ITEM">Item</option></Select></FormField>
            <FormField label="Tipo de objeto" error={fieldErrors.tipoObjeto}><Select value={form.tipoObjeto} error={Boolean(fieldErrors.tipoObjeto)} onChange={(event) => setForm((current) => ({ ...current, tipoObjeto: event.target.value }))}><option value="PRODUTO">Produto</option><option value="SERVICO">Serviço</option><option value="OBRA">Obra</option><option value="SERVICO_ENG">Serviço de engenharia</option></Select></FormField>
            <FormField label="Tipo de contratação" error={fieldErrors.tipoContratacao}><Select value={form.tipoContratacao} error={Boolean(fieldErrors.tipoContratacao)} onChange={(event) => setForm((current) => ({ ...current, tipoContratacao: event.target.value }))}><option value="AQUISICAO">Aquisição</option><option value="REGISTRO_PRECO">Registro de preço</option><option value="AQUISICAO_PARCELADA">Aquisição parcelada</option></Select></FormField>
          </div>

          <FormField label="Critério de julgamento" error={fieldErrors.criterioJulgamento}><Input value={form.criterioJulgamento} error={Boolean(fieldErrors.criterioJulgamento)} onChange={(event) => setForm((current) => ({ ...current, criterioJulgamento: event.target.value }))} /></FormField>
          <FormField label="Objeto" error={fieldErrors.objeto}><Textarea required rows={5} value={form.objeto} error={Boolean(fieldErrors.objeto)} onChange={(event) => setForm((current) => ({ ...current, objeto: event.target.value }))} /></FormField>

          <FormField label="Data prevista de abertura" error={fieldErrors.dataAbertura}>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
              <CalendarDays className="h-4 w-4 text-slate-400" />
              <input type="date" value={form.dataAbertura} onChange={(event) => setForm((current) => ({ ...current, dataAbertura: event.target.value }))} className="w-full border-none bg-transparent text-sm outline-none" />
            </div>
          </FormField>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
            <label className="flex items-start gap-3">
              <Checkbox checked={form.foraDoFluxo} onChange={(event) => setForm((current) => ({ ...current, foraDoFluxo: event.target.checked }))} className="mt-1" />
              <span className="space-y-1"><span className="block text-sm font-semibold text-slate-800">Processo fora do fluxo</span><span className="block text-sm text-slate-600">Use apenas para casos excepcionais. O sistema manterá essa marcação para análise gerencial.</span></span>
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
            <Button type="submit" disabled={createMutation.isPending}><PlusCircle className="h-4 w-4" />{createMutation.isPending ? "Salvando processo..." : "Salvar processo"}</Button>
            <Button type="button" variant="outline" onClick={() => { setForm(initialProcessoForm); setFieldErrors({}); setFormMessage(null); setFormError(null); }}><TimerReset className="h-4 w-4" />Limpar formulário</Button>
          </div>
        </form>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <SectionCard
          title="Monitoramento gerencial"
          description="Acompanhe o processo em qualquer fase, com filtros de localização, situação e tempo de parada."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar processo" className="pl-9" />
              </div>
              <Select value={secretariaId} onChange={(event) => setSecretariaId(event.target.value)} className="max-w-[220px]">
                <option value="">Todas as secretarias</option>
                {catalogQuery.data?.secretarias.map((item) => <option key={item.id} value={item.id}>{item.sigla} - {item.nome}</option>)}
              </Select>
              <Select value={statusId} onChange={(event) => setStatusId(event.target.value)} className="max-w-[180px]">
                <option value="">Todos os status</option>
                {catalogQuery.data?.statusProcesso.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
              </Select>
              <Select value={moduloAtual} onChange={(event) => setModuloAtual(event.target.value)} className="max-w-[180px]">
                <option value="">Todos os módulos</option>
                {workflowModuleOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </Select>
              <Select value={origemFluxo} onChange={(event) => setOrigemFluxo(event.target.value as typeof origemFluxo)} className="max-w-[180px]">
                <option value="">Qualquer origem</option>
                <option value="fluxo">No fluxo</option>
                <option value="fora">Fora do fluxo</option>
              </Select>
              <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                <Checkbox checked={somenteParados} onChange={(event) => setSomenteParados(event.target.checked)} />
                Somente parados há mais de 7 dias
              </label>
            </div>
          }
        >
          <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white">
            <Table className="min-w-[980px]">
              <TableHead>
                <tr>
                  <TableHeaderCell>Processo</TableHeaderCell>
                  <TableHeaderCell>Secretaria</TableHeaderCell>
                  <TableHeaderCell>Módulo</TableHeaderCell>
                  <TableHeaderCell>Etapa</TableHeaderCell>
                  <TableHeaderCell>Parado há</TableHeaderCell>
                  <TableHeaderCell>Documentos</TableHeaderCell>
                  <TableHeaderCell>Contratos</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {listQuery.isLoading
                  ? Array.from({ length: 6 }).map((_, index) => (
                      <TableRow key={index}>
                        <TableCell colSpan={7}><Skeleton className="h-12 w-full" /></TableCell>
                      </TableRow>
                    ))
                  : rows.map((row) => (
                      <TableRow key={row.id} onClick={() => setSelectedProcessId(row.id)} className={row.id === selectedProcessId ? "cursor-pointer bg-sky-50/80" : "cursor-pointer transition hover:bg-slate-50"}>
                        <TableCell>
                          <div className="font-bold text-slate-950">{row.numeroSirel}</div>
                          <div className="text-xs text-slate-500">{row.numeroEdital ?? "Edital ainda não gerado"}</div>
                          {row.foraDoFluxo ? <span className="mt-2 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800">Fora do fluxo</span> : null}
                        </TableCell>
                        <TableCell>{row.secretaria}</TableCell>
                        <TableCell>
                          <div className="font-semibold text-slate-950">{row.moduloAtual ?? "Sem workflow"}</div>
                          <div className="text-xs text-slate-500">{row.situacao ?? "Sem situação"}</div>
                        </TableCell>
                        <TableCell>{row.etapaAtual ?? "Cadastro inicial"}</TableCell>
                        <TableCell><div className="font-semibold text-slate-950">{row.diasParado} dia(s)</div><div className="text-xs text-slate-500">{row.ultimaMovimentacao?.descricao ?? "Sem movimentação"}</div></TableCell>
                        <TableCell>{row.documentos}</TableCell>
                        <TableCell>{row.contratosAtivos}/{row.contratos}</TableCell>
                      </TableRow>
                    ))}
                {!listQuery.isLoading && !rows.length ? <TableRow><TableCell colSpan={7} className="text-center text-slate-500">Nenhum processo encontrado para os filtros aplicados.</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">Exibindo <span className="font-bold text-slate-950">{rows.length}</span> de <span className="font-bold text-slate-950">{total}</span> processos.</p>
            <div className="flex items-center gap-3">
              <Select value={String(pageSize)} onChange={(event) => setPageSize(Number(event.target.value))} className="max-w-[140px]">
                {[12, 24, 48].map((option) => <option key={option} value={option}>{option} por página</option>)}
              </Select>
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Painel do processo" description="Resumo executivo da situação atual do processo selecionado.">
            {!selectedProcessId ? (
              <Alert variant="info">Selecione um processo para ver o detalhamento.</Alert>
            ) : overviewQuery.isLoading ? (
              <div className="space-y-3">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-20" />)}</div>
            ) : overviewQuery.error ? (
              <Alert variant="error">Falha ao carregar o resumo do processo selecionado.</Alert>
            ) : !overviewQuery.data ? (
              <Alert variant="warning">O processo selecionado não foi encontrado.</Alert>
            ) : (
              <div className="space-y-4">
                <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-xl font-black text-slate-950">{overviewQuery.data.processo.numeroSirel}</h4>
                    {overviewQuery.data.processo.foraDoFluxo ? <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800">Fora do fluxo</span> : null}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{overviewQuery.data.processo.objeto}</p>
                </article>

                <div className="grid gap-3 sm:grid-cols-2">
                  <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Módulo atual</p><p className="mt-2 text-lg font-black text-slate-950">{overviewQuery.data.workflow?.moduloAtual ?? "Sem workflow"}</p><p className="mt-1 text-sm text-slate-600">{overviewQuery.data.workflow?.etapaAtual ?? "Cadastro inicial"}</p></article>
                  <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Tempo parado</p><p className="mt-2 text-lg font-black text-slate-950">{overviewQuery.data.gerencial.diasParado} dia(s)</p><p className="mt-1 text-sm text-slate-600">Atualizado por último em {formatShortDateTimeBR(overviewQuery.data.workflow?.atualizadoEm ?? overviewQuery.data.processo.atualizadoEm)}</p></article>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Itens</p><p className="mt-2 text-2xl font-black text-slate-950">{overviewQuery.data.gerencial.itens}</p></article>
                  <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Documentos</p><p className="mt-2 text-2xl font-black text-slate-950">{overviewQuery.data.gerencial.documentos}</p></article>
                  <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Contratos</p><p className="mt-2 text-2xl font-black text-slate-950">{overviewQuery.data.gerencial.contratosAtivos}/{overviewQuery.data.gerencial.contratos}</p></article>
                </div>

                <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Parâmetros executivos</p>
                  <dl className="mt-3 grid gap-3 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2"><dt className="text-slate-500">Secretaria</dt><dd className="font-semibold text-slate-950">{overviewQuery.data.processo.secretaria.nome}</dd></div>
                    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2"><dt className="text-slate-500">Modalidade</dt><dd className="font-semibold text-slate-950">{overviewQuery.data.processo.modalidade?.nome ?? "Não informada"}</dd></div>
                    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2"><dt className="text-slate-500">Status atual</dt><dd className="font-semibold text-slate-950">{overviewQuery.data.processo.statusAtual?.nome ?? "Sem status"}</dd></div>
                    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2"><dt className="text-slate-500">Valor estimado</dt><dd className="font-semibold text-slate-950">{formatCurrencyBRL(overviewQuery.data.processo.valorEstimado)}</dd></div>
                    <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">Abertura prevista</dt><dd className="font-semibold text-slate-950">{formatShortDateBR(overviewQuery.data.processo.dataAbertura)}</dd></div>
                  </dl>
                </article>

                <SectionCard title="Fases do processo" description="Acompanhamento resumido das principais etapas para gestores.">
                  <div className="grid gap-3">
                    {overviewQuery.data.etapas.map((etapa) => (
                      <article key={etapa.chave} className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-950">{etapa.label}</div>
                            <div className="text-sm text-slate-600">{etapa.detalhe}</div>
                          </div>
                          <span className={["inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em]", statusColor(etapa.status)].join(" ")}>{etapa.status}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard title="Últimas movimentações" description="Histórico recente para entender onde o processo avançou ou parou.">
                  <div className="space-y-3">
                    {overviewQuery.data.timeline.map((row, index) => (
                      <article key={`${row.moduloDestino}-${index}`} className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-950">{row.descricao}</div>
                            <div className="text-sm text-slate-600">{row.observacao ?? "Sem observação adicional."}</div>
                          </div>
                          <div className="text-right text-xs text-slate-500">{row.moduloDestino} | {formatShortDateTimeBR(row.criadoEm)}</div>
                        </div>
                      </article>
                    ))}
                    {!overviewQuery.data.timeline.length ? <Alert variant="info">Ainda não há movimentações registradas para este processo.</Alert> : null}
                  </div>
                </SectionCard>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, ClipboardList, FileSearch, Printer, ShoppingCart, Trash2 } from "lucide-react";
import { useLocation } from "wouter";

import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { type EtpCotacaoFormState, validateEtpCotacaoForm, validateEtpForm } from "@/features/planejamento/form";
import {
  formatCurrencyBRL,
  formatDecimalInput,
  formatNumberBR,
  formatShortDateBR,
  maskCurrencyInputBR,
  normalizeCurrencyInputBR,
  normalizeDecimalInput,
} from "@/lib/formatters";
import {
  buildMapaComparativoHtml,
  navigatePreviewWindow,
  openPreviewWindow,
  openPrintableHtml,
  renderPreviewWindowMessage,
} from "@/lib/print-documents";
import { trpc } from "@/lib/trpc";
import { mapZodFieldErrors } from "@/lib/zod-errors";

interface PlanejamentoCotacoesPageProps { processoId: number; }
type AnaliseFaixa = "OK" | "SOBREPRECO" | "INEXEQUIVEL";
type Motivo = "SOBREPRECO" | "INEXEQUIVEL" | "OUTRO";

interface CotacaoFormState {
  cotacaoId?: number; itemId: number; fonte: string; fornecedorNome: string; documento: string; dataCotacao: string;
  quantidadeConsiderada: string; valorUnitario: string; considerada: boolean; motivoDesconsideracao?: Motivo;
  justificativaDesconsideracao: string; observacao: string;
}

const initialForm: CotacaoFormState = {
  itemId: 0, fonte: "", fornecedorNome: "", documento: "", dataCotacao: "", quantidadeConsiderada: "", valorUnitario: "",
  considerada: true, motivoDesconsideracao: undefined, justificativaDesconsideracao: "", observacao: "",
};

const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const classify = (value: number, media: number): AnaliseFaixa => (media <= 0 ? "OK" : value > media * 1.5 ? "SOBREPRECO" : value < media * 0.5 ? "INEXEQUIVEL" : "OK");
const label = (faixa: AnaliseFaixa) => (faixa === "SOBREPRECO" ? "Possível sobrepreço" : faixa === "INEXEQUIVEL" ? "Possível inexequibilidade" : "Faixa regular");
const chip = (considerada: boolean) => considerada ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700";

function suggestion(reason: Exclude<Motivo, "OUTRO">, fornecedor: string, media: number) {
  const ref = fornecedor.trim() || "a referência informada";
  const mediaTexto = formatCurrencyBRL(media);
  return reason === "SOBREPRECO"
    ? `A cotação apresentada por ${ref} foi desconsiderada porque supera em mais de 50% a média apurada para o item (${mediaTexto}), indicando possível sobrepreço.`
    : `A cotação apresentada por ${ref} foi desconsiderada porque está abaixo de 50% da média apurada para o item (${mediaTexto}), indicando possível inexequibilidade.`;
}

export function PlanejamentoCotacoesPage({ processoId }: PlanejamentoCotacoesPageProps) {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const detailQuery = trpc.planejamento.detail.useQuery({ processoId }, { retry: false });
  const catalogQuery = trpc.cadastros.formOptions.useQuery(undefined, { retry: false });
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [form, setForm] = useState<CotacaoFormState>(initialForm);
  const [metodologiaCotacao, setMetodologiaCotacao] = useState<"MENOR_PRECO" | "MEDIA" | "MEDIANA">("MEDIA");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const registroRef = useRef<HTMLElement | null>(null);
  const mapaRef = useRef<HTMLElement | null>(null);

  const saveEtpMutation = trpc.planejamento.saveEtp.useMutation({
    onSuccess: async () => { await Promise.all([utils.planejamento.detail.invalidate({ processoId }), utils.processos.overview.invalidate({ processoId })]); setMessage("Metodologia atualizada."); setErrorMessage(null); },
    onError: (error) => { setMessage(null); setErrorMessage(error.message); },
  });
  const saveMutation = trpc.planejamento.saveCotacaoPreliminar.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.planejamento.detail.invalidate({ processoId }), utils.processos.overview.invalidate({ processoId })]);
      setFieldErrors({}); setErrorMessage(null); setMessage(form.cotacaoId ? "Cotação atualizada." : "Cotação registrada.");
      if (selectedItemId) resetForm(selectedItemId, detailQuery.data?.itens ?? []);
    },
    onError: (error) => { setMessage(null); setErrorMessage(error.message); },
  });
  const deleteMutation = trpc.planejamento.deleteCotacaoPreliminar.useMutation({
    onSuccess: async () => { await Promise.all([utils.planejamento.detail.invalidate({ processoId }), utils.processos.overview.invalidate({ processoId })]); setMessage("Cotação removida."); setErrorMessage(null); },
    onError: (error) => { setMessage(null); setErrorMessage(error.message); },
  });
  const generateMutation = trpc.planejamento.generateDocumento.useMutation({
    onSuccess: async (created) => {
      await Promise.all([utils.documentos.list.invalidate(), utils.documentos.summary.invalidate()]);
      setMessage(`Documento persistido no processo: ${created.titulo}.`);
      setErrorMessage(null);
    },
    onError: (error) => {
      setMessage(null);
      setErrorMessage(error.message);
    },
  });

  const detalhe = detailQuery.data;
  const itens = detalhe?.itens ?? [];
  const metodologiaOptions = catalogQuery.data?.metodologiaCotacao ?? [];

  function resetForm(itemId: number, currentItems: Array<{ id: number; quantidade: string | number }>) {
    const item = currentItems.find((entry) => entry.id === itemId);
    setForm({ ...initialForm, itemId, quantidadeConsiderada: item ? formatDecimalInput(item.quantidade, 3) : "" });
  }

  useEffect(() => {
    if (!itens.length) { setSelectedItemId(null); setForm(initialForm); return; }
    setSelectedItemId((current) => (current && itens.some((item) => item.id === current) ? current : itens[0].id));
  }, [itens]);
  useEffect(() => { if (selectedItemId && !form.cotacaoId) resetForm(selectedItemId, itens); }, [selectedItemId, itens]);
  useEffect(() => { setMetodologiaCotacao((detalhe?.etp?.metodologiaCotacao as "MENOR_PRECO" | "MEDIA" | "MEDIANA") ?? "MEDIA"); }, [detalhe?.etp?.metodologiaCotacao]);

  const itemSelecionado = useMemo(() => itens.find((item) => item.id === selectedItemId) ?? null, [itens, selectedItemId]);
  const cotacoesDoItem = useMemo(() => detalhe?.cotacoesPreliminares.filter((cotacao) => cotacao.itemId === selectedItemId) ?? [], [detalhe?.cotacoesPreliminares, selectedItemId]);
  const mediaItem = useMemo(() => average(cotacoesDoItem.filter((cotacao) => cotacao.id !== form.cotacaoId).map((cotacao) => Number(cotacao.valorUnitario)).filter(Number.isFinite)), [cotacoesDoItem, form.cotacaoId]);
  const analiseAtual = useMemo(() => { const valor = normalizeCurrencyInputBR(form.valorUnitario); if (!valor || mediaItem <= 0) return null; const faixa = classify(valor, mediaItem); return faixa === "OK" ? null : { faixa, media: mediaItem }; }, [form.valorUnitario, mediaItem]);

  function toggleConsiderada(checked: boolean) {
    if (checked) { setForm((current) => ({ ...current, considerada: true, motivoDesconsideracao: undefined, justificativaDesconsideracao: "" })); return; }
    if (analiseAtual?.faixa === "SOBREPRECO" || analiseAtual?.faixa === "INEXEQUIVEL") {
      setForm((current) => ({ ...current, considerada: false, motivoDesconsideracao: analiseAtual.faixa, justificativaDesconsideracao: suggestion(analiseAtual.faixa, current.fornecedorNome, mediaItem) }));
      return;
    }
    setForm((current) => ({ ...current, considerada: false, motivoDesconsideracao: "OUTRO", justificativaDesconsideracao: "" }));
  }

  function editCotacao(cotacao: any) {
    setSelectedItemId(cotacao.itemId);
    setForm({
      cotacaoId: cotacao.id, itemId: cotacao.itemId, fonte: cotacao.fonte, fornecedorNome: cotacao.fornecedorNome, documento: cotacao.documento ?? "",
      dataCotacao: cotacao.dataCotacao ?? "", quantidadeConsiderada: formatDecimalInput(cotacao.quantidadeConsiderada, 3), valorUnitario: formatCurrencyBRL(cotacao.valorUnitario),
      considerada: cotacao.considerada, motivoDesconsideracao: cotacao.motivoDesconsideracao ?? undefined, justificativaDesconsideracao: cotacao.justificativaDesconsideracao ?? "", observacao: cotacao.observacao ?? "",
    });
    registroRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveMetodologia() {
    const parsed = validateEtpForm(processoId, { metodologiaCotacao, observacoes: detalhe?.etp?.observacoes ?? "", concluir: detalhe?.etp?.concluido ?? false });
    if (!parsed.success) { setErrorMessage("Não foi possível salvar a metodologia."); return; }
    await saveEtpMutation.mutateAsync(parsed.data);
  }

  async function saveCotacao(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedItemId) return;
    const quantidadeConsiderada = normalizeDecimalInput(form.quantidadeConsiderada);
    const valorUnitario = normalizeCurrencyInputBR(form.valorUnitario);
    if (!quantidadeConsiderada || !valorUnitario) { setErrorMessage("Informe quantidade considerada e valor unitário válidos."); setMessage(null); return; }
    const parsed = validateEtpCotacaoForm(processoId, {
      cotacaoId: form.cotacaoId, itemId: selectedItemId, fonte: form.fonte, fornecedorNome: form.fornecedorNome, documento: form.documento, dataCotacao: form.dataCotacao,
      quantidadeConsiderada, valorUnitario, considerada: form.considerada, motivoDesconsideracao: form.considerada ? undefined : form.motivoDesconsideracao,
      justificativaDesconsideracao: form.justificativaDesconsideracao, observacao: form.observacao,
    } as EtpCotacaoFormState);
    if (!parsed.success) { setFieldErrors(mapZodFieldErrors(parsed.error)); setErrorMessage("Revise os campos destacados antes de salvar a cotação."); setMessage(null); return; }
    setFieldErrors({});
    await saveMutation.mutateAsync(parsed.data);
  }

  function previewMapa(autoPrint: boolean) {
    if (!detalhe) return;
    const metodologiaLabel = metodologiaOptions.find((option) => option.codigo === metodologiaCotacao)?.nome ?? "Média";
    openPrintableHtml({ title: `Mapa Comparativo ${detalhe.processo.numeroSirel}`, bodyHtml: buildMapaComparativoHtml(detalhe, metodologiaLabel), autoPrint });
  }

  async function persistMapa(formato: "HTML" | "PDF") {
    if (!detalhe) return;

    let previewWindow: Window;
    try {
      previewWindow = openPreviewWindow(`Mapa comparativo ${detalhe.processo.numeroSirel}`);
    } catch (error) {
      setMessage(null);
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível abrir a pré-visualização.");
      return;
    }

    try {
      renderPreviewWindowMessage(
        previewWindow,
        `Mapa comparativo ${detalhe.processo.numeroSirel}`,
        "Gerando o arquivo e preparando a visualização...",
      );
      const created = await generateMutation.mutateAsync({ processoId, documento: "MAPA_COMPARATIVO", formato });
      if (!created.arquivoUrl) {
        throw new Error("O documento foi gerado, mas a URL de visualização não foi retornada.");
      }
      navigatePreviewWindow(previewWindow, created.arquivoUrl);
    } catch (error) {
      renderPreviewWindowMessage(
        previewWindow,
        `Mapa comparativo ${detalhe.processo.numeroSirel}`,
        error instanceof Error ? error.message : "Falha ao abrir a visualização do documento gerado.",
      );
    }
  }

  if (detailQuery.isLoading || catalogQuery.isLoading) return <div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-32" /><Skeleton className="h-96" /></div>;
  if (detailQuery.error || catalogQuery.error || !detalhe) return <Alert variant="warning">Falha ao carregar a etapa de cotações preliminares.</Alert>;
  if (!detalhe.etp) return <div className="space-y-6"><Alert variant="warning">Registre a etapa do ETP e anexe o documento principal antes de lançar as cotações preliminares.</Alert><Button variant="outline" onClick={() => setLocation(`/planejamento/etp/${processoId}`)}>Voltar ao ETP</Button></div>;

  const tabs = [
    { value: "registro", label: "Registro de cotações", content: (
      <section ref={registroRef} className="space-y-6">
        <SectionCard title="Registro de cotações preliminares" description="Cadastre referências, escolha a metodologia e trate eventuais indícios de sobrepreço ou inexequibilidade.">
          <div className="space-y-5">
            <div className="grid gap-4 xl:grid-cols-[1fr_240px]">
              <FormField label="Metodologia da fase de cotação"><Select value={metodologiaCotacao} onChange={(event) => setMetodologiaCotacao(event.target.value as typeof metodologiaCotacao)}>{metodologiaOptions.map((option) => <option key={option.codigo} value={option.codigo}>{option.nome}</option>)}</Select></FormField>
              <div className="flex items-end"><Button type="button" onClick={() => void saveMetodologia()} disabled={saveEtpMutation.isPending}>{saveEtpMutation.isPending ? "Salvando..." : "Salvar metodologia"}</Button></div>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">{itens.map((item) => <button key={item.id} type="button" onClick={() => { setSelectedItemId(item.id); resetForm(item.id, itens); }} className={["rounded-3xl border px-4 py-4 text-left transition", item.id === selectedItemId ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white hover:border-slate-300"].join(" ")}><p className="font-bold text-slate-950">Item {item.numeroItem}</p><p className="mt-1 text-sm text-slate-600">{item.descricao}</p><p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{formatNumberBR(item.quantidade, 3)} {item.unidade}</p></button>)}</div>
            {itemSelecionado ? <form className="space-y-4" onSubmit={saveCotacao}>
              <div className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 md:grid-cols-3">
                <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Item</p><p className="mt-2 text-lg font-black text-slate-950">Item {itemSelecionado.numeroItem}</p><p className="text-sm text-slate-600">{itemSelecionado.descricao}</p></div>
                <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Quantidade</p><p className="mt-2 text-lg font-black text-slate-950">{formatNumberBR(itemSelecionado.quantidade, 3)} {itemSelecionado.unidade}</p></div>
                <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Média atual</p><p className="mt-2 text-lg font-black text-slate-950">{formatCurrencyBRL(mediaItem)}</p></div>
              </div>
              {analiseAtual ? <Alert variant="warning">{label(analiseAtual.faixa)} detectado em tempo real. O valor informado foi comparado com a média atual do item ({formatCurrencyBRL(analiseAtual.media)}).</Alert> : null}
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <FormField label="Fonte" error={fieldErrors.fonte}><Input value={form.fonte} error={Boolean(fieldErrors.fonte)} onChange={(event) => setForm((current) => ({ ...current, fonte: event.target.value }))} /></FormField>
                <FormField label="Fornecedor / referência" error={fieldErrors.fornecedorNome}><Input value={form.fornecedorNome} error={Boolean(fieldErrors.fornecedorNome)} onChange={(event) => setForm((current) => ({ ...current, fornecedorNome: event.target.value }))} /></FormField>
                <FormField label="Documento de referência"><Input value={form.documento} onChange={(event) => setForm((current) => ({ ...current, documento: event.target.value }))} /></FormField>
                <FormField label="Data da cotação"><Input type="date" value={form.dataCotacao} onChange={(event) => setForm((current) => ({ ...current, dataCotacao: event.target.value }))} /></FormField>
                <FormField label="Quantidade considerada" error={fieldErrors.quantidadeConsiderada}><Input inputMode="decimal" value={form.quantidadeConsiderada} error={Boolean(fieldErrors.quantidadeConsiderada)} onChange={(event) => setForm((current) => ({ ...current, quantidadeConsiderada: event.target.value }))} /></FormField>
                <FormField label="Valor unitário" error={fieldErrors.valorUnitario}><Input inputMode="decimal" value={form.valorUnitario} error={Boolean(fieldErrors.valorUnitario)} placeholder="R$ 0,00" onChange={(event) => setForm((current) => ({ ...current, valorUnitario: maskCurrencyInputBR(event.target.value) }))} /></FormField>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white px-4 py-4">
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={form.considerada} onChange={(event) => toggleConsiderada(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />Considerar esta cotação no mapa comparativo</label>
                {!form.considerada ? <div className="mt-4 grid gap-4 xl:grid-cols-[260px_1fr]">
                  <FormField label="Motivo da desconsideração" error={fieldErrors.motivoDesconsideracao}>
                    <Select value={form.motivoDesconsideracao ?? ""} error={Boolean(fieldErrors.motivoDesconsideracao)} onChange={(event) => setForm((current) => { const motivo = event.target.value as Motivo; return motivo === "SOBREPRECO" || motivo === "INEXEQUIVEL" ? { ...current, motivoDesconsideracao: motivo, justificativaDesconsideracao: suggestion(motivo, current.fornecedorNome, mediaItem) } : { ...current, motivoDesconsideracao: "OUTRO", justificativaDesconsideracao: "" }; })}>
                      <option value="">Selecione</option><option value="SOBREPRECO">Possível sobrepreço</option><option value="INEXEQUIVEL">Possível inexequibilidade</option><option value="OUTRO">Outros motivos</option>
                    </Select>
                  </FormField>
                  <FormField label="Justificativa" error={fieldErrors.justificativaDesconsideracao}><Textarea rows={4} value={form.justificativaDesconsideracao} error={Boolean(fieldErrors.justificativaDesconsideracao)} onChange={(event) => setForm((current) => ({ ...current, justificativaDesconsideracao: event.target.value }))} /></FormField>
                </div> : null}
              </div>
              <FormField label="Observações da cotação"><Textarea rows={4} value={form.observacao} onChange={(event) => setForm((current) => ({ ...current, observacao: event.target.value }))} /></FormField>
              {message ? <Alert variant="success">{message}</Alert> : null}{errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}
              <div className="flex flex-wrap gap-3"><Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? "Salvando..." : form.cotacaoId ? "Atualizar cotação" : "Registrar cotação"}</Button><Button type="button" variant="outline" onClick={() => selectedItemId && resetForm(selectedItemId, itens)}>Limpar</Button></div>
            </form> : <Alert variant="warning">Selecione um item da DFD para registrar as cotações preliminares.</Alert>}
            <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white"><Table className="min-w-[860px]"><TableHead><tr><TableHeaderCell>Fonte</TableHeaderCell><TableHeaderCell>Fornecedor</TableHeaderCell><TableHeaderCell>Valor unitário</TableHeaderCell><TableHeaderCell>Análise</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell><TableHeaderCell className="text-right">Ações</TableHeaderCell></tr></TableHead><TableBody>{cotacoesDoItem.map((cotacao) => <TableRow key={cotacao.id}><TableCell className="align-top"><div className="font-semibold text-slate-950">{cotacao.fonte}</div><div className="text-xs text-slate-500">{cotacao.documento || "Sem documento"}</div></TableCell><TableCell className="align-top"><div className="font-medium text-slate-800">{cotacao.fornecedorNome}</div><div className="text-xs text-slate-500">{formatShortDateBR(cotacao.dataCotacao)}</div></TableCell><TableCell className="align-top font-semibold text-slate-900">{formatCurrencyBRL(cotacao.valorUnitario)}<div className="text-xs text-slate-500">Qtde considerada: {formatNumberBR(cotacao.quantidadeConsiderada, 3)}</div></TableCell><TableCell className="align-top"><span className={["inline-flex rounded-full border px-3 py-1 text-xs font-bold", cotacao.analiseFaixa === "OK" ? "border-slate-200 bg-slate-50 text-slate-700" : "border-amber-200 bg-amber-50 text-amber-700"].join(" ")}>{label(cotacao.analiseFaixa as AnaliseFaixa)}</span></TableCell><TableCell className="align-top"><span className={["inline-flex rounded-full border px-3 py-1 text-xs font-bold", chip(cotacao.considerada)].join(" ")}>{cotacao.considerada ? "Considerada" : "Desconsiderada"}</span>{!cotacao.considerada && cotacao.justificativaDesconsideracao ? <p className="mt-2 text-xs leading-5 text-slate-500">{cotacao.justificativaDesconsideracao}</p> : null}</TableCell><TableCell className="align-top"><div className="flex justify-end gap-2"><Button type="button" variant="outline" size="sm" onClick={() => editCotacao(cotacao)}>Editar</Button><Button type="button" variant="ghost" size="sm" onClick={() => void (window.confirm("Deseja excluir esta cotação preliminar?") && deleteMutation.mutate({ processoId, cotacaoId: cotacao.id }))}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>)}{!cotacoesDoItem.length ? <TableRow><TableCell className="py-8 text-center text-slate-500" colSpan={6}>Nenhuma cotação registrada para o item selecionado.</TableCell></TableRow> : null}</TableBody></Table></div>
          </div>
        </SectionCard>
      </section>
    ) },
    { value: "mapa", label: "Mapa comparativo", content: (
      <section ref={mapaRef} className="space-y-6">
        <SectionCard title="Mapa comparativo" description="Consolidação automática das cotações consideradas, respeitando a metodologia escolhida.">
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-4"><article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Itens com referência</p><p className="mt-2 text-2xl font-black text-slate-950">{detalhe.mapaComparativo.filter((item) => item.totalCotacoes > 0).length}</p></article><article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Cotações registradas</p><p className="mt-2 text-2xl font-black text-slate-950">{detalhe.cotacoesPreliminares.length}</p></article><article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Metodologia</p><p className="mt-2 text-lg font-black text-slate-950">{metodologiaOptions.find((option) => option.codigo === metodologiaCotacao)?.nome ?? "Média"}</p></article><article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Valor estimado</p><p className="mt-2 text-lg font-black text-slate-950">{formatCurrencyBRL(detalhe.processo.valorEstimado)}</p></article></div>
            <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" onClick={() => previewMapa(false)}><FileSearch className="h-4 w-4" />Pré-visualizar HTML</Button><Button type="button" onClick={() => previewMapa(true)}><Printer className="h-4 w-4" />Gerar PDF</Button><Button type="button" variant="outline" onClick={() => void persistMapa("HTML")} disabled={generateMutation.isPending}><FileSearch className="h-4 w-4" />Salvar HTML no processo</Button><Button type="button" variant="outline" onClick={() => void persistMapa("PDF")} disabled={generateMutation.isPending}><Printer className="h-4 w-4" />Salvar PDF no processo</Button></div>
            <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white"><Table className="min-w-[920px]"><TableHead><tr><TableHeaderCell>Item</TableHeaderCell><TableHeaderCell>Qtd.</TableHeaderCell><TableHeaderCell>Menor preço</TableHeaderCell><TableHeaderCell>Média</TableHeaderCell><TableHeaderCell>Mediana</TableHeaderCell><TableHeaderCell>Selecionado</TableHeaderCell><TableHeaderCell>Total</TableHeaderCell></tr></TableHead><TableBody>{detalhe.mapaComparativo.map((item) => <TableRow key={item.itemId}><TableCell className="align-top"><div className="font-bold text-slate-950">Item {item.numeroItem}</div><div className="text-xs text-slate-500">{item.descricao}</div></TableCell><TableCell className="align-top font-medium text-slate-800">{formatNumberBR(item.quantidade, 3)} {item.unidade}</TableCell><TableCell className="align-top font-medium text-slate-800">{formatCurrencyBRL(item.menorValorUnitario)}</TableCell><TableCell className="align-top font-medium text-slate-800">{formatCurrencyBRL(item.valorMedioUnitario)}</TableCell><TableCell className="align-top font-medium text-slate-800">{formatCurrencyBRL(item.valorMedianoUnitario)}</TableCell><TableCell className="align-top font-semibold text-slate-900">{formatCurrencyBRL(item.valorSelecionadoUnitario)}</TableCell><TableCell className="align-top font-semibold text-slate-900">{formatCurrencyBRL(item.valorReferenciaTotal)}</TableCell></TableRow>)}{!detalhe.mapaComparativo.length ? <TableRow><TableCell className="py-8 text-center text-slate-500" colSpan={7}>Nenhum item disponível para o mapa comparativo.</TableCell></TableRow> : null}</TableBody></Table></div>
          </div>
        </SectionCard>
      </section>
    ) },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <Breadcrumb items={[{ label: "Planejamento", href: "/planejamento" }, { label: `Cotações ${detalhe.processo.numeroSirel}` }]} />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Planejamento</p><h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Cotações preliminares do processo {detalhe.processo.numeroSirel}</h1><p className="mt-2 text-sm leading-6 text-slate-600">Etapa de lançamento das referências de mercado, metodologia e mapa comparativo.</p></div>
          <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => setLocation(`/planejamento/etp/${processoId}`)}><FileSearch className="h-4 w-4" />Voltar ao ETP</Button><Button variant="outline" onClick={() => setLocation(`/planejamento/tr/${processoId}`)}><ClipboardList className="h-4 w-4" />Abrir TR externo</Button><Button variant="outline" onClick={() => setLocation("/planejamento")}><ArrowLeft className="h-4 w-4" />Voltar ao Planejamento</Button></div>
        </div>
      </div>
      <div className={["grid gap-6", navCollapsed ? "xl:grid-cols-[92px_1fr]" : "xl:grid-cols-[240px_1fr]"].join(" ")}>
        <aside className="rounded-[28px] border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">{!navCollapsed ? <p className="pl-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Navegação</p> : null}<Button variant="outline" size="icon" onClick={() => setNavCollapsed((current) => !current)}>{navCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}</Button></div>
          <div className="mt-3 space-y-2"><Button variant="secondary" className={navCollapsed ? "w-full justify-center px-0" : "w-full justify-start"} onClick={() => registroRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}><ShoppingCart className="h-4 w-4 shrink-0" />{!navCollapsed ? <span>Registro</span> : null}</Button><Button variant="secondary" className={navCollapsed ? "w-full justify-center px-0" : "w-full justify-start"} onClick={() => mapaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}><ClipboardList className="h-4 w-4 shrink-0" />{!navCollapsed ? <span>Mapa comparativo</span> : null}</Button></div>
        </aside>
        <Tabs items={tabs} />
      </div>
    </div>
  );
}



import { useEffect, useMemo, useRef, useState, type ChangeEvent, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, ClipboardList, FileArchive, FileDown, FileSearch, ShoppingCart, Trash2, Upload } from "lucide-react";
import { useLocation } from "wouter";

import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { type TrFormState, validateTrForm } from "@/features/planejamento/form";
import { deletePlanejamentoDocumento, resolveServerAssetUrl, uploadPlanejamentoDocumento } from "@/lib/document-upload";
import { formatCurrencyBRL, formatIntegerBR, formatShortDateTimeBR } from "@/lib/formatters";
import {
  buildTrHtml,
  navigatePreviewWindow,
  openPreviewWindow,
  openPrintableHtml,
  renderPreviewWindowMessage,
} from "@/lib/print-documents";
import { trpc } from "@/lib/trpc";
import { mapZodFieldErrors } from "@/lib/zod-errors";

interface PlanejamentoTrPageProps {
  processoId: number;
}

interface UploadFormState {
  titulo: string;
  descricao: string;
  arquivo: File | null;
}

const initialUploadForm: UploadFormState = {
  titulo: "",
  descricao: "",
  arquivo: null,
};

const initialTrForm: TrFormState = {
  orcamentoSigiloso: false,
  observacoes: "",
  concluir: false,
};

function extractFileName(documento: { arquivoUrl?: string | null; arquivoChave?: string | null; titulo?: string | null }) {
  if (documento.titulo?.trim()) return documento.titulo;
  const source = documento.arquivoChave ?? documento.arquivoUrl ?? "";
  return source.split("/").pop() ?? "documento";
}

export function PlanejamentoTrPage({ processoId }: PlanejamentoTrPageProps) {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const detailQuery = trpc.planejamento.detail.useQuery({ processoId }, { retry: false });
  const documentosQuery = trpc.documentos.listByProcesso.useQuery({ processoId }, { retry: false });

  const [navCollapsed, setNavCollapsed] = useState(false);
  const [supportUpload, setSupportUpload] = useState<UploadFormState>(initialUploadForm);
  const [trUpload, setTrUpload] = useState<UploadFormState>(initialUploadForm);
  const [uploadingSupport, setUploadingSupport] = useState(false);
  const [uploadingTr, setUploadingTr] = useState(false);
  const [form, setForm] = useState(initialTrForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [documentMessage, setDocumentMessage] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);

  const overviewRef = useRef<HTMLElement | null>(null);
  const supportRef = useRef<HTMLElement | null>(null);
  const trRef = useRef<HTMLElement | null>(null);
  const resumoRef = useRef<HTMLElement | null>(null);

  const saveMutation = trpc.planejamento.saveTr.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.planejamento.list.invalidate(),
        utils.planejamento.detail.invalidate({ processoId }),
        utils.documentos.listByProcesso.invalidate({ processoId }),
        utils.workflow.byProcesso.invalidate({ processoId }),
        utils.processos.overview.invalidate({ processoId }),
      ]);
      setFieldErrors({});
      setErrorMessage(null);
      setMessage(form.concluir ? "TR externo concluído com sucesso." : "Etapa do TR salva em elaboração.");
    },
    onError: (error) => {
      setMessage(null);
      setErrorMessage(error.message);
    },
  });

  const generateMutation = trpc.planejamento.generateDocumento.useMutation({
    onSuccess: async (created) => {
      await Promise.all([
        utils.documentos.list.invalidate(),
        utils.documentos.summary.invalidate(),
        utils.documentos.listByProcesso.invalidate({ processoId }),
      ]);
      setDocumentError(null);
      setDocumentMessage(`Documento persistido no processo: ${created.titulo}.`);
    },
    onError: (error) => {
      setDocumentMessage(null);
      setDocumentError(error.message);
    },
  });

  useEffect(() => {
    const detail = detailQuery.data;
    if (!detail) return;

    setForm({
      orcamentoSigiloso: detail.tr?.orcamentoSigiloso ?? false,
      observacoes: detail.tr?.observacoes ?? "",
      concluir: detail.tr?.concluido ?? false,
    });
  }, [detailQuery.data]);

  const detalhe = detailQuery.data;
  const documentos = documentosQuery.data ?? [];
  const supportDocs = useMemo(
    () =>
      documentos
        .filter((documento) => documento.categoria === "SUPORTE_TR")
        .sort((left, right) => new Date(right.criadoEm).getTime() - new Date(left.criadoEm).getTime()),
    [documentos],
  );
  const trDocs = useMemo(
    () =>
      documentos
        .filter((documento) => documento.categoria === "TR_EXTERNO")
        .sort((left, right) => new Date(right.criadoEm).getTime() - new Date(left.criadoEm).getTime()),
    [documentos],
  );

  async function refreshData() {
    await Promise.all([
      utils.planejamento.list.invalidate(),
      utils.planejamento.detail.invalidate({ processoId }),
      utils.documentos.listByProcesso.invalidate({ processoId }),
      utils.workflow.byProcesso.invalidate({ processoId }),
      utils.processos.overview.invalidate({ processoId }),
    ]);
  }

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
    setter: Dispatch<SetStateAction<UploadFormState>>,
  ) {
    const nextFile = event.target.files?.[0] ?? null;
    setter((current) => ({
      ...current,
      arquivo: nextFile,
      titulo: current.titulo || nextFile?.name || "",
    }));
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>, type: "SUPORTE_TR" | "TR_EXTERNO") {
    event.preventDefault();

    const current = type === "SUPORTE_TR" ? supportUpload : trUpload;
    if (!current.arquivo) {
      setMessage(null);
      setErrorMessage("Selecione um arquivo para anexar.");
      return;
    }

    const setPending = type === "SUPORTE_TR" ? setUploadingSupport : setUploadingTr;
    const setState = type === "SUPORTE_TR" ? setSupportUpload : setTrUpload;

    try {
      setPending(true);
      setMessage(null);
      setErrorMessage(null);
      await uploadPlanejamentoDocumento({
        processoId,
        tipo: type === "SUPORTE_TR" ? "OUTRO" : "TR",
        categoria: type,
        titulo: current.titulo.trim() || current.arquivo.name,
        descricao: current.descricao.trim() || undefined,
        arquivo: current.arquivo,
      });
      await refreshData();
      setState(initialUploadForm);
      setMessage(type === "SUPORTE_TR" ? "Documento de suporte do TR anexado." : "Documento principal do TR anexado.");
    } catch (error) {
      setMessage(null);
      setErrorMessage(error instanceof Error ? error.message : "Falha ao anexar o documento.");
    } finally {
      setPending(false);
    }
  }

  async function handleDeleteDocumento(documentoId: number) {
    const confirmed = window.confirm("Deseja remover este documento do processo?");
    if (!confirmed) return;

    try {
      setMessage(null);
      setErrorMessage(null);
      await deletePlanejamentoDocumento(documentoId);
      await refreshData();
      setMessage("Documento removido com sucesso.");
    } catch (error) {
      setMessage(null);
      setErrorMessage(error instanceof Error ? error.message : "Falha ao remover o documento.");
    }
  }

  async function persistTr(concluir: boolean, silent = false) {
    const parsed = validateTrForm(processoId, {
      ...form,
      concluir,
    });

    if (!parsed.success) {
      setFieldErrors(mapZodFieldErrors(parsed.error));
      if (!silent) {
        setMessage(null);
        setErrorMessage("Revise os campos destacados antes de salvar a etapa do TR.");
      }
      return false;
    }

    setFieldErrors({});

    try {
      await saveMutation.mutateAsync(parsed.data);
      setForm((current) => ({ ...current, concluir }));
      if (silent) {
        setMessage(null);
      }
      return true;
    } catch {
      return false;
    }
  }

  function previewTr(autoPrint: boolean) {
    if (!detalhe) return;

    openPrintableHtml({
      title: `TR ${detalhe.processo.numeroSirel}`,
      bodyHtml: buildTrHtml({
        ...detalhe,
        tr: {
          ...detalhe.tr,
          orcamentoSigiloso: form.orcamentoSigiloso,
          observacoes: form.observacoes,
          concluido: form.concluir,
        },
      }),
      autoPrint,
    });
  }

  async function persistDocumento(formato: "HTML" | "PDF") {
    if (!detalhe) return;

    let previewWindow: Window;
    try {
      previewWindow = openPreviewWindow(`TR ${detalhe.processo.numeroSirel}`);
    } catch (error) {
      setDocumentMessage(null);
      setDocumentError(error instanceof Error ? error.message : "Não foi possível abrir a pré-visualização.");
      return;
    }

    const saved = await persistTr(false, true);
    if (!saved) {
      renderPreviewWindowMessage(
        previewWindow,
        `TR ${detalhe.processo.numeroSirel}`,
        "Não foi possível salvar a etapa do TR antes da geração do documento.",
      );
      return;
    }

    try {
      renderPreviewWindowMessage(previewWindow, `TR ${detalhe.processo.numeroSirel}`, "Gerando o arquivo e preparando a visualização...");
      const created = await generateMutation.mutateAsync({ processoId, documento: "TR", formato });
      if (!created.arquivoUrl) {
        throw new Error("O documento foi gerado, mas a URL de visualização não foi retornada.");
      }
      navigatePreviewWindow(previewWindow, created.arquivoUrl);
    } catch (error) {
      renderPreviewWindowMessage(
        previewWindow,
        `TR ${detalhe.processo.numeroSirel}`,
        error instanceof Error ? error.message : "Falha ao abrir a visualização do documento gerado.",
      );
    }
  }

  if (detailQuery.isLoading || documentosQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-28" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (detailQuery.error || documentosQuery.error || !detalhe) {
    return <Alert variant="warning">Falha ao carregar a etapa do TR no Planejamento.</Alert>;
  }

  const itens = detalhe.itens ?? [];
  const itensComReferencia = detalhe.mapaComparativo.filter((item) => item.totalCotacoes > 0);

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <Breadcrumb items={[{ label: "Planejamento", href: "/planejamento" }, { label: `TR ${detalhe.processo.numeroSirel}` }]} />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Planejamento</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">TR externo do processo {detalhe.processo.numeroSirel}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Nesta etapa o TR oficial será anexado como documento externo. O sistema continua gerando um documento-base em HTML/PDF
              a partir da DFD, do ETP e do mapa comparativo.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => previewTr(false)}>
              <FileSearch className="h-4 w-4" />
              Pré-visualizar HTML
            </Button>
            <Button variant="outline" onClick={() => previewTr(true)}>
              <FileDown className="h-4 w-4" />
              Gerar PDF
            </Button>
            <Button variant="outline" onClick={() => setLocation(`/planejamento/cotacoes/${processoId}`)}>
              <ShoppingCart className="h-4 w-4" />
              Abrir cotações
            </Button>
            <Button variant="outline" onClick={() => setLocation("/planejamento")}>
              <ArrowLeft className="h-4 w-4" />
              Voltar ao Planejamento
            </Button>
          </div>
        </div>
      </div>

      <div className={["grid gap-6", navCollapsed ? "xl:grid-cols-[92px_1fr]" : "xl:grid-cols-[240px_1fr]"].join(" ")}>
        <aside className="rounded-[28px] border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            {!navCollapsed ? <p className="pl-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Navegação</p> : null}
            <Button variant="outline" size="icon" onClick={() => setNavCollapsed((current) => !current)}>
              {navCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            <Button variant="secondary" className={navCollapsed ? "w-full justify-center px-0" : "w-full justify-start"} onClick={() => overviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              <ClipboardList className="h-4 w-4 shrink-0" />
              {!navCollapsed ? <span>Visão geral</span> : null}
            </Button>
            <Button variant="secondary" className={navCollapsed ? "w-full justify-center px-0" : "w-full justify-start"} onClick={() => supportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              <FileArchive className="h-4 w-4 shrink-0" />
              {!navCollapsed ? <span>Suportes do TR</span> : null}
            </Button>
            <Button variant="secondary" className={navCollapsed ? "w-full justify-center px-0" : "w-full justify-start"} onClick={() => trRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              <Upload className="h-4 w-4 shrink-0" />
              {!navCollapsed ? <span>Documento principal</span> : null}
            </Button>
            <Button variant="secondary" className={navCollapsed ? "w-full justify-center px-0" : "w-full justify-start"} onClick={() => resumoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              <FileSearch className="h-4 w-4 shrink-0" />
              {!navCollapsed ? <span>Documento-base</span> : null}
            </Button>
          </div>
        </aside>

        <div className="space-y-6">
          {!detalhe.dfd?.concluido ? <Alert variant="warning">Conclua a DFD antes de avançar para a etapa do TR.</Alert> : null}
          {!detalhe.etp?.concluido ? <Alert variant="warning">Conclua o ETP antes de avançar para a etapa do TR.</Alert> : null}
          {!itensComReferencia.length ? <Alert variant="warning">Registre cotações preliminares válidas antes de concluir o TR.</Alert> : null}
          {message ? <Alert variant="success">{message}</Alert> : null}
          {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}
          {documentMessage ? <Alert variant="success">{documentMessage}</Alert> : null}
          {documentError ? <Alert variant="error">{documentError}</Alert> : null}

          <section ref={overviewRef}>
            <SectionCard
              title="Visão geral da etapa"
              description="Controle dos anexos externos do TR e geração do documento-base de consolidação."
            >
              <div className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-4">
                  <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Processo</p>
                    <p className="mt-2 text-xl font-black text-slate-950">{detalhe.processo.numeroSirel}</p>
                    <p className="mt-1 text-sm text-slate-600">{detalhe.processo.secretaria}</p>
                  </article>
                  <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Itens consolidados</p>
                    <p className="mt-2 text-xl font-black text-slate-950">{formatIntegerBR(itens.length)}</p>
                    <p className="mt-1 text-sm text-slate-600">Itens reaproveitados da DFD para o TR.</p>
                  </article>
                  <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Suportes anexados</p>
                    <p className="mt-2 text-xl font-black text-slate-950">{formatIntegerBR(supportDocs.length)}</p>
                    <p className="mt-1 text-sm text-slate-600">Documentos auxiliares anteriores ao TR principal.</p>
                  </article>
                  <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Valor estimado atual</p>
                    <p className="mt-2 text-xl font-black text-slate-950">{formatCurrencyBRL(detalhe.processo.valorEstimado)}</p>
                    <p className="mt-1 text-sm text-slate-600">Valor consolidado a partir do mapa comparativo.</p>
                  </article>
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                  <FormField
                    label="Observações da etapa do TR"
                    description="O TR oficial permanece externo nesta fase. Estas observações entram no documento-base gerado pelo sistema."
                    error={fieldErrors.observacoes}
                  >
                    <div className="space-y-4">
                      <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                        <Checkbox
                          checked={form.orcamentoSigiloso}
                          onChange={(event) => setForm((current) => ({ ...current, orcamentoSigiloso: event.target.checked }))}
                        />
                        Marcar orçamento sigiloso no TR gerado
                      </label>
                      <Textarea
                        rows={6}
                        value={form.observacoes}
                        error={Boolean(fieldErrors.observacoes)}
                        onChange={(event) => setForm((current) => ({ ...current, observacoes: event.target.value }))}
                      />
                    </div>
                  </FormField>

                  <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Estado da etapa</p>
                    <p className="mt-2 text-lg font-black text-slate-950">{detalhe.tr?.concluido ? "Concluída" : "Em elaboração"}</p>
                    <p className="mt-2 text-sm text-slate-600">
                      Para concluir o TR é obrigatório anexar ao menos um documento principal do TR e manter o mapa comparativo válido.
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      Orçamento sigiloso na geração: <span className="font-semibold text-slate-900">{form.orcamentoSigiloso ? "Sim" : "Não"}</span>
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button type="button" onClick={() => void persistTr(false)} disabled={saveMutation.isPending || !detalhe.dfd}>
                        {saveMutation.isPending && !form.concluir ? "Salvando..." : "Salvar etapa"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void persistTr(true)}
                        disabled={saveMutation.isPending || !trDocs.length || !itensComReferencia.length}
                      >
                        {saveMutation.isPending && form.concluir ? "Concluindo..." : "Concluir anexos do TR"}
                      </Button>
                    </div>
                    </div>
                  </div>
                </div>
            </SectionCard>
          </section>

          <section ref={supportRef}>
            <SectionCard
              title="Documentos de suporte do TR"
              description="Anexe pareceres, minutas, justificativas e demais suportes que devem anteceder o documento principal do TR."
            >
              <div className="space-y-5">
                <form className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 xl:grid-cols-[1fr_1fr_220px] xl:items-end" onSubmit={(event) => void handleUpload(event, "SUPORTE_TR")}>
                  <FormField label="Título do documento">
                    <Input
                      value={supportUpload.titulo}
                      onChange={(event) => setSupportUpload((current) => ({ ...current, titulo: event.target.value }))}
                      placeholder="Ex.: Parecer técnico complementar"
                    />
                  </FormField>
                  <FormField label="Descrição">
                    <Input
                      value={supportUpload.descricao}
                      onChange={(event) => setSupportUpload((current) => ({ ...current, descricao: event.target.value }))}
                      placeholder="Resumo do conteúdo anexado"
                    />
                  </FormField>
                  <FormField label="Arquivo">
                    <Input type="file" onChange={(event) => handleFileChange(event, setSupportUpload)} />
                  </FormField>
                  <div className="xl:col-span-3 flex flex-wrap gap-3">
                    <Button type="submit" disabled={uploadingSupport || !detalhe.etp?.concluido}>
                      {uploadingSupport ? "Enviando suporte..." : "Anexar suporte"}
                    </Button>
                  </div>
                </form>

                <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white">
                  <Table className="min-w-[760px]">
                    <TableHead>
                      <tr>
                        <TableHeaderCell>Título</TableHeaderCell>
                        <TableHeaderCell>Descrição</TableHeaderCell>
                        <TableHeaderCell>Data</TableHeaderCell>
                        <TableHeaderCell className="text-right">Ações</TableHeaderCell>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {supportDocs.map((documento) => (
                        <TableRow key={documento.id}>
                          <TableCell className="align-top font-semibold text-slate-900">{extractFileName(documento)}</TableCell>
                          <TableCell className="align-top text-slate-600">{documento.descricao || "-"}</TableCell>
                          <TableCell className="align-top text-slate-600">{formatShortDateTimeBR(documento.criadoEm)}</TableCell>
                          <TableCell className="align-top">
                            <div className="flex justify-end gap-2">
                              <Button type="button" variant="outline" size="sm" onClick={() => window.open(resolveServerAssetUrl(documento.arquivoUrl) ?? "#", "_blank", "noopener,noreferrer")}>
                                Baixar
                              </Button>
                              <Button type="button" variant="ghost" size="sm" onClick={() => void handleDeleteDocumento(documento.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!supportDocs.length ? (
                        <TableRow>
                          <TableCell className="py-8 text-center text-slate-500" colSpan={4}>
                            Nenhum documento de suporte do TR anexado.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </SectionCard>
          </section>

          <section ref={trRef}>
            <SectionCard
              title="Documento principal do TR"
              description="Anexe o arquivo principal do TR. Este documento habilita a conclusão da etapa do Planejamento."
            >
              <div className="space-y-5">
                <form className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 xl:grid-cols-[1fr_1fr_220px] xl:items-end" onSubmit={(event) => void handleUpload(event, "TR_EXTERNO")}>
                  <FormField label="Título do TR">
                    <Input
                      value={trUpload.titulo}
                      onChange={(event) => setTrUpload((current) => ({ ...current, titulo: event.target.value }))}
                      placeholder="Ex.: Termo de Referência - Processo 0001/2026"
                    />
                  </FormField>
                  <FormField label="Descrição">
                    <Input
                      value={trUpload.descricao}
                      onChange={(event) => setTrUpload((current) => ({ ...current, descricao: event.target.value }))}
                      placeholder="Resumo do documento principal"
                    />
                  </FormField>
                  <FormField label="Arquivo do TR">
                    <Input type="file" onChange={(event) => handleFileChange(event, setTrUpload)} />
                  </FormField>
                  <div className="xl:col-span-3 flex flex-wrap gap-3">
                    <Button type="submit" disabled={uploadingTr || !detalhe.etp?.concluido}>
                      {uploadingTr ? "Enviando TR..." : "Anexar TR"}
                    </Button>
                  </div>
                </form>

                <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white">
                  <Table className="min-w-[760px]">
                    <TableHead>
                      <tr>
                        <TableHeaderCell>Título</TableHeaderCell>
                        <TableHeaderCell>Descrição</TableHeaderCell>
                        <TableHeaderCell>Data</TableHeaderCell>
                        <TableHeaderCell className="text-right">Ações</TableHeaderCell>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {trDocs.map((documento) => (
                        <TableRow key={documento.id}>
                          <TableCell className="align-top font-semibold text-slate-900">{extractFileName(documento)}</TableCell>
                          <TableCell className="align-top text-slate-600">{documento.descricao || "-"}</TableCell>
                          <TableCell className="align-top text-slate-600">{formatShortDateTimeBR(documento.criadoEm)}</TableCell>
                          <TableCell className="align-top">
                            <div className="flex justify-end gap-2">
                              <Button type="button" variant="outline" size="sm" onClick={() => window.open(resolveServerAssetUrl(documento.arquivoUrl) ?? "#", "_blank", "noopener,noreferrer")}>
                                Baixar
                              </Button>
                              <Button type="button" variant="ghost" size="sm" onClick={() => void handleDeleteDocumento(documento.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!trDocs.length ? (
                        <TableRow>
                          <TableCell className="py-8 text-center text-slate-500" colSpan={4}>
                            Nenhum documento principal do TR anexado.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </SectionCard>
          </section>

          <section ref={resumoRef}>
            <SectionCard
              title="Documento-base do TR"
              description="Geração do documento-base em HTML/PDF a partir da DFD, do ETP, das cotações preliminares e das observações da etapa."
              action={
                <div className="flex flex-wrap gap-3">
                  <Button type="button" variant="outline" onClick={() => void persistDocumento("HTML")} disabled={generateMutation.isPending}>
                    Salvar HTML no processo
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void persistDocumento("PDF")} disabled={generateMutation.isPending}>
                    Salvar PDF no processo
                  </Button>
                </div>
              }
            >
              <div className="space-y-4">
                <Alert variant="info">
                  Este documento-base não substitui o TR externo anexado. Ele serve como consolidação estruturada da fase de Planejamento
                  e pode ser arquivado no processo em HTML ou PDF.
                </Alert>

                <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white">
                  <Table className="min-w-[760px]">
                    <TableHead>
                      <tr>
                        <TableHeaderCell>Item</TableHeaderCell>
                        <TableHeaderCell>Descrição</TableHeaderCell>
                        <TableHeaderCell>Quantidade</TableHeaderCell>
                        <TableHeaderCell>Valor unitário</TableHeaderCell>
                        <TableHeaderCell>Total</TableHeaderCell>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {itens.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="align-top font-semibold text-slate-950">{item.numeroItem}</TableCell>
                          <TableCell className="align-top">{item.descricao}</TableCell>
                          <TableCell className="align-top">{item.quantidade} {item.unidade}</TableCell>
                          <TableCell className="align-top">{formatCurrencyBRL(item.valorUnitarioEstimado)}</TableCell>
                          <TableCell className="align-top">{formatCurrencyBRL(item.valorTotalEstimado)}</TableCell>
                        </TableRow>
                      ))}
                      {!itens.length ? (
                        <TableRow>
                          <TableCell className="py-8 text-center text-slate-500" colSpan={5}>
                            Nenhum item consolidado disponível para o TR.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </SectionCard>
          </section>
        </div>
      </div>
    </div>
  );
}




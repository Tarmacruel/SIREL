import { useEffect, useMemo, useRef, useState, type ChangeEvent, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, ClipboardList, FileArchive, FileSearch, ShoppingCart, Trash2, Upload } from "lucide-react";
import { useLocation } from "wouter";

import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { type EtpFormState, validateEtpForm } from "@/features/planejamento/form";
import { deletePlanejamentoDocumento, resolveServerAssetUrl, uploadPlanejamentoDocumento } from "@/lib/document-upload";
import { formatCurrencyBRL, formatIntegerBR, formatShortDateTimeBR } from "@/lib/formatters";
import { trpc } from "@/lib/trpc";
import { mapZodFieldErrors } from "@/lib/zod-errors";

interface PlanejamentoEtpPageProps {
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

const initialEtpForm: EtpFormState = {
  metodologiaCotacao: "MEDIA",
  observacoes: "",
  concluir: false,
};

function extractFileName(documento: { arquivoUrl?: string | null; arquivoChave?: string | null; titulo?: string | null }) {
  if (documento.titulo?.trim()) return documento.titulo;
  const source = documento.arquivoChave ?? documento.arquivoUrl ?? "";
  return source.split("/").pop() ?? "documento";
}

export function PlanejamentoEtpPage({ processoId }: PlanejamentoEtpPageProps) {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const detailQuery = trpc.planejamento.detail.useQuery({ processoId }, { retry: false });
  const documentosQuery = trpc.documentos.listByProcesso.useQuery({ processoId }, { retry: false });

  const [navCollapsed, setNavCollapsed] = useState(false);
  const [supportUpload, setSupportUpload] = useState<UploadFormState>(initialUploadForm);
  const [etpUpload, setEtpUpload] = useState<UploadFormState>(initialUploadForm);
  const [uploadingSupport, setUploadingSupport] = useState(false);
  const [uploadingEtp, setUploadingEtp] = useState(false);
  const [form, setForm] = useState(initialEtpForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const overviewRef = useRef<HTMLElement | null>(null);
  const supportRef = useRef<HTMLElement | null>(null);
  const etpRef = useRef<HTMLElement | null>(null);

  const saveMutation = trpc.planejamento.saveEtp.useMutation({
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
      setMessage(form.concluir ? "ETP externo concluído com sucesso." : "Etapa do ETP salva em elaboração.");
    },
    onError: (error) => {
      setMessage(null);
      setErrorMessage(error.message);
    },
  });

  useEffect(() => {
    const detail = detailQuery.data;
    if (!detail) return;

    setForm({
      metodologiaCotacao: (detail.etp?.metodologiaCotacao as "MENOR_PRECO" | "MEDIA" | "MEDIANA") ?? "MEDIA",
      observacoes: detail.etp?.observacoes ?? "",
      concluir: detail.etp?.concluido ?? false,
    });
  }, [detailQuery.data]);

  const detalhe = detailQuery.data;
  const documentos = documentosQuery.data ?? [];
  const supportDocs = useMemo(
    () =>
      documentos
        .filter((documento) => documento.categoria === "SUPORTE_ETP")
        .sort((left, right) => new Date(right.criadoEm).getTime() - new Date(left.criadoEm).getTime()),
    [documentos],
  );
  const etpDocs = useMemo(
    () =>
      documentos
        .filter((documento) => documento.categoria === "ETP_EXTERNO")
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

  async function handleUpload(
    event: FormEvent<HTMLFormElement>,
    type: "SUPORTE_ETP" | "ETP_EXTERNO",
  ) {
    event.preventDefault();

    const current = type === "SUPORTE_ETP" ? supportUpload : etpUpload;
    if (!current.arquivo) {
      setMessage(null);
      setErrorMessage("Selecione um arquivo para anexar.");
      return;
    }

    const setPending = type === "SUPORTE_ETP" ? setUploadingSupport : setUploadingEtp;
    const setState = type === "SUPORTE_ETP" ? setSupportUpload : setEtpUpload;

    try {
      setPending(true);
      setMessage(null);
      setErrorMessage(null);
      await uploadPlanejamentoDocumento({
        processoId,
        tipo: type === "SUPORTE_ETP" ? "OUTRO" : "ETP",
        categoria: type,
        titulo: current.titulo.trim() || current.arquivo.name,
        descricao: current.descricao.trim() || undefined,
        arquivo: current.arquivo,
      });
      await refreshData();
      setState(initialUploadForm);
      setMessage(type === "SUPORTE_ETP" ? "Documento de suporte anexado." : "Documento principal do ETP anexado.");
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

  async function persistEtp(concluir: boolean) {
    const parsed = validateEtpForm(processoId, {
      ...form,
      concluir,
    });

    if (!parsed.success) {
      setFieldErrors(mapZodFieldErrors(parsed.error));
      setMessage(null);
      setErrorMessage("Revise os campos destacados antes de salvar a etapa do ETP.");
      return;
    }

    setFieldErrors({});
    setForm((current) => ({ ...current, concluir }));
    await saveMutation.mutateAsync(parsed.data);
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
    return <Alert variant="warning">Falha ao carregar a etapa do ETP no Planejamento.</Alert>;
  }

  const itens = detalhe.itens ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <Breadcrumb items={[{ label: "Planejamento", href: "/planejamento" }, { label: `ETP ${detalhe.processo.numeroSirel}` }]} />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Planejamento</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">ETP externo do processo {detalhe.processo.numeroSirel}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Nesta etapa o ETP será anexado como documento externo. Primeiro entram os documentos de suporte e depois o arquivo
              principal do ETP.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setLocation(`/planejamento/dfd/${processoId}`)}>
              <ClipboardList className="h-4 w-4" />
              Abrir DFD
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
            <Button
              variant="secondary"
              className={navCollapsed ? "w-full justify-center px-0" : "w-full justify-start"}
              onClick={() => overviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              <FileSearch className="h-4 w-4 shrink-0" />
              {!navCollapsed ? <span>Visão geral</span> : null}
            </Button>
            <Button
              variant="secondary"
              className={navCollapsed ? "w-full justify-center px-0" : "w-full justify-start"}
              onClick={() => supportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              <FileArchive className="h-4 w-4 shrink-0" />
              {!navCollapsed ? <span>Suporte do ETP</span> : null}
            </Button>
            <Button
              variant="secondary"
              className={navCollapsed ? "w-full justify-center px-0" : "w-full justify-start"}
              onClick={() => etpRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              <Upload className="h-4 w-4 shrink-0" />
              {!navCollapsed ? <span>Documento principal</span> : null}
            </Button>
            <Button
              variant="outline"
              className={navCollapsed ? "w-full justify-center px-0" : "w-full justify-start"}
              onClick={() => setLocation(`/planejamento/cotacoes/${processoId}`)}
              disabled={!detalhe.etp}
            >
              <ShoppingCart className="h-4 w-4 shrink-0" />
              {!navCollapsed ? <span>Ir para cotações</span> : null}
            </Button>
          </div>
        </aside>

        <div className="space-y-6">
          {!detalhe.dfd ? (
            <Alert variant="warning">Conclua a DFD e a seleção de itens antes de avançar para o ETP.</Alert>
          ) : null}

          {message ? <Alert variant="success">{message}</Alert> : null}
          {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}

          <section ref={overviewRef}>
            <SectionCard
              title="Visão geral da etapa"
              description="Controle dos anexos externos do ETP e observações da etapa. A metodologia de cotação será aplicada nas cotações preliminares."
            >
              <div className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-4">
                  <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Processo</p>
                    <p className="mt-2 text-xl font-black text-slate-950">{detalhe.processo.numeroSirel}</p>
                    <p className="mt-1 text-sm text-slate-600">{detalhe.processo.secretaria}</p>
                  </article>
                  <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Itens da DFD</p>
                    <p className="mt-2 text-xl font-black text-slate-950">{formatIntegerBR(itens.length)}</p>
                    <p className="mt-1 text-sm text-slate-600">Itens prontos para a fase de cotações preliminares.</p>
                  </article>
                  <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Suportes anexados</p>
                    <p className="mt-2 text-xl font-black text-slate-950">{formatIntegerBR(supportDocs.length)}</p>
                    <p className="mt-1 text-sm text-slate-600">Documentos auxiliares posicionados antes do ETP.</p>
                  </article>
                  <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Valor estimado atual</p>
                    <p className="mt-2 text-xl font-black text-slate-950">{formatCurrencyBRL(detalhe.processo.valorEstimado)}</p>
                    <p className="mt-1 text-sm text-slate-600">Será recalculado na etapa de cotações preliminares.</p>
                  </article>
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                  <FormField
                    label="Observações da etapa do ETP"
                    description="A criação nativa do ETP será incluída em uma etapa posterior. Neste momento o fluxo trabalha apenas com anexos externos."
                    error={fieldErrors.observacoes}
                  >
                    <Textarea
                      rows={6}
                      value={form.observacoes}
                      error={Boolean(fieldErrors.observacoes)}
                      onChange={(event) => setForm((current) => ({ ...current, observacoes: event.target.value }))}
                    />
                  </FormField>

                  <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Estado da etapa</p>
                    <p className="mt-2 text-lg font-black text-slate-950">{detalhe.etp?.concluido ? "Concluída" : "Em elaboração"}</p>
                    <p className="mt-2 text-sm text-slate-600">
                      Para concluir o ETP é obrigatório anexar ao menos um documento principal do ETP.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button type="button" onClick={() => void persistEtp(false)} disabled={saveMutation.isPending || !detalhe.dfd}>
                        {saveMutation.isPending && !form.concluir ? "Salvando..." : "Salvar etapa"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void persistEtp(true)}
                        disabled={saveMutation.isPending || !etpDocs.length}
                      >
                        {saveMutation.isPending && form.concluir ? "Concluindo..." : "Concluir anexos do ETP"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>
          </section>

          <section ref={supportRef}>
            <SectionCard
              title="Documentos de suporte do ETP"
              description="Anexe estudos, pesquisas, pareceres e demais documentos de suporte. Estes anexos antecedem o ETP principal."
            >
              <div className="space-y-5">
                <form className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 xl:grid-cols-[1fr_1fr_220px] xl:items-end" onSubmit={(event) => void handleUpload(event, "SUPORTE_ETP")}>
                  <FormField label="Título do documento">
                    <Input
                      value={supportUpload.titulo}
                      onChange={(event) => setSupportUpload((current) => ({ ...current, titulo: event.target.value }))}
                      placeholder="Ex.: Pesquisa de mercado complementar"
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
                    <Button type="submit" disabled={uploadingSupport || !detalhe.dfd}>
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
                            Nenhum documento de suporte anexado.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </SectionCard>
          </section>

          <section ref={etpRef}>
            <SectionCard
              title="Documento principal do ETP"
              description="Anexe o arquivo principal do ETP. Este documento habilita a conclusão da etapa e o avanço para as cotações preliminares."
            >
              <div className="space-y-5">
                <form className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 xl:grid-cols-[1fr_1fr_220px] xl:items-end" onSubmit={(event) => void handleUpload(event, "ETP_EXTERNO")}>
                  <FormField label="Título do ETP">
                    <Input
                      value={etpUpload.titulo}
                      onChange={(event) => setEtpUpload((current) => ({ ...current, titulo: event.target.value }))}
                      placeholder="Ex.: Estudo Técnico Preliminar - Processo 0001/2026"
                    />
                  </FormField>
                  <FormField label="Descrição">
                    <Input
                      value={etpUpload.descricao}
                      onChange={(event) => setEtpUpload((current) => ({ ...current, descricao: event.target.value }))}
                      placeholder="Resumo do documento principal"
                    />
                  </FormField>
                  <FormField label="Arquivo do ETP">
                    <Input type="file" onChange={(event) => handleFileChange(event, setEtpUpload)} />
                  </FormField>
                  <div className="xl:col-span-3 flex flex-wrap gap-3">
                    <Button type="submit" disabled={uploadingEtp || !detalhe.dfd}>
                      {uploadingEtp ? "Enviando ETP..." : "Anexar ETP"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setLocation(`/planejamento/cotacoes/${processoId}`)} disabled={!detalhe.etp}>
                      Ir para cotações preliminares
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
                      {etpDocs.map((documento) => (
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
                      {!etpDocs.length ? (
                        <TableRow>
                          <TableCell className="py-8 text-center text-slate-500" colSpan={4}>
                            Nenhum documento principal do ETP anexado.
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


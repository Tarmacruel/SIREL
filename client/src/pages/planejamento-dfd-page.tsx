import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Building2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FilePenLine,
  PackagePlus,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Users2,
} from "lucide-react";
import { useLocation } from "wouter";

import { Modal } from "@/components/shared/modal";
import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { type DfdFormState, validateDfdForm } from "@/features/planejamento/form";
import { formatDecimalInput, formatNumberBR, normalizeDecimalInput } from "@/lib/formatters";
import {
  buildDfdHtml,
  navigatePreviewWindow,
  openPreviewWindow,
  openPrintableHtml,
  renderPreviewWindowMessage,
} from "@/lib/print-documents";
import { trpc } from "@/lib/trpc";
import { mapZodFieldErrors } from "@/lib/zod-errors";

interface PlanejamentoDfdPageProps {
  processoId: number;
}

interface CatalogCartItem {
  catalogoItemId: number;
  descricao: string;
  quantidade: string;
  unidade: string;
}

const initialDfdForm: DfdFormState = {
  solicitanteId: "",
  secretariaDemandanteId: "",
  secretariaResponsavelId: "",
  grauPrioridade: "MEDIA",
  demandaSistemica: false,
  secretariasParticipantes: [],
  justificativa: "",
  observacoes: "",
  responsavelIds: [],
  assinaturaResponsavelId: "",
  dataNecessidade: "",
  dataPrevistaConclusao: "",
  concluir: false,
};

const initialCatalogItemForm = {
  descricao: "",
  unidadePadrao: "UN",
};

const initialEditItemForm = {
  itemId: "",
  descricao: "",
  quantidade: "1",
  unidade: "UN",
};

function toggleNumberInArray(list: number[], value: number) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function findSecretariaAdministracao(secretarias: Array<{ id: number; nome: string; sigla: string }>) {
  return (
    secretarias.find((item) => item.nome.toUpperCase().includes("ADMINISTRA") || item.sigla.toUpperCase().includes("ADM")) ??
    null
  );
}

export function PlanejamentoDfdPage({ processoId }: PlanejamentoDfdPageProps) {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const authQuery = trpc.auth.me.useQuery(undefined, { retry: false });
  const catalogQuery = trpc.cadastros.formOptions.useQuery(undefined, { retry: false });
  const detailQuery = trpc.planejamento.detail.useQuery({ processoId }, { retry: false });

  const [navCollapsed, setNavCollapsed] = useState(false);
  const [openSecretariasModal, setOpenSecretariasModal] = useState(false);
  const [openResponsaveisModal, setOpenResponsaveisModal] = useState(false);
  const [openCatalogModal, setOpenCatalogModal] = useState(false);
  const [openNewCatalogItemModal, setOpenNewCatalogItemModal] = useState(false);
  const [openEditItemModal, setOpenEditItemModal] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogCart, setCatalogCart] = useState<CatalogCartItem[]>([]);
  const [form, setForm] = useState(initialDfdForm);
  const [newCatalogItemForm, setNewCatalogItemForm] = useState(initialCatalogItemForm);
  const [editItemForm, setEditItemForm] = useState(initialEditItemForm);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [itemMessage, setItemMessage] = useState<string | null>(null);
  const [itemErrorMessage, setItemErrorMessage] = useState<string | null>(null);

  const dadosSectionRef = useRef<HTMLElement | null>(null);
  const itensSectionRef = useRef<HTMLElement | null>(null);

  const catalogListQuery = trpc.planejamento.catalogList.useQuery(
    { search: catalogSearch.trim() || undefined },
    { retry: false, enabled: openCatalogModal, placeholderData: (previous) => previous },
  );

  useEffect(() => {
    const detail = detailQuery.data;
    if (!detail) return;

    setForm({
      solicitanteId: detail.dfd?.solicitante?.id ? String(detail.dfd.solicitante.id) : "",
      secretariaDemandanteId: detail.dfd?.secretariaDemandante?.id ? String(detail.dfd.secretariaDemandante.id) : String(detail.processo.secretariaId),
      secretariaResponsavelId: detail.dfd?.secretariaResponsavel?.id ? String(detail.dfd.secretariaResponsavel.id) : String(detail.processo.secretariaId),
      grauPrioridade: detail.dfd?.grauPrioridade ?? "MEDIA",
      demandaSistemica: detail.dfd?.demandaSistemica ?? false,
      secretariasParticipantes: detail.dfd?.secretariasParticipantes?.map((item) => item.id) ?? [],
      justificativa: detail.dfd?.justificativa ?? "",
      observacoes: detail.dfd?.observacoes ?? "",
      responsavelIds: detail.dfd?.responsaveis?.map((item) => item.id) ?? [],
      assinaturaResponsavelId: detail.dfd?.assinaturaResponsavel?.id ? String(detail.dfd.assinaturaResponsavel.id) : "",
      dataNecessidade: detail.dfd?.dataNecessidade ?? "",
      dataPrevistaConclusao: detail.dfd?.dataPrevistaConclusao ?? "",
      concluir: detail.dfd?.concluido ?? false,
    });
    setCatalogCart([]);
  }, [detailQuery.data]);

  useEffect(() => {
    const adminSecretaria = findSecretariaAdministracao(catalogQuery.data?.secretarias ?? []);
    if (form.demandaSistemica && adminSecretaria && form.secretariaResponsavelId !== String(adminSecretaria.id)) {
      setForm((current) => ({ ...current, secretariaResponsavelId: String(adminSecretaria.id) }));
    }
  }, [catalogQuery.data?.secretarias, form.demandaSistemica, form.secretariaResponsavelId]);

  useEffect(() => {
    if (!form.responsavelIds.length) {
      if (form.assinaturaResponsavelId) {
        setForm((current) => ({ ...current, assinaturaResponsavelId: "" }));
      }
      return;
    }

    if (!form.assinaturaResponsavelId || !form.responsavelIds.includes(Number(form.assinaturaResponsavelId))) {
      setForm((current) => ({
        ...current,
        assinaturaResponsavelId: String(current.responsavelIds[0] ?? ""),
      }));
    }
  }, [form.assinaturaResponsavelId, form.responsavelIds]);

  const saveMutation = trpc.planejamento.saveDfd.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.planejamento.list.invalidate(),
        utils.planejamento.detail.invalidate({ processoId }),
        utils.workflow.byProcesso.invalidate({ processoId }),
        utils.processos.overview.invalidate({ processoId }),
      ]);
      setFieldErrors({});
      setErrorMessage(null);
      setMessage(form.concluir ? "DFD salva e marcada como concluída." : "DFD salva em elaboração.");
    },
    onError: (error) => {
      setMessage(null);
      setErrorMessage(error.message);
    },
  });

  const deleteDfdMutation = trpc.planejamento.deleteDfd.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.planejamento.list.invalidate(),
        utils.planejamento.detail.invalidate({ processoId }),
        utils.workflow.byProcesso.invalidate({ processoId }),
        utils.processos.overview.invalidate({ processoId }),
      ]);
      setLocation("/planejamento");
    },
    onError: (error) => {
      setMessage(null);
      setErrorMessage(error.message);
    },
  });

  const createCatalogItemMutation = trpc.planejamento.createCatalogItem.useMutation({
    onSuccess: async (created) => {
      await utils.planejamento.catalogList.invalidate();
      setNewCatalogItemForm(initialCatalogItemForm);
      setOpenNewCatalogItemModal(false);
      setCatalogCart((current) =>
        current.some((item) => item.catalogoItemId === created.id)
          ? current
          : [
              ...current,
              {
                catalogoItemId: created.id,
                descricao: created.descricao,
                quantidade: "1",
                unidade: created.unidadePadrao,
              },
            ],
      );
      setItemErrorMessage(null);
      setItemMessage("Item incluído no catálogo e adicionado ao carrinho.");
    },
    onError: (error) => {
      setItemMessage(null);
      setItemErrorMessage(error.message);
    },
  });

  const addCatalogItemsMutation = trpc.planejamento.addCatalogItems.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.planejamento.list.invalidate(),
        utils.planejamento.detail.invalidate({ processoId }),
        utils.workflow.byProcesso.invalidate({ processoId }),
        utils.processos.overview.invalidate({ processoId }),
      ]);
      setCatalogCart([]);
      setOpenCatalogModal(false);
      setItemErrorMessage(null);
      setItemMessage("Itens adicionados à DFD com sucesso.");
    },
    onError: (error) => {
      setItemMessage(null);
      setItemErrorMessage(error.message);
    },
  });

  const saveItemMutation = trpc.planejamento.saveItem.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.planejamento.list.invalidate(), utils.planejamento.detail.invalidate({ processoId })]);
      setItemMessage("Item atualizado com sucesso.");
      setItemErrorMessage(null);
      setEditItemForm(initialEditItemForm);
      setOpenEditItemModal(false);
    },
    onError: (error) => {
      setItemMessage(null);
      setItemErrorMessage(error.message);
    },
  });

  const deleteItemMutation = trpc.planejamento.deleteItem.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.planejamento.list.invalidate(), utils.planejamento.detail.invalidate({ processoId })]);
      setItemMessage("Item removido com sucesso.");
      setItemErrorMessage(null);
    },
    onError: (error) => {
      setItemMessage(null);
      setItemErrorMessage(error.message);
    },
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

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setErrorMessage(null);

    const parsed = validateDfdForm(processoId, form);
    if (!parsed.success) {
      setFieldErrors(mapZodFieldErrors(parsed.error));
      setErrorMessage("Revise os campos destacados antes de salvar a DFD.");
      return;
    }

    setFieldErrors({});
    await saveMutation.mutateAsync(parsed.data);
  }

  async function handleAddCatalogItems() {
    if (!catalogCart.length) return;

    const itens = catalogCart
      .map((item) => ({
        catalogoItemId: item.catalogoItemId,
        quantidade: normalizeDecimalInput(item.quantidade),
        unidade: item.unidade.trim(),
      }))
      .filter((item) => item.quantidade && item.unidade);

    if (itens.length !== catalogCart.length) {
      setItemMessage(null);
      setItemErrorMessage("Informe quantidade válida e unidade para todos os itens do carrinho.");
      return;
    }

    setItemMessage(null);
    setItemErrorMessage(null);

    await addCatalogItemsMutation.mutateAsync({
      processoId,
      itens: itens.map((item) => ({
        catalogoItemId: item.catalogoItemId,
        quantidade: item.quantidade as number,
        unidade: item.unidade,
      })),
    });
  }

  async function handleCreateCatalogItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setItemMessage(null);
    setItemErrorMessage(null);

    await createCatalogItemMutation.mutateAsync({
      descricao: newCatalogItemForm.descricao.trim(),
      unidadePadrao: newCatalogItemForm.unidadePadrao.trim(),
    });
  }

  async function handleSaveEditedItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantidade = normalizeDecimalInput(editItemForm.quantidade);

    if (!quantidade || !editItemForm.unidade.trim()) {
      setItemMessage(null);
      setItemErrorMessage("Informe uma quantidade válida e uma unidade para o item.");
      return;
    }

    await saveItemMutation.mutateAsync({
      processoId,
      itemId: Number(editItemForm.itemId),
      descricao: editItemForm.descricao.trim(),
      quantidade,
      unidade: editItemForm.unidade.trim(),
    });
  }

  function toggleCatalogItem(item: { id: number; descricao: string; unidadePadrao: string }) {
    setCatalogCart((current) => {
      const existing = current.find((cartItem) => cartItem.catalogoItemId === item.id);
      if (existing) {
        return current.filter((cartItem) => cartItem.catalogoItemId !== item.id);
      }

      return [
        ...current,
        {
          catalogoItemId: item.id,
          descricao: item.descricao,
          quantidade: "1",
          unidade: item.unidadePadrao,
        },
      ];
    });
  }

  const detalhe = detailQuery.data;
  const itens = detalhe?.itens ?? [];
  const catalogItems = catalogListQuery.data ?? [];

  const atendenteNome = detalhe?.dfd?.atendente?.name ?? authQuery.data?.user.name ?? "Será registrado ao salvar";
  const adminSecretaria = findSecretariaAdministracao(catalogQuery.data?.secretarias ?? []);
  const secretariaResponsavelSelecionada =
    catalogQuery.data?.secretarias.find((item) => String(item.id) === form.secretariaResponsavelId) ??
    detalhe?.dfd?.secretariaResponsavel ??
    null;
  const secretariaDemandanteSelecionada =
    catalogQuery.data?.secretarias.find((item) => String(item.id) === form.secretariaDemandanteId) ??
    detalhe?.dfd?.secretariaDemandante ??
    null;
  const solicitanteSelecionado =
    catalogQuery.data?.pessoas.find((item) => String(item.id) === form.solicitanteId) ??
    detalhe?.dfd?.solicitante ??
    null;

  const selectedSecretarias = useMemo(
    () => catalogQuery.data?.secretarias.filter((item) => form.secretariasParticipantes.includes(item.id)) ?? [],
    [catalogQuery.data?.secretarias, form.secretariasParticipantes],
  );

  const selectedResponsaveis = useMemo(
    () => catalogQuery.data?.pessoas.filter((item) => form.responsavelIds.includes(item.id)) ?? [],
    [catalogQuery.data?.pessoas, form.responsavelIds],
  );

  const assinaturaResponsavelSelecionada = useMemo(
    () => selectedResponsaveis.find((item) => String(item.id) === form.assinaturaResponsavelId) ?? null,
    [selectedResponsaveis, form.assinaturaResponsavelId],
  );

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-32" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (detailQuery.error || !detalhe) {
    return <Alert variant="warning">Falha ao carregar o processo selecionado no Planejamento.</Alert>;
  }

  function handleOpenDfd(autoPrint: boolean) {
    if (!detalhe) return;
    openPrintableHtml({
      title: `DFD ${detalhe.processo.numeroSirel}`,
      bodyHtml: buildDfdHtml(detalhe),
      autoPrint,
    });
  }

  async function handlePersistDfd(formato: "HTML" | "PDF") {
    if (!detalhe) return;

    let previewWindow: Window;
    try {
      previewWindow = openPreviewWindow(`DFD ${detalhe.processo.numeroSirel}`);
    } catch (error) {
      setMessage(null);
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível abrir a pré-visualização.");
      return;
    }

    try {
      renderPreviewWindowMessage(previewWindow, `DFD ${detalhe.processo.numeroSirel}`, "Gerando o arquivo e preparando a visualização...");
      const created = await generateMutation.mutateAsync({ processoId, documento: "DFD", formato });
      if (!created.arquivoUrl) {
        throw new Error("O documento foi gerado, mas a URL de visualização não foi retornada.");
      }
      navigatePreviewWindow(previewWindow, created.arquivoUrl);
    } catch (error) {
      renderPreviewWindowMessage(
        previewWindow,
        `DFD ${detalhe.processo.numeroSirel}`,
        error instanceof Error ? error.message : "Falha ao abrir a visualização do documento gerado.",
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <Breadcrumb items={[{ label: "Planejamento", href: "/planejamento" }, { label: `DFD ${detalhe.processo.numeroSirel}` }]} />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Planejamento</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">DFD do processo {detalhe.processo.numeroSirel}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Tela específica da DFD com seletores em modal, catálogo de itens e conferência em formato de carrinho.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => handleOpenDfd(false)}>
              Pré-visualizar HTML
            </Button>
            <Button onClick={() => handleOpenDfd(true)}>
              Gerar PDF
            </Button>
            <Button variant="outline" onClick={() => void handlePersistDfd("HTML")} disabled={generateMutation.isPending || !detalhe.dfd}>
              Salvar HTML no processo
            </Button>
            <Button variant="outline" onClick={() => void handlePersistDfd("PDF")} disabled={generateMutation.isPending || !detalhe.dfd}>
              Salvar PDF no processo
            </Button>
            <Button variant="outline" onClick={() => setLocation("/planejamento")}>
              <ArrowLeft className="h-4 w-4" />
              Voltar ao Planejamento
            </Button>
          </div>
        </div>
      </div>

      <div className={["grid gap-6", navCollapsed ? "xl:grid-cols-[92px_1fr]" : "xl:grid-cols-[220px_1fr]"].join(" ")}>
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
              onClick={() => dadosSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              <ClipboardList className="h-4 w-4 shrink-0" />
              {!navCollapsed ? <span>Dados da DFD</span> : null}
            </Button>
            <Button
              variant="secondary"
              className={navCollapsed ? "w-full justify-center px-0" : "w-full justify-start"}
              onClick={() => itensSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              <PackagePlus className="h-4 w-4 shrink-0" />
              {!navCollapsed ? <span>Itens da DFD</span> : null}
            </Button>
            <Button
              variant="outline"
              className={navCollapsed ? "w-full justify-center px-0" : "w-full justify-start"}
              onClick={() => setLocation(`/planejamento/etp/${processoId}`)}
              disabled={!detalhe.dfd}
            >
              <FilePenLine className="h-4 w-4 shrink-0" />
              {!navCollapsed ? <span>Ir para ETP</span> : null}
            </Button>
            <Button
              variant="outline"
              className={navCollapsed ? "w-full justify-center px-0" : "w-full justify-start"}
              onClick={() => setLocation(`/planejamento/cotacoes/${processoId}`)}
              disabled={!detalhe.dfd}
            >
              <ShoppingCart className="h-4 w-4 shrink-0" />
              {!navCollapsed ? <span>Ir para Cotações</span> : null}
            </Button>
            <Button
              variant="destructive"
              className={navCollapsed ? "w-full justify-center px-0" : "w-full justify-start"}
              onClick={() => setOpenDeleteDialog(true)}
              disabled={deleteDfdMutation.isPending || !detalhe.dfd}
            >
              <Trash2 className="h-4 w-4 shrink-0" />
              {!navCollapsed ? <span>Excluir DFD</span> : null}
            </Button>
          </div>
        </aside>

        <div className="space-y-6">
          <section ref={dadosSectionRef} className="space-y-6">
            <SectionCard
              title="Dados da DFD"
              description="Preenchimento principal da demanda, com responsáveis, secretarias participantes e regras automáticas de secretaria responsável."
            >
              <div className="space-y-4">
                <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Processo selecionado</p>
                      <h4 className="mt-2 text-xl font-black text-slate-950">{detalhe.processo.numeroSirel}</h4>
                      <p className="mt-1 text-sm text-slate-600">{detalhe.processo.secretaria}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-950 p-3 text-white">
                      <FilePenLine className="h-5 w-5" />
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{detalhe.processo.objeto}</p>
                </article>

                <form className="space-y-4" onSubmit={handleSave}>
                  <div className="grid gap-3 md:grid-cols-2">
                    <FormField label="Atendente">
                      <Input value={atendenteNome} disabled />
                    </FormField>
                    <FormField label="Solicitante" error={fieldErrors.solicitanteId}>
                      <Select
                        value={form.solicitanteId}
                        error={Boolean(fieldErrors.solicitanteId)}
                        onChange={(event) => setForm((current) => ({ ...current, solicitanteId: event.target.value }))}
                      >
                        <option value="">Selecione o solicitante</option>
                        {catalogQuery.data?.pessoas.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.nome}{item.cargo ? ` · ${item.cargo}` : ""}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <FormField label="Secretaria demandante" error={fieldErrors.secretariaDemandanteId}>
                      <Select
                        value={form.secretariaDemandanteId}
                        error={Boolean(fieldErrors.secretariaDemandanteId)}
                        onChange={(event) => setForm((current) => ({ ...current, secretariaDemandanteId: event.target.value }))}
                      >
                        <option value="">Selecione a secretaria demandante</option>
                        {catalogQuery.data?.secretarias.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.sigla} · {item.nome}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                    <FormField label="Grau de prioridade" error={fieldErrors.grauPrioridade}>
                      <Select
                        value={form.grauPrioridade}
                        error={Boolean(fieldErrors.grauPrioridade)}
                        onChange={(event) => setForm((current) => ({ ...current, grauPrioridade: event.target.value }))}
                      >
                        {catalogQuery.data?.grauPrioridade.map((item) => (
                          <option key={item.codigo} value={item.codigo}>
                            {item.nome}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <FormField label="Secretaria responsável" error={fieldErrors.secretariaResponsavelId}>
                      <Select
                        value={form.secretariaResponsavelId}
                        error={Boolean(fieldErrors.secretariaResponsavelId)}
                        disabled={form.demandaSistemica}
                        onChange={(event) => setForm((current) => ({ ...current, secretariaResponsavelId: event.target.value }))}
                      >
                        <option value="">Selecione a secretaria responsável</option>
                        {catalogQuery.data?.secretarias.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.sigla} · {item.nome}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                    <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Resumo da seleção</p>
                      <p className="mt-3 text-sm text-slate-700">
                        <span className="font-semibold text-slate-900">Solicitante:</span> {solicitanteSelecionado?.nome ?? "-"}
                      </p>
                      <p className="mt-2 text-sm text-slate-700">
                        <span className="font-semibold text-slate-900">Demandante:</span> {secretariaDemandanteSelecionada?.nome ?? "-"}
                      </p>
                      <p className="mt-2 text-sm text-slate-700">
                        <span className="font-semibold text-slate-900">Responsável:</span> {secretariaResponsavelSelecionada?.nome ?? (form.demandaSistemica ? "Secretaria de Administração" : "-")}
                      </p>
                    </article>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <FormField label="Data da necessidade" error={fieldErrors.dataNecessidade}>
                      <Input
                        type="date"
                        value={form.dataNecessidade}
                        error={Boolean(fieldErrors.dataNecessidade)}
                        onChange={(event) => setForm((current) => ({ ...current, dataNecessidade: event.target.value }))}
                      />
                    </FormField>
                    <FormField label="Data prevista para conclusão" error={fieldErrors.dataPrevistaConclusao}>
                      <Input
                        type="date"
                        value={form.dataPrevistaConclusao}
                        error={Boolean(fieldErrors.dataPrevistaConclusao)}
                        onChange={(event) => setForm((current) => ({ ...current, dataPrevistaConclusao: event.target.value }))}
                      />
                    </FormField>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <label className="flex items-start gap-3">
                      <Checkbox
                        checked={form.demandaSistemica}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            demandaSistemica: event.target.checked,
                            secretariasParticipantes: event.target.checked ? current.secretariasParticipantes : [],
                          }))
                        }
                      />
                      <span className="space-y-1">
                        <span className="block text-sm font-semibold text-slate-800">Demanda sistêmica</span>
                        <span className="block text-sm leading-6 text-slate-600">
                          Ao marcar esta opção, a Secretaria de Administração passa a ser a responsável, independentemente das secretarias participantes.
                        </span>
                      </span>
                    </label>

                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div className="rounded-3xl border border-slate-200 bg-white px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                            <Building2 className="h-4 w-4 text-sky-700" />
                            Secretarias participantes
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setOpenSecretariasModal(true)}
                            disabled={!form.demandaSistemica}
                          >
                            Selecionar
                          </Button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {selectedSecretarias.length ? (
                            selectedSecretarias.map((item) => (
                              <span key={item.id} className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-800">
                                {item.sigla}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-slate-500">Nenhuma secretaria participante selecionada.</span>
                          )}
                        </div>
                        {fieldErrors.secretariasParticipantes ? (
                          <p className="mt-2 text-xs font-semibold text-rose-700">{fieldErrors.secretariasParticipantes}</p>
                        ) : null}
                      </div>

                      <div className="rounded-3xl border border-slate-200 bg-white px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                            <Users2 className="h-4 w-4 text-sky-700" />
                            Responsáveis pela DFD
                          </div>
                          <Button variant="outline" size="sm" onClick={() => setOpenResponsaveisModal(true)}>
                            Selecionar
                          </Button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {selectedResponsaveis.length ? (
                            selectedResponsaveis.map((item) => (
                              <span key={item.id} className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                                {item.nome}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-slate-500">Nenhum responsável selecionado.</span>
                          )}
                        </div>
                        {fieldErrors.responsavelIds ? <p className="mt-2 text-xs font-semibold text-rose-700">{fieldErrors.responsavelIds}</p> : null}
                        <div className="mt-4">
                          <FormField label="Assinatura ao final da DFD" error={fieldErrors.assinaturaResponsavelId}>
                            <Select
                              value={form.assinaturaResponsavelId}
                              error={Boolean(fieldErrors.assinaturaResponsavelId)}
                              onChange={(event) => setForm((current) => ({ ...current, assinaturaResponsavelId: event.target.value }))}
                            >
                              <option value="">Selecione quem assina a DFD</option>
                              {selectedResponsaveis.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.nome}{item.cargo ? ` · ${item.cargo}` : ""}
                                </option>
                              ))}
                            </Select>
                          </FormField>
                          {assinaturaResponsavelSelecionada ? (
                            <p className="mt-2 text-xs font-medium text-slate-600">
                              Assinatura atual: {assinaturaResponsavelSelecionada.nome}
                              {assinaturaResponsavelSelecionada.cargo ? ` · ${assinaturaResponsavelSelecionada.cargo}` : ""}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  <FormField label="Justificativa" error={fieldErrors.justificativa}>
                    <Textarea
                      rows={6}
                      value={form.justificativa}
                      error={Boolean(fieldErrors.justificativa)}
                      onChange={(event) => setForm((current) => ({ ...current, justificativa: event.target.value }))}
                    />
                  </FormField>

                  <FormField label="Observações">
                    <Textarea
                      rows={4}
                      value={form.observacoes}
                      onChange={(event) => setForm((current) => ({ ...current, observacoes: event.target.value }))}
                    />
                  </FormField>

                  <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                    <Checkbox
                      checked={form.concluir}
                      onChange={(event) => setForm((current) => ({ ...current, concluir: event.target.checked }))}
                    />
                    Marcar DFD como concluída
                  </label>

                  {message ? <Alert variant="success">{message}</Alert> : null}
                  {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}

                  <div className="flex flex-wrap gap-3">
                    <Button type="submit" disabled={saveMutation.isPending}>
                      {saveMutation.isPending ? "Salvando DFD..." : "Salvar DFD"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setLocation(`/planejamento/etp/${processoId}`)} disabled={!detalhe.dfd}>
                      Abrir ETP
                    </Button>
                    {detalhe.dfd ? (
                      <Button type="button" variant="destructive" onClick={() => setOpenDeleteDialog(true)} disabled={deleteDfdMutation.isPending}>
                        Excluir DFD
                      </Button>
                    ) : null}
                  </div>
                </form>
              </div>
            </SectionCard>
          </section>

          <section ref={itensSectionRef} className="space-y-6">
            <SectionCard
              title="Seleção de itens da DFD"
              description="Escolha os itens a partir do catálogo do sistema. Nesta etapa entram apenas descrição, quantidade e unidade."
              action={
                <Button onClick={() => setOpenCatalogModal(true)} disabled={!detalhe.dfd}>
                  <ShoppingCart className="h-4 w-4" />
                  Abrir catálogo
                </Button>
              }
            >
              {!detalhe.dfd ? (
                <Alert variant="warning">
                  Salve a DFD primeiro. Depois disso os itens poderão ser escolhidos a partir do catálogo do sistema.
                </Alert>
              ) : (
                <div className="space-y-4">
                  {itemMessage ? <Alert variant="success">{itemMessage}</Alert> : null}
                  {itemErrorMessage ? <Alert variant="error">{itemErrorMessage}</Alert> : null}

                  <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white">
                    <Table className="min-w-[760px]">
                      <TableHead>
                        <tr>
                          <TableHeaderCell>Item</TableHeaderCell>
                          <TableHeaderCell>Quantidade / unidade</TableHeaderCell>
                          <TableHeaderCell className="text-right">Ações</TableHeaderCell>
                        </tr>
                      </TableHead>
                      <TableBody>
                        {itens.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="align-top">
                              <div className="font-bold text-slate-950">Item {item.numeroItem}</div>
                              <div className="text-xs text-slate-500">{item.descricao}</div>
                            </TableCell>
                            <TableCell className="align-top font-medium text-slate-800">
                              {formatNumberBR(item.quantidade, 3)} {item.unidade}
                            </TableCell>
                            <TableCell className="align-top">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setEditItemForm({
                                      itemId: String(item.id),
                                      descricao: item.descricao,
                                      quantidade: formatDecimalInput(item.quantidade, 3),
                                      unidade: item.unidade,
                                    });
                                    setOpenEditItemModal(true);
                                  }}
                                >
                                  Editar
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => deleteItemMutation.mutate({ processoId, itemId: item.id })}
                                  disabled={deleteItemMutation.isPending}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Remover
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {!itens.length ? (
                          <TableRow>
                            <TableCell className="py-8 text-center text-slate-500" colSpan={3}>
                              Nenhum item cadastrado ainda para esta DFD.
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </SectionCard>
          </section>
        </div>
      </div>
      <Modal
        open={openSecretariasModal}
        onClose={() => setOpenSecretariasModal(false)}
        title="Secretarias participantes"
        description="Selecione as secretarias que participam da demanda sistêmica."
        actions={
          <div className="flex justify-end">
            <Button onClick={() => setOpenSecretariasModal(false)}>Concluir seleção</Button>
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          {catalogQuery.data?.secretarias.map((item) => {
            const selected = form.secretariasParticipantes.includes(item.id);

            return (
              <label
                key={item.id}
                className={[
                  "flex items-start gap-3 rounded-2xl border px-4 py-4 text-sm transition",
                  selected ? "border-sky-300 bg-sky-50 text-sky-900" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
                ].join(" ")}
              >
                <Checkbox
                  checked={selected}
                  onChange={() =>
                    setForm((current) => ({
                      ...current,
                      secretariasParticipantes: toggleNumberInArray(current.secretariasParticipantes, item.id),
                    }))
                  }
                />
                <span>
                  <span className="block font-semibold">{item.sigla}</span>
                  <span className="block text-xs text-slate-500">{item.nome}</span>
                </span>
              </label>
            );
          })}
        </div>
      </Modal>

      <Modal
        open={openResponsaveisModal}
        onClose={() => setOpenResponsaveisModal(false)}
        title="Responsáveis pela DFD"
        description="Selecione um ou mais responsáveis para a elaboração da DFD."
        actions={
          <div className="flex justify-end">
            <Button onClick={() => setOpenResponsaveisModal(false)}>Concluir seleção</Button>
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          {catalogQuery.data?.pessoas.map((item) => {
            const selected = form.responsavelIds.includes(item.id);

            return (
              <label
                key={item.id}
                className={[
                  "flex items-start gap-3 rounded-2xl border px-4 py-4 text-sm transition",
                  selected ? "border-sky-300 bg-sky-50 text-sky-900" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
                ].join(" ")}
              >
                <Checkbox
                  checked={selected}
                  onChange={() =>
                    setForm((current) => ({
                      ...current,
                      responsavelIds: toggleNumberInArray(current.responsavelIds, item.id),
                    }))
                  }
                />
                <span>
                  <span className="block font-semibold">{item.nome}</span>
                  <span className="block text-xs text-slate-500">{item.cargo ?? "Cargo não informado"}</span>
                </span>
              </label>
            );
          })}
        </div>
      </Modal>

      <Modal
        open={openCatalogModal}
        onClose={() => setOpenCatalogModal(false)}
        title="Catálogo de itens"
        description="Selecione os itens existentes, revise tudo no carrinho e só depois incorpore o conjunto à DFD."
        size="xl"
        actions={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-700">
              Itens no carrinho: <span className="text-slate-950">{catalogCart.length}</span>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => setOpenNewCatalogItemModal(true)}>
                <Plus className="h-4 w-4" />
                Novo item
              </Button>
              <Button onClick={handleAddCatalogItems} disabled={addCatalogItemsMutation.isPending || !catalogCart.length}>
                <ShoppingCart className="h-4 w-4" />
                {addCatalogItemsMutation.isPending ? "Adicionando..." : "Adicionar carrinho à DFD"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={catalogSearch}
                onChange={(event) => setCatalogSearch(event.target.value)}
                placeholder="Buscar item no catálogo"
                className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </label>

            <div className="space-y-3">
              {catalogItems.map((item) => {
                const selected = catalogCart.some((cartItem) => cartItem.catalogoItemId === item.id);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleCatalogItem(item)}
                    className={[
                      "flex w-full items-start justify-between gap-4 rounded-3xl border px-4 py-4 text-left transition",
                      selected ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white hover:border-slate-300",
                    ].join(" ")}
                  >
                    <div>
                      <p className="font-semibold text-slate-950">{item.descricao}</p>
                      <p className="mt-1 text-xs text-slate-500">Unidade padrão: {item.unidadePadrao}</p>
                    </div>
                    <span
                      className={[
                        "inline-flex rounded-full px-3 py-1 text-xs font-bold",
                        selected ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-700",
                      ].join(" ")}
                    >
                      {selected ? "No carrinho" : "Selecionar"}
                    </span>
                  </button>
                );
              })}

              {!catalogItems.length ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  Nenhum item encontrado no catálogo.
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <ShoppingCart className="h-4 w-4 text-sky-700" />
              Carrinho de itens
            </div>

            {catalogCart.length ? (
              catalogCart.map((item) => (
                <div key={item.catalogoItemId} className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">{item.descricao}</p>
                      <p className="mt-1 text-xs text-slate-500">Catálogo #{item.catalogoItemId}</p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() =>
                        setCatalogCart((current) => current.filter((cartItem) => cartItem.catalogoItemId !== item.catalogoItemId))
                      }
                    >
                      Remover
                    </Button>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <FormField label="Quantidade" className="text-xs">
                      <Input
                        value={item.quantidade}
                        inputMode="decimal"
                        onChange={(event) =>
                          setCatalogCart((current) =>
                            current.map((cartItem) =>
                              cartItem.catalogoItemId === item.catalogoItemId
                                ? { ...cartItem, quantidade: event.target.value }
                                : cartItem,
                            ),
                          )
                        }
                      />
                    </FormField>
                    <FormField label="Unidade" className="text-xs">
                      <Input
                        value={item.unidade}
                        onChange={(event) =>
                          setCatalogCart((current) =>
                            current.map((cartItem) =>
                              cartItem.catalogoItemId === item.catalogoItemId ? { ...cartItem, unidade: event.target.value } : cartItem,
                            ),
                          )
                        }
                      />
                    </FormField>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                Nenhum item selecionado ainda. Monte o carrinho e confirme antes de adicionar.
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={openNewCatalogItemModal}
        onClose={() => setOpenNewCatalogItemModal(false)}
        title="Novo item no catálogo"
        description="Cadastre um item para uso futuro no Planejamento."
        size="md"
      >
        <form className="space-y-4" onSubmit={handleCreateCatalogItem}>
          <FormField label="Descrição">
            <Textarea
              rows={4}
              value={newCatalogItemForm.descricao}
              onChange={(event) => setNewCatalogItemForm((current) => ({ ...current, descricao: event.target.value }))}
            />
          </FormField>

          <FormField label="Unidade padrão">
            <Input
              value={newCatalogItemForm.unidadePadrao}
              onChange={(event) => setNewCatalogItemForm((current) => ({ ...current, unidadePadrao: event.target.value }))}
            />
          </FormField>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setOpenNewCatalogItemModal(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createCatalogItemMutation.isPending}>
              {createCatalogItemMutation.isPending ? "Salvando..." : "Salvar item"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={openEditItemModal}
        onClose={() => setOpenEditItemModal(false)}
        title="Editar item da DFD"
        description="Ajuste descrição, quantidade e unidade do item já incorporado ao processo."
        size="md"
      >
        <form className="space-y-4" onSubmit={handleSaveEditedItem}>
          <FormField label="Descrição">
            <Textarea
              rows={4}
              value={editItemForm.descricao}
              onChange={(event) => setEditItemForm((current) => ({ ...current, descricao: event.target.value }))}
            />
          </FormField>

          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Quantidade">
              <Input
                value={editItemForm.quantidade}
                inputMode="decimal"
                onChange={(event) => setEditItemForm((current) => ({ ...current, quantidade: event.target.value }))}
              />
            </FormField>
            <FormField label="Unidade">
              <Input
                value={editItemForm.unidade}
                onChange={(event) => setEditItemForm((current) => ({ ...current, unidade: event.target.value }))}
              />
            </FormField>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setOpenEditItemModal(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saveItemMutation.isPending}>
              {saveItemMutation.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </form>
      </Modal>

      <AlertDialog
        open={openDeleteDialog}
        onClose={() => setOpenDeleteDialog(false)}
        onConfirm={() => deleteDfdMutation.mutate({ processoId })}
        loading={deleteDfdMutation.isPending}
        title="Excluir DFD"
        description="Esta ação remove a DFD e todos os itens vinculados a ela neste processo."
        confirmLabel="Excluir DFD"
        confirmVariant="destructive"
      >
        <p className="text-sm leading-6 text-slate-600">Use esta ação apenas quando a etapa precisar ser reiniciada do zero.</p>
      </AlertDialog>
    </div>
  );
}





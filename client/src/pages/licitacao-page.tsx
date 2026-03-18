import { useDeferredValue, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { FolderOpen, Gavel, Megaphone, Plus, ScrollText, Search, Trash2, Upload, Users } from "lucide-react";

import {
  habilitacaoStatusLabels,
  habilitacaoStatusOptions,
  licitacaoStatusLabels,
  licitacaoStatusOptions,
  licitacaoStepCatalog,
  propostaSituacaoLabels,
  propostaSituacaoOptions,
  recursoResultadoLabels,
  recursoResultadoOptions,
} from "@sirel/shared/const";
import {
  licitacaoAdvanceStageInputSchema,
  licitacaoDeleteLicitanteInputSchema,
  licitacaoHomologarInputSchema,
  licitacaoPublishInputSchema,
  licitacaoQuickFornecedorInputSchema,
  licitacaoSaveConfiguracaoInputSchema,
  licitacaoSaveHabilitacaoInputSchema,
  licitacaoSaveLanceInputSchema,
  licitacaoSaveLicitanteInputSchema,
  licitacaoSavePropostaInputSchema,
  licitacaoSaveRecursoInputSchema,
} from "@sirel/shared/schemas/licitacao";
import { Modal } from "@/components/shared/modal";
import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { deleteProcessoDocumento, uploadProcessoDocumento, type DocumentoTipo } from "@/lib/document-upload";
import { formatCnpjBR, formatCurrencyBRL, formatDecimalInput, formatShortDateBR, formatShortDateTimeBR, normalizeDecimalInput } from "@/lib/formatters";
import { trpc } from "@/lib/trpc";
import { mapZodFieldErrors } from "@/lib/zod-errors";

type LicitacaoTabValue = "publicacao" | "documentos" | "licitantes" | "propostas" | "lances" | "julgamento" | "habilitacao" | "recursos" | "homologacao";

type LicitacaoDocumentCategory =
  | "LICITACAO_EDITAL_FINAL"
  | "LICITACAO_AVISO"
  | "LICITACAO_ATA_SESSAO"
  | "LICITACAO_PARECER"
  | "LICITACAO_HOMOLOGACAO";

interface DocumentoUploadState {
  titulo: string;
  descricao: string;
  arquivo: File | null;
}

interface LicitacaoDocumentSpec {
  category: LicitacaoDocumentCategory;
  label: string;
  description: string;
  tipo: DocumentoTipo;
}

const licitacaoDocumentSpecs: readonly LicitacaoDocumentSpec[] = [
  {
    category: "LICITACAO_EDITAL_FINAL",
    label: "Edital final",
    description: "Versão final do edital apta para publicação e arquivamento no processo.",
    tipo: "EDITAL",
  },
  {
    category: "LICITACAO_AVISO",
    label: "Aviso de licitação",
    description: "Aviso publicado nos veículos oficiais e no portal do município.",
    tipo: "OUTRO",
  },
  {
    category: "LICITACAO_ATA_SESSAO",
    label: "Ata de sessão",
    description: "Ata da abertura, disputa ou sessão pública correspondente à fase corrente.",
    tipo: "RESULTADO",
  },
  {
    category: "LICITACAO_PARECER",
    label: "Pareceres e decisões",
    description: "Parecer jurídico, análise técnica, decisão de julgamento ou decisão recursal.",
    tipo: "OUTRO",
  },
  {
    category: "LICITACAO_HOMOLOGACAO",
    label: "Homologação",
    description: "Documento final de homologação e demais registros de encerramento da fase licitatória.",
    tipo: "RESULTADO",
  },
] as const;

function createDocumentoUploadState(): Record<LicitacaoDocumentCategory, DocumentoUploadState> {
  return {
    LICITACAO_EDITAL_FINAL: { titulo: "", descricao: "", arquivo: null },
    LICITACAO_AVISO: { titulo: "", descricao: "", arquivo: null },
    LICITACAO_ATA_SESSAO: { titulo: "", descricao: "", arquivo: null },
    LICITACAO_PARECER: { titulo: "", descricao: "", arquivo: null },
    LICITACAO_HOMOLOGACAO: { titulo: "", descricao: "", arquivo: null },
  };
}

function statusToTab(status?: string | null): LicitacaoTabValue {
  switch (status) {
    case "PUBLICACAO":
      return "publicacao";
    case "RECEBIMENTO_PROPOSTAS":
    case "ABERTURA_PROPOSTAS":
      return "propostas";
    case "LANCES":
      return "lances";
    case "JULGAMENTO":
      return "julgamento";
    case "HABILITACAO":
      return "habilitacao";
    case "RECURSOS":
      return "recursos";
    case "HOMOLOGACAO":
    case "CONTRATACAO":
      return "homologacao";
    default:
      return "publicacao";
  }
}

function toDateTimeLocalValue(value?: string | Date | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function toDateInputValue(value?: string | Date | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "HOMOLOGACAO":
    case "CONTRATACAO":
      return "bg-emerald-100 text-emerald-800";
    case "RECURSOS":
      return "bg-amber-100 text-amber-800";
    case "FRACASSADA":
    case "CANCELADA":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-sky-100 text-sky-800";
  }
}

function workflowStepState(currentStatus: string, stepKey: string) {
  const normalizedStatus = currentStatus === "CONTRATACAO" ? "HOMOLOGACAO" : currentStatus;
  const currentIndex = licitacaoStepCatalog.findIndex((item) => item.key === normalizedStatus);
  const stepIndex = licitacaoStepCatalog.findIndex((item) => item.key === stepKey);
  if (currentIndex === -1) {
    return stepIndex === 0 ? "current" : "upcoming";
  }
  if (stepIndex < currentIndex) return "done";
  if (stepIndex === currentIndex) return "current";
  return "upcoming";
}

function StepperCard({
  label,
  description,
  state,
  onClick,
}: {
  label: string;
  description: string;
  state: "done" | "current" | "upcoming";
  onClick: () => void;
}) {
  const classes = {
    done: "border-emerald-200 bg-emerald-50 text-emerald-900",
    current: "border-sky-200 bg-sky-50 text-sky-900",
    upcoming: "border-slate-200 bg-white text-slate-700",
  } as const;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[24px] border px-4 py-4 text-left transition hover:border-sky-300 ${classes[state]}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold">{label}</p>
        <span className="text-[11px] font-bold uppercase tracking-[0.18em]">
          {state === "done" ? "Concluída" : state === "current" ? "Atual" : "Próxima"}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 opacity-80">{description}</p>
    </button>
  );
}

export function LicitacaoPage() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | (typeof licitacaoStatusOptions)[number]>("");
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<LicitacaoTabValue>("publicacao");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [configForm, setConfigForm] = useState({
    criterioJulgamento: "",
    modoDisputa: "",
    dataPublicacaoEdital: "",
    dataRecebimentoPropostasInicio: "",
    dataRecebimentoPropostasFim: "",
    dataAberturaPropostas: "",
    dataInicioLances: "",
    dataFimLances: "",
    dataJulgamento: "",
    observacoes: "",
  });
  const [publishForm, setPublishForm] = useState({
    condutorProcessoId: "",
    statusId: "",
    descricao: "",
    observacao: "",
  });
  const [licitanteForm, setLicitanteForm] = useState({ fornecedorId: "" });
  const [fornecedorForm, setFornecedorForm] = useState({
    razaoSocial: "",
    cnpj: "",
    email: "",
    telefone: "",
    cidade: "",
    estado: "BA",
  });
  const [propostaForm, setPropostaForm] = useState({
    propostaId: "",
    licitanteId: "",
    itemId: "",
    valorUnitarioProposto: "",
    dataProposta: "",
    classificacao: "",
    situacao: "VALIDA",
    justificativa: "",
  });
  const [lanceForm, setLanceForm] = useState({
    propostaId: "",
    valorLance: "",
    dataLance: "",
    observacao: "",
  });
  const [habilitacaoForm, setHabilitacaoForm] = useState({
    licitanteId: "",
    statusHabilitacao: "PENDENTE",
    observacaoHabilitacao: "",
  });
  const [recursoForm, setRecursoForm] = useState({
    recursoId: "",
    licitanteId: "",
    dataInterposicao: "",
    dataJulgamento: "",
    resultado: "PENDENTE",
    descricao: "",
    decisao: "",
  });
  const [homologacaoForm, setHomologacaoForm] = useState({
    dataHomologacao: "",
    statusId: "",
    observacao: "",
  });
  const [documentoForms, setDocumentoForms] = useState<Record<LicitacaoDocumentCategory, DocumentoUploadState>>(
    createDocumentoUploadState(),
  );
  const [documentoUploading, setDocumentoUploading] = useState<LicitacaoDocumentCategory | null>(null);
  const [openFornecedorModal, setOpenFornecedorModal] = useState(false);

  const deferredSearch = useDeferredValue(search.trim());
  const filters = useMemo(
    () => ({
      page,
      pageSize,
      search: deferredSearch || undefined,
      statusLicitacao: statusFilter || undefined,
    }),
    [deferredSearch, page, pageSize, statusFilter],
  );

  const summaryQuery = trpc.licitacao.summary.useQuery(undefined, { retry: false });
  const catalogQuery = trpc.cadastros.formOptions.useQuery(undefined, { retry: false });
  const listQuery = trpc.licitacao.list.useQuery(filters, { retry: false, placeholderData: (previous) => previous });
  const rows = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, pageSize, statusFilter]);

  useEffect(() => {
    if (!rows.length) {
      setSelectedProcessId(null);
      return;
    }
    if (!selectedProcessId || !rows.some((row) => row.processoId === selectedProcessId)) {
      setSelectedProcessId(rows[0].processoId);
    }
  }, [rows, selectedProcessId]);

  const detailQuery = trpc.licitacao.detail.useQuery(
    { processoId: selectedProcessId ?? 0 },
    { enabled: Boolean(selectedProcessId), retry: false },
  );
  const documentosQuery = trpc.documentos.listByProcesso.useQuery(
    { processoId: selectedProcessId ?? 0 },
    { enabled: Boolean(selectedProcessId), retry: false, placeholderData: (previous) => previous },
  );

  const detail = detailQuery.data;
  const processo = detail?.processo;
  const licitacao = detail?.licitacao;
  const documentosProcesso = documentosQuery.data ?? [];

  useEffect(() => {
    if (!detail) return;
    const licitanteInicial = detail.licitantes.find((item) => item.ativo) ?? detail.licitantes[0];
    setActiveTab(statusToTab(detail.licitacao?.statusLicitacao));
    setConfigForm({
      criterioJulgamento: detail.processo.criterioJulgamento ?? "",
      modoDisputa: detail.processo.modoDisputa ?? "",
      dataPublicacaoEdital: toDateTimeLocalValue(detail.licitacao?.dataPublicacaoEdital),
      dataRecebimentoPropostasInicio: toDateTimeLocalValue(detail.licitacao?.dataRecebimentoPropostasInicio),
      dataRecebimentoPropostasFim: toDateTimeLocalValue(detail.licitacao?.dataRecebimentoPropostasFim),
      dataAberturaPropostas: toDateTimeLocalValue(detail.licitacao?.dataAberturaPropostas),
      dataInicioLances: toDateTimeLocalValue(detail.licitacao?.dataInicioLances),
      dataFimLances: toDateTimeLocalValue(detail.licitacao?.dataFimLances),
      dataJulgamento: toDateTimeLocalValue(detail.licitacao?.dataJulgamento),
      observacoes: detail.licitacao?.observacoes ?? "",
    });
    setPublishForm({
      condutorProcessoId: detail.processo.condutorProcesso?.id ? String(detail.processo.condutorProcesso.id) : "",
      statusId: detail.processo.statusId ? String(detail.processo.statusId) : "",
      descricao: detail.processo.numeroEdital ? `Atualização da publicidade do edital ${detail.processo.numeroEdital}` : "Processo publicado com aviso e edital.",
      observacao: "",
    });
    setHomologacaoForm({
      dataHomologacao: toDateInputValue(detail.licitacao?.dataHomologacao),
      statusId: detail.processo.statusId ? String(detail.processo.statusId) : "",
      observacao: "",
    });
    setPropostaForm({
      propostaId: "",
      licitanteId: "",
      itemId: "",
      valorUnitarioProposto: "",
      dataProposta: "",
      classificacao: "",
      situacao: "VALIDA",
      justificativa: "",
    });
    setLanceForm({
      propostaId: "",
      valorLance: "",
      dataLance: "",
      observacao: "",
    });
    setHabilitacaoForm({
      licitanteId: licitanteInicial?.id ? String(licitanteInicial.id) : "",
      statusHabilitacao: licitanteInicial?.statusHabilitacao ?? "PENDENTE",
      observacaoHabilitacao: licitanteInicial?.observacaoHabilitacao ?? "",
    });
    setRecursoForm({
      recursoId: "",
      licitanteId: licitanteInicial?.id ? String(licitanteInicial.id) : "",
      dataInterposicao: "",
      dataJulgamento: "",
      resultado: "PENDENTE",
      descricao: "",
      decisao: "",
    });
    setDocumentoForms(createDocumentoUploadState());
    setFieldErrors({});
    setErrorMessage(null);
    setFeedback(null);
  }, [detail]);

  async function refreshModulo(processoId: number) {
    await Promise.all([
      utils.licitacao.summary.invalidate(),
      utils.licitacao.list.invalidate(),
      utils.licitacao.detail.invalidate({ processoId }),
      utils.workflow.list.invalidate(),
      utils.workflow.byProcesso.invalidate({ processoId }),
      utils.processos.list.invalidate(),
      utils.processos.overview.invalidate({ processoId }),
      utils.documentos.list.invalidate(),
      utils.documentos.listByProcesso.invalidate({ processoId }),
      utils.documentos.summary.invalidate(),
      utils.dashboard.summary.invalidate(),
    ]);
  }

  function handleMutationError(error: unknown) {
    setFeedback(null);
    setErrorMessage(error instanceof Error ? error.message : "Não foi possível concluir a operação.");
  }

  const configuracaoMutation = trpc.licitacao.saveConfiguracao.useMutation({
    onSuccess: async (_, variables) => {
      await refreshModulo(variables.processoId);
      setFeedback("Configuração da Licitação atualizada.");
      setErrorMessage(null);
    },
    onError: handleMutationError,
  });

  const publishMutation = trpc.licitacao.publish.useMutation({
    onSuccess: async (result, variables) => {
      await refreshModulo(variables.processoId);
      setFeedback(`Processo publicado com o edital ${result.numeroEdital}.`);
      setErrorMessage(null);
      setActiveTab("propostas");
    },
    onError: handleMutationError,
  });

  const licitanteMutation = trpc.licitacao.saveLicitante.useMutation({
    onSuccess: async (_, variables) => {
      await refreshModulo(variables.processoId);
      setFeedback("Licitante adicionado à fase de Licitação.");
      setLicitanteForm({ fornecedorId: "" });
      setErrorMessage(null);
    },
    onError: handleMutationError,
  });

  const fornecedorQuickMutation = trpc.licitacao.createFornecedorQuick.useMutation({
    onSuccess: async (result) => {
      await utils.cadastros.formOptions.invalidate();
      setFeedback(
        result.criado
          ? `Fornecedor ${result.razaoSocial} cadastrado e pronto para a disputa.`
          : result.reativado
            ? `Fornecedor ${result.razaoSocial} reativado e atualizado.`
            : `Fornecedor ${result.razaoSocial} atualizado para uso imediato na Licitação.`,
      );
      setErrorMessage(null);
      setLicitanteForm({ fornecedorId: String(result.id) });
      setFornecedorForm({
        razaoSocial: "",
        cnpj: "",
        email: "",
        telefone: "",
        cidade: "",
        estado: "BA",
      });
      setOpenFornecedorModal(false);
    },
    onError: handleMutationError,
  });

  const deleteLicitanteMutation = trpc.licitacao.deleteLicitante.useMutation({
    onSuccess: async () => {
      if (!selectedProcessId) return;
      await refreshModulo(selectedProcessId);
      setFeedback("Licitante retirado da disputa.");
      setErrorMessage(null);
    },
    onError: handleMutationError,
  });

  const propostaMutation = trpc.licitacao.saveProposta.useMutation({
    onSuccess: async (_, variables) => {
      await refreshModulo(variables.processoId);
      setFeedback("Proposta registrada com sucesso.");
      setErrorMessage(null);
    },
    onError: handleMutationError,
  });

  const lanceMutation = trpc.licitacao.saveLance.useMutation({
    onSuccess: async () => {
      if (!selectedProcessId) return;
      await refreshModulo(selectedProcessId);
      setFeedback("Lance registrado na sessão pública.");
      setErrorMessage(null);
    },
    onError: handleMutationError,
  });

  const habilitacaoMutation = trpc.licitacao.saveHabilitacao.useMutation({
    onSuccess: async () => {
      if (!selectedProcessId) return;
      await refreshModulo(selectedProcessId);
      setFeedback("Situação de habilitação atualizada.");
      setErrorMessage(null);
    },
    onError: handleMutationError,
  });

  const recursoMutation = trpc.licitacao.saveRecurso.useMutation({
    onSuccess: async (_, variables) => {
      await refreshModulo(variables.processoId);
      setFeedback("Recurso administrativo salvo.");
      setErrorMessage(null);
    },
    onError: handleMutationError,
  });

  const advanceStageMutation = trpc.licitacao.advanceStage.useMutation({
    onSuccess: async (_, variables) => {
      await refreshModulo(variables.processoId);
      setFeedback("Etapa da Licitação atualizada.");
      setErrorMessage(null);
    },
    onError: handleMutationError,
  });

  const homologarMutation = trpc.licitacao.homologar.useMutation({
    onSuccess: async (_, variables) => {
      await refreshModulo(variables.processoId);
      setFeedback("Processo homologado na fase licitatória.");
      setErrorMessage(null);
    },
    onError: handleMutationError,
  });

  async function handleSalvarConfiguracao(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProcessId) return;
    const parsed = licitacaoSaveConfiguracaoInputSchema.safeParse({
      processoId: selectedProcessId,
      ...configForm,
    });
    if (!parsed.success) {
      setFieldErrors(mapZodFieldErrors(parsed.error));
      setErrorMessage("Revise a configuração da Licitação antes de salvar.");
      return;
    }
    setFieldErrors({});
    await configuracaoMutation.mutateAsync(parsed.data);
  }

  async function handlePublicar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProcessId) return;
    const parsed = licitacaoPublishInputSchema.safeParse({
      processoId: selectedProcessId,
      condutorProcessoId: Number(publishForm.condutorProcessoId),
      statusId: publishForm.statusId ? Number(publishForm.statusId) : undefined,
      dataPublicacaoEdital: configForm.dataPublicacaoEdital || undefined,
      dataRecebimentoPropostasInicio: configForm.dataRecebimentoPropostasInicio || undefined,
      dataRecebimentoPropostasFim: configForm.dataRecebimentoPropostasFim || undefined,
      dataAberturaPropostas: configForm.dataAberturaPropostas || undefined,
      dataInicioLances: configForm.dataInicioLances || undefined,
      dataFimLances: configForm.dataFimLances || undefined,
      descricao: publishForm.descricao,
      observacao: publishForm.observacao,
    });
    if (!parsed.success) {
      setFieldErrors(mapZodFieldErrors(parsed.error));
      setErrorMessage("Revise os dados da publicação antes de continuar.");
      return;
    }
    setFieldErrors({});
    await publishMutation.mutateAsync(parsed.data);
  }

  async function handleAdicionarLicitante(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProcessId) return;
    const parsed = licitacaoSaveLicitanteInputSchema.safeParse({
      processoId: selectedProcessId,
      fornecedorId: Number(licitanteForm.fornecedorId),
    });
    if (!parsed.success) {
      setFieldErrors(mapZodFieldErrors(parsed.error));
      setErrorMessage("Selecione um fornecedor para registrar como licitante.");
      return;
    }
    setFieldErrors({});
    await licitanteMutation.mutateAsync(parsed.data);
  }

  async function handleCadastrarFornecedorRapido(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = licitacaoQuickFornecedorInputSchema.safeParse(fornecedorForm);
    if (!parsed.success) {
      setFieldErrors(mapZodFieldErrors(parsed.error));
      setErrorMessage("Revise os dados do fornecedor antes de salvar.");
      return;
    }

    setFieldErrors({});
    await fornecedorQuickMutation.mutateAsync(parsed.data);
  }

  async function handleExcluirLicitante(licitanteId: number) {
    const confirmed = window.confirm("Deseja retirar este licitante da disputa? O histórico será preservado.");
    if (!confirmed) return;

    const parsed = licitacaoDeleteLicitanteInputSchema.safeParse({ licitanteId });
    if (!parsed.success) {
      setFieldErrors(mapZodFieldErrors(parsed.error));
      setErrorMessage("Não foi possível preparar a retirada do licitante.");
      return;
    }

    setFieldErrors({});
    await deleteLicitanteMutation.mutateAsync(parsed.data);
  }

  async function handleSalvarProposta(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProcessId) return;
    const valorUnitario = normalizeDecimalInput(propostaForm.valorUnitarioProposto);
    const parsed = licitacaoSavePropostaInputSchema.safeParse({
      processoId: selectedProcessId,
      propostaId: propostaForm.propostaId ? Number(propostaForm.propostaId) : undefined,
      licitanteId: Number(propostaForm.licitanteId),
      itemId: Number(propostaForm.itemId),
      valorUnitarioProposto: valorUnitario,
      dataProposta: propostaForm.dataProposta || undefined,
      classificacao: propostaForm.classificacao ? Number(propostaForm.classificacao) : undefined,
      situacao: propostaForm.situacao,
      justificativa: propostaForm.justificativa,
    });
    if (!parsed.success) {
      setFieldErrors(mapZodFieldErrors(parsed.error));
      setErrorMessage("Revise a proposta antes de salvar.");
      return;
    }
    setFieldErrors({});
    await propostaMutation.mutateAsync(parsed.data);
  }

  async function handleSalvarLance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const valorLance = normalizeDecimalInput(lanceForm.valorLance);
    const parsed = licitacaoSaveLanceInputSchema.safeParse({
      propostaId: Number(lanceForm.propostaId),
      valorLance,
      dataLance: lanceForm.dataLance || undefined,
      observacao: lanceForm.observacao,
    });
    if (!parsed.success) {
      setFieldErrors(mapZodFieldErrors(parsed.error));
      setErrorMessage("Revise os dados do lance antes de registrar.");
      return;
    }
    setFieldErrors({});
    await lanceMutation.mutateAsync(parsed.data);
  }

  async function handleSalvarHabilitacao(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = licitacaoSaveHabilitacaoInputSchema.safeParse({
      licitanteId: Number(habilitacaoForm.licitanteId),
      statusHabilitacao: habilitacaoForm.statusHabilitacao,
      observacaoHabilitacao: habilitacaoForm.observacaoHabilitacao,
    });
    if (!parsed.success) {
      setFieldErrors(mapZodFieldErrors(parsed.error));
      setErrorMessage("Revise a habilitação informada antes de salvar.");
      return;
    }
    setFieldErrors({});
    await habilitacaoMutation.mutateAsync(parsed.data);
  }

  async function handleSalvarRecurso(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProcessId) return;
    const parsed = licitacaoSaveRecursoInputSchema.safeParse({
      processoId: selectedProcessId,
      recursoId: recursoForm.recursoId ? Number(recursoForm.recursoId) : undefined,
      licitanteId: Number(recursoForm.licitanteId),
      dataInterposicao: recursoForm.dataInterposicao || undefined,
      dataJulgamento: recursoForm.dataJulgamento || undefined,
      resultado: recursoForm.resultado,
      descricao: recursoForm.descricao,
      decisao: recursoForm.decisao,
    });
    if (!parsed.success) {
      setFieldErrors(mapZodFieldErrors(parsed.error));
      setErrorMessage("Revise os dados do recurso antes de salvar.");
      return;
    }
    setFieldErrors({});
    await recursoMutation.mutateAsync(parsed.data);
  }

  async function handleHomologar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProcessId) return;
    const parsed = licitacaoHomologarInputSchema.safeParse({
      processoId: selectedProcessId,
      dataHomologacao: homologacaoForm.dataHomologacao || undefined,
      statusId: homologacaoForm.statusId ? Number(homologacaoForm.statusId) : undefined,
      observacao: homologacaoForm.observacao,
    });
    if (!parsed.success) {
      setFieldErrors(mapZodFieldErrors(parsed.error));
      setErrorMessage("Revise a homologação antes de concluir.");
      return;
    }
    setFieldErrors({});
    await homologarMutation.mutateAsync(parsed.data);
  }

  async function handleAdvanceStage(statusLicitacao: string, etapaAtual: string, nextTab: LicitacaoTabValue) {
    if (!selectedProcessId) return;
    const parsed = licitacaoAdvanceStageInputSchema.safeParse({
      processoId: selectedProcessId,
      statusLicitacao,
      etapaAtual,
    });
    if (!parsed.success) {
      setFieldErrors(mapZodFieldErrors(parsed.error));
      setErrorMessage("Não foi possível atualizar a etapa.");
      return;
    }
    setFieldErrors({});
    await advanceStageMutation.mutateAsync(parsed.data);
    setActiveTab(nextTab);
  }

  function handleDocumentoFileChange(category: LicitacaoDocumentCategory, event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setDocumentoForms((current) => ({
      ...current,
      [category]: {
        ...current[category],
        arquivo: nextFile,
        titulo: current[category].titulo || nextFile?.name || "",
      },
    }));
  }

  async function handleUploadDocumentoLicitacao(event: FormEvent<HTMLFormElement>, spec: LicitacaoDocumentSpec) {
    event.preventDefault();
    if (!selectedProcessId) return;

    const form = documentoForms[spec.category];
    if (!form.arquivo) {
      setFeedback(null);
      setErrorMessage(`Selecione um arquivo para ${spec.label.toLowerCase()}.`);
      return;
    }

    try {
      setDocumentoUploading(spec.category);
      setFeedback(null);
      setErrorMessage(null);
      await uploadProcessoDocumento({
        processoId: selectedProcessId,
        tipo: spec.tipo,
        categoria: spec.category,
        titulo: form.titulo.trim() || form.arquivo.name,
        descricao: form.descricao.trim() || undefined,
        arquivo: form.arquivo,
      });
      await refreshModulo(selectedProcessId);
      setDocumentoForms((current) => ({
        ...current,
        [spec.category]: { titulo: "", descricao: "", arquivo: null },
      }));
      setFeedback(`${spec.label} anexado ao processo com sucesso.`);
    } catch (error) {
      setFeedback(null);
      setErrorMessage(error instanceof Error ? error.message : "Falha ao anexar o documento da fase licitatória.");
    } finally {
      setDocumentoUploading(null);
    }
  }

  async function handleDeleteDocumentoLicitacao(documentoId: number) {
    const confirmed = window.confirm("Deseja remover este documento da Licitação?");
    if (!confirmed || !selectedProcessId) return;

    try {
      setFeedback(null);
      setErrorMessage(null);
      await deleteProcessoDocumento(documentoId);
      await refreshModulo(selectedProcessId);
      setFeedback("Documento removido do processo.");
    } catch (error) {
      setFeedback(null);
      setErrorMessage(error instanceof Error ? error.message : "Falha ao remover o documento.");
    }
  }

  function carregarProposta(propostaId: string) {
    const proposta = detail?.propostas.find((item) => String(item.id) === propostaId);
    if (!proposta) return;
    setPropostaForm({
      propostaId: String(proposta.id),
      licitanteId: String(proposta.licitanteId),
      itemId: String(proposta.itemId),
      valorUnitarioProposto: formatDecimalInput(proposta.valorUnitarioProposto),
      dataProposta: toDateTimeLocalValue(proposta.dataProposta),
      classificacao: proposta.classificacao ? String(proposta.classificacao) : "",
      situacao: proposta.situacao,
      justificativa: proposta.justificativa ?? "",
    });
  }

  function carregarRecurso(recursoId: string) {
    const recurso = detail?.recursos.find((item) => String(item.id) === recursoId);
    if (!recurso) return;
    setRecursoForm({
      recursoId: String(recurso.id),
      licitanteId: String(recurso.licitanteId),
      dataInterposicao: toDateInputValue(recurso.dataInterposicao),
      dataJulgamento: toDateInputValue(recurso.dataJulgamento),
      resultado: recurso.resultado,
      descricao: recurso.descricao,
      decisao: recurso.decisao ?? "",
    });
  }

  const licitanteOptions = detail?.licitantes ?? [];
  const licitanteOptionsAtivos = licitanteOptions.filter((item) => item.ativo);
  const propostaOptions = detail?.propostas ?? [];
  const documentosLicitacao = useMemo(
    () =>
      licitacaoDocumentSpecs.map((spec) => ({
        ...spec,
        documentos: documentosProcesso.filter((documento) => documento.categoria === spec.category),
      })),
    [documentosProcesso],
  );

  const tabItems: TabItem[] = [
    {
      value: "publicacao",
      label: "Publicação",
      content: (
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <SectionCard title="Configuração da fase" description="Cronograma oficial, critério de julgamento e modo de disputa.">
              <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSalvarConfiguracao}>
                <FormField label="Critério de julgamento" error={fieldErrors.criterioJulgamento}>
                  <Input value={configForm.criterioJulgamento} onChange={(event) => setConfigForm((current) => ({ ...current, criterioJulgamento: event.target.value }))} placeholder="Ex.: menor preço por item" />
                </FormField>
                <FormField label="Modo de disputa" error={fieldErrors.modoDisputa}>
                  <Select value={configForm.modoDisputa} onChange={(event) => setConfigForm((current) => ({ ...current, modoDisputa: event.target.value }))}>
                    <option value="">Selecione</option>
                    {catalogQuery.data?.modoDisputa.map((item) => (
                      <option key={item.codigo} value={item.codigo}>{item.nome}</option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Publicação do edital"><Input type="datetime-local" value={configForm.dataPublicacaoEdital} onChange={(event) => setConfigForm((current) => ({ ...current, dataPublicacaoEdital: event.target.value }))} /></FormField>
                <FormField label="Início do recebimento"><Input type="datetime-local" value={configForm.dataRecebimentoPropostasInicio} onChange={(event) => setConfigForm((current) => ({ ...current, dataRecebimentoPropostasInicio: event.target.value }))} /></FormField>
                <FormField label="Fim do recebimento"><Input type="datetime-local" value={configForm.dataRecebimentoPropostasFim} onChange={(event) => setConfigForm((current) => ({ ...current, dataRecebimentoPropostasFim: event.target.value }))} /></FormField>
                <FormField label="Abertura de propostas"><Input type="datetime-local" value={configForm.dataAberturaPropostas} onChange={(event) => setConfigForm((current) => ({ ...current, dataAberturaPropostas: event.target.value }))} /></FormField>
                <FormField label="Início dos lances"><Input type="datetime-local" value={configForm.dataInicioLances} onChange={(event) => setConfigForm((current) => ({ ...current, dataInicioLances: event.target.value }))} disabled={!processo?.suportaLances} /></FormField>
                <FormField label="Fim dos lances"><Input type="datetime-local" value={configForm.dataFimLances} onChange={(event) => setConfigForm((current) => ({ ...current, dataFimLances: event.target.value }))} disabled={!processo?.suportaLances} /></FormField>
                <FormField label="Data de julgamento" className="md:col-span-2"><Input type="datetime-local" value={configForm.dataJulgamento} onChange={(event) => setConfigForm((current) => ({ ...current, dataJulgamento: event.target.value }))} /></FormField>
                <FormField label="Observações da fase" className="md:col-span-2"><Textarea rows={4} value={configForm.observacoes} onChange={(event) => setConfigForm((current) => ({ ...current, observacoes: event.target.value }))} /></FormField>
                <div className="md:col-span-2 flex flex-wrap gap-3">
                  <Button type="submit" disabled={configuracaoMutation.isPending}>Salvar configuração</Button>
                  <Button type="button" variant="outline" onClick={() => handleAdvanceStage("PUBLICACAO", "Licitação / edital em preparação", "publicacao")}>Marcar preparação do edital</Button>
                </div>
              </form>
            </SectionCard>

            <SectionCard title="Publicação oficial" description="Definição do condutor e geração do número do edital.">
              <form className="space-y-4" onSubmit={handlePublicar}>
                <FormField label="Condutor do processo" error={fieldErrors.condutorProcessoId}>
                  <Select value={publishForm.condutorProcessoId} onChange={(event) => setPublishForm((current) => ({ ...current, condutorProcessoId: event.target.value }))}>
                    <option value="">Selecione</option>
                    {catalogQuery.data?.pessoas.map((item) => (
                      <option key={item.id} value={item.id}>{item.nome}{item.cargo ? ` - ${item.cargo}` : ""}</option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Status do processo">
                  <Select value={publishForm.statusId} onChange={(event) => setPublishForm((current) => ({ ...current, statusId: event.target.value }))}>
                    <option value="">Manter atual</option>
                    {catalogQuery.data?.statusProcesso.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
                  </Select>
                </FormField>
                <FormField label="Descrição da movimentação"><Input value={publishForm.descricao} onChange={(event) => setPublishForm((current) => ({ ...current, descricao: event.target.value }))} /></FormField>
                <FormField label="Observação"><Textarea rows={4} value={publishForm.observacao} onChange={(event) => setPublishForm((current) => ({ ...current, observacao: event.target.value }))} /></FormField>
                <Alert variant={processo?.publicado ? "success" : "info"}>
                  {processo?.publicado
                    ? `Edital já gerado: ${processo.numeroEdital ?? "-"}. Condutor atual: ${processo.condutorProcesso?.nome ?? "-"}`
                    : "Ao publicar, o SIREL gera o número do edital por modalidade, define o condutor e inicia a subetapa de propostas."}
                </Alert>
                <Button type="submit" disabled={publishMutation.isPending}>Publicar processo</Button>
              </form>
            </SectionCard>
          </div>

          <SectionCard title="Documentos do processo" description="Acervo recente vinculado ao processo licitatório.">
            <div className="overflow-x-auto rounded-[24px] border border-slate-200">
              <Table className="min-w-[680px]">
                <TableHead><tr><TableHeaderCell>Título</TableHeaderCell><TableHeaderCell>Tipo</TableHeaderCell><TableHeaderCell>Categoria</TableHeaderCell><TableHeaderCell>Criado em</TableHeaderCell></tr></TableHead>
                <TableBody>
                  {detail?.documentos.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-semibold text-slate-950">{doc.arquivoUrl ? <a className="text-sky-700 hover:underline" href={doc.arquivoUrl} target="_blank" rel="noreferrer">{doc.titulo}</a> : doc.titulo}</TableCell>
                      <TableCell>{doc.tipo}</TableCell>
                      <TableCell>{doc.categoria ?? "-"}</TableCell>
                      <TableCell>{formatShortDateTimeBR(doc.criadoEm)}</TableCell>
                    </TableRow>
                  ))}
                  {!detail?.documentos.length ? <TableRow><TableCell colSpan={4} className="text-center text-slate-500">Nenhum documento recente registrado para a Licitação.</TableCell></TableRow> : null}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </div>
      ),
    },
    {
      value: "documentos",
      label: "Documentos",
      content: (
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            {documentosLicitacao.map((spec) => {
              const form = documentoForms[spec.category];
              const docs = spec.documentos;
              return (
                <SectionCard key={spec.category} title={spec.label} description={spec.description}>
                  <div className="space-y-4">
                    <form className="grid gap-4 md:grid-cols-[1fr_1fr_220px] md:items-end" onSubmit={(event) => void handleUploadDocumentoLicitacao(event, spec)}>
                      <FormField label={`Título do ${spec.label.toLowerCase()}`}>
                        <Input
                          value={form.titulo}
                          onChange={(event) =>
                            setDocumentoForms((current) => ({
                              ...current,
                              [spec.category]: {
                                ...current[spec.category],
                                titulo: event.target.value,
                              },
                            }))
                          }
                          placeholder={spec.label}
                        />
                      </FormField>
                      <FormField label="Descrição">
                        <Input
                          value={form.descricao}
                          onChange={(event) =>
                            setDocumentoForms((current) => ({
                              ...current,
                              [spec.category]: {
                                ...current[spec.category],
                                descricao: event.target.value,
                              },
                            }))
                          }
                          placeholder="Resumo do documento anexado"
                        />
                      </FormField>
                      <FormField label="Arquivo">
                        <Input type="file" onChange={(event) => handleDocumentoFileChange(spec.category, event)} />
                      </FormField>
                      <div className="md:col-span-3 flex flex-wrap items-center gap-3">
                        <Button type="submit" disabled={documentoUploading === spec.category}>
                          <Upload className="h-4 w-4" />
                          {documentoUploading === spec.category ? "Enviando..." : `Anexar ${spec.label}`}
                        </Button>
                        <span className="text-xs text-slate-500">
                          {docs.length
                            ? `${docs.length} documento(s) já arquivado(s) nesta categoria.`
                            : "Nenhum documento arquivado nesta categoria ainda."}
                        </span>
                      </div>
                    </form>

                    <div className="overflow-x-auto rounded-[24px] border border-slate-200">
                      <Table className="min-w-[720px]">
                        <TableHead>
                          <tr>
                            <TableHeaderCell>Título</TableHeaderCell>
                            <TableHeaderCell>Descrição</TableHeaderCell>
                            <TableHeaderCell>Data</TableHeaderCell>
                            <TableHeaderCell className="text-right">Ações</TableHeaderCell>
                          </tr>
                        </TableHead>
                        <TableBody>
                          {docs.map((doc) => (
                            <TableRow key={doc.id}>
                              <TableCell className="font-semibold text-slate-950">{doc.titulo}</TableCell>
                              <TableCell>{doc.descricao ?? "-"}</TableCell>
                              <TableCell>{formatShortDateTimeBR(doc.criadoEm)}</TableCell>
                              <TableCell>
                                <div className="flex justify-end gap-2">
                                  <Button type="button" variant="outline" size="sm" onClick={() => window.open(doc.arquivoUrl ?? "#", "_blank", "noopener,noreferrer")}>
                                    <FolderOpen className="h-4 w-4" />
                                    Abrir
                                  </Button>
                                  <Button type="button" variant="ghost" size="sm" onClick={() => void handleDeleteDocumentoLicitacao(doc.id)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                          {!docs.length ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-slate-500">
                                Nenhum documento cadastrado para {spec.label.toLowerCase()}.
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </SectionCard>
              );
            })}
          </div>
        </div>
      ),
    },
    {
      value: "licitantes",
      label: "Licitantes",
      content: (
        <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <SectionCard title="Cadastrar licitante" description="Registro dos participantes habilitados a apresentar propostas.">
            <form className="space-y-4" onSubmit={handleAdicionarLicitante}>
              {!catalogQuery.data?.fornecedores.length ? <Alert variant="warning">Ainda não há fornecedores ativos cadastrados na base Beta 2.0 para compor a disputa.</Alert> : null}
              <FormField label="Fornecedor" error={fieldErrors.fornecedorId}>
                <Select value={licitanteForm.fornecedorId} onChange={(event) => setLicitanteForm({ fornecedorId: event.target.value })}>
                  <option value="">Selecione</option>
                  {catalogQuery.data?.fornecedores.map((item) => <option key={item.id} value={item.id}>{item.razaoSocial} · {formatCnpjBR(item.cnpj)}</option>)}
                </Select>
              </FormField>
              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={licitanteMutation.isPending}>Adicionar licitante</Button>
                <Button type="button" variant="outline" onClick={() => setOpenFornecedorModal(true)}>
                  <Plus className="h-4 w-4" />
                  Cadastro rápido de fornecedor
                </Button>
              </div>
            </form>
          </SectionCard>
          <SectionCard title="Participantes" description="Licitantes cadastrados na disputa, com situação documental e controle de atividade.">
            <div className="overflow-x-auto rounded-[24px] border border-slate-200">
              <Table className="min-w-[760px]">
                <TableHead><tr><TableHeaderCell>Fornecedor</TableHeaderCell><TableHeaderCell>CNPJ</TableHeaderCell><TableHeaderCell>Habilitação</TableHeaderCell><TableHeaderCell>Situação</TableHeaderCell><TableHeaderCell>Cadastro</TableHeaderCell><TableHeaderCell className="text-right">Ações</TableHeaderCell></tr></TableHead>
                <TableBody>
                  {licitanteOptions.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-semibold text-slate-950">{item.razaoSocial}</TableCell>
                      <TableCell>{formatCnpjBR(item.cnpj)}</TableCell>
                      <TableCell><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${item.statusHabilitacao === "HABILITADO" ? "bg-emerald-100 text-emerald-800" : item.statusHabilitacao === "INABILITADO" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>{habilitacaoStatusLabels[item.statusHabilitacao]}</span></TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${item.ativo ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-600"}`}>
                          {item.ativo ? "Ativo" : "Retirado"}
                        </span>
                      </TableCell>
                      <TableCell>{formatShortDateTimeBR(item.dataCadastro)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => {
                            setHabilitacaoForm({
                              licitanteId: String(item.id),
                              statusHabilitacao: item.statusHabilitacao,
                              observacaoHabilitacao: item.observacaoHabilitacao ?? "",
                            });
                            setActiveTab("habilitacao");
                          }}>
                            Ir para habilitação
                          </Button>
                          <Button type="button" variant="ghost" size="sm" disabled={!item.ativo || deleteLicitanteMutation.isPending} onClick={() => void handleExcluirLicitante(item.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!licitanteOptions.length ? <TableRow><TableCell colSpan={6} className="text-center text-slate-500">Nenhum licitante registrado até o momento.</TableCell></TableRow> : null}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </div>
      ),
    },
    {
      value: "propostas",
      label: "Propostas",
      content: (
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <SectionCard title="Recebimento de propostas" description="Cadastro ou ajuste das propostas dos licitantes por item.">
            <form className="space-y-4" onSubmit={handleSalvarProposta}>
              <FormField label="Editar proposta existente">
                <Select value={propostaForm.propostaId} onChange={(event) => carregarProposta(event.target.value)}>
                  <option value="">Nova proposta</option>
                  {propostaOptions.map((item) => <option key={item.id} value={item.id}>{item.licitanteNome} · Item {item.itemNumero}</option>)}
                </Select>
              </FormField>
              <FormField label="Licitante" error={fieldErrors.licitanteId}>
                <Select value={propostaForm.licitanteId} onChange={(event) => setPropostaForm((current) => ({ ...current, licitanteId: event.target.value }))}>
                  <option value="">Selecione</option>
                  {licitanteOptionsAtivos.map((item) => <option key={item.id} value={item.id}>{item.razaoSocial}</option>)}
                </Select>
              </FormField>
              <FormField label="Item do processo" error={fieldErrors.itemId}>
                <Select value={propostaForm.itemId} onChange={(event) => setPropostaForm((current) => ({ ...current, itemId: event.target.value }))}>
                  <option value="">Selecione</option>
                  {detail?.itens.map((item) => <option key={item.id} value={item.id}>Item {item.numeroItem} · {item.descricao}</option>)}
                </Select>
              </FormField>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Valor unitário proposto" error={fieldErrors.valorUnitarioProposto}><Input value={propostaForm.valorUnitarioProposto} onChange={(event) => setPropostaForm((current) => ({ ...current, valorUnitarioProposto: event.target.value }))} placeholder="0,00" /></FormField>
                <FormField label="Data/hora da proposta"><Input type="datetime-local" value={propostaForm.dataProposta} onChange={(event) => setPropostaForm((current) => ({ ...current, dataProposta: event.target.value }))} /></FormField>
              </div>
              <Button type="submit" disabled={propostaMutation.isPending}>Salvar proposta</Button>
              <Button type="button" variant="outline" onClick={() => handleAdvanceStage("RECEBIMENTO_PROPOSTAS", "Licitação / recebimento de propostas", "propostas")}>Marcar recebimento de propostas</Button>
            </form>
          </SectionCard>
          <SectionCard title="Propostas registradas" description="Comparativo inicial das propostas por item.">
            <div className="overflow-x-auto rounded-[24px] border border-slate-200">
              <Table className="min-w-[760px]">
                <TableHead><tr><TableHeaderCell>Item</TableHeaderCell><TableHeaderCell>Licitante</TableHeaderCell><TableHeaderCell>Valor atual</TableHeaderCell><TableHeaderCell>Situação</TableHeaderCell><TableHeaderCell>Classificação</TableHeaderCell></tr></TableHead>
                <TableBody>
                  {propostaOptions.map((item) => (
                    <TableRow key={item.id} onClick={() => carregarProposta(String(item.id))} className="cursor-pointer hover:bg-slate-50">
                      <TableCell><div className="font-semibold text-slate-950">Item {item.itemNumero}</div><div className="text-xs text-slate-500">{item.itemDescricao}</div></TableCell>
                      <TableCell>{item.licitanteNome}</TableCell>
                      <TableCell>{formatCurrencyBRL(item.valorAtualUnitario)}</TableCell>
                      <TableCell>{propostaSituacaoLabels[item.situacao]}</TableCell>
                      <TableCell>{item.classificacao ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                  {!propostaOptions.length ? <TableRow><TableCell colSpan={5} className="text-center text-slate-500">Nenhuma proposta registrada.</TableCell></TableRow> : null}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </div>
      ),
    },
    {
      value: "lances",
      label: "Lances",
      content: (
        <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <SectionCard title="Sessão pública" description={processo?.suportaLances ? "Registro dos lances ofertados pelos licitantes." : "Esta modalidade não prevê etapa competitiva por lances."}>
            {processo?.suportaLances ? (
              <form className="space-y-4" onSubmit={handleSalvarLance}>
                <FormField label="Proposta vinculada" error={fieldErrors.propostaId}>
                  <Select value={lanceForm.propostaId} onChange={(event) => setLanceForm((current) => ({ ...current, propostaId: event.target.value }))}>
                    <option value="">Selecione</option>
                    {propostaOptions.map((item) => <option key={item.id} value={item.id}>{item.licitanteNome} · Item {item.itemNumero}</option>)}
                  </Select>
                </FormField>
                <FormField label="Valor do lance" error={fieldErrors.valorLance}><Input value={lanceForm.valorLance} onChange={(event) => setLanceForm((current) => ({ ...current, valorLance: event.target.value }))} placeholder="0,00" /></FormField>
                <FormField label="Data/hora do lance"><Input type="datetime-local" value={lanceForm.dataLance} onChange={(event) => setLanceForm((current) => ({ ...current, dataLance: event.target.value }))} /></FormField>
                <FormField label="Observação"><Textarea rows={3} value={lanceForm.observacao} onChange={(event) => setLanceForm((current) => ({ ...current, observacao: event.target.value }))} /></FormField>
                <div className="flex flex-wrap gap-3">
                  <Button type="submit" disabled={lanceMutation.isPending}>Registrar lance</Button>
                  <Button type="button" variant="outline" onClick={() => handleAdvanceStage("LANCES", "Licitação / sessão de lances", "lances")}>Marcar fase de lances</Button>
                </div>
              </form>
            ) : (
              <Alert variant="info">Para esta modalidade, a etapa de lances não se aplica. O fluxo pode seguir diretamente para julgamento.</Alert>
            )}
          </SectionCard>
          <SectionCard title="Histórico da disputa" description="Últimos lances registrados, com rastreabilidade do usuário.">
            <div className="overflow-x-auto rounded-[24px] border border-slate-200">
              <Table className="min-w-[720px]">
                <TableHead><tr><TableHeaderCell>Proposta</TableHeaderCell><TableHeaderCell>Valor</TableHeaderCell><TableHeaderCell>Data/hora</TableHeaderCell><TableHeaderCell>Usuário</TableHeaderCell></tr></TableHead>
                <TableBody>
                  {detail?.lances.map((item) => {
                    const proposta = propostaOptions.find((propostaRow) => propostaRow.id === item.propostaId);
                    return <TableRow key={item.id}><TableCell>{proposta ? `${proposta.licitanteNome} · Item ${proposta.itemNumero}` : `Proposta ${item.propostaId}`}</TableCell><TableCell>{formatCurrencyBRL(item.valorLance)}</TableCell><TableCell>{formatShortDateTimeBR(item.dataLance)}</TableCell><TableCell>{item.usuarioNome ?? "-"}</TableCell></TableRow>;
                  })}
                  {!detail?.lances.length ? <TableRow><TableCell colSpan={4} className="text-center text-slate-500">Nenhum lance registrado.</TableCell></TableRow> : null}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </div>
      ),
    },
    {
      value: "julgamento",
      label: "Julgamento",
      content: (
        <SectionCard title="Classificação e julgamento" description="Atualize a classificação final das propostas e marque a vencedora quando couber.">
          <form className="grid gap-4 lg:grid-cols-[0.75fr_1.25fr]" onSubmit={handleSalvarProposta}>
            <div className="space-y-4">
              <FormField label="Proposta para julgamento">
                <Select value={propostaForm.propostaId} onChange={(event) => carregarProposta(event.target.value)}>
                  <option value="">Selecione</option>
                  {propostaOptions.map((item) => <option key={item.id} value={item.id}>{item.licitanteNome} · Item {item.itemNumero}</option>)}
                </Select>
              </FormField>
              <FormField label="Classificação final"><Input value={propostaForm.classificacao} onChange={(event) => setPropostaForm((current) => ({ ...current, classificacao: event.target.value }))} placeholder="1" /></FormField>
              <FormField label="Situação da proposta">
                <Select value={propostaForm.situacao} onChange={(event) => setPropostaForm((current) => ({ ...current, situacao: event.target.value }))}>
                  {propostaSituacaoOptions.map((item) => <option key={item} value={item}>{propostaSituacaoLabels[item]}</option>)}
                </Select>
              </FormField>
              <FormField label="Justificativa"><Textarea rows={4} value={propostaForm.justificativa} onChange={(event) => setPropostaForm((current) => ({ ...current, justificativa: event.target.value }))} /></FormField>
              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={propostaMutation.isPending || !propostaForm.propostaId}>Salvar julgamento</Button>
                <Button type="button" variant="outline" onClick={() => handleAdvanceStage("JULGAMENTO", "Licitação / análise e julgamento", "julgamento")}>Marcar julgamento</Button>
              </div>
            </div>
            <div className="overflow-x-auto rounded-[24px] border border-slate-200">
              <Table className="min-w-[760px]">
                <TableHead><tr><TableHeaderCell>Item</TableHeaderCell><TableHeaderCell>Licitante</TableHeaderCell><TableHeaderCell>Valor atual</TableHeaderCell><TableHeaderCell>Situação</TableHeaderCell><TableHeaderCell>Classificação</TableHeaderCell></tr></TableHead>
                <TableBody>
                  {propostaOptions.map((item) => (
                    <TableRow key={item.id} onClick={() => carregarProposta(String(item.id))} className="cursor-pointer hover:bg-slate-50">
                      <TableCell>{item.itemNumero}</TableCell>
                      <TableCell>{item.licitanteNome}</TableCell>
                      <TableCell>{formatCurrencyBRL(item.valorAtualUnitario)}</TableCell>
                      <TableCell>{propostaSituacaoLabels[item.situacao]}</TableCell>
                      <TableCell>{item.classificacao ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                  {!propostaOptions.length ? <TableRow><TableCell colSpan={5} className="text-center text-slate-500">Ainda não há propostas para julgamento.</TableCell></TableRow> : null}
                </TableBody>
              </Table>
            </div>
          </form>
        </SectionCard>
      ),
    },
    {
      value: "habilitacao",
      label: "Habilitação",
      content: (
        <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <SectionCard title="Verificação documental" description="Atualize a situação de habilitação do licitante classificado.">
            <form className="space-y-4" onSubmit={handleSalvarHabilitacao}>
              <FormField label="Licitante">
                <Select value={habilitacaoForm.licitanteId} onChange={(event) => {
                  const next = licitanteOptions.find((item) => String(item.id) === event.target.value);
                  setHabilitacaoForm({
                    licitanteId: event.target.value,
                    statusHabilitacao: next?.statusHabilitacao ?? "PENDENTE",
                    observacaoHabilitacao: next?.observacaoHabilitacao ?? "",
                  });
                }}>
                  <option value="">Selecione</option>
                  {licitanteOptionsAtivos.map((item) => <option key={item.id} value={item.id}>{item.razaoSocial}</option>)}
                </Select>
              </FormField>
              <FormField label="Situação da habilitação">
                <Select value={habilitacaoForm.statusHabilitacao} onChange={(event) => setHabilitacaoForm((current) => ({ ...current, statusHabilitacao: event.target.value }))}>
                  {habilitacaoStatusOptions.map((item) => <option key={item} value={item}>{habilitacaoStatusLabels[item]}</option>)}
                </Select>
              </FormField>
              <FormField label="Observação"><Textarea rows={4} value={habilitacaoForm.observacaoHabilitacao} onChange={(event) => setHabilitacaoForm((current) => ({ ...current, observacaoHabilitacao: event.target.value }))} /></FormField>
              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={habilitacaoMutation.isPending}>Salvar habilitação</Button>
                <Button type="button" variant="outline" onClick={() => handleAdvanceStage("HABILITACAO", "Licitação / verificação documental", "habilitacao")}>Marcar habilitação</Button>
              </div>
            </form>
          </SectionCard>
          <SectionCard title="Quadro de habilitação" description="Situação documental atual dos licitantes.">
            <div className="overflow-x-auto rounded-[24px] border border-slate-200">
              <Table className="min-w-[620px]">
                <TableHead><tr><TableHeaderCell>Licitante</TableHeaderCell><TableHeaderCell>Situação</TableHeaderCell><TableHeaderCell>Observação</TableHeaderCell></tr></TableHead>
                <TableBody>
                  {licitanteOptionsAtivos.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-semibold text-slate-950">{item.razaoSocial}</TableCell>
                      <TableCell>{habilitacaoStatusLabels[item.statusHabilitacao]}</TableCell>
                      <TableCell>{item.observacaoHabilitacao ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                  {!licitanteOptions.length ? <TableRow><TableCell colSpan={3} className="text-center text-slate-500">Nenhum licitante para habilitar.</TableCell></TableRow> : null}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </div>
      ),
    },
    {
      value: "recursos",
      label: "Recursos",
      content: (
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <SectionCard title="Interposição e decisão" description="Registro de recursos administrativos, pareceres e julgamento.">
            <form className="space-y-4" onSubmit={handleSalvarRecurso}>
              <FormField label="Editar recurso existente">
                <Select value={recursoForm.recursoId} onChange={(event) => carregarRecurso(event.target.value)}>
                  <option value="">Novo recurso</option>
                  {detail?.recursos.map((item) => <option key={item.id} value={item.id}>{item.licitanteNome} · {formatShortDateBR(item.dataInterposicao)}</option>)}
                </Select>
              </FormField>
              <FormField label="Licitante">
                <Select value={recursoForm.licitanteId} onChange={(event) => setRecursoForm((current) => ({ ...current, licitanteId: event.target.value }))}>
                  <option value="">Selecione</option>
                  {licitanteOptionsAtivos.map((item) => <option key={item.id} value={item.id}>{item.razaoSocial}</option>)}
                </Select>
              </FormField>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Data da interposição"><Input type="date" value={recursoForm.dataInterposicao} onChange={(event) => setRecursoForm((current) => ({ ...current, dataInterposicao: event.target.value }))} /></FormField>
                <FormField label="Data do julgamento"><Input type="date" value={recursoForm.dataJulgamento} onChange={(event) => setRecursoForm((current) => ({ ...current, dataJulgamento: event.target.value }))} /></FormField>
              </div>
              <FormField label="Resultado">
                <Select value={recursoForm.resultado} onChange={(event) => setRecursoForm((current) => ({ ...current, resultado: event.target.value }))}>
                  {recursoResultadoOptions.map((item) => <option key={item} value={item}>{recursoResultadoLabels[item]}</option>)}
                </Select>
              </FormField>
              <FormField label="Descrição do recurso"><Textarea rows={4} value={recursoForm.descricao} onChange={(event) => setRecursoForm((current) => ({ ...current, descricao: event.target.value }))} /></FormField>
              <FormField label="Decisão/Parecer"><Textarea rows={4} value={recursoForm.decisao} onChange={(event) => setRecursoForm((current) => ({ ...current, decisao: event.target.value }))} /></FormField>
              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={recursoMutation.isPending}>Salvar recurso</Button>
                <Button type="button" variant="outline" onClick={() => handleAdvanceStage("RECURSOS", "Licitação / recursos administrativos", "recursos")}>Marcar fase recursal</Button>
              </div>
            </form>
          </SectionCard>
          <SectionCard title="Recursos registrados" description="Histórico recursal consolidado da licitação.">
            <div className="overflow-x-auto rounded-[24px] border border-slate-200">
              <Table className="min-w-[760px]">
                <TableHead><tr><TableHeaderCell>Licitante</TableHeaderCell><TableHeaderCell>Interposição</TableHeaderCell><TableHeaderCell>Resultado</TableHeaderCell><TableHeaderCell>Decisão</TableHeaderCell></tr></TableHead>
                <TableBody>
                  {detail?.recursos.map((item) => (
                    <TableRow key={item.id} onClick={() => carregarRecurso(String(item.id))} className="cursor-pointer hover:bg-slate-50">
                      <TableCell>{item.licitanteNome}</TableCell>
                      <TableCell>{formatShortDateBR(item.dataInterposicao)}</TableCell>
                      <TableCell>{recursoResultadoLabels[item.resultado]}</TableCell>
                      <TableCell>{item.decisao ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                  {!detail?.recursos.length ? <TableRow><TableCell colSpan={4} className="text-center text-slate-500">Nenhum recurso cadastrado.</TableCell></TableRow> : null}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </div>
      ),
    },
    {
      value: "homologacao",
      label: "Homologação",
      content: (
        <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <SectionCard title="Homologação do resultado" description="Encerramento da fase licitatória e consolidação do resultado final.">
            <form className="space-y-4" onSubmit={handleHomologar}>
              <FormField label="Data da homologação"><Input type="date" value={homologacaoForm.dataHomologacao} onChange={(event) => setHomologacaoForm((current) => ({ ...current, dataHomologacao: event.target.value }))} /></FormField>
              <FormField label="Status do processo">
                <Select value={homologacaoForm.statusId} onChange={(event) => setHomologacaoForm((current) => ({ ...current, statusId: event.target.value }))}>
                  <option value="">Manter atual</option>
                  {catalogQuery.data?.statusProcesso.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
                </Select>
              </FormField>
              <FormField label="Observação final"><Textarea rows={4} value={homologacaoForm.observacao} onChange={(event) => setHomologacaoForm((current) => ({ ...current, observacao: event.target.value }))} /></FormField>
              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={homologarMutation.isPending}>Homologar processo</Button>
                <Button type="button" variant="outline" onClick={() => handleAdvanceStage("CONTRATACAO", "Licitação / aguardando contratação", "homologacao")}>Encaminhar para contratação</Button>
              </div>
            </form>
          </SectionCard>
          <SectionCard title="Timeline da fase" description="Movimentações recentes da Licitação e do workflow do processo.">
            <div className="space-y-3">
              {detail?.historico.map((item) => (
                <article key={item.id} className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                  <p className="text-sm font-semibold text-slate-950">{item.descricao}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatShortDateTimeBR(item.criadoEm)}</p>
                  {item.observacao ? <p className="mt-2 text-sm leading-6 text-slate-600">{item.observacao}</p> : null}
                </article>
              ))}
              {!detail?.historico.length ? <p className="text-sm text-slate-500">Sem histórico recente da fase.</p> : null}
            </div>
          </SectionCard>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-4">
        <article className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Em Licitação</p><p className="mt-2 text-3xl font-black text-slate-950">{summaryQuery.data?.total ?? 0}</p><p className="mt-2 text-sm text-slate-600">Processos ativos dentro do módulo de Licitação.</p></article>
        <article className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Publicados</p><p className="mt-2 text-3xl font-black text-slate-950">{summaryQuery.data?.publicados ?? 0}</p><p className="mt-2 text-sm text-slate-600">Com edital numerado e cronograma oficial em andamento.</p></article>
        <article className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Aguardando publicidade</p><p className="mt-2 text-3xl font-black text-slate-950">{summaryQuery.data?.aguardandoPublicacao ?? 0}</p><p className="mt-2 text-sm text-slate-600">Processos já em Licitação, mas ainda sem publicação concluída.</p></article>
        <article className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Recursos pendentes</p><p className="mt-2 text-3xl font-black text-slate-950">{summaryQuery.data?.recursosPendentes ?? 0}</p><p className="mt-2 text-sm text-slate-600">Demandas recursais ainda sem decisão registrada.</p></article>
      </div>

      <SectionCard
        title="Módulo de Licitação"
        description="Controle visual das subetapas da Lei nº 14.133/2021, com avanço por fase, formulários contextuais e rastreabilidade do processo."
        action={
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_230px_150px]">
            <FormField label="Buscar">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                <Search className="h-4 w-4 text-slate-400" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Processo, objeto ou secretaria" className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" />
              </div>
            </FormField>
            <FormField label="Status da Licitação">
              <Select value={statusFilter} onChange={(event) => setStatusFilter((event.target.value || "") as "" | (typeof licitacaoStatusOptions)[number])}>
                <option value="">Todos</option>
                {licitacaoStatusOptions.map((item) => <option key={item} value={item}>{licitacaoStatusLabels[item]}</option>)}
              </Select>
            </FormField>
            <FormField label="Por página">
              <Select value={String(pageSize)} onChange={(event) => setPageSize(Number(event.target.value))}>
                {[12, 24, 48].map((option) => <option key={option} value={option}>{option}</option>)}
              </Select>
            </FormField>
          </div>
        }
      >
        <div className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white">
              <Table className="min-w-[760px]">
                <TableHead><tr><TableHeaderCell>Processo</TableHeaderCell><TableHeaderCell>Etapa</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell><TableHeaderCell>Edital</TableHeaderCell></tr></TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.processoId} onClick={() => setSelectedProcessId(row.processoId)} className={`cursor-pointer transition ${row.processoId === selectedProcessId ? "bg-sky-50" : "hover:bg-slate-50"}`}>
                      <TableCell><div className="font-bold text-slate-950">{row.numeroSirel}</div><div className="text-xs text-slate-500">{row.secretaria}</div></TableCell>
                      <TableCell><div className="font-semibold text-slate-950">{row.etapaAtual}</div><div className="text-xs text-slate-500">{row.modalidade ?? "Modalidade não definida"}</div></TableCell>
                      <TableCell><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusBadgeClass(row.statusLicitacao)}`}>{licitacaoStatusLabels[row.statusLicitacao]}</span><div className="mt-2 text-xs text-slate-500">{row.condutorNome ?? "Sem condutor publicado"}</div></TableCell>
                      <TableCell>{row.numeroEdital ?? "Ainda não gerado"}</TableCell>
                    </TableRow>
                  ))}
                  {!rows.length ? <TableRow><TableCell colSpan={4} className="text-center text-slate-500">{listQuery.isFetching ? "Carregando processos da Licitação..." : "Nenhum processo está atualmente no módulo de Licitação."}</TableCell></TableRow> : null}
                </TableBody>
              </Table>
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>

          <div className="space-y-4">
            {!selectedProcessId ? <SectionCard title="Seleção do processo" description="Escolha um processo na grade para operar a fase licitatória."><p className="text-sm text-slate-500">Nenhum processo selecionado.</p></SectionCard> : detailQuery.isLoading ? <SectionCard title="Carregando fase licitatória" description="Buscando dados do processo selecionado."><div className="space-y-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-20 rounded-[24px]" />)}</div></SectionCard> : processo ? (
              <>
                <SectionCard title={`${processo.numeroSirel} · ${processo.modalidade ?? "Licitação"}`} description={processo.objeto}>
                  <div className="grid gap-4 md:grid-cols-4">
                    <article className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4"><div className="flex items-center gap-2 text-slate-500"><Megaphone className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-[0.18em]">Edital</span></div><p className="mt-3 text-lg font-black text-slate-950">{processo.numeroEdital ?? "Não gerado"}</p></article>
                    <article className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4"><div className="flex items-center gap-2 text-slate-500"><Users className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-[0.18em]">Licitantes</span></div><p className="mt-3 text-lg font-black text-slate-950">{detail?.resumo.totalLicitantes ?? 0}</p></article>
                    <article className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4"><div className="flex items-center gap-2 text-slate-500"><ScrollText className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-[0.18em]">Propostas</span></div><p className="mt-3 text-lg font-black text-slate-950">{detail?.resumo.totalPropostas ?? 0}</p></article>
                    <article className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4"><div className="flex items-center gap-2 text-slate-500"><Gavel className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-[0.18em]">Situação</span></div><p className="mt-3 text-lg font-black text-slate-950">{licitacaoStatusLabels[(licitacao?.statusLicitacao ?? "PREPARACAO") as keyof typeof licitacaoStatusLabels]}</p></article>
                  </div>
                </SectionCard>

                <SectionCard title="Workflow visual por etapa" description="Linha do tempo operacional da Licitação, com destaque para a etapa atual e as próximas transições.">
                  <div className="grid gap-3 xl:grid-cols-3">
                    {licitacaoStepCatalog.map((step) => <StepperCard key={step.key} label={step.label} description={step.description} state={workflowStepState(licitacao?.statusLicitacao ?? "PREPARACAO", step.key)} onClick={() => setActiveTab(statusToTab(step.key))} />)}
                  </div>
                </SectionCard>

                {feedback ? <Alert variant="success">{feedback}</Alert> : null}
                {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}

                <Tabs items={tabItems} value={activeTab} onValueChange={(value) => setActiveTab(value as LicitacaoTabValue)} />
              </>
            ) : <SectionCard title="Processo indisponível" description="Não foi possível carregar o detalhamento da Licitação."><p className="text-sm text-slate-500">Selecione outro processo ou tente novamente.</p></SectionCard>}
          </div>
        </div>
      </SectionCard>

      <Modal
        open={openFornecedorModal}
        onClose={() => setOpenFornecedorModal(false)}
        title="Cadastro rápido de fornecedor"
        description="Cadastre o fornecedor sem sair da fase licitatória e já deixe-o disponível para inclusão como licitante."
        size="md"
      >
        <form className="space-y-4" onSubmit={handleCadastrarFornecedorRapido}>
          <FormField label="Razão social" error={fieldErrors.razaoSocial}>
            <Input
              value={fornecedorForm.razaoSocial}
              onChange={(event) => setFornecedorForm((current) => ({ ...current, razaoSocial: event.target.value }))}
              placeholder="Nome empresarial do fornecedor"
            />
          </FormField>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="CNPJ" error={fieldErrors.cnpj}>
              <Input
                value={fornecedorForm.cnpj}
                onChange={(event) => setFornecedorForm((current) => ({ ...current, cnpj: event.target.value }))}
                placeholder="00.000.000/0000-00"
              />
            </FormField>
            <FormField label="Telefone">
              <Input
                value={fornecedorForm.telefone}
                onChange={(event) => setFornecedorForm((current) => ({ ...current, telefone: event.target.value }))}
                placeholder="(00) 00000-0000"
              />
            </FormField>
          </div>
          <FormField label="E-mail" error={fieldErrors.email}>
            <Input
              value={fornecedorForm.email}
              onChange={(event) => setFornecedorForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="contato@fornecedor.com.br"
            />
          </FormField>
          <div className="grid gap-4 md:grid-cols-[1fr_100px]">
            <FormField label="Cidade">
              <Input
                value={fornecedorForm.cidade}
                onChange={(event) => setFornecedorForm((current) => ({ ...current, cidade: event.target.value }))}
                placeholder="Município"
              />
            </FormField>
            <FormField label="UF">
              <Input
                value={fornecedorForm.estado}
                maxLength={2}
                onChange={(event) => setFornecedorForm((current) => ({ ...current, estado: event.target.value.toUpperCase() }))}
                placeholder="BA"
              />
            </FormField>
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setOpenFornecedorModal(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={fornecedorQuickMutation.isPending}>
              {fornecedorQuickMutation.isPending ? "Salvando..." : "Salvar fornecedor"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

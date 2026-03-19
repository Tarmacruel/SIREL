import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type RefObject } from "react";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  FileStack,
  FolderKanban,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useLocation } from "wouter";

import {
  habilitacaoStatusLabels,
  habilitacaoStatusOptions,
  licitacaoStatusLabels,
  licitacaoStepCatalog,
  modoDisputaLabels,
  propostaSituacaoLabels,
  propostaSituacaoOptions,
  recursoResultadoLabels,
  recursoResultadoOptions,
} from "@sirel/shared/const";
import { CollapsibleSectionCard } from "@/components/shared/collapsible-section-card";
import { Modal } from "@/components/shared/modal";
import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { deleteProcessoDocumento, resolveServerAssetUrl, uploadProcessoDocumento } from "@/lib/document-upload";
import { formatCurrencyBRL, formatShortDateBR, formatShortDateTimeBR } from "@/lib/formatters";
import { trpc } from "@/lib/trpc";

interface LicitacaoProcessoPageProps {
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

const initialPropostaForm = {
  licitanteId: "",
  itemId: "",
  valorUnitarioProposto: "",
  dataProposta: "",
  classificacao: "",
  situacao: "VALIDA",
  justificativa: "",
};

const initialLanceForm = {
  propostaId: "",
  valorLance: "",
  dataLance: "",
  observacao: "",
};

const initialHabilitacaoForm = {
  licitanteId: "",
  statusHabilitacao: "PENDENTE",
  observacaoHabilitacao: "",
};

const initialRecursoForm = {
  licitanteId: "",
  dataInterposicao: "",
  dataJulgamento: "",
  resultado: "PENDENTE",
  descricao: "",
  decisao: "",
};

const initialHomologacaoForm = {
  dataHomologacao: "",
  statusId: "",
  observacao: "",
};

function toDateInputValue(value: string | Date | null | undefined) {
  if (!value) return "";
  const source =
    value instanceof Date
      ? value
      : /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T12:00:00`)
        : new Date(value);
  if (Number.isNaN(source.getTime())) return "";
  const year = source.getFullYear();
  const month = String(source.getMonth() + 1).padStart(2, "0");
  const day = String(source.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateTimeStart(value?: string) {
  return value?.trim() ? `${value}T08:00:00` : undefined;
}

function toTimeInputValue(value: string | Date | null | undefined) {
  if (!value) return "08:30";
  const source =
    value instanceof Date
      ? value
      : /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T12:00:00`)
        : new Date(value);
  if (Number.isNaN(source.getTime())) return "08:30";
  return `${String(source.getHours()).padStart(2, "0")}:${String(source.getMinutes()).padStart(2, "0")}`;
}

function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addBusinessDays(source: Date, businessDays: number) {
  const cursor = startOfDay(source);
  let remaining = businessDays;

  while (remaining > 0) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }

  return cursor;
}

function combineDateAndTime(date: Date, hours = 8, minutes = 0) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
}

function parseTimeInput(value?: string) {
  const match = String(value ?? "").match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return { hours: 8, minutes: 30 };
  }

  return {
    hours: Number(match[1]),
    minutes: Number(match[2]),
  };
}

function buildSchedulePreview(params: {
  modalidadeCodigo?: string | null;
  dataPublicacaoEdital?: string;
  publicarNoDou?: boolean;
  publicarEmJornal?: boolean;
  horaDisputa?: string;
}) {
  if (!params.modalidadeCodigo || !params.dataPublicacaoEdital) return null;

  const prazoBasePorModalidade: Record<string, number> = {
    CONCORRENCIA_ELETRONICA: 10,
    CONCORRENCIA_PRESENCIAL: 10,
    CREDENCIAMENTO: 15,
    DISPENSA_SIMPLIFICADA: 3,
    DISPENSA_ELETRONICA: 3,
    INEXIGIBILIDADE: 3,
    LEILAO_ELETRONICO: 15,
    PREGAO_ELETRONICO: 8,
    PREGAO_PRESENCIAL: 8,
  };

  const baseDays = prazoBasePorModalidade[params.modalidadeCodigo] ?? 8;
  const municipioExtra = 1;
  const canaisExtra = params.publicarNoDou || params.publicarEmJornal ? 1 : 0;
  const totalBusinessDays = baseDays + municipioExtra + canaisExtra;
  const startOffset = 1 + municipioExtra + canaisExtra;
  const publicacaoDia = new Date(`${params.dataPublicacaoEdital}T12:00:00`);
  const recebimentoInicial = addBusinessDays(publicacaoDia, startOffset);
  const disputaDia = addBusinessDays(publicacaoDia, totalBusinessDays);
  const disputeTime = parseTimeInput(params.horaDisputa);
  const abertura = combineDateAndTime(disputaDia, disputeTime.hours, disputeTime.minutes);
  const encerramento = new Date(abertura.getTime() - 15 * 60 * 1000);

  return {
    baseDays,
    municipioExtra,
    canaisExtra,
    startOffset,
    totalBusinessDays,
    dataPublicacaoEdital: publicacaoDia,
    horaDisputa: `${String(disputeTime.hours).padStart(2, "0")}:${String(disputeTime.minutes).padStart(2, "0")}`,
    dataRecebimentoPropostasInicio: combineDateAndTime(recebimentoInicial, 8, 0),
    dataRecebimentoPropostasFim: encerramento,
    dataAberturaPropostas: abertura,
  };
}

function getUploadState(state: Record<string, UploadFormState>, category: string) {
  return state[category] ?? initialUploadForm;
}

function mapStatusToVisualStep(status: string) {
  switch (status) {
    case "PREPARACAO":
      return "PREPARACAO_INTERNA";
    case "PUBLICACAO":
      return "PUBLICACAO";
    case "RECEBIMENTO_PROPOSTAS":
    case "ABERTURA_PROPOSTAS":
      return "RECEBIMENTO_PROPOSTAS";
    case "LANCES":
      return "LANCES";
    case "JULGAMENTO":
      return "JULGAMENTO";
    case "HABILITACAO":
      return "HABILITACAO";
    case "RECURSOS":
      return "RECURSOS";
    case "HOMOLOGACAO":
    case "CONTRATACAO":
      return "HOMOLOGACAO";
    default:
      return "PREPARACAO_INTERNA";
  }
}

export function LicitacaoProcessoPage({ processoId }: LicitacaoProcessoPageProps) {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const detailQuery = trpc.licitacao.detail.useQuery({ processoId }, { retry: false });
  const documentosQuery = trpc.documentos.listByProcesso.useQuery({ processoId }, { retry: false });
  const catalogsQuery = trpc.cadastros.formOptions.useQuery(undefined, { retry: false });

  const [navCollapsed, setNavCollapsed] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deletingDocumentoId, setDeletingDocumentoId] = useState<number | null>(null);
  const [showAllDocsModal, setShowAllDocsModal] = useState(false);
  const [uploadForms, setUploadForms] = useState<Record<string, UploadFormState>>({});
  const [sectionOpen, setSectionOpen] = useState({
    overview: true,
    internal: false,
    docs: false,
    publication: false,
    licitantes: false,
    propostas: false,
    lances: false,
    julgamento: false,
    habilitacao: false,
    recursos: false,
    homologacao: false,
    history: false,
  });
  const [configForm, setConfigForm] = useState({
    criterioJulgamento: "",
    modoDisputa: "NAO_SE_APLICA",
    exigeDeclaracaoNaoFracionamento: false,
    publicarNoDou: false,
    publicarEmJornal: false,
    observacoes: "",
  });
  const [publishForm, setPublishForm] = useState({
    condutorProcessoId: "",
    statusId: "",
    dataPublicacaoEdital: "",
    horaDisputa: "08:30",
    descricao: "",
    observacao: "",
  });
  const [licitanteFornecedorId, setLicitanteFornecedorId] = useState("");
  const [propostaForm, setPropostaForm] = useState(initialPropostaForm);
  const [lanceForm, setLanceForm] = useState(initialLanceForm);
  const [habilitacaoForm, setHabilitacaoForm] = useState(initialHabilitacaoForm);
  const [recursoForm, setRecursoForm] = useState(initialRecursoForm);
  const [homologacaoForm, setHomologacaoForm] = useState(initialHomologacaoForm);

  const overviewRef = useRef<HTMLElement | null>(null);
  const internalRef = useRef<HTMLElement | null>(null);
  const docsRef = useRef<HTMLElement | null>(null);
  const publicationRef = useRef<HTMLElement | null>(null);
  const licitantesRef = useRef<HTMLElement | null>(null);
  const propostasRef = useRef<HTMLElement | null>(null);
  const lancesRef = useRef<HTMLElement | null>(null);
  const julgamentoRef = useRef<HTMLElement | null>(null);
  const habilitacaoRef = useRef<HTMLElement | null>(null);
  const recursosRef = useRef<HTMLElement | null>(null);
  const homologacaoRef = useRef<HTMLElement | null>(null);
  const historyRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const detail = detailQuery.data;
    if (!detail) return;

    setConfigForm({
      criterioJulgamento: detail.processo.criterioJulgamento ?? "",
      modoDisputa: detail.processo.modoDisputa ?? "NAO_SE_APLICA",
      exigeDeclaracaoNaoFracionamento: detail.licitacao.exigeDeclaracaoNaoFracionamento ?? false,
      publicarNoDou: detail.licitacao.publicarNoDou ?? false,
      publicarEmJornal: detail.licitacao.publicarEmJornal ?? false,
      observacoes: detail.licitacao.observacoes ?? "",
    });

    setPublishForm({
      condutorProcessoId: detail.processo.condutorProcesso?.id ? String(detail.processo.condutorProcesso.id) : "",
      statusId: detail.processo.statusId ? String(detail.processo.statusId) : "",
      dataPublicacaoEdital: toDateInputValue(detail.licitacao.dataPublicacaoEdital),
      horaDisputa: toTimeInputValue(detail.licitacao.dataAberturaPropostas),
      descricao: detail.processo.numeroEdital ? `Publicação do edital ${detail.processo.numeroEdital}` : `Publicação do processo ${detail.processo.numeroSirel}`,
      observacao: detail.licitacao.observacoes ?? "",
    });

    setLicitanteFornecedorId((current) => current || (catalogsQuery.data?.fornecedores[0]?.id ? String(catalogsQuery.data.fornecedores[0].id) : ""));
    setPropostaForm((current) => ({
      ...current,
      licitanteId: current.licitanteId || (detail.licitantes[0]?.id ? String(detail.licitantes[0].id) : ""),
      itemId: current.itemId || (detail.itens[0]?.id ? String(detail.itens[0].id) : ""),
    }));
    setLanceForm((current) => ({
      ...current,
      propostaId: current.propostaId || (detail.propostas[0]?.id ? String(detail.propostas[0].id) : ""),
    }));
    setHabilitacaoForm((current) => ({
      ...current,
      licitanteId: current.licitanteId || (detail.licitantes[0]?.id ? String(detail.licitantes[0].id) : ""),
    }));
    setRecursoForm((current) => ({
      ...current,
      licitanteId: current.licitanteId || (detail.licitantes[0]?.id ? String(detail.licitantes[0].id) : ""),
    }));
    setHomologacaoForm((current) => ({
      ...current,
      statusId: current.statusId || (detail.processo.statusId ? String(detail.processo.statusId) : ""),
      dataHomologacao: current.dataHomologacao || toDateInputValue(detail.licitacao.dataHomologacao),
    }));
  }, [catalogsQuery.data, detailQuery.data]);

  const saveConfiguracaoMutation = trpc.licitacao.saveConfiguracao.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.licitacao.detail.invalidate({ processoId }),
        utils.licitacao.list.invalidate(),
        utils.licitacao.summary.invalidate(),
        utils.prazos.list.invalidate(),
        utils.prazos.summary.invalidate(),
        utils.workflow.byProcesso.invalidate({ processoId }),
        utils.processos.overview.invalidate({ processoId }),
      ]);
      setErrorMessage(null);
      setFeedback("Configuração interna da Licitação salva com sucesso.");
    },
    onError: (error) => {
      setFeedback(null);
      setErrorMessage(error.message);
    },
  });

  const publishMutation = trpc.licitacao.publish.useMutation({
    onSuccess: async (payload) => {
      await Promise.all([
        utils.licitacao.detail.invalidate({ processoId }),
        utils.licitacao.list.invalidate(),
        utils.licitacao.summary.invalidate(),
        utils.prazos.list.invalidate(),
        utils.prazos.summary.invalidate(),
        utils.workflow.byProcesso.invalidate({ processoId }),
        utils.workflow.list.invalidate(),
        utils.processos.list.invalidate(),
        utils.processos.overview.invalidate({ processoId }),
      ]);
      setErrorMessage(null);
      setFeedback(`Processo publicado com sucesso. Edital gerado: ${payload.numeroEdital}.`);
    },
    onError: (error) => {
      setFeedback(null);
      setErrorMessage(error.message);
    },
  });
  const saveLicitanteMutation = trpc.licitacao.saveLicitante.useMutation({
    onSuccess: async () => {
      await refreshAll();
      setFeedback("Licitante vinculado à Licitação com sucesso.");
      setErrorMessage(null);
    },
    onError: (error) => {
      setFeedback(null);
      setErrorMessage(error.message);
    },
  });
  const deleteLicitanteMutation = trpc.licitacao.deleteLicitante.useMutation({
    onSuccess: async () => {
      await refreshAll();
      setFeedback("Licitante retirado da disputa.");
      setErrorMessage(null);
    },
    onError: (error) => {
      setFeedback(null);
      setErrorMessage(error.message);
    },
  });
  const savePropostaMutation = trpc.licitacao.saveProposta.useMutation({
    onSuccess: async () => {
      await refreshAll();
      setPropostaForm((current) => ({
        ...initialPropostaForm,
        licitanteId: current.licitanteId,
        itemId: current.itemId,
      }));
      setFeedback("Proposta registrada com sucesso.");
      setErrorMessage(null);
    },
    onError: (error) => {
      setFeedback(null);
      setErrorMessage(error.message);
    },
  });
  const saveLanceMutation = trpc.licitacao.saveLance.useMutation({
    onSuccess: async () => {
      await refreshAll();
      setLanceForm((current) => ({
        ...initialLanceForm,
        propostaId: current.propostaId,
      }));
      setFeedback("Lance registrado com sucesso.");
      setErrorMessage(null);
    },
    onError: (error) => {
      setFeedback(null);
      setErrorMessage(error.message);
    },
  });
  const saveHabilitacaoMutation = trpc.licitacao.saveHabilitacao.useMutation({
    onSuccess: async () => {
      await refreshAll();
      setFeedback("Situação de habilitação atualizada.");
      setErrorMessage(null);
    },
    onError: (error) => {
      setFeedback(null);
      setErrorMessage(error.message);
    },
  });
  const saveRecursoMutation = trpc.licitacao.saveRecurso.useMutation({
    onSuccess: async () => {
      await refreshAll();
      setRecursoForm((current) => ({
        ...initialRecursoForm,
        licitanteId: current.licitanteId,
      }));
      setFeedback("Recurso administrativo registrado.");
      setErrorMessage(null);
    },
    onError: (error) => {
      setFeedback(null);
      setErrorMessage(error.message);
    },
  });
  const advanceStageMutation = trpc.licitacao.advanceStage.useMutation({
    onSuccess: async () => {
      await refreshAll();
      setFeedback("Etapa da Licitação atualizada.");
      setErrorMessage(null);
    },
    onError: (error) => {
      setFeedback(null);
      setErrorMessage(error.message);
    },
  });
  const homologarMutation = trpc.licitacao.homologar.useMutation({
    onSuccess: async () => {
      await refreshAll();
      setFeedback("Licitação homologada com sucesso.");
      setErrorMessage(null);
    },
    onError: (error) => {
      setFeedback(null);
      setErrorMessage(error.message);
    },
  });
  const detalhe = detailQuery.data;
  const documentos = documentosQuery.data ?? [];
  const docsByCategory = useMemo(() => {
    const grouped = new Map<string, typeof documentos>();
    documentos.forEach((documento) => {
      const category = documento.categoria?.trim() || "__SEM_CATEGORIA__";
      grouped.set(category, [...(grouped.get(category) ?? []), documento]);
    });
    return grouped;
  }, [documentos]);

  const checklistItems = detalhe?.checklistInterno.itens ?? [];
  const pendingRequired = detalhe?.checklistInterno.obrigatoriosPendentes ?? [];
  const progressCount = checklistItems.filter((item) => item.concluido).length;
  const schedulePreview = useMemo(
    () =>
      buildSchedulePreview({
        modalidadeCodigo: detalhe?.processo.modalidadeCodigo ?? null,
        dataPublicacaoEdital: publishForm.dataPublicacaoEdital,
        publicarNoDou: configForm.publicarNoDou,
        publicarEmJornal: configForm.publicarEmJornal,
        horaDisputa: publishForm.horaDisputa,
      }),
    [configForm.publicarEmJornal, configForm.publicarNoDou, detalhe?.processo.modalidadeCodigo, publishForm.dataPublicacaoEdital, publishForm.horaDisputa],
  );

  async function refreshAll() {
    await Promise.all([
      utils.licitacao.detail.invalidate({ processoId }),
      utils.licitacao.list.invalidate(),
      utils.licitacao.summary.invalidate(),
      utils.documentos.listByProcesso.invalidate({ processoId }),
      utils.documentos.list.invalidate(),
      utils.documentos.summary.invalidate(),
      utils.workflow.byProcesso.invalidate({ processoId }),
      utils.processos.overview.invalidate({ processoId }),
    ]);
  }

  function setUploadState(category: string, updater: (current: UploadFormState) => UploadFormState) {
    setUploadForms((current) => ({
      ...current,
      [category]: updater(getUploadState(current, category)),
    }));
  }

  function handleFileChange(category: string, event: ChangeEvent<HTMLInputElement>, suggestedTitle: string) {
    const nextFile = event.target.files?.[0] ?? null;
    setUploadState(category, (current) => ({
      ...current,
      arquivo: nextFile,
      titulo: current.titulo || nextFile?.name || suggestedTitle,
    }));
  }

  async function handleUploadChecklistDocumento(item: (typeof checklistItems)[number]) {
    const current = getUploadState(uploadForms, item.category);
    if (!current.arquivo) {
      setFeedback(null);
      setErrorMessage(`Selecione o arquivo para ${item.label.toLowerCase()}.`);
      return;
    }

    try {
      setFeedback(null);
      setErrorMessage(null);
      await uploadProcessoDocumento({
        processoId,
        tipo: item.tipo,
        categoria: item.category,
        titulo: current.titulo.trim() || item.label,
        descricao: current.descricao.trim() || item.description,
        arquivo: current.arquivo,
      });
      setUploadForms((currentState) => {
        const nextState = { ...currentState };
        delete nextState[item.category];
        return nextState;
      });
      await refreshAll();
      setFeedback(`${item.label} anexado com sucesso.`);
    } catch (error) {
      setFeedback(null);
      setErrorMessage(error instanceof Error ? error.message : "Falha ao anexar o documento.");
    }
  }

  async function handleDeleteDocumento(documentoId: number) {
    const confirmed = window.confirm("Deseja remover este documento do processo?");
    if (!confirmed) return;

    try {
      setDeletingDocumentoId(documentoId);
      setFeedback(null);
      setErrorMessage(null);
      await deleteProcessoDocumento(documentoId);
      await refreshAll();
      setFeedback("Documento removido com sucesso.");
    } catch (error) {
      setFeedback(null);
      setErrorMessage(error instanceof Error ? error.message : "Falha ao remover o documento.");
    } finally {
      setDeletingDocumentoId(null);
    }
  }

  async function persistConfiguracao() {
    await saveConfiguracaoMutation.mutateAsync({
      processoId,
      criterioJulgamento: configForm.criterioJulgamento || undefined,
      modoDisputa: configForm.modoDisputa,
      exigeDeclaracaoNaoFracionamento: configForm.exigeDeclaracaoNaoFracionamento,
      publicarNoDou: configForm.publicarNoDou,
      publicarEmJornal: configForm.publicarEmJornal,
      dataPublicacaoEdital: publishForm.dataPublicacaoEdital ? `${publishForm.dataPublicacaoEdital}T00:00:00` : undefined,
      dataAberturaPropostas: publishForm.dataPublicacaoEdital
        ? `${publishForm.dataPublicacaoEdital}T${publishForm.horaDisputa || "08:30"}:00`
        : undefined,
      observacoes: configForm.observacoes || undefined,
    });
  }

  async function handleSalvarConfiguracao(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await persistConfiguracao();
  }

  async function handlePublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!publishForm.condutorProcessoId) {
      setFeedback(null);
      setErrorMessage("Selecione o condutor do processo antes de publicar.");
      return;
    }

    await publishMutation.mutateAsync({
      processoId,
      condutorProcessoId: Number(publishForm.condutorProcessoId),
      statusId: publishForm.statusId ? Number(publishForm.statusId) : undefined,
      dataPublicacaoEdital: publishForm.dataPublicacaoEdital ? `${publishForm.dataPublicacaoEdital}T00:00:00` : undefined,
      dataAberturaPropostas: publishForm.dataPublicacaoEdital
        ? `${publishForm.dataPublicacaoEdital}T${publishForm.horaDisputa || "08:30"}:00`
        : undefined,
      descricao: publishForm.descricao || undefined,
      observacao: publishForm.observacao || undefined,
    });
  }

  async function handleAddLicitante() {
    if (!licitanteFornecedorId) {
      setFeedback(null);
      setErrorMessage("Selecione um fornecedor para incluir como licitante.");
      return;
    }
    await saveLicitanteMutation.mutateAsync({
      processoId,
      fornecedorId: Number(licitanteFornecedorId),
    });
  }

  async function handleSaveProposta(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!propostaForm.licitanteId || !propostaForm.itemId || !propostaForm.valorUnitarioProposto) {
      setFeedback(null);
      setErrorMessage("Informe licitante, item e valor unitário da proposta.");
      return;
    }
    await savePropostaMutation.mutateAsync({
      processoId,
      licitanteId: Number(propostaForm.licitanteId),
      itemId: Number(propostaForm.itemId),
      valorUnitarioProposto: Number(String(propostaForm.valorUnitarioProposto).replace(/\./g, "").replace(",", ".")),
      dataProposta: toDateTimeStart(propostaForm.dataProposta),
      classificacao: propostaForm.classificacao ? Number(propostaForm.classificacao) : undefined,
      situacao: propostaForm.situacao as "VALIDA" | "DESCLASSIFICADA" | "VENCEDORA",
      justificativa: propostaForm.justificativa || undefined,
    });
  }

  async function handleSaveLance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lanceForm.propostaId || !lanceForm.valorLance) {
      setFeedback(null);
      setErrorMessage("Selecione a proposta e informe o valor do lance.");
      return;
    }
    await saveLanceMutation.mutateAsync({
      propostaId: Number(lanceForm.propostaId),
      valorLance: Number(String(lanceForm.valorLance).replace(/\./g, "").replace(",", ".")),
      dataLance: toDateTimeStart(lanceForm.dataLance),
      observacao: lanceForm.observacao || undefined,
    });
  }

  async function handleSaveHabilitacao(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!habilitacaoForm.licitanteId) {
      setFeedback(null);
      setErrorMessage("Selecione o licitante para atualizar a habilitação.");
      return;
    }
    await saveHabilitacaoMutation.mutateAsync({
      licitanteId: Number(habilitacaoForm.licitanteId),
      statusHabilitacao: habilitacaoForm.statusHabilitacao as "PENDENTE" | "HABILITADO" | "INABILITADO",
      observacaoHabilitacao: habilitacaoForm.observacaoHabilitacao || undefined,
    });
  }

  async function handleSaveRecurso(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recursoForm.licitanteId || !recursoForm.descricao.trim()) {
      setFeedback(null);
      setErrorMessage("Selecione o licitante e descreva o recurso administrativo.");
      return;
    }
    await saveRecursoMutation.mutateAsync({
      processoId,
      licitanteId: Number(recursoForm.licitanteId),
      dataInterposicao: recursoForm.dataInterposicao || undefined,
      dataJulgamento: recursoForm.dataJulgamento || undefined,
      resultado: recursoForm.resultado as "PENDENTE" | "PROVIDO" | "IMPROVIDO" | "PARCIALMENTE_PROVIDO",
      descricao: recursoForm.descricao,
      decisao: recursoForm.decisao || undefined,
    });
  }

  async function handleAdvanceStage(statusLicitacao: "RECEBIMENTO_PROPOSTAS" | "LANCES" | "JULGAMENTO" | "HABILITACAO" | "RECURSOS", etapaAtual: string, observacao: string) {
    await advanceStageMutation.mutateAsync({
      processoId,
      statusLicitacao,
      etapaAtual,
      observacao,
    });
  }

  async function handleHomologar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await homologarMutation.mutateAsync({
      processoId,
      dataHomologacao: homologacaoForm.dataHomologacao || undefined,
      observacao: homologacaoForm.observacao || undefined,
      statusId: homologacaoForm.statusId ? Number(homologacaoForm.statusId) : undefined,
    });
  }

  const navItems = [
    { key: "overview", label: "Visão geral", ref: overviewRef },
    { key: "internal", label: "Fase interna", ref: internalRef },
    { key: "docs", label: "Documentos do processo", ref: docsRef },
    { key: "publication", label: "Publicação", ref: publicationRef },
    { key: "licitantes", label: "Licitantes", ref: licitantesRef },
    { key: "propostas", label: "Propostas", ref: propostasRef },
    ...((detalhe?.processo.suportaLances ?? false) ? [{ key: "lances", label: "Lances", ref: lancesRef }] : []),
    { key: "julgamento", label: "Julgamento", ref: julgamentoRef },
    { key: "habilitacao", label: "Habilitação", ref: habilitacaoRef },
    { key: "recursos", label: "Recursos", ref: recursosRef },
    { key: "homologacao", label: "Homologação", ref: homologacaoRef },
    { key: "history", label: "Movimentações", ref: historyRef },
  ];
  const currentVisualStep = !(detalhe?.processo.publicado ?? false)
    ? "PREPARACAO_INTERNA"
    : mapStatusToVisualStep(detalhe?.licitacao.statusLicitacao ?? "PREPARACAO");
  const currentVisualStepIndex = licitacaoStepCatalog.findIndex((item) => item.key === currentVisualStep);
  const currentNavKey = (() => {
    switch (currentVisualStep) {
      case "PREPARACAO_INTERNA":
        return "internal";
      case "PUBLICACAO":
        return "publication";
      case "RECEBIMENTO_PROPOSTAS":
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
        return "homologacao";
      default:
        return "overview";
    }
  })();

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((item) => (
          <Skeleton key={item} className="h-40 rounded-[28px]" />
        ))}
      </div>
    );
  }

  if (detailQuery.error || !detalhe) {
    return <Alert variant="error">Não foi possível carregar a etapa da Licitação para este processo.</Alert>;
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Licitação", href: "/licitacao" }, { label: detalhe.processo.numeroSirel }]} />

      <SectionCard
        title={`Licitação do processo ${detalhe.processo.numeroSirel}`}
        description="Tela operacional da fase licitatória com checklist documental interno, acervo completo do processo e cronograma automático de publicação."
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowAllDocsModal(true)}>
              <FileStack className="h-4 w-4" />
              Documentos do processo
            </Button>
            <Button type="button" variant="outline" onClick={() => setLocation("/licitacao")}>
              <ArrowLeft className="h-4 w-4" />
              Voltar à fila
            </Button>
          </div>
        }
      >
        <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
            <div className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(230,240,255,0.74))] p-4 shadow-[0_12px_24px_-22px_rgba(15,26,109,0.2)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Navegação</p>
                <Button type="button" size="sm" variant="ghost" className="hidden xl:inline-flex" onClick={() => setNavCollapsed((current) => !current)}>
                  {navCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                </Button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 xl:block xl:max-h-[72vh] xl:space-y-2 xl:overflow-y-auto xl:overflow-x-visible xl:pb-0">
                {navItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setSectionOpen((current) => ({ ...current, [item.key]: true }));
                      requestAnimationFrame(() => item.ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
                    }}
                    className={[
                      "flex min-w-[180px] shrink-0 items-center justify-between rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition xl:w-full xl:min-w-0",
                      item.key === currentNavKey || sectionOpen[item.key as keyof typeof sectionOpen]
                        ? "border-[rgba(65,105,225,0.35)] bg-[var(--color-primary-50)] text-[var(--color-primary-800)]"
                        : "border-[rgba(204,225,255,0.92)] bg-white text-[var(--color-neutral-700)] hover:border-[rgba(65,105,225,0.35)] hover:text-[var(--color-primary-800)]",
                    ].join(" ")}
                  >
                    <span className={navCollapsed ? "sr-only xl:not-sr-only" : ""}>{item.label}</span>
                    <ChevronRight className="h-4 w-4 flex-none" />
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white p-4 shadow-[0_12px_24px_-22px_rgba(15,26,109,0.18)]">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Andamento da etapa</p>
              <div className="mt-3 grid gap-2 text-sm text-[var(--color-neutral-600)] sm:grid-cols-3 xl:grid-cols-1">
                <div className="rounded-2xl bg-[var(--color-primary-50)] px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-[var(--color-neutral-500)]">Status da Licitação</div>
                  <div className="mt-1 font-bold text-[var(--color-primary-900)]">{detalhe.licitacao.statusLicitacao}</div>
                </div>
                <div className="rounded-2xl bg-[var(--color-primary-50)] px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-[var(--color-neutral-500)]">Checklist interno</div>
                  <div className="mt-1 font-bold text-[var(--color-primary-900)]">{progressCount}/{checklistItems.length} concluídos</div>
                </div>
                <div className="rounded-2xl bg-[var(--color-primary-50)] px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-[var(--color-neutral-500)]">Documentos no processo</div>
                  <div className="mt-1 font-bold text-[var(--color-primary-900)]">{documentos.length}</div>
                </div>
              </div>
            </div>
          </aside>

          <div className="space-y-6">
            {feedback ? <Alert variant="success">{feedback}</Alert> : null}
            {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}
            <section ref={overviewRef}>
              <CollapsibleSectionCard
                title="Visão geral da Licitação"
                description="Resumo do processo, da fase atual e das próximas etapas da Lei nº 14.133/2021."
                open={sectionOpen.overview}
                onToggle={(nextOpen) => setSectionOpen((current) => ({ ...current, overview: nextOpen }))}
                defaultOpen
                collapsedSummary={
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm"><span className="font-semibold text-[var(--color-primary-900)]">{detalhe.processo.numeroSirel}</span><div className="text-[var(--color-neutral-500)]">{detalhe.processo.modalidade ?? "Licitação"}</div></div>
                    <div className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm"><span className="font-semibold text-[var(--color-primary-900)]">{detalhe.licitacao.statusLicitacao}</span><div className="text-[var(--color-neutral-500)]">Etapa atual</div></div>
                    <div className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm"><span className="font-semibold text-[var(--color-primary-900)]">{detalhe.processo.numeroEdital ?? "Sem edital"}</span><div className="text-[var(--color-neutral-500)]">Edital</div></div>
                    <div className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm"><span className="font-semibold text-[var(--color-primary-900)]">{documentos.length}</span><div className="text-[var(--color-neutral-500)]">Documentos</div></div>
                  </div>
                }
              >
                <div className="grid gap-3 lg:grid-cols-4">
                  <article className="rounded-3xl border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Processo</p>
                    <p className="mt-2 text-lg font-black text-[var(--color-primary-900)]">{detalhe.processo.numeroSirel}</p>
                    <p className="mt-1 text-sm text-[var(--color-neutral-600)]">{detalhe.processo.secretaria}</p>
                  </article>
                  <article className="rounded-3xl border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Modalidade</p>
                    <p className="mt-2 text-lg font-black text-[var(--color-primary-900)]">{detalhe.processo.modalidade ?? "Não definida"}</p>
                    <p className="mt-1 text-sm text-[var(--color-neutral-600)]">{detalhe.processo.numeroEdital ?? "Edital ainda não gerado"}</p>
                  </article>
                  <article className="rounded-3xl border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Critério / modo</p>
                    <p className="mt-2 text-lg font-black text-[var(--color-primary-900)]">{detalhe.processo.criterioJulgamento ?? "Não informado"}</p>
                    <p className="mt-1 text-sm text-[var(--color-neutral-600)]">{modoDisputaLabels[(detalhe.processo.modoDisputa as keyof typeof modoDisputaLabels) ?? "NAO_SE_APLICA"] ?? "Não se aplica"}</p>
                  </article>
                  <article className="rounded-3xl border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Valor estimado</p>
                    <p className="mt-2 text-lg font-black text-[var(--color-primary-900)]">{formatCurrencyBRL(detalhe.processo.valorEstimado)}</p>
                    <p className="mt-1 text-sm text-[var(--color-neutral-600)]">Condutor: {detalhe.processo.condutorProcesso?.nome ?? "Definido na publicação"}</p>
                  </article>
                </div>

                <div className="mt-4 grid gap-3 xl:grid-cols-4">
                  {licitacaoStepCatalog.map((item, index) => {
                    const current = item.key === currentVisualStep;
                    const completed =
                      item.key === "PREPARACAO_INTERNA"
                        ? pendingRequired.length === 0 && currentVisualStepIndex > index
                        : currentVisualStepIndex > index;

                    return (
                      <article
                        key={item.key}
                        onClick={() => {
                          if (item.key === "LANCES" && !(detalhe?.processo.suportaLances ?? false)) {
                            return;
                          }
                          const sectionByStep: Record<string, keyof typeof sectionOpen> = {
                            PREPARACAO_INTERNA: "internal",
                            PUBLICACAO: "publication",
                            RECEBIMENTO_PROPOSTAS: "propostas",
                            LANCES: "lances",
                            JULGAMENTO: "julgamento",
                            HABILITACAO: "habilitacao",
                            RECURSOS: "recursos",
                            HOMOLOGACAO: "homologacao",
                          };
                          const targetSection = sectionByStep[item.key];
                          const targetRefMap: Record<string, RefObject<HTMLElement | null>> = {
                            internal: internalRef,
                            publication: publicationRef,
                            propostas: propostasRef,
                            lances: lancesRef,
                            julgamento: julgamentoRef,
                            habilitacao: habilitacaoRef,
                            recursos: recursosRef,
                            homologacao: homologacaoRef,
                          };

                          if (targetSection) {
                            setSectionOpen((current) => ({ ...current, [targetSection]: true }));
                            requestAnimationFrame(() => targetRefMap[targetSection]?.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
                          }
                        }}
                        className={[
                          "rounded-3xl border px-4 py-4 transition",
                          item.key === "LANCES" && !(detalhe?.processo.suportaLances ?? false) ? "opacity-60" : "cursor-pointer hover:-translate-y-0.5",
                          current ? "border-[rgba(102,165,255,0.9)] bg-[var(--color-primary-50)]" : completed ? "border-emerald-200 bg-emerald-50" : "border-[rgba(204,225,255,0.92)] bg-white",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-bold text-[var(--color-primary-900)]">{item.label}</p>
                          {completed ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[var(--color-neutral-600)]">{item.description}</p>
                      </article>
                    );
                  })}
                </div>
              </CollapsibleSectionCard>
            </section>

            <section ref={internalRef}>
              <CollapsibleSectionCard
                title="Fase interna documental"
                description="Todos os documentos obrigatórios antes da publicidade. O processo só pode ser publicado quando o checklist estiver completo."
                open={sectionOpen.internal}
                onToggle={(nextOpen) => setSectionOpen((current) => ({ ...current, internal: nextOpen }))}
                action={
                  <div className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary-900)] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white">
                    <ShieldCheck className="h-4 w-4" />
                    {progressCount}/{checklistItems.length} concluídos
                  </div>
                }
                collapsedSummary={
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">Checklist: {progressCount}/{checklistItems.length}</span>
                    <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">Pendentes: {pendingRequired.length}</span>
                    <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">DOU: {configForm.publicarNoDou ? "Sim" : "Não"}</span>
                    <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">Jornal: {configForm.publicarEmJornal ? "Sim" : "Não"}</span>
                  </div>
                }
              >
                <form className="space-y-5" onSubmit={handleSalvarConfiguracao}>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <FormField label="Critério de julgamento">
                      <Input
                        value={configForm.criterioJulgamento}
                        onChange={(event) => setConfigForm((current) => ({ ...current, criterioJulgamento: event.target.value }))}
                        placeholder="Ex.: Menor preço por lote"
                      />
                    </FormField>
                    <FormField label="Modo de disputa">
                      <Select value={configForm.modoDisputa} onChange={(event) => setConfigForm((current) => ({ ...current, modoDisputa: event.target.value }))}>
                        {Object.entries(modoDisputaLabels).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-3">
                    <label className="inline-flex items-center gap-3 rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm font-semibold text-[var(--color-neutral-700)]">
                      <Checkbox
                        checked={configForm.exigeDeclaracaoNaoFracionamento}
                        onChange={(event) => setConfigForm((current) => ({ ...current, exigeDeclaracaoNaoFracionamento: event.target.checked }))}
                      />
                      Exigir declaração de não fracionamento
                    </label>
                    <label className="inline-flex items-center gap-3 rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm font-semibold text-[var(--color-neutral-700)]">
                      <Checkbox
                        checked={configForm.publicarNoDou}
                        onChange={(event) => setConfigForm((current) => ({ ...current, publicarNoDou: event.target.checked }))}
                      />
                      Publicar também no DOU
                    </label>
                    <label className="inline-flex items-center gap-3 rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm font-semibold text-[var(--color-neutral-700)]">
                      <Checkbox
                        checked={configForm.publicarEmJornal}
                        onChange={(event) => setConfigForm((current) => ({ ...current, publicarEmJornal: event.target.checked }))}
                      />
                      Publicar também em jornal
                    </label>
                  </div>

                  <div className="grid gap-3">
                    <FormField label="Observações internas">
                      <Textarea
                        rows={3}
                        value={configForm.observacoes}
                        onChange={(event) => {
                          setConfigForm((current) => ({ ...current, observacoes: event.target.value }));
                          setPublishForm((current) => ({ ...current, observacao: event.target.value }));
                        }}
                      />
                    </FormField>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button type="submit" disabled={saveConfiguracaoMutation.isPending}>
                      {saveConfiguracaoMutation.isPending ? "Salvando..." : "Salvar configuração interna"}
                    </Button>
                  </div>
                </form>

                {pendingRequired.length ? (
                  <Alert variant="warning" title="Checklist interno pendente">
                    Ainda faltam documentos obrigatórios antes da publicação: {pendingRequired.map((item) => item.label).join(", ")}.
                  </Alert>
                ) : (
                  <Alert variant="success">Checklist interno concluído. O processo está apto para seguir ao cronograma de publicação.</Alert>
                )}

                <div className="mt-4 grid gap-4 2xl:grid-cols-2">
                  {checklistItems.map((item) => {
                    const uploadState = getUploadState(uploadForms, item.category);
                    const latestDocumento = (docsByCategory.get(item.category) ?? []).slice().sort((left, right) => new Date(right.criadoEm).getTime() - new Date(left.criadoEm).getTime())[0];

                    return (
                      <article key={item.category} className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white p-4 shadow-[0_10px_24px_-24px_rgba(15,26,109,0.35)]">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-base font-black text-[var(--color-primary-900)]">{item.label}</h4>
                              <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${item.concluido ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                                {item.concluido ? "Anexado" : "Pendente"}
                              </span>
                              {!item.obrigatorio ? (
                                <span className="inline-flex rounded-full bg-[var(--color-neutral-100)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-neutral-700)]">
                                  Condicional
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[var(--color-neutral-600)]">{item.description}</p>
                          </div>
                          <div className="rounded-2xl bg-[var(--color-primary-900)] p-3 text-white">
                            <FileCheck2 className="h-5 w-5" />
                          </div>
                        </div>
                        {latestDocumento ? (
                          <div className="mt-4 rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] p-3 text-sm">
                            <div className="font-semibold text-[var(--color-primary-900)]">{latestDocumento.titulo}</div>
                            <div className="mt-1 text-[var(--color-neutral-600)]">Anexado em {formatShortDateTimeBR(latestDocumento.criadoEm)}</div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <a href={resolveServerAssetUrl(latestDocumento.arquivoUrl) ?? "#"} target="_blank" rel="noreferrer">
                                <Button type="button" size="sm" variant="outline" disabled={!latestDocumento.arquivoUrl}>
                                  Abrir documento
                                </Button>
                              </a>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                disabled={deletingDocumentoId === latestDocumento.id}
                                onClick={() => void handleDeleteDocumento(latestDocumento.id)}
                              >
                                {deletingDocumentoId === latestDocumento.id ? "Removendo..." : "Remover"}
                              </Button>
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-4 grid gap-3 2xl:grid-cols-2">
                          <FormField label="Título">
                            <Input
                              value={uploadState.titulo}
                              onChange={(event) => setUploadState(item.category, (current) => ({ ...current, titulo: event.target.value }))}
                              placeholder={item.label}
                            />
                          </FormField>
                          <FormField label="Descrição">
                            <Input
                              value={uploadState.descricao}
                              onChange={(event) => setUploadState(item.category, (current) => ({ ...current, descricao: event.target.value }))}
                              placeholder={item.description}
                            />
                          </FormField>
                          <FormField label="Arquivo" className="2xl:col-span-2">
                            <Input type="file" onChange={(event) => handleFileChange(item.category, event, item.label)} />
                          </FormField>
                        </div>

                        <div className="mt-3 flex justify-end">
                          <Button type="button" onClick={() => void handleUploadChecklistDocumento(item)}>
                            <Upload className="h-4 w-4" />
                            Anexar documento
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </CollapsibleSectionCard>
            </section>

            <section ref={docsRef}>
              <CollapsibleSectionCard
                title="Documentos do processo"
                description="Acervo completo recebido pelo setor, na ordem em que os documentos foram adicionados ao processo."
                open={sectionOpen.docs}
                onToggle={(nextOpen) => setSectionOpen((current) => ({ ...current, docs: nextOpen }))}
                action={
                  <Button type="button" variant="outline" onClick={() => setShowAllDocsModal(true)}>
                    <FolderKanban className="h-4 w-4" />
                    Abrir em destaque
                  </Button>
                }
                collapsedSummary={
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">{documentos.length} documento(s)</span>
                    {documentos[0] ? <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">Último: {documentos[0].titulo}</span> : null}
                  </div>
                }
              >
                {!documentos.length ? (
                  <Alert variant="info">Este processo ainda não possui documentos vinculados.</Alert>
                ) : (
                  <div className="overflow-x-auto rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white shadow-[0_12px_24px_-24px_rgba(15,26,109,0.22)]">
                    <Table className="min-w-[1080px]">
                      <TableHead>
                        <tr>
                          <TableHeaderCell>#</TableHeaderCell>
                          <TableHeaderCell>Título</TableHeaderCell>
                          <TableHeaderCell>Tipo</TableHeaderCell>
                          <TableHeaderCell>Categoria</TableHeaderCell>
                          <TableHeaderCell>Adicionado em</TableHeaderCell>
                          <TableHeaderCell className="text-right">Arquivo</TableHeaderCell>
                        </tr>
                      </TableHead>
                      <TableBody>
                        {documentos.map((item, index) => (
                          <TableRow key={item.id}>
                            <TableCell>{index + 1}</TableCell>
                            <TableCell>
                              <div className="font-semibold text-[var(--color-primary-900)]">{item.titulo}</div>
                              <div className="text-xs text-[var(--color-neutral-500)]">Versão {item.versao}</div>
                            </TableCell>
                            <TableCell>{item.tipo}</TableCell>
                            <TableCell>{item.categoria ?? "-"}</TableCell>
                            <TableCell>{formatShortDateTimeBR(item.criadoEm)}</TableCell>
                            <TableCell className="text-right">
                              <a href={resolveServerAssetUrl(item.arquivoUrl) ?? "#"} target="_blank" rel="noreferrer">
                                <Button type="button" size="sm" variant="outline" disabled={!item.arquivoUrl}>
                                  Abrir
                                </Button>
                              </a>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CollapsibleSectionCard>
            </section>

            <section ref={publicationRef}>
              <CollapsibleSectionCard
                title="Publicação e cronograma automático"
                description="Depois de concluir a fase interna, o sistema calcula automaticamente o cronograma de publicação e prazos com o acréscimo municipal adotado em Teixeira de Freitas."
                open={sectionOpen.publication}
                onToggle={(nextOpen) => setSectionOpen((current) => ({ ...current, publication: nextOpen }))}
                action={
                  <div className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary-100)] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary-800)]">
                    <CalendarClock className="h-4 w-4" />
                    Contador automático
                  </div>
                }
                collapsedSummary={
                  schedulePreview ? (
                    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
                      <div className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm"><span className="font-semibold text-[var(--color-primary-900)]">{formatShortDateBR(schedulePreview.dataPublicacaoEdital)}</span><div className="text-[var(--color-neutral-500)]">Publicação</div></div>
                      <div className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm"><span className="font-semibold text-[var(--color-primary-900)]">{formatShortDateTimeBR(schedulePreview.dataRecebimentoPropostasInicio)}</span><div className="text-[var(--color-neutral-500)]">Recebimento inicial</div></div>
                      <div className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm"><span className="font-semibold text-[var(--color-primary-900)]">{formatShortDateTimeBR(schedulePreview.dataRecebimentoPropostasFim)}</span><div className="text-[var(--color-neutral-500)]">Recebimento final</div></div>
                      <div className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm"><span className="font-semibold text-[var(--color-primary-900)]">{formatShortDateTimeBR(schedulePreview.dataAberturaPropostas)}</span><div className="text-[var(--color-neutral-500)]">Disputa</div></div>
                    </div>
                  ) : (
                    <Alert variant="info">Informe a data de publicação e a hora da disputa para gerar o cronograma automático.</Alert>
                  )
                }
              >
                <form className="space-y-5" onSubmit={handlePublish}>
                  <div className="grid gap-3 xl:grid-cols-3 2xl:grid-cols-5">
                    <FormField label="Data prevista de publicação">
                      <Input
                        type="date"
                        value={publishForm.dataPublicacaoEdital}
                        onChange={(event) => setPublishForm((current) => ({ ...current, dataPublicacaoEdital: event.target.value }))}
                      />
                    </FormField>
                    <FormField label="Hora da disputa">
                      <div className="relative">
                        <Input
                          type="time"
                          value={publishForm.horaDisputa}
                          onChange={(event) => setPublishForm((current) => ({ ...current, horaDisputa: event.target.value }))}
                        />
                        <Clock3 className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-[var(--color-neutral-400)]" />
                      </div>
                    </FormField>
                    <FormField label="Condutor do processo">
                      <Select value={publishForm.condutorProcessoId} onChange={(event) => setPublishForm((current) => ({ ...current, condutorProcessoId: event.target.value }))}>
                        <option value="">Selecione</option>
                        {catalogsQuery.data?.pessoas.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.nome}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                    <FormField label="Status do processo">
                      <Select value={publishForm.statusId} onChange={(event) => setPublishForm((current) => ({ ...current, statusId: event.target.value }))}>
                        <option value="">Manter atual</option>
                        {catalogsQuery.data?.statusProcesso.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.nome}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                    <FormField label="Número do edital">
                      <Input value={detalhe.processo.numeroEdital ?? "Gerado automaticamente no ato da publicação"} disabled />
                    </FormField>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <FormField label="Descrição da movimentação">
                      <Input value={publishForm.descricao} onChange={(event) => setPublishForm((current) => ({ ...current, descricao: event.target.value }))} />
                    </FormField>
                    <FormField label="Observação operacional">
                      <Textarea rows={3} value={publishForm.observacao} onChange={(event) => setPublishForm((current) => ({ ...current, observacao: event.target.value }))} />
                    </FormField>
                  </div>
                  {schedulePreview ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
                      <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-4">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Publicação</p>
                        <p className="mt-2 text-lg font-black text-[var(--color-primary-900)]">{formatShortDateBR(schedulePreview.dataPublicacaoEdital)}</p>
                        <p className="mt-1 text-sm text-[var(--color-neutral-600)]">Data base informada</p>
                      </article>
                      <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-4">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Recebimento inicial</p>
                        <p className="mt-2 text-lg font-black text-[var(--color-primary-900)]">{formatShortDateTimeBR(schedulePreview.dataRecebimentoPropostasInicio)}</p>
                        <p className="mt-1 text-sm text-[var(--color-neutral-600)]">{schedulePreview.startOffset} dias úteis após a publicação</p>
                      </article>
                      <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-4">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Recebimento final</p>
                        <p className="mt-2 text-lg font-black text-[var(--color-primary-900)]">{formatShortDateTimeBR(schedulePreview.dataRecebimentoPropostasFim)}</p>
                        <p className="mt-1 text-sm text-[var(--color-neutral-600)]">Mesmo dia da disputa, 15 minutos antes</p>
                      </article>
                      <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-4">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Sessão / disputa</p>
                        <p className="mt-2 text-lg font-black text-[var(--color-primary-900)]">{formatShortDateTimeBR(schedulePreview.dataAberturaPropostas)}</p>
                        <p className="mt-1 text-sm text-[var(--color-neutral-600)]">Horário definido para a disputa</p>
                      </article>
                      <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-4">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Acréscimos</p>
                        <p className="mt-2 text-lg font-black text-[var(--color-primary-900)]">
                          +{schedulePreview.municipioExtra}
                          {schedulePreview.canaisExtra ? ` / +${schedulePreview.canaisExtra}` : ""}
                        </p>
                        <p className="mt-1 text-sm text-[var(--color-neutral-600)]">Município / canais extras (DOU ou jornal)</p>
                      </article>
                    </div>
                  ) : (
                    <Alert variant="info">Defina a data prevista de publicação e a hora da disputa para calcular automaticamente o cronograma.</Alert>
                  )}

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => void persistConfiguracao()} disabled={saveConfiguracaoMutation.isPending}>
                      Salvar cronograma
                    </Button>
                    <Button type="submit" disabled={publishMutation.isPending}>
                      {publishMutation.isPending ? "Publicando..." : "Publicar processo"}
                    </Button>
                  </div>
                </form>
              </CollapsibleSectionCard>
            </section>

            <section ref={licitantesRef}>
              <CollapsibleSectionCard
                title="Licitantes"
                description="Controle dos participantes habilitados a apresentar propostas nesta licitação."
                open={sectionOpen.licitantes}
                onToggle={(nextOpen) => setSectionOpen((current) => ({ ...current, licitantes: nextOpen }))}
                collapsedSummary={
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">{detalhe.licitantes.length} licitante(s)</span>
                    {detalhe.licitantes[0] ? <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">Último: {detalhe.licitantes[0].razaoSocial}</span> : null}
                  </div>
                }
              >
                <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_auto]">
                  <FormField label="Fornecedor">
                    <Select value={licitanteFornecedorId} onChange={(event) => setLicitanteFornecedorId(event.target.value)}>
                      <option value="">Selecione</option>
                      {catalogsQuery.data?.fornecedores.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.razaoSocial} {item.cnpj ? `- ${item.cnpj}` : ""}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <div className="flex items-end">
                    <Button type="button" onClick={() => void handleAddLicitante()} disabled={saveLicitanteMutation.isPending}>
                      {saveLicitanteMutation.isPending ? "Incluindo..." : "Adicionar licitante"}
                    </Button>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white shadow-[0_12px_24px_-24px_rgba(15,26,109,0.22)]">
                  <Table className="min-w-[860px]">
                    <TableHead>
                      <tr>
                        <TableHeaderCell>Licitante</TableHeaderCell>
                        <TableHeaderCell>CNPJ</TableHeaderCell>
                        <TableHeaderCell>Habilitação</TableHeaderCell>
                        <TableHeaderCell>Cadastro</TableHeaderCell>
                        <TableHeaderCell className="text-right">Ações</TableHeaderCell>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {detalhe.licitantes.length ? (
                        detalhe.licitantes.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <div className="font-semibold text-[var(--color-primary-900)]">{item.razaoSocial}</div>
                              <div className="text-xs text-[var(--color-neutral-500)]">{item.ativo ? "Participando" : "Inativo"}</div>
                            </TableCell>
                            <TableCell>{item.cnpj ?? "-"}</TableCell>
                            <TableCell>{habilitacaoStatusLabels[item.statusHabilitacao as keyof typeof habilitacaoStatusLabels] ?? item.statusHabilitacao}</TableCell>
                            <TableCell>{formatShortDateTimeBR(item.dataCadastro)}</TableCell>
                            <TableCell className="text-right">
                              <Button type="button" size="sm" variant="outline" onClick={() => void deleteLicitanteMutation.mutateAsync({ licitanteId: item.id })} disabled={deleteLicitanteMutation.isPending || !item.ativo}>
                                Retirar
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="text-[var(--color-neutral-500)]">Nenhum licitante registrado ainda.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CollapsibleSectionCard>
            </section>

            <section ref={propostasRef}>
              <CollapsibleSectionCard
                title="Propostas"
                description="Recebimento, classificação inicial e situação das propostas por item e por licitante."
                open={sectionOpen.propostas}
                onToggle={(nextOpen) => setSectionOpen((current) => ({ ...current, propostas: nextOpen }))}
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleAdvanceStage("RECEBIMENTO_PROPOSTAS", "Licitação / recebimento de propostas", "Recebimento de propostas em andamento.")}
                    disabled={advanceStageMutation.isPending}
                  >
                    Definir etapa atual
                  </Button>
                }
                collapsedSummary={
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">{detalhe.propostas.length} proposta(s)</span>
                    {detalhe.propostas[0] ? <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">Última: item {detalhe.propostas[0].itemNumero}</span> : null}
                  </div>
                }
              >
                <form className="grid gap-4 2xl:grid-cols-2" onSubmit={handleSaveProposta}>
                  <FormField label="Licitante">
                    <Select value={propostaForm.licitanteId} onChange={(event) => setPropostaForm((current) => ({ ...current, licitanteId: event.target.value }))}>
                      <option value="">Selecione</option>
                      {detalhe.licitantes.filter((item) => item.ativo).map((item) => (
                        <option key={item.id} value={item.id}>{item.razaoSocial}</option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label="Item do processo">
                    <Select value={propostaForm.itemId} onChange={(event) => setPropostaForm((current) => ({ ...current, itemId: event.target.value }))}>
                      <option value="">Selecione</option>
                      {detalhe.itens.map((item) => (
                        <option key={item.id} value={item.id}>
                          Item {item.numeroItem} - {item.descricao}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label="Valor unitário proposto">
                    <Input value={propostaForm.valorUnitarioProposto} onChange={(event) => setPropostaForm((current) => ({ ...current, valorUnitarioProposto: event.target.value }))} placeholder="0,00" />
                  </FormField>
                  <FormField label="Data da proposta">
                    <Input type="date" value={propostaForm.dataProposta} onChange={(event) => setPropostaForm((current) => ({ ...current, dataProposta: event.target.value }))} />
                  </FormField>
                  <FormField label="Classificação">
                    <Input type="number" min={1} value={propostaForm.classificacao} onChange={(event) => setPropostaForm((current) => ({ ...current, classificacao: event.target.value }))} placeholder="1" />
                  </FormField>
                  <FormField label="Situação">
                    <Select value={propostaForm.situacao} onChange={(event) => setPropostaForm((current) => ({ ...current, situacao: event.target.value }))}>
                      {propostaSituacaoOptions.map((item) => (
                        <option key={item} value={item}>{propostaSituacaoLabels[item]}</option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label="Justificativa" className="2xl:col-span-2">
                    <Textarea rows={3} value={propostaForm.justificativa} onChange={(event) => setPropostaForm((current) => ({ ...current, justificativa: event.target.value }))} />
                  </FormField>
                  <div className="xl:col-span-2 flex justify-end">
                    <Button type="submit" disabled={savePropostaMutation.isPending}>{savePropostaMutation.isPending ? "Salvando..." : "Registrar proposta"}</Button>
                  </div>
                </form>

                <div className="mt-4 overflow-x-auto rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white shadow-[0_12px_24px_-24px_rgba(15,26,109,0.22)]">
                  <Table className="min-w-[1080px]">
                    <TableHead>
                      <tr>
                        <TableHeaderCell>Item</TableHeaderCell>
                        <TableHeaderCell>Licitante</TableHeaderCell>
                        <TableHeaderCell>Valor unitário</TableHeaderCell>
                        <TableHeaderCell>Valor atual</TableHeaderCell>
                        <TableHeaderCell>Classificação</TableHeaderCell>
                        <TableHeaderCell>Situação</TableHeaderCell>
                        <TableHeaderCell>Data</TableHeaderCell>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {detalhe.propostas.length ? (
                        detalhe.propostas.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <div className="font-semibold text-[var(--color-primary-900)]">Item {item.itemNumero}</div>
                              <div className="text-xs text-[var(--color-neutral-500)]">{item.itemDescricao}</div>
                            </TableCell>
                            <TableCell>{item.licitanteNome}</TableCell>
                            <TableCell>{formatCurrencyBRL(Number(item.valorUnitarioProposto ?? 0))}</TableCell>
                            <TableCell>{formatCurrencyBRL(Number(item.valorAtualUnitario ?? 0))}</TableCell>
                            <TableCell>{item.classificacao ?? "-"}</TableCell>
                            <TableCell>{propostaSituacaoLabels[item.situacao as keyof typeof propostaSituacaoLabels] ?? item.situacao}</TableCell>
                            <TableCell>{formatShortDateTimeBR(item.dataProposta)}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="text-[var(--color-neutral-500)]">Nenhuma proposta registrada ainda.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CollapsibleSectionCard>
            </section>

            {detalhe.processo.suportaLances ? (
              <section ref={lancesRef}>
                <CollapsibleSectionCard
                  title="Lances"
                  description="Registro operacional dos lances apresentados durante a sessão pública."
                  open={sectionOpen.lances}
                  onToggle={(nextOpen) => setSectionOpen((current) => ({ ...current, lances: nextOpen }))}
                  action={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleAdvanceStage("LANCES", "Licitação / fase de lances", "Sessão de lances em andamento.")}
                      disabled={advanceStageMutation.isPending}
                    >
                      Definir etapa atual
                    </Button>
                  }
                  collapsedSummary={
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">{detalhe.lances.length} lance(s)</span>
                      {detalhe.lances[0] ? <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">Último em {formatShortDateTimeBR(detalhe.lances[0].dataLance)}</span> : null}
                    </div>
                  }
                >
                  <form className="grid gap-4 2xl:grid-cols-2" onSubmit={handleSaveLance}>
                    <FormField label="Proposta vinculada">
                      <Select value={lanceForm.propostaId} onChange={(event) => setLanceForm((current) => ({ ...current, propostaId: event.target.value }))}>
                        <option value="">Selecione</option>
                        {detalhe.propostas.map((item) => (
                          <option key={item.id} value={item.id}>
                            Item {item.itemNumero} - {item.licitanteNome}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                    <FormField label="Valor do lance">
                      <Input value={lanceForm.valorLance} onChange={(event) => setLanceForm((current) => ({ ...current, valorLance: event.target.value }))} placeholder="0,00" />
                    </FormField>
                    <FormField label="Data do lance">
                      <Input type="date" value={lanceForm.dataLance} onChange={(event) => setLanceForm((current) => ({ ...current, dataLance: event.target.value }))} />
                    </FormField>
                    <FormField label="Observação">
                      <Textarea rows={3} value={lanceForm.observacao} onChange={(event) => setLanceForm((current) => ({ ...current, observacao: event.target.value }))} />
                    </FormField>
                    <div className="xl:col-span-2 flex justify-end">
                      <Button type="submit" disabled={saveLanceMutation.isPending}>{saveLanceMutation.isPending ? "Registrando..." : "Registrar lance"}</Button>
                    </div>
                  </form>

                  <div className="mt-4 overflow-x-auto rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white shadow-[0_12px_24px_-24px_rgba(15,26,109,0.22)]">
                    <Table className="min-w-[920px]">
                      <TableHead>
                        <tr>
                          <TableHeaderCell>Proposta</TableHeaderCell>
                          <TableHeaderCell>Valor</TableHeaderCell>
                          <TableHeaderCell>Registrado em</TableHeaderCell>
                          <TableHeaderCell>Usuário</TableHeaderCell>
                          <TableHeaderCell>Observação</TableHeaderCell>
                        </tr>
                      </TableHead>
                      <TableBody>
                        {detalhe.lances.length ? (
                          detalhe.lances.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell>{item.propostaId}</TableCell>
                              <TableCell>{formatCurrencyBRL(Number(item.valorLance ?? 0))}</TableCell>
                              <TableCell>{formatShortDateTimeBR(item.dataLance)}</TableCell>
                              <TableCell>{item.usuarioNome ?? "Sistema"}</TableCell>
                              <TableCell>{item.observacao ?? "-"}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} className="text-[var(--color-neutral-500)]">Nenhum lance registrado ainda.</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleSectionCard>
              </section>
            ) : null}

            <section ref={julgamentoRef}>
              <CollapsibleSectionCard
                title="Julgamento"
                description="Definição visual da etapa de julgamento e conferência da classificação das propostas."
                open={sectionOpen.julgamento}
                onToggle={(nextOpen) => setSectionOpen((current) => ({ ...current, julgamento: nextOpen }))}
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleAdvanceStage("JULGAMENTO", "Licitação / julgamento", "Classificação e julgamento das propostas.")}
                    disabled={advanceStageMutation.isPending}
                  >
                    Definir etapa atual
                  </Button>
                }
                collapsedSummary={
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">Status: {licitacaoStatusLabels[detalhe.licitacao.statusLicitacao as keyof typeof licitacaoStatusLabels] ?? detalhe.licitacao.statusLicitacao}</span>
                  </div>
                }
              >
                <Alert variant="info">Use as classificações e situações lançadas em propostas para registrar o julgamento. Esta seção define visualmente a etapa atual e permite conferência consolidada.</Alert>
                <div className="mt-4 overflow-x-auto rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white shadow-[0_12px_24px_-24px_rgba(15,26,109,0.22)]">
                  <Table className="min-w-[1040px]">
                    <TableHead>
                      <tr>
                        <TableHeaderCell>Item</TableHeaderCell>
                        <TableHeaderCell>Licitante</TableHeaderCell>
                        <TableHeaderCell>Classificação</TableHeaderCell>
                        <TableHeaderCell>Situação</TableHeaderCell>
                        <TableHeaderCell>Valor atual</TableHeaderCell>
                        <TableHeaderCell>Justificativa</TableHeaderCell>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {detalhe.propostas.length ? (
                        detalhe.propostas.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>{item.itemNumero}</TableCell>
                            <TableCell>{item.licitanteNome}</TableCell>
                            <TableCell>{item.classificacao ?? "-"}</TableCell>
                            <TableCell>{propostaSituacaoLabels[item.situacao as keyof typeof propostaSituacaoLabels] ?? item.situacao}</TableCell>
                            <TableCell>{formatCurrencyBRL(Number(item.valorAtualTotal ?? 0))}</TableCell>
                            <TableCell>{item.justificativa ?? "-"}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={6} className="text-[var(--color-neutral-500)]">Sem propostas para julgamento.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CollapsibleSectionCard>
            </section>

            <section ref={habilitacaoRef}>
              <CollapsibleSectionCard
                title="Habilitação"
                description="Registro da situação documental do licitante classificado e observações da comissão."
                open={sectionOpen.habilitacao}
                onToggle={(nextOpen) => setSectionOpen((current) => ({ ...current, habilitacao: nextOpen }))}
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleAdvanceStage("HABILITACAO", "Licitação / habilitação", "Verificação documental do licitante classificado.")}
                    disabled={advanceStageMutation.isPending}
                  >
                    Definir etapa atual
                  </Button>
                }
                collapsedSummary={
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">{detalhe.licitantes.length} licitante(s) para conferência</span>
                  </div>
                }
              >
                <form className="grid gap-4 2xl:grid-cols-2" onSubmit={handleSaveHabilitacao}>
                  <FormField label="Licitante">
                    <Select value={habilitacaoForm.licitanteId} onChange={(event) => setHabilitacaoForm((current) => ({ ...current, licitanteId: event.target.value }))}>
                      <option value="">Selecione</option>
                      {detalhe.licitantes.map((item) => (
                        <option key={item.id} value={item.id}>{item.razaoSocial}</option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label="Status da habilitação">
                    <Select value={habilitacaoForm.statusHabilitacao} onChange={(event) => setHabilitacaoForm((current) => ({ ...current, statusHabilitacao: event.target.value }))}>
                      {habilitacaoStatusOptions.map((item) => (
                        <option key={item} value={item}>{habilitacaoStatusLabels[item]}</option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label="Observação" className="2xl:col-span-2">
                    <Textarea rows={3} value={habilitacaoForm.observacaoHabilitacao} onChange={(event) => setHabilitacaoForm((current) => ({ ...current, observacaoHabilitacao: event.target.value }))} />
                  </FormField>
                  <div className="xl:col-span-2 flex justify-end">
                    <Button type="submit" disabled={saveHabilitacaoMutation.isPending}>{saveHabilitacaoMutation.isPending ? "Salvando..." : "Salvar habilitação"}</Button>
                  </div>
                </form>

                <div className="mt-4 overflow-x-auto rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white shadow-[0_12px_24px_-24px_rgba(15,26,109,0.22)]">
                  <Table className="min-w-[920px]">
                    <TableHead>
                      <tr>
                        <TableHeaderCell>Licitante</TableHeaderCell>
                        <TableHeaderCell>Status</TableHeaderCell>
                        <TableHeaderCell>Observação</TableHeaderCell>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {detalhe.licitantes.length ? (
                        detalhe.licitantes.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>{item.razaoSocial}</TableCell>
                            <TableCell>{habilitacaoStatusLabels[item.statusHabilitacao as keyof typeof habilitacaoStatusLabels] ?? item.statusHabilitacao}</TableCell>
                            <TableCell>{item.observacaoHabilitacao ?? "-"}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={3} className="text-[var(--color-neutral-500)]">Nenhum licitante cadastrado para habilitação.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CollapsibleSectionCard>
            </section>

            <section ref={recursosRef}>
              <CollapsibleSectionCard
                title="Recursos"
                description="Registro de interposição, julgamento e resultado recursal dentro da fase licitatória."
                open={sectionOpen.recursos}
                onToggle={(nextOpen) => setSectionOpen((current) => ({ ...current, recursos: nextOpen }))}
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleAdvanceStage("RECURSOS", "Licitação / recursos administrativos", "Abertura da fase recursal.")}
                    disabled={advanceStageMutation.isPending}
                  >
                    Definir etapa atual
                  </Button>
                }
                collapsedSummary={
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">{detalhe.recursos.length} recurso(s)</span>
                  </div>
                }
              >
                <form className="grid gap-4 2xl:grid-cols-2" onSubmit={handleSaveRecurso}>
                  <FormField label="Licitante">
                    <Select value={recursoForm.licitanteId} onChange={(event) => setRecursoForm((current) => ({ ...current, licitanteId: event.target.value }))}>
                      <option value="">Selecione</option>
                      {detalhe.licitantes.map((item) => (
                        <option key={item.id} value={item.id}>{item.razaoSocial}</option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label="Resultado">
                    <Select value={recursoForm.resultado} onChange={(event) => setRecursoForm((current) => ({ ...current, resultado: event.target.value }))}>
                      {recursoResultadoOptions.map((item) => (
                        <option key={item} value={item}>{recursoResultadoLabels[item]}</option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label="Data de interposição">
                    <Input type="date" value={recursoForm.dataInterposicao} onChange={(event) => setRecursoForm((current) => ({ ...current, dataInterposicao: event.target.value }))} />
                  </FormField>
                  <FormField label="Data do julgamento">
                    <Input type="date" value={recursoForm.dataJulgamento} onChange={(event) => setRecursoForm((current) => ({ ...current, dataJulgamento: event.target.value }))} />
                  </FormField>
                  <FormField label="Descrição" className="2xl:col-span-2">
                    <Textarea rows={4} value={recursoForm.descricao} onChange={(event) => setRecursoForm((current) => ({ ...current, descricao: event.target.value }))} />
                  </FormField>
                  <FormField label="Decisão" className="2xl:col-span-2">
                    <Textarea rows={4} value={recursoForm.decisao} onChange={(event) => setRecursoForm((current) => ({ ...current, decisao: event.target.value }))} />
                  </FormField>
                  <div className="xl:col-span-2 flex justify-end">
                    <Button type="submit" disabled={saveRecursoMutation.isPending}>{saveRecursoMutation.isPending ? "Salvando..." : "Registrar recurso"}</Button>
                  </div>
                </form>

                <div className="mt-4 overflow-x-auto rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white shadow-[0_12px_24px_-24px_rgba(15,26,109,0.22)]">
                  <Table className="min-w-[1100px]">
                    <TableHead>
                      <tr>
                        <TableHeaderCell>Licitante</TableHeaderCell>
                        <TableHeaderCell>Interposição</TableHeaderCell>
                        <TableHeaderCell>Julgamento</TableHeaderCell>
                        <TableHeaderCell>Resultado</TableHeaderCell>
                        <TableHeaderCell>Descrição</TableHeaderCell>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {detalhe.recursos.length ? (
                        detalhe.recursos.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>{item.licitanteNome}</TableCell>
                            <TableCell>{formatShortDateBR(item.dataInterposicao)}</TableCell>
                            <TableCell>{formatShortDateBR(item.dataJulgamento)}</TableCell>
                            <TableCell>{recursoResultadoLabels[item.resultado as keyof typeof recursoResultadoLabels] ?? item.resultado}</TableCell>
                            <TableCell>{item.descricao}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="text-[var(--color-neutral-500)]">Nenhum recurso registrado até o momento.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CollapsibleSectionCard>
            </section>

            <section ref={homologacaoRef}>
              <CollapsibleSectionCard
                title="Homologação"
                description="Encerramento formal da fase licitatória com atualização do status final do processo."
                open={sectionOpen.homologacao}
                onToggle={(nextOpen) => setSectionOpen((current) => ({ ...current, homologacao: nextOpen }))}
                collapsedSummary={
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 font-semibold text-[var(--color-primary-700)]">
                      {detalhe.processo.homologado ? "Processo homologado" : "Homologação pendente"}
                    </span>
                  </div>
                }
              >
                <form className="grid gap-4 2xl:grid-cols-2" onSubmit={handleHomologar}>
                  <FormField label="Data da homologação">
                    <Input type="date" value={homologacaoForm.dataHomologacao} onChange={(event) => setHomologacaoForm((current) => ({ ...current, dataHomologacao: event.target.value }))} />
                  </FormField>
                  <FormField label="Status do processo após homologação">
                    <Select value={homologacaoForm.statusId} onChange={(event) => setHomologacaoForm((current) => ({ ...current, statusId: event.target.value }))}>
                      <option value="">Manter atual</option>
                      {catalogsQuery.data?.statusProcesso.map((item) => (
                        <option key={item.id} value={item.id}>{item.nome}</option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label="Observação" className="2xl:col-span-2">
                    <Textarea rows={4} value={homologacaoForm.observacao} onChange={(event) => setHomologacaoForm((current) => ({ ...current, observacao: event.target.value }))} />
                  </FormField>
                  <div className="xl:col-span-2 flex justify-end">
                    <Button type="submit" disabled={homologarMutation.isPending}>{homologarMutation.isPending ? "Homologando..." : "Homologar licitação"}</Button>
                  </div>
                </form>
              </CollapsibleSectionCard>
            </section>

            <section ref={historyRef}>
              <CollapsibleSectionCard
                title="Movimentações recentes"
                description="Rastro operacional da fase licitatória para acompanhamento do setor e da gestão."
                open={sectionOpen.history}
                onToggle={(nextOpen) => setSectionOpen((current) => ({ ...current, history: nextOpen }))}
                collapsedSummary={
                  detalhe.historico.length ? (
                    <div className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm">
                      <span className="font-semibold text-[var(--color-primary-900)]">{detalhe.historico[0]?.descricao}</span>
                      <div className="text-[var(--color-neutral-500)]">{formatShortDateTimeBR(detalhe.historico[0]?.criadoEm)}</div>
                    </div>
                  ) : (
                    <Alert variant="info">Ainda não há movimentações registradas para esta etapa.</Alert>
                  )
                }
              >
                <div className="space-y-3">
                  {detalhe.historico.length ? (
                    detalhe.historico.map((item) => (
                      <article key={item.id} className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-[var(--color-primary-900)]">{item.descricao}</div>
                            <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--color-neutral-500)]">Registro operacional da Licitação</div>
                          </div>
                          <span className="text-xs text-[var(--color-neutral-500)]">{formatShortDateTimeBR(item.criadoEm)}</span>
                        </div>
                        {item.observacao ? <p className="mt-3 text-sm leading-6 text-[var(--color-neutral-600)]">{item.observacao}</p> : null}
                      </article>
                    ))
                  ) : (
                    <Alert variant="info">Ainda não há movimentações registradas para esta etapa da Licitação.</Alert>
                  )}
                </div>
              </CollapsibleSectionCard>
            </section>
          </div>
        </div>
      </SectionCard>

      <Modal
        open={showAllDocsModal}
        onClose={() => setShowAllDocsModal(false)}
        title={`Documentos do processo ${detalhe.processo.numeroSirel}`}
        description="Conferência integral do acervo do processo, em ordem de inclusão."
        size="xl"
      >
        {!documentos.length ? (
          <Alert variant="info">Este processo ainda não possui documentos vinculados.</Alert>
        ) : (
          <div className="overflow-x-auto rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white shadow-[0_12px_24px_-24px_rgba(15,26,109,0.22)]">
            <Table className="min-w-[1080px]">
              <TableHead>
                <tr>
                  <TableHeaderCell>#</TableHeaderCell>
                  <TableHeaderCell>Título</TableHeaderCell>
                  <TableHeaderCell>Tipo</TableHeaderCell>
                  <TableHeaderCell>Categoria</TableHeaderCell>
                  <TableHeaderCell>Data de referência</TableHeaderCell>
                  <TableHeaderCell>Adicionado em</TableHeaderCell>
                  <TableHeaderCell className="text-right">Arquivo</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {documentos.map((item, index) => (
                  <TableRow key={item.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{item.titulo}</TableCell>
                    <TableCell>{item.tipo}</TableCell>
                    <TableCell>{item.categoria ?? "-"}</TableCell>
                    <TableCell>{formatShortDateBR(item.dataReferencia)}</TableCell>
                    <TableCell>{formatShortDateTimeBR(item.criadoEm)}</TableCell>
                    <TableCell className="text-right">
                      <a href={resolveServerAssetUrl(item.arquivoUrl) ?? "#"} target="_blank" rel="noreferrer">
                        <Button type="button" size="sm" variant="outline" disabled={!item.arquivoUrl}>
                          Abrir
                        </Button>
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Modal>
    </div>
  );
}




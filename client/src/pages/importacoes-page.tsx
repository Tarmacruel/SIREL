import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  Eye,
  Link2,
  RefreshCcw,
  Search,
  Sparkles,
  Trash2,
  Unlink,
  Upload,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { Link } from "wouter";

import {
  importacaoBllConciliacaoStatusLabels,
  importacaoBllExecutionStatusLabels,
  importacaoBllModeLabels,
  importacaoBllSourceLabels,
} from "@sirel/shared/const";
import type {
  ImportacaoBllConciliacaoStatus,
  ImportacaoBllSource,
  PncpStoredEntity,
} from "@sirel/shared/schemas/importacoes";

import { ProcessoCreateModal } from "@/components/processos/processo-create-modal";
import { Modal } from "@/components/shared/modal";
import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import {
  formatCurrencyBRL,
  formatIntegerBR,
  formatShortDateBR,
  formatShortDateTimeBR,
  maskCurrencyInputBR,
} from "@/lib/formatters";
import { trpc } from "@/lib/trpc";

type FeedbackState = {
  variant: "success" | "error" | "warning" | "info";
  message: string;
} | null;
type CsvUploadState = {
  source: ImportacaoBllSource;
  registrosFile: File | null;
  itensFile: File | null;
};
type SuggestionRow = {
  processoId: number;
  numeroSirel: string;
  numeroAdministrativo: string | null;
  numeroEdital: string | null;
  objeto: string;
  modalidade: string | null;
  secretaria: string;
  moduloAtual: string | null;
  valorEstimado: number | null;
  score: number;
  nivel: string;
  motivos: string[];
};

type ImportacoesTab = "DASHBOARD" | "BASE" | "PNCP" | "CSV" | "HISTORICO";
type SyncAction = "LICITACAO" | "COMPRA_DIRETA" | "TODOS";
type ColumnKey = "origem" | "processoInterno" | "publicacao";
type ConciliationDetailTab = "GERAL" | "SUGESTOES" | "ITENS";
type PncpDetailTab = "GERAL" | "CONCILIACAO" | "ITENS" | "RAW";

const TEIXEIRA_FREITAS_CNPJ_FORMAT = "13.650.403/0001-28";

const sourceOptions = Object.entries(importacaoBllSourceLabels) as Array<
  [ImportacaoBllSource, string]
>;
const conciliationOptions = Object.entries(
  importacaoBllConciliacaoStatusLabels,
) as Array<[ImportacaoBllConciliacaoStatus, string]>;
const conciliationBadgeClass: Record<ImportacaoBllConciliacaoStatus, string> = {
  PENDENTE: "border-amber-200 bg-amber-50 text-amber-800",
  SUGERIDO: "border-sky-200 bg-sky-50 text-sky-800",
  VINCULADO: "border-emerald-200 bg-emerald-50 text-emerald-800",
  IGNORADO: "border-slate-200 bg-slate-100 text-slate-700",
};

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Falha ao ler arquivo."));
    reader.readAsText(file, "utf-8");
  });
}

function formatDateForInput(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatDateTimeForInput(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function mapWorkflowSituacaoFromExternal(value?: string | null) {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (!normalized) return "RASCUNHO";
  if (normalized.includes("rascun")) return "RASCUNHO";
  if (
    normalized.includes("conclu") ||
    normalized.includes("homolog") ||
    normalized.includes("finaliz")
  ) {
    return "CONCLUIDO";
  }
  if (normalized.includes("suspens")) return "SUSPENSO";
  if (
    normalized.includes("aguard") ||
    normalized.includes("analise") ||
    normalized.includes("analis")
  ) {
    return "AGUARDANDO";
  }
  return "EM_ANDAMENTO";
}

function formatCurrencyForForm(value: number | null | undefined) {
  if (value === null || value === undefined) return "";
  return maskCurrencyInputBR(String(value));
}

function getInternalProcessHref(
  processoId: number,
  moduloAtual?: string | null,
) {
  return moduloAtual === "LICITACAO"
    ? `/licitacao/${processoId}`
    : `/processos/${processoId}`;
}

function ConciliationBadge({
  status,
}: {
  status: ImportacaoBllConciliacaoStatus;
}) {
  return (
    <span
      className={[
        "inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em]",
        conciliationBadgeClass[status],
      ].join(" ")}
    >
      {importacaoBllConciliacaoStatusLabels[status]}
    </span>
  );
}

function SuggestionCard({
  suggestion,
  onLink,
  busy,
}: {
  suggestion: SuggestionRow;
  onLink: (processoId: number) => void;
  busy: boolean;
}) {
  return (
    <article className="rounded-[24px] border border-[rgba(204,225,255,0.9)] bg-white px-4 py-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-700)]">
              {suggestion.numeroSirel}
            </span>
            <span
              className={[
                "rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em]",
                suggestion.nivel === "ALTO"
                  ? "bg-emerald-50 text-emerald-800"
                  : suggestion.nivel === "MEDIO"
                    ? "bg-sky-50 text-sky-800"
                    : "bg-amber-50 text-amber-800",
              ].join(" ")}
            >
              Score {suggestion.score}
            </span>
          </div>
          <p className="text-sm font-black text-[var(--color-neutral-900)]">
            {suggestion.objeto}
          </p>
          <p className="text-xs text-[var(--color-neutral-600)]">
            {suggestion.secretaria}
            {suggestion.modalidade ? ` • ${suggestion.modalidade}` : ""}
            {suggestion.numeroAdministrativo
              ? ` • Adm ${suggestion.numeroAdministrativo}`
              : ""}
          </p>
          <ul className="space-y-1 text-xs text-[var(--color-neutral-600)]">
            {suggestion.motivos.map((motivo) => (
              <li key={motivo}>• {motivo}</li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Link
            href={getInternalProcessHref(
              suggestion.processoId,
              suggestion.moduloAtual,
            )}
          >
            <Button
              variant="outline"
              size="sm"
              icon={<ArrowUpRight className="h-4 w-4" />}
            >
              Abrir processo
            </Button>
          </Link>
          <Button
            size="sm"
            onClick={() => onLink(suggestion.processoId)}
            disabled={busy}
            icon={<Link2 className="h-4 w-4" />}
          >
            Vincular
          </Button>
        </div>
      </div>
    </article>
  );
}

export function ImportacoesPage() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [executionPage, setExecutionPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"" | ImportacaoBllSource>(
    "",
  );
  const [conciliationFilter, setConciliationFilter] = useState<
    "" | ImportacaoBllConciliacaoStatus
  >("");
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [selectedRecordIds, setSelectedRecordIds] = useState<number[]>([]);
  const [createProcessModalOpen, setCreateProcessModalOpen] = useState(false);
  const [createProcessSource, setCreateProcessSource] = useState<
    "BLL" | "PNCP" | null
  >(null);
  const [manualProcessSearch, setManualProcessSearch] = useState("");
  const [detailTab, setDetailTab] = useState<ConciliationDetailTab>("GERAL");
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [activeTab, setActiveTab] = useState<ImportacoesTab>("DASHBOARD");
  const [syncAction, setSyncAction] = useState<SyncAction>("TODOS");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>({
    origem: true,
    processoInterno: true,
    publicacao: true,
  });
  const [csvState, setCsvState] = useState<CsvUploadState>({
    source: "LICITACAO",
    registrosFile: null,
    itensFile: null,
  });
  const [pncpDateRange, setPncpDateRange] = useState({
    dataInicio: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    dataFim: new Date().toISOString().split("T")[0],
  });
  const [pncpPreviewData, setPncpPreviewData] = useState<any>(null);
  const [pncpLoading, setPncpLoading] = useState(false);
  const [pncpOperation, setPncpOperation] = useState<
    "preview" | "import" | "conciliar" | null
  >(null);
  const [pncpStoredTab, setPncpStoredTab] =
    useState<PncpStoredEntity>("CONTRATACOES");
  const [pncpStoredSearch, setPncpStoredSearch] = useState("");
  const [pncpStoredPage, setPncpStoredPage] = useState(1);
  const [pncpStoredRange, setPncpStoredRange] = useState({
    dataInicio: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    dataFim: new Date().toISOString().split("T")[0],
  });
  const [pncpStoredDetail, setPncpStoredDetail] = useState<{
    tipo: PncpStoredEntity;
    id: number;
  } | null>(null);
  const [pncpDetailTab, setPncpDetailTab] = useState<PncpDetailTab>("GERAL");
  const [pncpManualProcessSearch, setPncpManualProcessSearch] = useState("");
  const pncpPreviewQuery = trpc.pncpTeixeira.previewData.useQuery(
    {
      dataInicio: pncpDateRange.dataInicio,
      dataFim: pncpDateRange.dataFim,
    },
    {
      enabled: false,
      retry: false,
      refetchOnWindowFocus: false,
    },
  );
  const pncpImportMutation = trpc.pncpTeixeira.importAllData.useMutation();
  const deferredSearch = useDeferredValue(search.trim());
  const deferredPncpStoredSearch = useDeferredValue(pncpStoredSearch.trim());
  const deferredManualProcessSearch = useDeferredValue(
    manualProcessSearch.trim(),
  );
  const deferredPncpManualProcessSearch = useDeferredValue(
    pncpManualProcessSearch.trim(),
  );
  const pncpStoredListQuery = trpc.pncpTeixeira.listStored.useQuery(
    {
      tipo: pncpStoredTab,
      search: deferredPncpStoredSearch || undefined,
      dataInicio: pncpStoredRange.dataInicio || undefined,
      dataFim: pncpStoredRange.dataFim || undefined,
      page: pncpStoredPage,
      pageSize: 8,
    },
    {
      retry: false,
    },
  );
  const pncpStoredDetailQuery = trpc.pncpTeixeira.getStoredDetail.useQuery(
    {
      tipo: pncpStoredDetail?.tipo ?? "CONTRATACOES",
      id: pncpStoredDetail?.id ?? 0,
    },
    {
      enabled: Boolean(pncpStoredDetail),
      retry: false,
    },
  );
  const pncpProcessSearchQuery = trpc.pncpTeixeira.searchProcessos.useQuery(
    {
      tipo: pncpStoredDetail?.tipo ?? "CONTRATACOES",
      id: pncpStoredDetail?.id ?? 0,
      search: deferredPncpManualProcessSearch || undefined,
      pageSize: 8,
    },
    {
      enabled: Boolean(pncpStoredDetail) && pncpDetailTab === "CONCILIACAO",
      retry: false,
    },
  );
  const pncpStoredColSpan = pncpStoredTab === "CONTRATOS" ? 8 : 7;
  const pncpDetailData = pncpStoredDetailQuery.data as any;
  const summaryQuery = trpc.importacoes.summary.useQuery(undefined, {
    retry: false,
  });
  const catalogQuery = trpc.cadastros.formOptions.useQuery(undefined, {
    retry: false,
  });
  const recordsQuery = trpc.importacoes.list.useQuery(
    {
      page,
      pageSize: 12,
      search: deferredSearch || undefined,
      source: sourceFilter || undefined,
      conciliationStatus: conciliationFilter || undefined,
    },
    { retry: false, placeholderData: (previous) => previous },
  );
  const executionsQuery = trpc.importacoes.executions.useQuery(
    { page: executionPage, pageSize: 8, source: sourceFilter || undefined },
    { retry: false, placeholderData: (previous) => previous },
  );
  const detailQuery = trpc.importacoes.detail.useQuery(
    { id: selectedRecordId ?? 0 },
    { enabled: selectedRecordId !== null, retry: false },
  );
  const processSearchQuery = trpc.importacoes.searchProcessos.useQuery(
    {
      importedId: selectedRecordId ?? 0,
      search: deferredManualProcessSearch || undefined,
      pageSize: 8,
    },
    {
      enabled:
        selectedRecordId !== null && deferredManualProcessSearch.length > 0,
      retry: false,
    },
  );

  const visibleRecordIds = recordsQuery.data?.items.map((row) => row.id) ?? [];
  const allVisibleSelected =
    visibleRecordIds.length > 0 &&
    visibleRecordIds.every((id) => selectedRecordIds.includes(id));

  const invalidateImportacoes = async () => {
    await Promise.all([
      utils.importacoes.summary.invalidate(),
      utils.importacoes.list.invalidate(),
      utils.importacoes.executions.invalidate(),
      utils.importacoes.detail.invalidate(),
    ]);
  };

  const invalidatePncp = async () => {
    await Promise.all([
      utils.pncpTeixeira.listStored.invalidate(),
      utils.pncpTeixeira.getStoredDetail.invalidate(),
    ]);
  };

  const previewPncpData = async () => {
    setPncpOperation("preview");
    setPncpLoading(true);
    try {
      const result = await pncpPreviewQuery.refetch();
      setPncpPreviewData(result.data);
      setFeedback({ variant: "success", message: "Preview PNCP carregado com sucesso." });
    } catch (error: any) {
      setFeedback({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "Falha ao buscar preview PNCP.",
      });
    } finally {
      setPncpLoading(false);
      setPncpOperation(null);
    }
  };

  const importPncpData = async () => {
    setPncpOperation("import");
    setPncpLoading(true);
    try {
      const result = await pncpImportMutation.mutateAsync({
        dataInicio: pncpDateRange.dataInicio,
        dataFim: pncpDateRange.dataFim,
        incluirItens: true,
        incluirAtas: true,
        incluirContratos: true,
        dryRun: false,
      });
      setFeedback({ variant: "success", message: result.message ?? "Importação PNCP concluída." });
      await Promise.all([invalidateImportacoes(), invalidatePncp()]);
      setPncpPreviewData(null);
    } catch (error: any) {
      setFeedback({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "Falha ao importar PNCP.",
      });
    } finally {
      setPncpLoading(false);
      setPncpOperation(null);
    }
  };

  // Funções de navegação no modal de conciliação
  const navigateToNextProcess = () => {
    if (!selectedRecordId || !recordsQuery.data?.items) return;

    const currentRecords = recordsQuery.data.items;
    const currentIndex = currentRecords.findIndex(record => record.id === selectedRecordId);

    if (currentIndex === -1) return;

    const nextIndex = (currentIndex + 1) % currentRecords.length;
    const nextRecord = currentRecords[nextIndex];

    setSelectedRecordId(nextRecord.id);
    setManualProcessSearch("");
  };

  const navigateToPreviousProcess = () => {
    if (!selectedRecordId || !recordsQuery.data?.items) return;

    const currentRecords = recordsQuery.data.items;
    const currentIndex = currentRecords.findIndex(record => record.id === selectedRecordId);

    if (currentIndex === -1) return;

    const prevIndex = currentIndex === 0 ? currentRecords.length - 1 : currentIndex - 1;
    const prevRecord = currentRecords[prevIndex];

    setSelectedRecordId(prevRecord.id);
    setManualProcessSearch("");
  };

  // Calcular posição atual na lista para exibir no modal
  const getCurrentPosition = () => {
    if (!selectedRecordId || !recordsQuery.data?.items) return null;

    const currentRecords = recordsQuery.data.items;
    const currentIndex = currentRecords.findIndex(record => record.id === selectedRecordId);

    if (currentIndex === -1) return null;

    return {
      current: currentIndex + 1,
      total: currentRecords.length,
    };
  };

  const getCurrentPncpPosition = () => {
    if (!pncpStoredDetail || !pncpStoredListQuery.data?.items) return null;
    const currentItems = pncpStoredListQuery.data.items;
    const currentIndex = currentItems.findIndex((row: any) => row.id === pncpStoredDetail.id);
    if (currentIndex === -1) return null;
    return {
      current: currentIndex + 1,
      total: currentItems.length,
    };
  };

  const navigateToNextPncp = () => {
    if (!pncpStoredDetail || !pncpStoredListQuery.data?.items?.length) return;
    const currentItems = pncpStoredListQuery.data.items;
    const currentIndex = currentItems.findIndex((row: any) => row.id === pncpStoredDetail.id);
    if (currentIndex === -1) return;
    const nextIndex = (currentIndex + 1) % currentItems.length;
    setPncpStoredDetail({ tipo: pncpStoredDetail.tipo, id: currentItems[nextIndex].id });
  };

  const navigateToPreviousPncp = () => {
    if (!pncpStoredDetail || !pncpStoredListQuery.data?.items?.length) return;
    const currentItems = pncpStoredListQuery.data.items;
    const currentIndex = currentItems.findIndex((row: any) => row.id === pncpStoredDetail.id);
    if (currentIndex === -1) return;
    const previousIndex = currentIndex === 0 ? currentItems.length - 1 : currentIndex - 1;
    setPncpStoredDetail({ tipo: pncpStoredDetail.tipo, id: currentItems[previousIndex].id });
  };

  // Atalhos de teclado para navegação
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Só funciona quando algum modal de detalhe está aberto
      if (selectedRecordId === null && pncpStoredDetail === null) return;

      // Evita conflito com campos de input
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          if (selectedRecordId !== null) {
            navigateToPreviousProcess();
          } else {
            navigateToPreviousPncp();
          }
          break;
        case 'ArrowRight':
          event.preventDefault();
          if (selectedRecordId !== null) {
            navigateToNextProcess();
          } else {
            navigateToNextPncp();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedRecordId, pncpStoredDetail, recordsQuery.data?.items, pncpStoredListQuery.data?.items]);

  useEffect(() => {
    setSelectedRecordIds([]);
  }, [search, sourceFilter, conciliationFilter, page]);

  useEffect(() => {
    if (selectedRecordId !== null) {
      setDetailTab("GERAL");
    }
  }, [selectedRecordId]);

  useEffect(() => {
    if (pncpStoredDetail !== null) {
      setPncpDetailTab("GERAL");
      setPncpManualProcessSearch("");
    }
  }, [pncpStoredDetail]);

  const syncRemoteMutation = trpc.importacoes.syncRemote.useMutation({
    onSuccess: async (result) => {
      setFeedback({ variant: "success", message: result.message });
      await invalidateImportacoes();
    },
    onError: (error) =>
      setFeedback({ variant: "error", message: error.message }),
  });
  const autoReconcileMutation = trpc.importacoes.autoReconcile.useMutation({
    onSuccess: async (result) => {
      setFeedback({ variant: "success", message: result.message });
      await invalidateImportacoes();
    },
    onError: (error) =>
      setFeedback({ variant: "error", message: error.message }),
  });
  const importCsvMutation = trpc.importacoes.importCsv.useMutation({
    onSuccess: async (result) => {
      setFeedback({ variant: "success", message: result.message });
      setCsvState((current) => ({
        ...current,
        registrosFile: null,
        itensFile: null,
      }));
      await invalidateImportacoes();
    },
    onError: (error) =>
      setFeedback({ variant: "error", message: error.message }),
  });
  const linkProcessoMutation = trpc.importacoes.linkProcesso.useMutation({
    onSuccess: async (result) => {
      setFeedback({ variant: "success", message: result.message });
      await invalidateImportacoes();
    },
    onError: (error) =>
      setFeedback({ variant: "error", message: error.message }),
  });
  const unlinkProcessoMutation = trpc.importacoes.unlinkProcesso.useMutation({
    onSuccess: async (result) => {
      setFeedback({ variant: "success", message: result.message });
      await invalidateImportacoes();
    },
    onError: (error) =>
      setFeedback({ variant: "error", message: error.message }),
  });
  const deleteProcessoMutation = trpc.importacoes.deleteProcesso.useMutation({
    onSuccess: async (result) => {
      setFeedback({ variant: "success", message: result.message });
      setSelectedRecordId(null);
      setManualProcessSearch("");
      await invalidateImportacoes();
    },
    onError: (error) =>
      setFeedback({ variant: "error", message: error.message }),
  });

  const deleteProcessosMutation = trpc.importacoes.deleteProcessos.useMutation({
    onSuccess: async (result) => {
      setFeedback({ variant: "success", message: result.message });
      setSelectedRecordIds([]);
      setSelectedRecordId(null);
      setManualProcessSearch("");
      await invalidateImportacoes();
    },
    onError: (error) =>
      setFeedback({ variant: "error", message: error.message }),
  });

  const setIgnoredMutation = trpc.importacoes.setIgnored.useMutation({
    onSuccess: async (result) => {
      setFeedback({ variant: "success", message: result.message });
      await invalidateImportacoes();
    },
    onError: (error) =>
      setFeedback({ variant: "error", message: error.message }),
  });

  // PNCP mutations
  const pncpAutoConciliateMutation = trpc.importacoes.autoConciliatePncp.useMutation({
    onSuccess: (result) => {
      setFeedback({
        variant: "success",
        message: result.message,
      });
      void Promise.all([invalidateImportacoes(), invalidatePncp()]);
      setPncpOperation(null);
    },
    onError: (error) => {
      setFeedback({
        variant: "error",
        message: error.message,
      });
      setPncpOperation(null);
    },
  });
  const deletePncpStoredMutation = trpc.pncpTeixeira.deleteStored.useMutation({
    onSuccess: async (result) => {
      setFeedback({ variant: "success", message: result.message });
      setPncpStoredDetail(null);
      await invalidatePncp();
    },
    onError: (error) =>
      setFeedback({ variant: "error", message: error.message }),
  });
  const pncpLinkProcessoMutation = trpc.pncpTeixeira.linkProcesso.useMutation({
    onSuccess: async (result) => {
      setFeedback({ variant: "success", message: result.message });
      await invalidatePncp();
    },
    onError: (error) =>
      setFeedback({ variant: "error", message: error.message }),
  });
  const pncpUnlinkProcessoMutation = trpc.pncpTeixeira.unlinkProcesso.useMutation({
    onSuccess: async (result) => {
      setFeedback({ variant: "success", message: result.message });
      await invalidatePncp();
    },
    onError: (error) =>
      setFeedback({ variant: "error", message: error.message }),
  });

  const detailData = detailQuery.data;
  const suggestionRows =
    deferredManualProcessSearch.length > 0
      ? (processSearchQuery.data?.items ?? [])
      : (detailData?.suggestions ?? []);
  const pncpSuggestionRows = pncpProcessSearchQuery.data?.items ?? [];
  const summaryCards = useMemo(() => {
    const counts = summaryQuery.data?.counts;
    const conciliation = summaryQuery.data?.conciliation;
    return [
      {
        label: "Licitações importadas",
        value: counts?.LICITACAO.registros ?? 0,
        note: `${formatIntegerBR(counts?.LICITACAO.itens ?? 0)} item(ns) públicos`,
        icon: Database,
        tone: "text-sky-700 bg-sky-50 border-sky-200",
        quickFilter: () => {
          setSourceFilter("LICITACAO");
          setConciliationFilter("");
          setPage(1);
          setActiveTab("BASE");
        },
      },
      {
        label: "Compras diretas importadas",
        value: counts?.COMPRA_DIRETA.registros ?? 0,
        note: `${formatIntegerBR(counts?.COMPRA_DIRETA.itens ?? 0)} item(ns) públicos`,
        icon: Database,
        tone: "text-indigo-700 bg-indigo-50 border-indigo-200",
        quickFilter: () => {
          setSourceFilter("COMPRA_DIRETA");
          setConciliationFilter("");
          setPage(1);
          setActiveTab("BASE");
        },
      },
      {
        label: "Vinculados ao SIREL",
        value: conciliation?.VINCULADO ?? 0,
        note: "Registros reconciliados com processos internos.",
        icon: CheckCircle2,
        tone: "text-emerald-700 bg-emerald-50 border-emerald-200",
        quickFilter: () => {
          setSourceFilter("");
          setConciliationFilter("VINCULADO");
          setPage(1);
          setActiveTab("BASE");
        },
      },
      {
        label: "Sugestões encontradas",
        value: conciliation?.SUGERIDO ?? 0,
        note: "Aguardando revisão manual do operador.",
        icon: Sparkles,
        tone: "text-amber-700 bg-amber-50 border-amber-200",
        quickFilter: () => {
          setSourceFilter("");
          setConciliationFilter("SUGERIDO");
          setPage(1);
          setActiveTab("BASE");
        },
      },
      {
        label: "Pendentes",
        value: conciliation?.PENDENTE ?? 0,
        note: "Sem match confiável até o momento.",
        icon: Clock3,
        tone: "text-rose-700 bg-rose-50 border-rose-200",
        quickFilter: () => {
          setSourceFilter("");
          setConciliationFilter("PENDENTE");
          setPage(1);
          setActiveTab("BASE");
        },
      },
    ];
  }, [summaryQuery.data]);

  const importacoesTabs = useMemo<Array<{ value: ImportacoesTab; label: string }>>(
    () => [
      { value: "DASHBOARD", label: "Dashboard" },
      { value: "BASE", label: "Base importada" },
      { value: "PNCP", label: "PNCP" },
      { value: "CSV", label: "Importação CSV" },
      { value: "HISTORICO", label: "Histórico" },
    ],
    [],
  );

  const visibleBaseColumns = useMemo(
    () => Object.values(visibleColumns).filter(Boolean).length,
    [visibleColumns],
  );
  const baseTableColSpan = 5 + visibleBaseColumns + 1;

  const createProcessInitialValues = useMemo(() => {
    const normalize = (value?: string | null) =>
      String(value ?? "").trim().toLocaleLowerCase();

    const tipoContratoMap = (
      value?: string | null,
    ): "AQUISICAO" | "REGISTRO_PRECO" | "AQUISICAO_PARCELADA" => {
      const normalized = normalize(value);
      if (normalized.includes("registro")) return "REGISTRO_PRECO";
      if (normalized.includes("parcelada")) return "AQUISICAO_PARCELADA";
      return "AQUISICAO";
    };

    if (createProcessSource === "PNCP" && pncpDetailData?.registro) {
      const registro = pncpDetailData.registro as Record<string, any>;
      const dadosOriginais = (registro.dadosOriginais ?? {}) as Record<
        string,
        unknown
      >;
      const modalidadeRaw =
        registro.modalidade ??
        dadosOriginais.modalidadeNome ??
        dadosOriginais.modalidade ??
        "";
      const situacaoRaw =
        registro.situacao ??
        dadosOriginais.situacaoCompraNome ??
        dadosOriginais.situacao ??
        "";
      const modoDisputaRaw =
        registro.modoDisputa ??
        dadosOriginais.modoDisputaNome ??
        dadosOriginais.modoDisputa ??
        "";
      const modoDisputaNorm = normalize(String(modoDisputaRaw));
      const modoDisputa =
        modoDisputaNorm.includes("aberto") && modoDisputaNorm.includes("fechado")
          ? "ABERTO_FECHADO"
          : modoDisputaNorm.includes("aberto")
            ? "ABERTO"
            : modoDisputaNorm.includes("fechado")
              ? "FECHADO"
              : "NAO_SE_APLICA";
      const matchedModalidade = catalogQuery.data?.modalidades.find(
        (item) => normalize(item.nome) === normalize(String(modalidadeRaw)),
      );
      const matchedStatus = catalogQuery.data?.statusProcesso.find(
        (item) => normalize(item.nome) === normalize(String(situacaoRaw)),
      );

      const dataBase =
        registro.dataAberturaProposta ??
        registro.dataInicioVigencia ??
        registro.dataAssinatura ??
        registro.dataPublicacao ??
        null;
      const anoReferencia = (() => {
        const parsed = dataBase ? new Date(String(dataBase)) : null;
        if (!parsed || Number.isNaN(parsed.getTime())) {
          return String(new Date().getFullYear());
        }
        return String(parsed.getFullYear());
      })();

      return {
        numeroAdministrativo:
          String(
            dadosOriginais.processo ??
              dadosOriginais.numeroCompra ??
              registro.numeroAta ??
              registro.numeroContrato ??
              "",
          ) || "",
        numeroEdital: String(dadosOriginais.numeroCompra ?? registro.numeroContrato ?? ""),
        anoReferencia,
        objeto: String(registro.objeto ?? ""),
        valorEstimado: formatCurrencyForForm(
          registro.valorTotalEstimado ??
            registro.valorGlobal ??
            registro.valorTotal ??
            null,
        ),
        dataAbertura:
          formatDateForInput(registro.dataAberturaProposta) ||
          formatDateForInput(registro.dataInicioVigencia) ||
          formatDateForInput(registro.dataAssinatura) ||
          formatDateForInput(registro.dataPublicacao),
        dataPublicacao:
          formatDateForInput(registro.dataPublicacao) ||
          formatDateForInput(registro.dataAssinatura),
        dataDisputaSessao:
          formatDateTimeForInput(registro.dataAberturaProposta) ||
          formatDateTimeForInput(registro.dataInicioVigencia),
        situacao: mapWorkflowSituacaoFromExternal(String(situacaoRaw)),
        modalidadeId: matchedModalidade ? String(matchedModalidade.id) : "",
        tipoContratacao:
          pncpStoredDetail?.tipo === "ATAS"
            ? "REGISTRO_PRECO"
            : "AQUISICAO",
        modoDisputa,
        statusId: matchedStatus ? String(matchedStatus.id) : "",
        foraDoFluxo: true,
      };
    }

    if (createProcessSource === "BLL" && detailData?.record) {
      const importedModalidade = normalize(detailData.record.modalidade);
      const matchedModalidade = catalogQuery.data?.modalidades.find(
        (item) => normalize(item.nome) === importedModalidade,
      );

      const modoDisputaFromBll = (() => {
        const dadosOriginais = detailData.record.dadosOriginais as
          | Record<string, unknown>
          | undefined;
        const rawValue =
          dadosOriginais?.modo_disputa ?? dadosOriginais?.modoDisputa ?? "";
        const raw = normalize(String(rawValue));
        if (raw.includes("aberto") && raw.includes("fechado"))
          return "ABERTO_FECHADO";
        if (raw.includes("aberto")) return "ABERTO";
        if (raw.includes("fechado")) return "FECHADO";
        return "NAO_SE_APLICA";
      })();

      const matchedAutoridade = catalogQuery.data?.pessoas.find(
        (item) =>
          normalize(item.nome) === normalize(detailData.record.autoridadeNome),
      );
      const matchedCondutor = catalogQuery.data?.pessoas.find(
        (item) =>
          normalize(item.nome) === normalize(detailData.record.condutorNome),
      );

      const matchedStatus = catalogQuery.data?.statusProcesso.find(
        (item) =>
          normalize(item.nome) === normalize(detailData.record.situacaoExterna),
      );

      return {
        numeroAdministrativo: detailData.record.numeroAdministrativo ?? "",
        numeroEdital: detailData.record.numeroEdital ?? "",
        anoReferencia: String(
          detailData.record.anoReferencia ?? new Date().getFullYear(),
        ),
        objeto: detailData.record.objeto ?? "",
        valorEstimado: formatCurrencyForForm(
          detailData.record.valorTotal ?? detailData.record.valorReferencia,
        ),
        dataAbertura:
          formatDateForInput(detailData.record.inicioDisputaEm) ||
          formatDateForInput(detailData.record.publicacaoEm) ||
          formatDateForInput(detailData.record.inicioRecepcaoEm),
        dataPublicacao: formatDateForInput(detailData.record.publicacaoEm),
        dataDisputaSessao: formatDateTimeForInput(detailData.record.inicioDisputaEm),
        situacao: mapWorkflowSituacaoFromExternal(detailData.record.situacaoExterna),
        modalidadeId: matchedModalidade ? String(matchedModalidade.id) : "",
        tipoContratacao: tipoContratoMap(detailData.record.tipoContrato),
        modoDisputa: modoDisputaFromBll,
        autoridadeCompetenteId: matchedAutoridade
          ? String(matchedAutoridade.id)
          : "",
        condutorProcessoId: matchedCondutor ? String(matchedCondutor.id) : "",
        statusId: matchedStatus ? String(matchedStatus.id) : "",
        foraDoFluxo: true,
      };
    }

    return undefined;
  }, [
    catalogQuery.data?.modalidades,
    catalogQuery.data?.pessoas,
    catalogQuery.data?.statusProcesso,
    createProcessSource,
    detailData,
    pncpDetailData,
    pncpStoredDetail?.tipo,
  ]);

  const createProcessExternalDates = useMemo(() => {
    if (createProcessSource === "PNCP" && pncpDetailData?.registro) {
      const registro = pncpDetailData.registro as Record<string, any>;
      return {
        sourceLabel: "PNCP",
        publicacaoEm: registro.dataPublicacao ?? registro.dataAssinatura ?? null,
        disputaEm: registro.dataAberturaProposta ?? registro.dataInicioVigencia ?? null,
        recebimentoInicialEm: registro.dataAberturaProposta ?? null,
        recebimentoFinalEm:
          registro.dataEncerramentoProposta ??
          registro.dataFimVigencia ??
          null,
      };
    }

    if (createProcessSource === "BLL" && detailData?.record) {
      return {
        sourceLabel: "BLL",
        publicacaoEm: detailData.record.publicacaoEm ?? null,
        disputaEm: detailData.record.inicioDisputaEm ?? null,
        recebimentoInicialEm: detailData.record.inicioRecepcaoEm ?? null,
        recebimentoFinalEm: detailData.record.fimRecepcaoEm ?? null,
      };
    }

    return undefined;
  }, [createProcessSource, detailData, pncpDetailData]);

  async function handleCsvImport() {
    try {
      if (!csvState.registrosFile || !csvState.itensFile) {
        setFeedback({
          variant: "warning",
          message: "Selecione os dois arquivos CSV antes de importar.",
        });
        return;
      }
      const [registrosContent, itensContent] = await Promise.all([
        readFileAsText(csvState.registrosFile),
        readFileAsText(csvState.itensFile),
      ]);
      await importCsvMutation.mutateAsync({
        source: csvState.source,
        registrosFilename: csvState.registrosFile.name,
        registrosContent,
        itensFilename: csvState.itensFile.name,
        itensContent,
      });
    } catch (error) {
      setFeedback({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "Falha ao processar os arquivos CSV.",
      });
    }
  }

  function handleCsvFileChange(
    field: "registrosFile" | "itensFile",
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0] ?? null;
    setCsvState((current) => ({ ...current, [field]: file }));
  }

  async function handleRunSyncAction() {
    if (syncAction === "TODOS") {
      await syncRemoteMutation.mutateAsync({});
      return;
    }
    await syncRemoteMutation.mutateAsync({ source: syncAction });
  }

  async function handlePncpConciliate() {
    setPncpOperation("conciliar");
    try {
      await pncpAutoConciliateMutation.mutateAsync({
        source: sourceFilter || undefined,
        onlyPending: true,
      });
    } catch {
      // Erro tratado no callback do mutation.
    } finally {
      setPncpOperation(null);
    }
  }

  const pncpBusy =
    pncpLoading ||
    pncpImportMutation.isPending ||
    pncpAutoConciliateMutation.isPending;
  const pncpBusyMessage =
    pncpOperation === "import"
      ? "Importando dados completos do PNCP. Esta etapa pode levar alguns minutos."
      : pncpOperation === "conciliar"
        ? "Executando conciliação automática PNCP com a base interna."
        : "Carregando preview do PNCP.";
  const pncpCurrentPosition = getCurrentPncpPosition();
  const pncpExternalLink =
    pncpStoredDetail?.tipo === "ATAS"
      ? (pncpDetailData?.registro?.urlAta ?? null)
      : pncpStoredDetail?.tipo === "CONTRATOS"
        ? (pncpDetailData?.registro?.urlContrato ?? null)
        : (pncpDetailData?.registro?.urlProcesso ?? null);

  useEffect(() => {
    if (!pncpBusy) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [pncpBusy]);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Importações BLL"
        description="Importe o acervo público da BLL, concilie com processos internos do SIREL e mantenha a base pública atualizada todas as manhãs."
        action={
          <div className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary-50)] px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-700)]">
            <Sparkles className="h-4 w-4" />
            Conciliação automática
          </div>
        }
      >
        {feedback ? (
          <Alert variant={feedback.variant}>{feedback.message}</Alert>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {summaryCards.map((card) => (
            <button
              key={card.label}
              type="button"
              onClick={card.quickFilter}
              className="rounded-[24px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[rgba(47,84,196,0.28)] hover:shadow-[0_18px_30px_-24px_rgba(36,64,167,0.65)]"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                  {card.label}
                </p>
                <span className={["inline-flex h-8 w-8 items-center justify-center rounded-full border", card.tone].join(" ")}>
                  <card.icon className="h-4 w-4" />
                </span>
              </div>
              {summaryQuery.isLoading ? (
                <Skeleton className="mt-3 h-10 w-20" />
              ) : (
                <p className="mt-3 text-3xl font-black text-[var(--color-primary-900)]">
                  {formatIntegerBR(card.value)}
                </p>
              )}
              <p className="mt-2 text-sm leading-6 text-[var(--color-neutral-600)]">
                {card.note}
              </p>
            </button>
          ))}
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="rounded-[26px] border border-[rgba(204,225,255,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(230,240,255,0.72))] px-4 py-4 shadow-sm">
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
              <Select
                value={syncAction}
                onChange={(event) => setSyncAction(event.target.value as SyncAction)}
                className="h-11 rounded-2xl border-[rgba(204,225,255,0.95)]"
              >
                <option value="TODOS">Sincronizar todas as origens</option>
                <option value="LICITACAO">Sincronizar licitações BLL</option>
                <option value="COMPRA_DIRETA">Sincronizar compras diretas BLL</option>
              </Select>
              <Button
                onClick={() => void handleRunSyncAction()}
                disabled={syncRemoteMutation.isPending}
                icon={
                  syncRemoteMutation.isPending ? (
                    <RefreshCcw className="h-4 w-4 animate-spin" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )
                }
              >
                Sincronizar
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  void autoReconcileMutation.mutateAsync({
                    source: sourceFilter || undefined,
                    onlyPending: true,
                  })
                }
                disabled={autoReconcileMutation.isPending}
                icon={<Link2 className="h-4 w-4" />}
              >
                {autoReconcileMutation.isPending ? "Conciliando..." : "Conciliar automaticamente"}
              </Button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {sourceOptions.map(([source, label]) => {
                const lastSuccessful =
                  summaryQuery.data?.lastSuccessfulBySource?.[source] ?? null;
                return (
                  <div
                    key={source}
                    className="rounded-[22px] border border-white/70 bg-white/95 px-4 py-3 shadow-sm"
                  >
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                      {label}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-[var(--color-neutral-900)]">
                      {lastSuccessful
                        ? `Última execução: ${formatShortDateTimeBR(lastSuccessful.iniciadoEm)}`
                        : "Ainda sem execução concluída."}
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-neutral-600)]">
                      {lastSuccessful
                        ? `${importacaoBllModeLabels[lastSuccessful.modo]} • ${formatIntegerBR(lastSuccessful.totalRegistros)} registro(s)`
                        : "A sincronização remota usa o JSON público consolidado."}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-[26px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
              Rotina automática
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--color-neutral-600)]">
              {summaryQuery.data?.scheduler.automaticEnabled
                ? `Importação automática habilitada às ${String(summaryQuery.data?.scheduler.dailyHour ?? 7).padStart(2, "0")}:00 (${summaryQuery.data?.scheduler.timezone}).`
                : "Importação automática desabilitada no ambiente atual."}
            </p>
            <p className="mt-3 text-xs leading-6 text-[var(--color-neutral-500)]">
              Método atual:{" "}
              {summaryQuery.data?.scheduler.method ??
                "JSON público consolidado"}
              . Após cada carga, o sistema recalcula sugestões e deduplica por
              número de edital, administrativo, objeto, modalidade, valor e
              proximidade de datas.
            </p>
          </div>
        </div>
      </SectionCard>
      <div className="sticky top-2 z-10 rounded-[24px] border border-[rgba(204,225,255,0.95)] bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          {importacoesTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={[
                "rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] transition",
                activeTab === tab.value
                  ? "bg-[var(--color-primary-500)] text-white shadow-[0_14px_24px_-20px_rgba(36,64,167,0.75)]"
                  : "border border-[rgba(204,225,255,0.95)] bg-white text-[var(--color-neutral-600)] hover:border-[rgba(47,84,196,0.35)] hover:text-[var(--color-primary-700)]",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      {activeTab === "DASHBOARD" ? (
        <SectionCard
          title="Dashboard de importações"
          description="Resumo operacional com atalhos para reduzir tempo de navegação no saneamento diário."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <article className="rounded-[22px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                Prioridade de hoje
              </p>
              <p className="mt-2 text-sm text-[var(--color-neutral-700)]">
                Concilie pendências e sugestões antes da próxima sincronização automática.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setConciliationFilter("PENDENTE");
                    setSourceFilter("");
                    setPage(1);
                    setActiveTab("BASE");
                  }}
                >
                  Ver pendentes
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setConciliationFilter("SUGERIDO");
                    setSourceFilter("");
                    setPage(1);
                    setActiveTab("BASE");
                  }}
                >
                  Ver sugestões
                </Button>
              </div>
            </article>
            <article className="rounded-[22px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                Integração PNCP
              </p>
              <p className="mt-2 text-sm text-[var(--color-neutral-700)]">
                Faça preview e importação completa com filtros por período em uma única área operacional.
              </p>
              <div className="mt-4">
                <Button size="sm" variant="outline" onClick={() => setActiveTab("PNCP")}>
                  Abrir painel PNCP
                </Button>
              </div>
            </article>
            <article className="rounded-[22px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                Auditoria e histórico
              </p>
              <p className="mt-2 text-sm text-[var(--color-neutral-700)]">
                Consulte execuções com erro e valide a saúde da rotina de importação.
              </p>
              <div className="mt-4">
                <Button size="sm" variant="outline" onClick={() => setActiveTab("HISTORICO")}>
                  Abrir histórico
                </Button>
              </div>
            </article>
          </div>
        </SectionCard>
      ) : null}
      {activeTab === "PNCP" ? (
        <>
      <SectionCard
        title="Gerenciamento PNCP"
        description={`Integração do PNCP para ${TEIXEIRA_FREITAS_CNPJ_FORMAT}, com preview, importação completa e conciliação automática.`}
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="rounded-[24px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="Data início">
                <Input
                  type="date"
                  value={pncpDateRange.dataInicio}
                  onChange={(event) =>
                    setPncpDateRange((prev) => ({ ...prev, dataInicio: event.target.value }))
                  }
                />
              </FormField>
              <FormField label="Data fim">
                <Input
                  type="date"
                  value={pncpDateRange.dataFim}
                  onChange={(event) =>
                    setPncpDateRange((prev) => ({ ...prev, dataFim: event.target.value }))
                  }
                />
              </FormField>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                onClick={() => void previewPncpData()}
                disabled={pncpLoading || pncpPreviewQuery.isFetching}
                icon={<Search className="h-4 w-4" />}
              >
                {pncpLoading ? "Buscando..." : "Preview PNCP"}
              </Button>
              <Button
                onClick={() => void importPncpData()}
                disabled={pncpLoading || pncpImportMutation.isPending || !pncpPreviewData}
                icon={<Upload className="h-4 w-4" />}
              >
                Importar tudo
              </Button>
              <Button
                variant="outline"
                onClick={() => void handlePncpConciliate()}
                disabled={
                  pncpAutoConciliateMutation.isPending ||
                  pncpLoading ||
                  pncpImportMutation.isPending
                }
                icon={<Sparkles className="h-4 w-4" />}
              >
                {pncpAutoConciliateMutation.isPending ? "Conciliando PNCP..." : "Conciliar PNCP"}
              </Button>
            </div>
          </div>
          <div className="rounded-[24px] border border-[rgba(204,225,255,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(230,240,255,0.72))] px-4 py-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
              Status da integração
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--color-neutral-600)]">
              Último período consultado:{" "}
              <span className="font-semibold text-[var(--color-neutral-900)]">
                {pncpDateRange.dataInicio} até {pncpDateRange.dataFim}
              </span>
            </p>
            {pncpPreviewData ? (
              <ul className="mt-3 grid gap-2 text-xs text-[var(--color-neutral-700)] md:grid-cols-3">
                <li className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-white px-3 py-2">
                  Contratações:{" "}
                  <span className="font-black text-[var(--color-primary-800)]">
                    {formatIntegerBR(pncpPreviewData.contratacoes.total)}
                  </span>
                </li>
                <li className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-white px-3 py-2">
                  Atas:{" "}
                  <span className="font-black text-[var(--color-primary-800)]">
                    {formatIntegerBR(pncpPreviewData.atas.total)}
                  </span>
                </li>
                <li className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-white px-3 py-2">
                  Contratos:{" "}
                  <span className="font-black text-[var(--color-primary-800)]">
                    {formatIntegerBR(pncpPreviewData.contratos.total)}
                  </span>
                </li>
              </ul>
            ) : (
              <Alert variant="info" className="mt-3">
                Gere um preview para visualizar o volume disponível no PNCP antes da importação.
              </Alert>
            )}
          </div>
        </div>
      </SectionCard>
      <SectionCard
        title="PNCP armazenado"
        description="Visualize as contratações, atas e contratos já importados do PNCP com itens e aditivos."
      >
        <div className="flex flex-wrap items-center gap-2">
          {(["CONTRATACOES", "ATAS", "CONTRATOS"] as const).map((tipo) => (
            <button
              key={tipo}
              type="button"
              onClick={() => {
                setPncpStoredTab(tipo);
                setPncpStoredPage(1);
                setPncpStoredDetail(null);
              }}
              className={[
                "rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.2em]",
                tipo === pncpStoredTab
                  ? "border-[var(--color-primary-500)] bg-[var(--color-primary-50)] text-[var(--color-primary-700)]"
                  : "border-slate-200 text-[var(--color-neutral-500)] hover:border-[var(--color-primary-200)] hover:text-[var(--color-primary-600)]",
              ].join(" ")}
            >
              {tipo === "CONTRATACOES"
                ? "Contratações"
                : tipo === "ATAS"
                  ? "Atas"
                  : "Contratos"}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <FormField label="Busca textual">
            <Input
              value={pncpStoredSearch}
              onChange={(event) => {
                setPncpStoredPage(1);
                setPncpStoredSearch(event.target.value);
              }}
              placeholder="Objeto, número, fornecedor"
            />
          </FormField>
          <FormField label="Data início">
            <Input
              type="date"
              value={pncpStoredRange.dataInicio}
              onChange={(event) => {
                setPncpStoredPage(1);
                setPncpStoredRange((prev) => ({
                  ...prev,
                  dataInicio: event.target.value,
                }));
              }}
            />
          </FormField>
          <FormField label="Data fim">
            <Input
              type="date"
              value={pncpStoredRange.dataFim}
              onChange={(event) => {
                setPncpStoredPage(1);
                setPncpStoredRange((prev) => ({
                  ...prev,
                  dataFim: event.target.value,
                }));
              }}
            />
          </FormField>
          <div className="flex items-end">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setPncpStoredSearch("");
                setPncpStoredRange({
                  dataInicio: "",
                  dataFim: "",
                });
                setPncpStoredPage(1);
              }}
            >
              Limpar filtros
            </Button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHead>
              <tr>
                {pncpStoredTab === "CONTRATACOES" ? (
                  <>
                    <TableHeaderCell>Número PNCP</TableHeaderCell>
                    <TableHeaderCell>Objeto</TableHeaderCell>
                    <TableHeaderCell>Modalidade</TableHeaderCell>
                    <TableHeaderCell>Publicação</TableHeaderCell>
                    <TableHeaderCell>Valor estimado</TableHeaderCell>
                    <TableHeaderCell>Situação</TableHeaderCell>
                    <TableHeaderCell className="text-right">
                      Ações
                    </TableHeaderCell>
                  </>
                ) : pncpStoredTab === "ATAS" ? (
                  <>
                    <TableHeaderCell>Número da ata</TableHeaderCell>
                    <TableHeaderCell>Objeto</TableHeaderCell>
                    <TableHeaderCell>Vigência</TableHeaderCell>
                    <TableHeaderCell>Fornecedor</TableHeaderCell>
                    <TableHeaderCell>Valor</TableHeaderCell>
                    <TableHeaderCell>Situação</TableHeaderCell>
                    <TableHeaderCell className="text-right">
                      Ações
                    </TableHeaderCell>
                  </>
                ) : (
                  <>
                    <TableHeaderCell>Número do contrato</TableHeaderCell>
                    <TableHeaderCell>Objeto</TableHeaderCell>
                    <TableHeaderCell>Fornecedor</TableHeaderCell>
                    <TableHeaderCell>Assinatura</TableHeaderCell>
                    <TableHeaderCell>Vigência fim</TableHeaderCell>
                    <TableHeaderCell>Valor</TableHeaderCell>
                    <TableHeaderCell>Situação</TableHeaderCell>
                    <TableHeaderCell className="text-right">
                      Ações
                    </TableHeaderCell>
                  </>
                )}
              </tr>
            </TableHead>
            <TableBody>
              {pncpStoredListQuery.error ? (
                <TableRow>
                  <TableCell colSpan={pncpStoredColSpan} className="py-6">
                    <Alert variant="error">
                      {pncpStoredListQuery.error.message ||
                        "Falha ao carregar a base PNCP armazenada."}
                    </Alert>
                  </TableCell>
                </TableRow>
              ) : pncpStoredListQuery.isLoading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={pncpStoredColSpan}>
                      <Skeleton className="h-16 w-full rounded-[20px]" />
                    </TableCell>
                  </TableRow>
                ))
              ) : (pncpStoredListQuery.data?.items?.length ?? 0) === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={pncpStoredColSpan}
                    className="py-10 text-center text-sm text-[var(--color-neutral-500)]"
                  >
                    <div className="mx-auto max-w-lg space-y-2">
                      <p className="text-sm font-semibold text-[var(--color-neutral-700)]">
                        Nenhum registro PNCP encontrado para o período atual.
                      </p>
                      <p className="text-xs text-[var(--color-neutral-500)]">
                        Use "Preview PNCP" para validar o recorte e depois "Importar tudo" para popular esta base.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                pncpStoredListQuery.data?.items.map((item: any) => (
                  <TableRow key={`${pncpStoredTab}-${item.id}`}>
                    {pncpStoredTab === "CONTRATACOES" ? (
                      <>
                        <TableCell className="font-semibold text-[var(--color-neutral-900)]">
                          {item.numeroControlePncp}
                        </TableCell>
                        <TableCell>{item.objeto}</TableCell>
                        <TableCell>{item.modalidade ?? "-"}</TableCell>
                        <TableCell>
                          {formatShortDateBR(item.dataPublicacao)}
                        </TableCell>
                        <TableCell>
                          {formatCurrencyBRL(item.valorTotalEstimado)}
                        </TableCell>
                        <TableCell>{item.situacao ?? "-"}</TableCell>
                      </>
                    ) : pncpStoredTab === "ATAS" ? (
                      <>
                        <TableCell className="font-semibold text-[var(--color-neutral-900)]">
                          {item.numeroAta ?? item.idAtaPncp}
                        </TableCell>
                        <TableCell>{item.objeto}</TableCell>
                        <TableCell>
                          {formatShortDateBR(item.dataInicioVigencia)}{" "}
                          {item.dataFimVigencia
                            ? `• ${formatShortDateBR(item.dataFimVigencia)}`
                            : ""}
                        </TableCell>
                        <TableCell>{item.fornecedorNome ?? "-"}</TableCell>
                        <TableCell>{formatCurrencyBRL(item.valorGlobal)}</TableCell>
                        <TableCell>{item.situacao ?? "-"}</TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="font-semibold text-[var(--color-neutral-900)]">
                          {item.numeroContrato ?? item.idContratoPncp}
                        </TableCell>
                        <TableCell>{item.objeto}</TableCell>
                        <TableCell>{item.fornecedorNome ?? "-"}</TableCell>
                        <TableCell>
                          {formatShortDateBR(item.dataAssinatura)}
                        </TableCell>
                        <TableCell>
                          {formatShortDateBR(item.dataFimVigencia)}
                        </TableCell>
                        <TableCell>{formatCurrencyBRL(item.valorTotal)}</TableCell>
                        <TableCell>{item.situacao ?? "-"}</TableCell>
                      </>
                    )}
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="outline"
                        icon={<Eye className="h-4 w-4" />}
                        onClick={() =>
                          setPncpStoredDetail({
                            tipo: pncpStoredTab,
                            id: item.id,
                          })
                        }
                        aria-label="Detalhar registro PNCP"
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--color-neutral-600)]">
            Total encontrado:{" "}
            <span className="font-bold text-[var(--color-neutral-900)]">
              {formatIntegerBR(pncpStoredListQuery.data?.total ?? 0)}
            </span>
          </p>
          <Pagination
            page={pncpStoredPage}
            totalPages={pncpStoredListQuery.data?.totalPages ?? 1}
            onPageChange={setPncpStoredPage}
          />
        </div>
      </SectionCard>
        </>
      ) : null}
      {activeTab === "BASE" || activeTab === "CSV" ? (
      <div className="grid gap-6">
        {activeTab === "BASE" ? (
        <SectionCard
          title="Base importada"
          description="Consulte registros públicos já carregados e acompanhe o status da conciliação com processos internos."
        >
          <div className="sticky top-[76px] z-[5] rounded-[20px] border border-[rgba(204,225,255,0.95)] bg-white/95 p-3 shadow-sm backdrop-blur">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
              <FormField label="Busca textual">
                <Input
                  value={search}
                  onChange={(event) => {
                    setPage(1);
                    setSearch(event.target.value);
                  }}
                  placeholder="Edital, objeto, autoridade ou fornecedor"
                />
              </FormField>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  className="w-full md:w-auto"
                  onClick={() => setShowAdvancedFilters((current) => !current)}
                >
                  {showAdvancedFilters ? "Ocultar filtros avançados" : "Filtros avançados"}
                </Button>
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  className="w-full md:w-auto"
                  onClick={() => {
                    setSearch("");
                    setSourceFilter("");
                    setConciliationFilter("");
                    setPage(1);
                  }}
                >
                  Limpar
                </Button>
              </div>
            </div>
            {showAdvancedFilters ? (
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <FormField label="Origem">
                  <Select
                    value={sourceFilter}
                    onChange={(event) => {
                      setPage(1);
                      setSourceFilter(
                        event.target.value as "" | ImportacaoBllSource,
                      );
                    }}
                  >
                    <option value="">Todas</option>
                    {sourceOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Conciliação">
                  <Select
                    value={conciliationFilter}
                    onChange={(event) => {
                      setPage(1);
                      setConciliationFilter(
                        event.target.value as "" | ImportacaoBllConciliacaoStatus,
                      );
                    }}
                  >
                    <option value="">Todas</option>
                    {conciliationOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <div className="rounded-2xl border border-[rgba(204,225,255,0.95)] bg-[var(--color-primary-50)]/45 px-3 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-700)]">
                    Colunas visíveis
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--color-neutral-700)]">
                    <label className="inline-flex items-center gap-2">
                      <Checkbox
                        checked={visibleColumns.origem}
                        onChange={(event) =>
                          setVisibleColumns((current) => ({
                            ...current,
                            origem: event.target.checked,
                          }))
                        }
                      />
                      Origem
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <Checkbox
                        checked={visibleColumns.processoInterno}
                        onChange={(event) =>
                          setVisibleColumns((current) => ({
                            ...current,
                            processoInterno: event.target.checked,
                          }))
                        }
                      />
                      Processo interno
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <Checkbox
                        checked={visibleColumns.publicacao}
                        onChange={(event) =>
                          setVisibleColumns((current) => ({
                            ...current,
                            publicacao: event.target.checked,
                          }))
                        }
                      />
                      Publicação
                    </label>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="destructive"
              disabled={selectedRecordIds.length === 0 || deleteProcessosMutation.isPending}
              onClick={async () => {
                if (selectedRecordIds.length === 0) return;
                if (!window.confirm(`Deseja excluir ${selectedRecordIds.length} registro(s) importado(s)?`)) return;
                await deleteProcessosMutation.mutateAsync({ importedIds: selectedRecordIds });
              }}
              icon={<Trash2 className="h-4 w-4" />}
            >
              Excluir selecionados
            </Button>
            {selectedRecordIds.length > 0 ? (
              <p className="text-sm text-[var(--color-neutral-600)]">
                {selectedRecordIds.length} selecionado(s)
              </p>
            ) : null}
          </div>

          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell className="w-[40px]">
                    <Checkbox
                      checked={allVisibleSelected}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        if (checked) {
                          setSelectedRecordIds(visibleRecordIds);
                        } else {
                          setSelectedRecordIds([]);
                        }
                      }}
                    />
                  </TableHeaderCell>
                  {visibleColumns.origem ? (
                    <TableHeaderCell>Origem</TableHeaderCell>
                  ) : null}
                  <TableHeaderCell>Processo público</TableHeaderCell>
                  <TableHeaderCell>Objeto</TableHeaderCell>
                  <TableHeaderCell>Conciliação</TableHeaderCell>
                  {visibleColumns.processoInterno ? (
                    <TableHeaderCell>Processo interno</TableHeaderCell>
                  ) : null}
                  {visibleColumns.publicacao ? (
                    <TableHeaderCell>Publicação</TableHeaderCell>
                  ) : null}
                  <TableHeaderCell className="text-right">
                    Ações
                  </TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {recordsQuery.isLoading
                  ? Array.from({ length: 6 }).map((_, index) => (
                      <TableRow key={index}>
                        <TableCell colSpan={baseTableColSpan}>
                          <Skeleton className="h-16 w-full rounded-[20px]" />
                        </TableCell>
                      </TableRow>
                    ))
                  : recordsQuery.data?.items.map((row) => (
                      <TableRow
                        key={row.id}
                        className="cursor-pointer transition hover:bg-[var(--color-primary-50)]/55"
                        onClick={() => {
                          setSelectedRecordId(row.id);
                          setManualProcessSearch("");
                        }}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedRecordIds.includes(row.id)}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              setSelectedRecordIds((current) => {
                                if (checked) {
                                  return Array.from(new Set([...current, row.id]));
                                }
                                return current.filter((id) => id !== row.id);
                              });
                            }}
                          />
                        </TableCell>
                        {visibleColumns.origem ? (
                          <TableCell>
                            <p className="font-semibold text-[var(--color-neutral-900)]">
                              {importacaoBllSourceLabels[row.origem]}
                            </p>
                            <p className="text-xs text-[var(--color-neutral-500)]">
                              {row.tipoContrato ||
                                row.situacaoExterna ||
                                "Sem fase externa"}
                            </p>
                          </TableCell>
                        ) : null}
                        <TableCell>
                          <p className="font-semibold text-[var(--color-neutral-900)]">
                            {row.numeroEdital || row.chaveExterna}
                          </p>
                          <p className="text-xs text-[var(--color-neutral-500)]">
                            {row.numeroAdministrativo ||
                              "Sem número administrativo"}
                          </p>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[360px]">
                            <p className="line-clamp-2 font-semibold text-[var(--color-neutral-900)]">
                              {row.objeto}
                            </p>
                            <p className="text-xs text-[var(--color-neutral-500)]">
                              {row.modalidade}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <ConciliationBadge status={row.statusConciliacao} />
                            {row.scoreConciliacao ? (
                              <span
                                title={`Score de conciliação: ${row.scoreConciliacao}`}
                                className="inline-flex rounded-full border border-[rgba(204,225,255,0.95)] bg-[var(--color-primary-50)] px-2 py-1 text-[11px] font-bold text-[var(--color-primary-700)]"
                              >
                                S{row.scoreConciliacao}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        {visibleColumns.processoInterno ? (
                          <TableCell>
                            {row.processoInternoId ? (
                              <div>
                                <p className="font-semibold text-[var(--color-neutral-900)]">
                                  {row.processoInternoNumeroSirel}
                                </p>
                                <p className="text-xs text-[var(--color-neutral-500)]">
                                  {row.processoInternoNumeroAdministrativo ||
                                    row.processoInternoModuloAtual ||
                                    "Processo interno vinculado"}
                                </p>
                              </div>
                            ) : (
                              <span className="text-sm text-[var(--color-neutral-500)]">
                                Não vinculado
                              </span>
                            )}
                          </TableCell>
                        ) : null}
                        {visibleColumns.publicacao ? (
                          <TableCell>
                            <p className="font-semibold text-[var(--color-neutral-900)]">
                              {formatShortDateBR(row.publicacaoEm)}
                            </p>
                            <p className="text-xs text-[var(--color-neutral-500)]">
                              Atualizado{" "}
                              {formatShortDateTimeBR(row.ultimaAtualizacaoEm)}
                            </p>
                          </TableCell>
                        ) : null}
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedRecordId(row.id);
                              setManualProcessSearch("");
                            }}
                            icon={<ChevronRight className="h-4 w-4" />}
                            aria-label="Detalhar registro"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </div>
          {!recordsQuery.isLoading && !recordsQuery.data?.items.length ? (
            <Alert variant="info" className="mt-4">
              Nenhum registro importado encontrado com os filtros atuais.
            </Alert>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--color-neutral-600)]">
              Total localizado:{" "}
              <span className="font-bold text-[var(--color-neutral-900)]">
                {formatIntegerBR(recordsQuery.data?.total ?? 0)}
              </span>
            </p>
            <Pagination
              page={page}
              totalPages={recordsQuery.data?.totalPages ?? 1}
              onPageChange={setPage}
            />
          </div>
        </SectionCard>
        ) : null}

        {activeTab === "CSV" ? (
        <div className="space-y-6">
          <SectionCard
            title="Importação manual por CSV"
            description="Use o mesmo padrão de arquivos separados em registros e itens para importar lotes históricos ou repetir a carga pública."
          >
            <div className="grid gap-3">
              <FormField label="Origem dos CSVs">
                <Select
                  value={csvState.source}
                  onChange={(event) =>
                    setCsvState((current) => ({
                      ...current,
                      source: event.target.value as ImportacaoBllSource,
                    }))
                  }
                >
                  {sourceOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Arquivo de registros">
                <Input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) =>
                    handleCsvFileChange("registrosFile", event)
                  }
                />
              </FormField>
              <FormField label="Arquivo de itens">
                <Input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => handleCsvFileChange("itensFile", event)}
                />
              </FormField>
              <Button
                onClick={() => void handleCsvImport()}
                disabled={importCsvMutation.isPending}
                icon={<Upload className="h-4 w-4" />}
              >
                Importar pacote CSV
              </Button>
            </div>
          </SectionCard>

          <SectionCard
            title="Mapa de equivalências"
            description="Campos usados pelo reconciliador para vincular a base pública a processos internos do SIREL."
          >
            <details className="group rounded-[20px] border border-[rgba(204,225,255,0.95)] bg-white">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-[var(--color-primary-700)]">
                Mostrar mapa de equivalências de deduplicação
              </summary>
              <div className="border-t border-[rgba(204,225,255,0.85)] px-4 py-4">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHead>
                      <tr>
                        <TableHeaderCell>Origem pública</TableHeaderCell>
                        <TableHeaderCell>Processo SIREL</TableHeaderCell>
                        <TableHeaderCell>Uso na deduplicação</TableHeaderCell>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {[
                        [
                          "Número do edital / ID BLL",
                          "processos.numeroEdital",
                          "Match direto e prioridade alta",
                        ],
                        [
                          "Número administrativo",
                          "processos.numeroAdministrativo",
                          "Match direto e prioridade alta",
                        ],
                        [
                          "Modalidade",
                          "modalidades.nome",
                          "Compatibilidade de contexto",
                        ],
                        [
                          "Objeto",
                          "processos.objeto",
                          "Proximidade textual por tokens",
                        ],
                        [
                          "Valor público",
                          "processos.valorEstimado",
                          "Proximidade de valor",
                        ],
                        [
                          "Publicação",
                          "processos.dataAbertura",
                          "Janela temporal de apoio",
                        ],
                      ].map(([from, to, usage]) => (
                        <TableRow key={from}>
                          <TableCell className="font-semibold text-[var(--color-neutral-900)]">
                            {from}
                          </TableCell>
                          <TableCell className="text-sm text-[var(--color-neutral-700)]">
                            {to}
                          </TableCell>
                          <TableCell className="text-sm text-[var(--color-neutral-700)]">
                            {usage}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </details>
          </SectionCard>
        </div>
        ) : null}
      </div>
      ) : null}
      {activeTab === "HISTORICO" ? (
      <SectionCard
        title="Histórico de execuções"
        description="Acompanhe as cargas automáticas e manuais realizadas para cada origem pública."
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Origem</TableHeaderCell>
                <TableHeaderCell>Modo</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Início</TableHeaderCell>
                <TableHeaderCell>Resultado</TableHeaderCell>
                <TableHeaderCell>Referência</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {executionsQuery.isLoading
                ? Array.from({ length: 4 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-14 w-full rounded-[20px]" />
                      </TableCell>
                    </TableRow>
                  ))
                : executionsQuery.data?.items.map((execution) => (
                    <TableRow
                      key={execution.id}
                      className={
                        execution.status === "ERRO"
                          ? "bg-rose-50/65"
                          : undefined
                      }
                    >
                      <TableCell className="font-semibold text-[var(--color-neutral-900)]">
                        {importacaoBllSourceLabels[execution.origem]}
                      </TableCell>
                      <TableCell>
                        {importacaoBllModeLabels[execution.modo]}
                      </TableCell>
                      <TableCell>
                        <span
                          className={[
                            "inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]",
                            execution.status === "ERRO"
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : execution.status === "CONCLUIDA"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-sky-200 bg-sky-50 text-sky-700",
                          ].join(" ")}
                        >
                          {importacaoBllExecutionStatusLabels[execution.status]}
                        </span>
                      </TableCell>
                      <TableCell>
                        {formatShortDateTimeBR(execution.iniciadoEm)}
                      </TableCell>
                      <TableCell>
                        {formatIntegerBR(execution.totalRegistros)} registro(s)
                        • {formatIntegerBR(execution.totalItens)} item(ns)
                      </TableCell>
                      <TableCell>
                        {execution.referenciaRotina ||
                          execution.arquivoRegistrosNome ||
                          execution.urlFonte ||
                          "-"}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--color-neutral-600)]">
            Total de execuções:{" "}
            <span className="font-bold text-[var(--color-neutral-900)]">
              {formatIntegerBR(executionsQuery.data?.total ?? 0)}
            </span>
          </p>
          <Pagination
            page={executionPage}
            totalPages={executionsQuery.data?.totalPages ?? 1}
            onPageChange={setExecutionPage}
          />
        </div>
      </SectionCard>
      ) : null}

      {pncpBusy
        ? createPortal(
            <div className="fixed inset-0 z-[2147483000] flex min-h-screen w-screen items-center justify-center bg-[rgba(15,23,42,0.38)] px-4 py-6 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-[24px] border border-[rgba(204,225,255,0.95)] bg-white px-5 py-5 shadow-[0_24px_40px_-26px_rgba(15,23,42,0.55)]">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 animate-spin items-center justify-center rounded-full border-2 border-[var(--color-primary-200)] border-t-[var(--color-primary-600)]" />
                  <div>
                    <p className="text-sm font-black text-[var(--color-neutral-900)]">
                      Processando integração PNCP
                    </p>
                    <p className="text-xs text-[var(--color-neutral-600)]">
                      {pncpBusyMessage}
                    </p>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      <Modal
        open={pncpStoredDetail !== null}
        onClose={() => {
          setPncpStoredDetail(null);
          setPncpManualProcessSearch("");
        }}
        title={
          (() => {
            const baseTitle =
              pncpDetailData?.registro?.numeroControlePncp ||
              pncpDetailData?.registro?.numeroAta ||
              pncpDetailData?.registro?.numeroContrato ||
              "Detalhes PNCP";
            return pncpCurrentPosition
              ? `${baseTitle} (${pncpCurrentPosition.current} de ${pncpCurrentPosition.total})`
              : baseTitle;
          })()
        }
        description={
          pncpStoredDetail?.tipo === "CONTRATACOES"
            ? "Contratação pública registrada no PNCP."
            : pncpStoredDetail?.tipo === "ATAS"
              ? "Ata de registro de preços importada do PNCP."
              : "Contrato público importado do PNCP."
        }
        size="lg"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={navigateToPreviousPncp}
              disabled={!pncpStoredListQuery.data?.items || pncpStoredListQuery.data.items.length <= 1}
              icon={<ChevronLeft className="h-4 w-4" />}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={navigateToNextPncp}
              disabled={!pncpStoredListQuery.data?.items || pncpStoredListQuery.data.items.length <= 1}
              icon={<ChevronRight className="h-4 w-4" />}
            >
              Próximo
            </Button>
            {pncpExternalLink ? (
              <a href={pncpExternalLink} target="_blank" rel="noreferrer">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<ArrowUpRight className="h-4 w-4" />}
                >
                  Abrir fonte pública
                </Button>
              </a>
            ) : null}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (!pncpStoredDetail) return;
                const label =
                  pncpStoredDetail.tipo === "CONTRATACOES"
                    ? "contratação"
                    : pncpStoredDetail.tipo === "ATAS"
                      ? "ata"
                      : "contrato";
                if (
                  !window.confirm(
                    `Tem certeza que deseja excluir este registro PNCP (${label})? Esta ação é irreversível.`,
                  )
                ) {
                  return;
                }
                void deletePncpStoredMutation.mutateAsync({
                  tipo: pncpStoredDetail.tipo,
                  id: pncpStoredDetail.id,
                });
              }}
              disabled={deletePncpStoredMutation.isPending || !pncpStoredDetail}
              icon={<Trash2 className="h-4 w-4" />}
            >
              Excluir
            </Button>
          </div>
        }
      >
        {pncpStoredDetailQuery.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full rounded-[20px]" />
            <Skeleton className="h-52 w-full rounded-[20px]" />
          </div>
        ) : pncpDetailData ? (
          <div className="space-y-5">
            <div className="rounded-[22px] border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)]/40 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[rgba(204,225,255,0.95)] bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-700)]">
                  {pncpStoredDetail?.tipo === "CONTRATOS"
                    ? "Contrato"
                    : pncpStoredDetail?.tipo === "ATAS"
                      ? "Ata"
                      : "Contratação"}
                </span>
                <span className="rounded-full border border-[rgba(204,225,255,0.95)] bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-700)]">
                  {formatIntegerBR(pncpDetailData.itens?.length ?? 0)}{" "}
                  {pncpStoredDetail?.tipo === "CONTRATOS" ? "aditivo(s)" : "item(ns)"}
                </span>
                <span className="rounded-full border border-[rgba(204,225,255,0.95)] bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-700)]">
                  {pncpDetailData.registro.situacao ?? "Sem situação"}
                </span>
                <span className="rounded-full border border-[rgba(204,225,255,0.95)] bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-700)]">
                  {pncpDetailData.linkedProcess ? "Vinculado" : "Sem vínculo"}
                </span>
                <span className="rounded-full border border-[rgba(204,225,255,0.95)] bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-700)]">
                  {formatIntegerBR(pncpSuggestionRows.length)} sugestão(ões)
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {[
                  { value: "GERAL" as const, label: "Visão geral" },
                  { value: "CONCILIACAO" as const, label: "Conciliação" },
                  {
                    value: "ITENS" as const,
                    label:
                      pncpStoredDetail?.tipo === "CONTRATOS"
                        ? "Aditivos"
                        : "Itens",
                  },
                  { value: "RAW" as const, label: "Dados brutos" },
                ].map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setPncpDetailTab(tab.value)}
                    className={[
                      "rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] transition",
                      pncpDetailTab === tab.value
                        ? "bg-[var(--color-primary-500)] text-white shadow-[0_14px_24px_-20px_rgba(36,64,167,0.75)]"
                        : "border border-[rgba(204,225,255,0.95)] bg-white text-[var(--color-neutral-600)] hover:border-[rgba(47,84,196,0.35)] hover:text-[var(--color-primary-700)]",
                    ].join(" ")}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {pncpDetailTab === "GERAL" ? (
              <div className="rounded-[24px] border border-[rgba(204,225,255,0.9)] bg-white px-4 py-4 shadow-sm">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                      Objeto
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-neutral-900)]">
                      {pncpDetailData.registro.objeto ?? "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                      Fornecedor/Órgão
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-neutral-700)]">
                      {pncpDetailData.registro.fornecedorNome ??
                        pncpDetailData.registro.orgaoEntidadeNome ??
                        "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                      Valor
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-neutral-900)]">
                      {formatCurrencyBRL(
                        pncpDetailData.registro.valorTotal ??
                          pncpDetailData.registro.valorTotalEstimado ??
                          pncpDetailData.registro.valorGlobal,
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                      Situação
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-neutral-700)]">
                      {pncpDetailData.registro.situacao ?? "-"}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
            {pncpDetailTab === "CONCILIACAO" ? (
              <div className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                  <div className="rounded-[24px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4 shadow-sm">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                      Vínculo interno
                    </p>
                    {pncpDetailData.linkedProcess ? (
                      <div className="mt-3 space-y-4">
                        <div>
                          <p className="text-lg font-black text-[var(--color-neutral-900)]">
                            {pncpDetailData.linkedProcess.numeroSirel}
                          </p>
                          <p className="mt-1 text-sm text-[var(--color-neutral-600)]">
                            {pncpDetailData.linkedProcess.objeto}
                          </p>
                          <p className="mt-2 text-xs text-[var(--color-neutral-500)]">
                            {pncpDetailData.linkedProcess.secretariaNome}
                            {pncpDetailData.linkedProcess.modalidadeNome
                              ? ` • ${pncpDetailData.linkedProcess.modalidadeNome}`
                              : ""}
                            {pncpDetailData.linkedProcess.numeroAdministrativo
                              ? ` • Adm ${pncpDetailData.linkedProcess.numeroAdministrativo}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={getInternalProcessHref(
                              pncpDetailData.linkedProcess.id,
                              pncpDetailData.linkedProcess.moduloAtual,
                            )}
                          >
                            <Button
                              variant="outline"
                              size="sm"
                              icon={<ArrowUpRight className="h-4 w-4" />}
                            >
                              Abrir processo
                            </Button>
                          </Link>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() =>
                              void pncpUnlinkProcessoMutation.mutateAsync({
                                tipo: pncpStoredDetail?.tipo ?? "CONTRATACOES",
                                id: pncpStoredDetail?.id ?? 0,
                              })
                            }
                            disabled={
                              pncpUnlinkProcessoMutation.isPending ||
                              !pncpStoredDetail
                            }
                            icon={<Unlink className="h-4 w-4" />}
                          >
                            Desvincular
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-4">
                        <Alert variant="info">
                          Ainda não existe processo interno vinculado a este
                          registro PNCP.
                        </Alert>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              setCreateProcessSource("PNCP");
                              setCreateProcessModalOpen(true);
                            }}
                            icon={<Link2 className="h-4 w-4" />}
                          >
                            Criar processo no SIREL
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="rounded-[24px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4 shadow-sm">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                      Buscar processo interno
                    </p>
                    <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                      <FormField label="Busca manual">
                        <Input
                          value={pncpManualProcessSearch}
                          onChange={(event) =>
                            setPncpManualProcessSearch(event.target.value)
                          }
                          placeholder="Número SIREL, administrativo, edital ou objeto"
                        />
                      </FormField>
                      <div className="flex items-end">
                        <Button
                          variant="outline"
                          onClick={() => setPncpManualProcessSearch("")}
                          className="w-full md:w-auto"
                          icon={<Search className="h-4 w-4" />}
                        >
                          Limpar busca
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
                <SectionCard
                  title="Sugestões de conciliação"
                  description="Vincule o processo interno correto diretamente neste modal para manter a base PNCP reconciliada."
                  action={
                    <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-700)]">
                      {deferredPncpManualProcessSearch
                        ? "Busca manual ativa"
                        : "Sugestões automáticas"}
                    </span>
                  }
                >
                  <div className="space-y-3">
                    {pncpProcessSearchQuery.isLoading ? (
                      Array.from({ length: 3 }).map((_, index) => (
                        <Skeleton
                          key={index}
                          className="h-32 w-full rounded-[24px]"
                        />
                      ))
                    ) : pncpSuggestionRows.length ? (
                      pncpSuggestionRows.map((suggestion) => (
                        <SuggestionCard
                          key={`${suggestion.processoId}-${suggestion.score}`}
                          suggestion={suggestion}
                          onLink={(processoId) =>
                            void pncpLinkProcessoMutation.mutateAsync({
                              tipo: pncpStoredDetail?.tipo ?? "CONTRATACOES",
                              id: pncpStoredDetail?.id ?? 0,
                              processoId,
                            })
                          }
                          busy={pncpLinkProcessoMutation.isPending}
                        />
                      ))
                    ) : (
                      <Alert variant="warning">
                        Nenhum processo interno atingiu score suficiente com os
                        filtros atuais.
                      </Alert>
                    )}
                  </div>
                </SectionCard>
              </div>
            ) : null}

            {pncpDetailTab === "ITENS" ? (
              <div className="rounded-[24px] border border-[rgba(204,225,255,0.9)] bg-white px-4 py-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                  {pncpStoredDetail?.tipo === "CONTRATOS" ? "Aditivos" : "Itens"}
                </p>
                <div className="mt-3 overflow-x-auto">
                  <Table>
                    <TableHead>
                      <tr>
                        {pncpStoredDetail?.tipo === "CONTRATOS" ? (
                          <>
                            <TableHeaderCell>Número</TableHeaderCell>
                            <TableHeaderCell>Tipo</TableHeaderCell>
                            <TableHeaderCell>Objeto</TableHeaderCell>
                            <TableHeaderCell>Assinatura</TableHeaderCell>
                            <TableHeaderCell>Valor</TableHeaderCell>
                          </>
                        ) : (
                          <>
                            <TableHeaderCell>Item</TableHeaderCell>
                            <TableHeaderCell>Descrição</TableHeaderCell>
                            <TableHeaderCell>Quantidade</TableHeaderCell>
                            <TableHeaderCell>Valor unit.</TableHeaderCell>
                            <TableHeaderCell>Valor total</TableHeaderCell>
                            <TableHeaderCell>Fornecedor</TableHeaderCell>
                          </>
                        )}
                      </tr>
                    </TableHead>
                    <TableBody>
                      {(pncpDetailData.itens?.length ?? 0) === 0 ? (
                        <TableRow>
                          <TableCell colSpan={pncpStoredDetail?.tipo === "CONTRATOS" ? 5 : 6}>
                            Nenhum registro adicional encontrado.
                          </TableCell>
                        </TableRow>
                      ) : (
                        pncpDetailData.itens.map((item: any) => (
                          <TableRow key={item.id}>
                            {pncpStoredDetail?.tipo === "CONTRATOS" ? (
                              <>
                                <TableCell className="font-semibold">
                                  {item.numeroAditivo ?? "-"}
                                </TableCell>
                                <TableCell>{item.tipoAditivo ?? "-"}</TableCell>
                                <TableCell>{item.objeto ?? "-"}</TableCell>
                                <TableCell>
                                  {formatShortDateBR(item.dataAssinatura)}
                                </TableCell>
                                <TableCell>
                                  {formatCurrencyBRL(item.valorAditivo)}
                                </TableCell>
                              </>
                            ) : (
                              <>
                                <TableCell className="font-semibold">
                                  {item.numeroItem}
                                </TableCell>
                                <TableCell>{item.descricao}</TableCell>
                                <TableCell>{item.quantidade ?? "-"}</TableCell>
                                <TableCell>
                                  {formatCurrencyBRL(item.valorUnitario)}
                                </TableCell>
                                <TableCell>
                                  {formatCurrencyBRL(item.valorTotal)}
                                </TableCell>
                                <TableCell>{item.fornecedorNome ?? "-"}</TableCell>
                              </>
                            )}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null}
            {pncpDetailTab === "RAW" ? (
              <div className="rounded-[24px] border border-[rgba(204,225,255,0.9)] bg-white px-4 py-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                  Payload original PNCP
                </p>
                <pre className="mt-3 max-h-[420px] overflow-auto rounded-[18px] border border-[rgba(204,225,255,0.9)] bg-[var(--color-primary-50)]/45 p-3 text-xs leading-5 text-[var(--color-neutral-700)]">
                  {JSON.stringify(pncpDetailData.registro?.dadosOriginais ?? {}, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
        ) : (
          <Alert variant="error">
            {pncpStoredDetailQuery.error?.message ??
              "Não foi possível carregar o detalhamento do registro PNCP."}
          </Alert>
        )}
      </Modal>

      <Modal
        open={selectedRecordId !== null}
        onClose={() => {
          setSelectedRecordId(null);
          setManualProcessSearch("");
        }}
        title={
          (() => {
            const position = getCurrentPosition();
            const baseTitle = detailData?.record.numeroEdital ||
              detailData?.record.chaveExterna ||
              "Conciliação de importação";

            return position
              ? `${baseTitle} (${position.current} de ${position.total})`
              : baseTitle;
          })()
        }
        description={
          recordsQuery.data?.items && recordsQuery.data.items.length > 1
            ? "Revise o registro público, vincule ao processo interno correto ou descarte duplicidades. Use ← → para navegar entre processos."
            : "Revise o registro público, vincule ao processo interno correto ou descarte duplicidades sem impacto no acervo importado."
        }
        size="xl"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={navigateToPreviousProcess}
              disabled={!recordsQuery.data?.items || recordsQuery.data.items.length <= 1}
              icon={<ChevronLeft className="h-4 w-4" />}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={navigateToNextProcess}
              disabled={!recordsQuery.data?.items || recordsQuery.data.items.length <= 1}
              icon={<ChevronRight className="h-4 w-4" />}
            >
              Próximo
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (!detailData?.record?.id) return;
                if (!window.confirm("Tem certeza que deseja excluir este registro importado? Esta ação é irreversível.")) {
                  return;
                }
                void deleteProcessoMutation.mutateAsync({ importedId: detailData.record.id });
              }}
              disabled={deleteProcessoMutation.isPending}
              icon={<Trash2 className="h-4 w-4" />}
            >
              Excluir
            </Button>
          </div>
        }
      >
        {detailQuery.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full rounded-[24px]" />
            <Skeleton className="h-52 w-full rounded-[24px]" />
            <Skeleton className="h-52 w-full rounded-[24px]" />
          </div>
        ) : detailData ? (
          <div className="space-y-5">
            {detailData.warnings?.length ? (
              <Alert variant="warning">
                <div className="space-y-1 text-sm">
                  <p className="font-semibold">
                    Atenção: alguns dados não puderam ser carregados.
                  </p>
                  {detailData.warnings.map((warning: string) => (
                    <p key={warning}>• {warning}</p>
                  ))}
                </div>
              </Alert>
            ) : null}
            <div className="rounded-[22px] border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)]/40 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[rgba(204,225,255,0.95)] bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-700)]">
                  {detailData.linkedProcess ? "Vinculado" : "Sem vínculo"}
                </span>
                <span className="rounded-full border border-[rgba(204,225,255,0.95)] bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-700)]">
                  {formatIntegerBR(detailData.items.length)} item(ns)
                </span>
                <span className="rounded-full border border-[rgba(204,225,255,0.95)] bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-700)]">
                  {formatIntegerBR(suggestionRows.length)} sugestão(ões)
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {[
                  { value: "GERAL" as const, label: "Visão geral" },
                  { value: "SUGESTOES" as const, label: "Sugestões" },
                  { value: "ITENS" as const, label: "Itens importados" },
                ].map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setDetailTab(tab.value)}
                    className={[
                      "rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] transition",
                      detailTab === tab.value
                        ? "bg-[var(--color-primary-500)] text-white shadow-[0_14px_24px_-20px_rgba(36,64,167,0.75)]"
                        : "border border-[rgba(204,225,255,0.95)] bg-white text-[var(--color-neutral-600)] hover:border-[rgba(47,84,196,0.35)] hover:text-[var(--color-primary-700)]",
                    ].join(" ")}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            {detailTab === "GERAL" ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div className="rounded-[24px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <ConciliationBadge
                    status={detailData.record.statusConciliacao}
                  />
                  {detailData.record.scoreConciliacao ? (
                    <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-700)]">
                      Score {detailData.record.scoreConciliacao}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-lg font-black text-[var(--color-neutral-900)]">
                  {detailData.record.objeto}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                      Origem
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-neutral-900)]">
                      {importacaoBllSourceLabels[detailData.record.origem]}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                      Número administrativo
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-neutral-900)]">
                      {detailData.record.numeroAdministrativo ||
                        "Não informado"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                      Modalidade
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-neutral-900)]">
                      {detailData.record.modalidade}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                      Valor público
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-neutral-900)]">
                      {formatCurrencyBRL(
                        detailData.record.valorTotal ??
                          detailData.record.valorReferencia,
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                      Publicação
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-neutral-900)]">
                      {formatShortDateBR(detailData.record.publicacaoEm)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                      Fornecedor / autoridade
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-neutral-900)]">
                      {detailData.record.fornecedorNome ||
                        detailData.record.autoridadeNome ||
                        "Não informado"}
                    </p>
                  </div>
                </div>
                {detailData.record.linkExterno ? (
                  <div className="mt-4">
                    <a
                      href={detailData.record.linkExterno}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-primary-700)] hover:text-[var(--color-primary-800)]"
                    >
                      Abrir fonte pública
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </div>
                ) : null}
              </div>
              <div className="rounded-[24px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                  Vínculo interno
                </p>
                {detailData.linkedProcess ? (
                  <div className="mt-3 space-y-4">
                    <div>
                      <p className="text-lg font-black text-[var(--color-neutral-900)]">
                        {detailData.linkedProcess.numeroSirel}
                      </p>
                      <p className="mt-1 text-sm text-[var(--color-neutral-600)]">
                        {detailData.linkedProcess.objeto}
                      </p>
                      <p className="mt-2 text-xs text-[var(--color-neutral-500)]">
                        {detailData.linkedProcess.secretariaNome}
                        {detailData.linkedProcess.modalidadeNome
                          ? ` • ${detailData.linkedProcess.modalidadeNome}`
                          : ""}
                        {detailData.linkedProcess.numeroAdministrativo
                          ? ` • Adm ${detailData.linkedProcess.numeroAdministrativo}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={getInternalProcessHref(
                          detailData.linkedProcess.id,
                          detailData.linkedProcess.moduloAtual,
                        )}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          icon={<ArrowUpRight className="h-4 w-4" />}
                        >
                          Abrir processo
                        </Button>
                      </Link>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() =>
                          void unlinkProcessoMutation.mutateAsync({
                            importedId: detailData.record.id,
                          })
                        }
                        disabled={unlinkProcessoMutation.isPending}
                        icon={<Unlink className="h-4 w-4" />}
                      >
                        Desvincular
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 space-y-4">
                    <Alert variant="info">
                      Ainda não existe processo interno vinculado a este
                      registro importado.
                    </Alert>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          setCreateProcessSource("BLL");
                          setCreateProcessModalOpen(true);
                        }}
                        icon={<Link2 className="h-4 w-4" />}
                      >
                        Criar processo no SIREL
                      </Button>
                      {detailData.record.statusConciliacao === "IGNORADO" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void setIgnoredMutation.mutateAsync({
                              importedId: detailData.record.id,
                              ignored: false,
                            })
                          }
                          disabled={setIgnoredMutation.isPending}
                        >
                          Reabrir conciliação
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            void setIgnoredMutation.mutateAsync({
                              importedId: detailData.record.id,
                              ignored: true,
                            })
                          }
                          disabled={setIgnoredMutation.isPending}
                        >
                          Ignorar registro
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            ) : null}
            {detailTab === "SUGESTOES" ? (
            <SectionCard
              title="Sugestões de conciliação"
              description="O reconciliador usa número de edital, número administrativo, objeto, modalidade, valor e datas para propor o melhor match."
              action={
                <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-700)]">
                  {deferredManualProcessSearch
                    ? "Busca manual ativa"
                    : "Sugestões automáticas"}
                </span>
              }
            >
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <FormField label="Buscar processo interno específico">
                  <Input
                    value={manualProcessSearch}
                    onChange={(event) =>
                      setManualProcessSearch(event.target.value)
                    }
                    placeholder="Número SIREL, administrativo, edital ou objeto"
                  />
                </FormField>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    onClick={() => setManualProcessSearch("")}
                    className="w-full md:w-auto"
                    icon={<Search className="h-4 w-4" />}
                  >
                    Limpar busca
                  </Button>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {(processSearchQuery.isLoading &&
                  deferredManualProcessSearch) ||
                detailQuery.isFetching ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton
                      key={index}
                      className="h-32 w-full rounded-[24px]"
                    />
                  ))
                ) : suggestionRows.length ? (
                  suggestionRows.map((suggestion) => (
                    <SuggestionCard
                      key={`${suggestion.processoId}-${suggestion.score}`}
                      suggestion={suggestion}
                      onLink={(processoId) =>
                        void linkProcessoMutation.mutateAsync({
                          importedId: detailData.record.id,
                          processoId,
                        })
                      }
                      busy={linkProcessoMutation.isPending}
                    />
                  ))
                ) : (
                  <Alert variant="warning">
                    Nenhum processo interno atingiu score suficiente com os
                    filtros atuais.
                  </Alert>
                )}
              </div>
            </SectionCard>
            ) : null}
            {detailTab === "ITENS" ? (
            <SectionCard
              title="Itens importados"
              description="Itens públicos já associados ao registro importado atual. Use esta visão para validar escopo antes de vincular ao processo interno."
            >
              <div className="overflow-x-auto">
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Lote / item</TableHeaderCell>
                      <TableHeaderCell>Descrição</TableHeaderCell>
                      <TableHeaderCell>Fornecedor</TableHeaderCell>
                      <TableHeaderCell>Quantidade</TableHeaderCell>
                      <TableHeaderCell>Valor</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {detailData.items.slice(0, 20).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          {item.loteNumero || "-"} / {item.itemNumero || "-"}
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[460px]">
                            <p className="line-clamp-2 font-semibold text-[var(--color-neutral-900)]">
                              {item.descricao}
                            </p>
                            <p className="text-xs text-[var(--color-neutral-500)]">
                              {item.unidade || "Unidade não informada"}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{item.fornecedorNome || "-"}</TableCell>
                        <TableCell>{item.quantidade ?? "-"}</TableCell>
                        <TableCell>
                          {formatCurrencyBRL(
                            item.valorUnitario ??
                              item.valorReferencia ??
                              item.subtotal,
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {detailData.items.length > 20 ? (
                <p className="mt-3 text-xs text-[var(--color-neutral-500)]">
                  Mostrando 20 de {formatIntegerBR(detailData.items.length)}{" "}
                  item(ns) importados.
                </p>
              ) : null}
            </SectionCard>
            ) : null}
          </div>
        ) : (
          <Alert variant="error">
            Não foi possível carregar o detalhamento do registro importado.
          </Alert>
        )}
      </Modal>

      <ProcessoCreateModal
        open={createProcessModalOpen}
        onClose={() => {
          setCreateProcessModalOpen(false);
          setCreateProcessSource(null);
        }}
        initialValues={createProcessInitialValues}
        externalDates={createProcessExternalDates}
        title="Criar processo interno"
        description="Crie o processo no SIREL com base nos dados importados e vincule-o automaticamente ao registro público atual."
        submitLabel="Criar e vincular"
        onCreated={(created) => {
          void (async () => {
            if (createProcessSource === "PNCP") {
              if (!pncpStoredDetail) return;
              await pncpLinkProcessoMutation.mutateAsync({
                tipo: pncpStoredDetail.tipo,
                id: pncpStoredDetail.id,
                processoId: created.id,
              });
            } else {
              if (!selectedRecordId) return;
              await linkProcessoMutation.mutateAsync({
                importedId: selectedRecordId,
                processoId: created.id,
              });
            }
            setCreateProcessModalOpen(false);
            setCreateProcessSource(null);
          })();
        }}
      />

    </div>
  );
}





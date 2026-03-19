import {
  ArrowUpRight,
  Eye,
  Globe,
  Link2,
  RefreshCcw,
  Search,
  Sparkles,
  Unlink,
  Upload,
} from "lucide-react";
import { useDeferredValue, useMemo, useState, type ChangeEvent } from "react";
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
} from "@sirel/shared/schemas/importacoes";

import { Modal } from "@/components/shared/modal";
import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
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
  nivel: "ALTO" | "MEDIO" | "BAIXO";
  motivos: string[];
};

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
  const [manualProcessSearch, setManualProcessSearch] = useState("");
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [csvState, setCsvState] = useState<CsvUploadState>({
    source: "LICITACAO",
    registrosFile: null,
    itensFile: null,
  });
  const deferredSearch = useDeferredValue(search.trim());
  const deferredManualProcessSearch = useDeferredValue(
    manualProcessSearch.trim(),
  );
  const summaryQuery = trpc.importacoes.summary.useQuery(undefined, {
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

  const invalidateImportacoes = async () => {
    await Promise.all([
      utils.importacoes.summary.invalidate(),
      utils.importacoes.list.invalidate(),
      utils.importacoes.executions.invalidate(),
      utils.importacoes.detail.invalidate(),
    ]);
  };

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
  const setIgnoredMutation = trpc.importacoes.setIgnored.useMutation({
    onSuccess: async (result) => {
      setFeedback({ variant: "success", message: result.message });
      await invalidateImportacoes();
    },
    onError: (error) =>
      setFeedback({ variant: "error", message: error.message }),
  });

  const detailData = detailQuery.data;
  const suggestionRows =
    deferredManualProcessSearch.length > 0
      ? (processSearchQuery.data?.items ?? [])
      : (detailData?.suggestions ?? []);
  const summaryCards = useMemo(() => {
    const counts = summaryQuery.data?.counts;
    const conciliation = summaryQuery.data?.conciliation;
    return [
      {
        label: "Licitações importadas",
        value: counts?.LICITACAO.registros ?? 0,
        note: `${formatIntegerBR(counts?.LICITACAO.itens ?? 0)} item(ns) públicos`,
      },
      {
        label: "Compras diretas importadas",
        value: counts?.COMPRA_DIRETA.registros ?? 0,
        note: `${formatIntegerBR(counts?.COMPRA_DIRETA.itens ?? 0)} item(ns) públicos`,
      },
      {
        label: "Vinculados ao SIREL",
        value: conciliation?.VINCULADO ?? 0,
        note: "Registros reconciliados com processos internos.",
      },
      {
        label: "Sugestões encontradas",
        value: conciliation?.SUGERIDO ?? 0,
        note: "Aguardando revisão manual do operador.",
      },
      {
        label: "Pendentes",
        value: conciliation?.PENDENTE ?? 0,
        note: "Sem match confiável até o momento.",
      },
    ];
  }, [summaryQuery.data]);

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
        <div className="grid gap-4 xl:grid-cols-5">
          {summaryCards.map((card) => (
            <article
              key={card.label}
              className="rounded-[24px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4 shadow-sm"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">
                {card.label}
              </p>
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
            </article>
          ))}
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="rounded-[26px] border border-[rgba(204,225,255,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(230,240,255,0.72))] px-4 py-4 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  void syncRemoteMutation.mutateAsync({ source: "LICITACAO" })
                }
                disabled={syncRemoteMutation.isPending}
                icon={<Globe className="h-4 w-4" />}
              >
                Sincronizar licitações
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  void syncRemoteMutation.mutateAsync({
                    source: "COMPRA_DIRETA",
                  })
                }
                disabled={syncRemoteMutation.isPending}
                icon={<Globe className="h-4 w-4" />}
              >
                Sincronizar compras diretas
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
                Conciliar automaticamente
              </Button>
              <Button
                variant="ghost"
                onClick={() => void syncRemoteMutation.mutateAsync({})}
                disabled={syncRemoteMutation.isPending}
                icon={<RefreshCcw className="h-4 w-4" />}
              >
                Sincronizar tudo
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
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <SectionCard
          title="Base importada"
          description="Consulte registros públicos já carregados e acompanhe o status da conciliação com processos internos."
        >
          <div className="grid gap-3 md:grid-cols-4">
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
            <div className="flex items-end">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSearch("");
                  setSourceFilter("");
                  setConciliationFilter("");
                  setPage(1);
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
                  <TableHeaderCell>Origem</TableHeaderCell>
                  <TableHeaderCell>Processo público</TableHeaderCell>
                  <TableHeaderCell>Objeto</TableHeaderCell>
                  <TableHeaderCell>Conciliação</TableHeaderCell>
                  <TableHeaderCell>Processo interno</TableHeaderCell>
                  <TableHeaderCell>Publicação</TableHeaderCell>
                  <TableHeaderCell className="text-right">
                    Ações
                  </TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {recordsQuery.isLoading
                  ? Array.from({ length: 6 }).map((_, index) => (
                      <TableRow key={index}>
                        <TableCell colSpan={7}>
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
                          <p className="font-semibold text-[var(--color-neutral-900)]">
                            {importacaoBllSourceLabels[row.origem]}
                          </p>
                          <p className="text-xs text-[var(--color-neutral-500)]">
                            {row.tipoContrato ||
                              row.situacaoExterna ||
                              "Sem fase externa"}
                          </p>
                        </TableCell>
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
                          <div className="space-y-2">
                            <ConciliationBadge status={row.statusConciliacao} />
                            <p className="text-xs text-[var(--color-neutral-500)]">
                              {row.scoreConciliacao
                                ? `Score ${row.scoreConciliacao}`
                                : "Sem score calculado"}
                            </p>
                          </div>
                        </TableCell>
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
                        <TableCell>
                          <p className="font-semibold text-[var(--color-neutral-900)]">
                            {formatShortDateBR(row.publicacaoEm)}
                          </p>
                          <p className="text-xs text-[var(--color-neutral-500)]">
                            Atualizado{" "}
                            {formatShortDateTimeBR(row.ultimaAtualizacaoEm)}
                          </p>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedRecordId(row.id);
                              setManualProcessSearch("");
                            }}
                            icon={<Eye className="h-4 w-4" />}
                          >
                            Detalhar
                          </Button>
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
          </SectionCard>
        </div>
      </div>
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
                    <TableRow key={execution.id}>
                      <TableCell className="font-semibold text-[var(--color-neutral-900)]">
                        {importacaoBllSourceLabels[execution.origem]}
                      </TableCell>
                      <TableCell>
                        {importacaoBllModeLabels[execution.modo]}
                      </TableCell>
                      <TableCell>
                        {importacaoBllExecutionStatusLabels[execution.status]}
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

      <Modal
        open={selectedRecordId !== null}
        onClose={() => {
          setSelectedRecordId(null);
          setManualProcessSearch("");
        }}
        title={
          detailData?.record.numeroEdital ||
          detailData?.record.chaveExterna ||
          "Conciliação de importação"
        }
        description="Revise o registro público, vincule ao processo interno correto ou descarte duplicidades sem impacto no acervo importado."
        size="xl"
      >
        {detailQuery.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full rounded-[24px]" />
            <Skeleton className="h-52 w-full rounded-[24px]" />
            <Skeleton className="h-52 w-full rounded-[24px]" />
          </div>
        ) : detailData ? (
          <div className="space-y-6">
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
          </div>
        ) : (
          <Alert variant="error">
            Não foi possível carregar o detalhamento do registro importado.
          </Alert>
        )}
      </Modal>
    </div>
  );
}

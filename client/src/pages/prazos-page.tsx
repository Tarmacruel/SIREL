import { Clock3, Siren, CheckCircle2, CalendarRange, Search, Users2, Plus, Bell, History, UserCircle2, Download, Share2, BarChart3, Mail, Smartphone, BellRing } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { SimpleBarChart } from "@/components/dashboard/simple-bar-chart";
import { SectionCard } from "@/components/shared/section-card";
import { Modal } from "@/components/shared/modal";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import {
  prazoProcessualStatusLabels,
  prazoProcessualStatusOptions,
  prazoProcessualTipoLabels,
  prazoProcessualTipoOptions,
  tarefaEquipePrioridadeLabels,
  tarefaEquipePrioridadeOptions,
  tarefaEquipeStatusLabels,
  tarefaEquipeStatusOptions,
} from "@sirel/shared/const";
import type { NotificationPreferences } from "@sirel/shared/schemas/notificacoes";
import { formatShortDateBR, formatShortDateTimeBR } from "@/lib/formatters";
import { isPushSupported, subscribeToPush, unsubscribeFromPush } from "@/lib/push-notifications";
import { exportReportToCsv, exportReportToPdf } from "@/lib/report-export";
import { trpc } from "@/lib/trpc";

type PrazoTipo = (typeof prazoProcessualTipoOptions)[number];
type PrazoStatus = (typeof prazoProcessualStatusOptions)[number];
type TarefaStatus = (typeof tarefaEquipeStatusOptions)[number];
type TarefaPrioridade = (typeof tarefaEquipePrioridadeOptions)[number];
type PrazosTab = "DASHBOARD" | "MEUS_PRAZOS" | "TAREFAS_EQUIPE" | "NOVO" | "ALERTAS" | "HISTORICO";

const initialPrazoForm = {
  prazoId: null as number | null,
  processoId: "",
  tipo: "PUBLICACAO_EDITAL" as PrazoTipo,
  titulo: "",
  dataPrevista: "",
  responsavelId: "",
  observacao: "",
  lembretes: "7,3,1",
};

const initialTaskForm = {
  tarefaId: null as number | null,
  processoId: "",
  prazoId: "",
  titulo: "",
  descricao: "",
  dataEntrega: "",
  responsavelId: "",
  prioridade: "MEDIA" as TarefaPrioridade,
  status: "PENDENTE" as TarefaStatus,
  notificarResponsavel: true,
};

type ProcessOption = {
  id: number;
  numeroSirel: string;
  objeto: string;
  secretariaNome: string | null;
};

type AgendaRowAction = "CONCLUIR" | "REAGENDAR" | "DELEGAR" | "COMENTAR" | "EXCLUIR";

const defaultNotificationPreferences: NotificationPreferences = {
  frequencia: "IMEDIATA",
  escopo: "MEUS_ITENS",
  canais: {
    inApp: true,
    email: false,
    push: false,
  },
};

function normalizeSearch(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function formatProcessOptionLabel(option: ProcessOption) {
  return `${option.numeroSirel} - ${option.objeto}`;
}

function offsetDateInputValue(value: string, offsetDays: number) {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  parsed.setDate(parsed.getDate() + offsetDays);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function ProcessAutocompleteField({
  value,
  onChange,
  options,
  placeholder,
  allowClear = true,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ProcessOption[];
  placeholder: string;
  allowClear?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => {
    const currentId = Number(value);
    return options.find((item) => item.id === currentId) ?? null;
  }, [options, value]);

  useEffect(() => {
    if (selected) {
      setQuery(formatProcessOptionLabel(selected));
      return;
    }
    if (!open) setQuery("");
  }, [selected, open]);

  const groupedResults = useMemo(() => {
    const needle = normalizeSearch(query);
    const filtered = !needle
      ? options
      : options.filter((item) =>
          [item.numeroSirel, item.objeto, item.secretariaNome].some((entry) =>
            normalizeSearch(entry).includes(needle),
          ),
        );
    const grouped = new Map<string, ProcessOption[]>();
    for (const item of filtered) {
      const group = item.secretariaNome || "Sem secretaria";
      const bucket = grouped.get(group) ?? [];
      bucket.push(item);
      grouped.set(group, bucket);
    }
    return Array.from(grouped.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [options, query]);

  return (
    <div className="relative">
      <Input
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => {
            setOpen(false);
            if (selected) {
              setQuery(formatProcessOptionLabel(selected));
            }
          }, 120);
        }}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          if (value) onChange("");
          setOpen(true);
        }}
      />
      {allowClear && value ? (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onChange("");
            setQuery("");
            setOpen(false);
          }}
          className="absolute right-2 top-2 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--color-primary-700)] hover:bg-[var(--color-primary-50)]"
        >
          Limpar
        </button>
      ) : null}
      {open ? (
        <div className="absolute z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-[rgba(204,225,255,0.95)] bg-white p-2 shadow-[0_20px_45px_-30px_rgba(15,26,109,0.35)]">
          {groupedResults.length ? (
            groupedResults.map(([group, items]) => (
              <div key={group} className="mb-2 last:mb-0">
                <p className="px-2 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-neutral-500)]">{group}</p>
                <div className="space-y-1">
                  {items.slice(0, 10).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        onChange(String(item.id));
                        setQuery(formatProcessOptionLabel(item));
                        setOpen(false);
                      }}
                      className="w-full rounded-xl px-2 py-2 text-left text-sm text-[var(--color-neutral-700)] transition hover:bg-[var(--color-primary-50)]"
                      title={item.objeto}
                    >
                      <span className="block font-semibold text-[var(--color-primary-900)]">{item.numeroSirel}</span>
                      <span className="block truncate text-xs text-[var(--color-neutral-500)]">{item.objeto}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p className="px-2 py-2 text-sm text-[var(--color-neutral-500)]">Nenhum processo encontrado.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function toDateInputValue(value: string | Date | null | undefined) {
  if (!value) return "";
  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLembretes(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isInteger(item) && item >= 0),
    ),
  );
}

function alertBadge(level: string) {
  switch (level) {
    case "error":
      return "bg-[rgba(239,68,68,0.12)] text-[color:var(--color-error)]";
    case "critical":
      return "bg-[rgba(245,158,11,0.16)] text-[color:var(--color-warning)]";
    case "warning":
      return "bg-[rgba(245,158,11,0.12)] text-[color:var(--color-warning)]";
    case "info":
      return "bg-[var(--color-primary-100)] text-[var(--color-primary-800)]";
    case "success":
      return "bg-[rgba(16,185,129,0.14)] text-[color:var(--color-success)]";
    default:
      return "bg-[var(--color-neutral-100)] text-[var(--color-neutral-700)]";
  }
}

export function PrazosPage() {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<PrazosTab>("DASHBOARD");
  const [tabBeforeCreate, setTabBeforeCreate] = useState<PrazosTab>("DASHBOARD");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [formMode, setFormMode] = useState<"PRAZO_PROCESSUAL" | "TAREFA_EQUIPE">("PRAZO_PROCESSUAL");
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(10);
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<"" | PrazoTipo>("");
  const [status, setStatus] = useState<"" | PrazoStatus>("");
  const [statusTarefa, setStatusTarefa] = useState<"" | TarefaStatus>("");
  const [prioridadeTarefa, setPrioridadeTarefa] = useState<"" | TarefaPrioridade>("");
  const [responsavelFiltro, setResponsavelFiltro] = useState("");
  const [somenteCriticos, setSomenteCriticos] = useState(false);
  const [somenteDelegadosPorMim, setSomenteDelegadosPorMim] = useState(false);
  const [ocultarConcluidos, setOcultarConcluidos] = useState(false);
  const [form, setForm] = useState(initialPrazoForm);
  const [taskForm, setTaskForm] = useState(initialTaskForm);
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
  const [bulkAction, setBulkAction] = useState<"" | "CONCLUIR" | "DELEGAR" | "REAGENDAR">("");
  const [bulkResponsavelId, setBulkResponsavelId] = useState("");
  const [bulkDataEntrega, setBulkDataEntrega] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [exportAction, setExportAction] = useState<"" | "CSV" | "PDF" | "LINK">("");
  const [shareMemberId, setShareMemberId] = useState("");
  const [sharePermission, setSharePermission] = useState<"SOMENTE_VISUALIZACAO" | "COMENTARIOS">("SOMENTE_VISUALIZACAO");
  const [exporting, setExporting] = useState<null | "CSV" | "PDF" | "LINK">(null);
  const [shareToken] = useState(() => new URLSearchParams(window.location.search).get("share") ?? "");
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(defaultNotificationPreferences);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSharedView = Boolean(shareToken);

  const summaryQuery = trpc.prazos.agendaSummary.useQuery(undefined, { retry: false });
  const processOptionsQuery = trpc.prazos.processOptions.useQuery(undefined, { retry: false });
  const teamMembersQuery = trpc.prazos.teamMembers.useQuery(undefined, { retry: false });
  const teamWorkloadQuery = trpc.prazos.teamWorkload.useQuery(undefined, { retry: false });
  const shareResolveQuery = trpc.prazos.agendaShareResolve.useQuery({ token: shareToken }, { enabled: isSharedView, retry: false });
  const notificationPreferencesQuery = trpc.notificacoes.preferences.useQuery(undefined, { retry: false });
  const saveNotificationPreferencesMutation = trpc.notificacoes.savePreferences.useMutation({
    onError: (mutationError) => {
      setError(mutationError.message);
    },
  });
  const registerPushMutation = trpc.notificacoes.registerPush.useMutation({
    onError: (mutationError) => {
      setError(mutationError.message);
    },
  });
  const unregisterPushMutation = trpc.notificacoes.unregisterPush.useMutation({
    onError: (mutationError) => {
      setError(mutationError.message);
    },
  });
  const shareCreateMutation = trpc.prazos.agendaShareCreate.useMutation({
    onError: (mutationError) => {
      setError(mutationError.message);
    },
  });
  const sharedCommentMutation = trpc.prazos.agendaSharedComment.useMutation({
    onError: (mutationError) => {
      setError(mutationError.message);
    },
  });

  const processOptions = processOptionsQuery.data ?? [];
  const notifyResponsibleDefault =
    notificationPreferences.canais.inApp || notificationPreferences.canais.email || notificationPreferences.canais.push;

  useEffect(() => {
    if (!notificationPreferencesQuery.data) return;
    setNotificationPreferences(notificationPreferencesQuery.data);
    setPreferencesLoaded(true);
  }, [notificationPreferencesQuery.data]);

  useEffect(() => {
    if (notificationPreferencesQuery.isFetched && !preferencesLoaded) {
      setPreferencesLoaded(true);
    }
  }, [notificationPreferencesQuery.isFetched, preferencesLoaded]);

  useEffect(() => {
    if (!isSharedView || !shareResolveQuery.data) return;
    const filtros = shareResolveQuery.data.filtros ?? {};
    if (filtros.escopo) {
      setTab(filtros.escopo as PrazosTab);
    }
    if (typeof filtros.busca === "string") {
      setBusca(filtros.busca);
    }
    setTipo((filtros.prazoTipo as PrazoTipo) ?? "");
    setStatus((filtros.statusPrazo as PrazoStatus) ?? "");
    setStatusTarefa((filtros.statusTarefa as TarefaStatus) ?? "");
    setPrioridadeTarefa((filtros.prioridadeTarefa as TarefaPrioridade) ?? "");
    setResponsavelFiltro(filtros.responsavelId ? String(filtros.responsavelId) : "");
    setSomenteCriticos(Boolean(filtros.somenteCriticos));
    setSomenteDelegadosPorMim(Boolean(filtros.somenteDelegadosPorMim));
    setOcultarConcluidos(Boolean(filtros.ocultarConcluidos));
  }, [isSharedView, shareResolveQuery.data]);

  const sharedPermission = shareResolveQuery.data?.permissao ?? "SOMENTE_VISUALIZACAO";
  const sharedReadOnly = isSharedView && sharedPermission !== "COMENTARIOS";
  const agendaEnabled = tab !== "HISTORICO";
  const filters = useMemo(
    () => ({
      pagina,
      limite,
      busca: busca.trim() || undefined,
      escopo: tab === "NOVO" ? "DASHBOARD" : tab === "HISTORICO" ? "DASHBOARD" : tab,
      prazoTipo: tipo || undefined,
      statusPrazo: status || undefined,
      statusTarefa: statusTarefa || undefined,
      prioridadeTarefa: prioridadeTarefa || undefined,
      responsavelId: responsavelFiltro ? Number(responsavelFiltro) : undefined,
      somenteCriticos: somenteCriticos || undefined,
      somenteDelegadosPorMim: somenteDelegadosPorMim || undefined,
      ocultarConcluidos: ocultarConcluidos || undefined,
      somenteMeusItens: tab === "MEUS_PRAZOS" ? true : undefined,
    }),
    [
      busca,
      limite,
      ocultarConcluidos,
      pagina,
      prioridadeTarefa,
      responsavelFiltro,
      somenteCriticos,
      somenteDelegadosPorMim,
      status,
      statusTarefa,
      tab,
      tipo,
    ],
  );
  const agendaListQuery = trpc.prazos.agendaList.useQuery(filters as any, { enabled: agendaEnabled && !isSharedView, retry: false, placeholderData: (previous) => previous });
  const sharedListQuery = trpc.prazos.agendaSharedList.useQuery({ token: shareToken, pagina, limite, busca: busca.trim() || undefined }, { enabled: agendaEnabled && isSharedView && !!shareToken, retry: false, placeholderData: (previous) => previous });
  const listQuery = isSharedView ? sharedListQuery : agendaListQuery;

  const historyQuery = trpc.auditoria.list.useQuery(
    { page: historyPage, pageSize: 20, search: busca.trim() || undefined },
    { enabled: tab === "HISTORICO", retry: false },
  );

  const saveMutation = trpc.prazos.save.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.prazos.summary.invalidate(),
        utils.prazos.agendaSummary.invalidate(),
        utils.prazos.agendaList.invalidate(),
        utils.prazos.teamWorkload.invalidate(),
      ]);
      setForm(initialPrazoForm);
      closeCreateModal();
      setError(null);
      setFeedback("Prazo salvo com sucesso.");
    },
    onError: (mutationError) => {
      setFeedback(null);
      setError(mutationError.message);
    },
  });

  const concludeMutation = trpc.prazos.conclude.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.prazos.summary.invalidate(),
        utils.prazos.agendaSummary.invalidate(),
        utils.prazos.agendaList.invalidate(),
        utils.prazos.teamWorkload.invalidate(),
      ]);
      setFeedback("Prazo marcado como concluído.");
      setError(null);
    },
    onError: (mutationError) => {
      setFeedback(null);
      setError(mutationError.message);
    },
  });

  const removeMutation = trpc.prazos.remove.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.prazos.summary.invalidate(),
        utils.prazos.agendaSummary.invalidate(),
        utils.prazos.agendaList.invalidate(),
        utils.prazos.teamWorkload.invalidate(),
      ]);
      setFeedback("Prazo removido com sucesso.");
      setError(null);
    },
    onError: (mutationError) => {
      setFeedback(null);
      setError(mutationError.message);
    },
  });

  const taskSaveMutation = trpc.prazos.taskSave.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.prazos.agendaSummary.invalidate(),
        utils.prazos.agendaList.invalidate(),
        utils.prazos.teamWorkload.invalidate(),
      ]);
      setTaskForm({ ...initialTaskForm, notificarResponsavel: notifyResponsibleDefault });
      closeCreateModal();
      setError(null);
      setFeedback("Tarefa salva com sucesso.");
    },
    onError: (mutationError) => {
      setFeedback(null);
      setError(mutationError.message);
    },
  });

  const taskSetStatusMutation = trpc.prazos.taskSetStatus.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.prazos.agendaSummary.invalidate(),
        utils.prazos.agendaList.invalidate(),
        utils.prazos.teamWorkload.invalidate(),
      ]);
      setError(null);
      setFeedback("Status da tarefa atualizado.");
    },
    onError: (mutationError) => {
      setFeedback(null);
      setError(mutationError.message);
    },
  });

  const taskRemoveMutation = trpc.prazos.taskRemove.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.prazos.agendaSummary.invalidate(),
        utils.prazos.agendaList.invalidate(),
        utils.prazos.teamWorkload.invalidate(),
      ]);
      setError(null);
      setFeedback("Tarefa removida com sucesso.");
    },
    onError: (mutationError) => {
      setFeedback(null);
      setError(mutationError.message);
    },
  });

  const taskBulkMutation = trpc.prazos.taskBulkAction.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.prazos.agendaSummary.invalidate(),
        utils.prazos.agendaList.invalidate(),
        utils.prazos.teamWorkload.invalidate(),
      ]);
      setSelectedTaskIds([]);
      setBulkAction("");
      setBulkResponsavelId("");
      setBulkDataEntrega("");
      setError(null);
      setFeedback("Ação em lote aplicada.");
    },
    onError: (mutationError) => {
      setFeedback(null);
      setError(mutationError.message);
    },
  });

  function persistNotificationPreferences(next: NotificationPreferences) {
    setNotificationPreferences(next);
    if (!preferencesLoaded) return;
    saveNotificationPreferencesMutation.mutate(next);
  }

  async function handlePushToggle(checked: boolean) {
    setError(null);
    if (checked) {
      if (!isPushSupported()) {
        setError("Push não disponível neste navegador.");
        return;
      }
      try {
        const subscription = await subscribeToPush();
        if (!subscription) {
          setError("Não foi possível registrar a assinatura push.");
          return;
        }
        await registerPushMutation.mutateAsync(subscription);
        persistNotificationPreferences({
          ...notificationPreferences,
          canais: { ...notificationPreferences.canais, push: true },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao ativar push.");
      }
      return;
    }

    try {
      const endpoint = await unsubscribeFromPush();
      if (endpoint) {
        await unregisterPushMutation.mutateAsync({ endpoint });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao desativar push.");
    }

    persistNotificationPreferences({
      ...notificationPreferences,
      canais: { ...notificationPreferences.canais, push: false },
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setError(null);

    if (formMode === "PRAZO_PROCESSUAL") {
      if (!form.processoId || !form.titulo.trim() || !form.dataPrevista) {
        setError("Informe processo, título e data prevista para salvar o prazo.");
        return;
      }
      const lembretes = parseLembretes(form.lembretes);
      await saveMutation.mutateAsync({
        prazoId: form.prazoId ?? undefined,
        processoId: Number(form.processoId),
        tipo: form.tipo as any,
        titulo: form.titulo,
        dataPrevista: form.dataPrevista,
        responsavelId: form.responsavelId ? Number(form.responsavelId) : undefined,
        observacao: form.observacao || undefined,
        lembretes: lembretes.length ? lembretes : [7, 3, 1],
      });
      return;
    }

    if (!taskForm.titulo.trim() || !taskForm.dataEntrega || !taskForm.responsavelId) {
      setError("Informe título, responsável e data de entrega para salvar a tarefa.");
      return;
    }

    await taskSaveMutation.mutateAsync({
      tarefaId: taskForm.tarefaId ?? undefined,
      processoId: taskForm.processoId ? Number(taskForm.processoId) : undefined,
      prazoId: taskForm.prazoId ? Number(taskForm.prazoId) : undefined,
      titulo: taskForm.titulo,
      descricao: taskForm.descricao || undefined,
      dataEntrega: taskForm.dataEntrega,
      responsavelId: Number(taskForm.responsavelId),
      prioridade: taskForm.prioridade,
      status: taskForm.status,
      notificarResponsavel: taskForm.notificarResponsavel,
    });
  }

  function openCreateModal(nextMode: "PRAZO_PROCESSUAL" | "TAREFA_EQUIPE" = "PRAZO_PROCESSUAL") {
    if (isSharedView) {
      setError("Visualizacao compartilhada nao permite criar novos itens.");
      return;
    }
    setTabBeforeCreate((current) => (tab === "NOVO" ? current : tab));
    setFormMode(nextMode);
    if (nextMode === "PRAZO_PROCESSUAL") {
      setForm(initialPrazoForm);
    } else {
      setTaskForm({ ...initialTaskForm, notificarResponsavel: notifyResponsibleDefault });
    }
    setError(null);
    setFeedback(null);
    setTab("NOVO");
    setIsCreateModalOpen(true);
  }

  function closeCreateModal() {
    setIsCreateModalOpen(false);
    setTab((current) => (current === "NOVO" ? tabBeforeCreate : current));
  }

  function handleEdit(item: any) {
    if (item.itemTipo === "TAREFA_EQUIPE") {
      setFormMode("TAREFA_EQUIPE");
      setTaskForm({
        tarefaId: item.id,
        processoId: item.processoId ? String(item.processoId) : "",
        prazoId: item.prazoId ? String(item.prazoId) : "",
        titulo: item.titulo,
        descricao: item.observacao ?? "",
        dataEntrega: toDateInputValue(item.dataLimite),
        responsavelId: item.responsavelId ? String(item.responsavelId) : "",
        prioridade: item.prioridade ?? "MEDIA",
        status: item.status,
        notificarResponsavel: item.notificarResponsavel ?? notifyResponsibleDefault,
      });
      setTabBeforeCreate((current) => (tab === "NOVO" ? current : tab));
      setTab("NOVO");
      setIsCreateModalOpen(true);
      return;
    }

    setFormMode("PRAZO_PROCESSUAL");
    setForm({
      prazoId: item.id,
      processoId: String(item.processoId),
      tipo: item.tipo,
      titulo: item.titulo,
      dataPrevista: toDateInputValue(item.dataPrevista),
      responsavelId: item.responsavelId ? String(item.responsavelId) : "",
      observacao: item.observacao ?? "",
      lembretes: Array.isArray(item.alertasConfig?.lembretes) ? item.alertasConfig.lembretes.join(",") : "7,3,1",
    });
    setTabBeforeCreate((current) => (tab === "NOVO" ? current : tab));
    setTab("NOVO");
    setIsCreateModalOpen(true);
    setFeedback(null);
    setError(null);
  }

  async function handleConclude(itemId: number, arquivarTarefasRelacionadas = false) {
    await concludeMutation.mutateAsync({ prazoId: itemId, arquivarTarefasRelacionadas });
  }

  async function handleRemove(itemId: number) {
    if (!window.confirm("Deseja realmente remover este prazo processual?")) return;
    await removeMutation.mutateAsync({ prazoId: itemId });
  }

  async function handleTaskStatus(itemId: number, nextStatus: TarefaStatus) {
    await taskSetStatusMutation.mutateAsync({ tarefaId: itemId, status: nextStatus });
  }

  async function handleTaskRemove(itemId: number) {
    if (!window.confirm("Deseja realmente remover esta tarefa da equipe?")) return;
    await taskRemoveMutation.mutateAsync({ tarefaId: itemId });
  }

  async function handleBulkAction() {
    if (isSharedView) {
      setError("Visualizacao compartilhada nao permite acao em lote.");
      return;
    }
    if (!bulkAction || !selectedTaskIds.length) return;
    await taskBulkMutation.mutateAsync({
      tarefaIds: selectedTaskIds,
      acao: bulkAction,
      responsavelId: bulkResponsavelId ? Number(bulkResponsavelId) : undefined,
      dataEntrega: bulkDataEntrega || undefined,
    });
  }

  function suggestTaskFromPrazo() {
    if (!form.processoId || !form.dataPrevista) {
      setError("Selecione processo e data prevista para gerar sugestão automática de tarefa.");
      return;
    }
    const suggestedTitle = `Revisar ${prazoProcessualTipoLabels[form.tipo].toLowerCase()}`;
    setTaskForm({
      ...initialTaskForm,
      processoId: form.processoId,
      prazoId: form.prazoId ? String(form.prazoId) : "",
      titulo: suggestedTitle,
      dataEntrega: offsetDateInputValue(form.dataPrevista, -2) || form.dataPrevista,
      responsavelId: form.responsavelId,
      prioridade: "MEDIA",
      notificarResponsavel: notifyResponsibleDefault,
    });
    setFormMode("TAREFA_EQUIPE");
    setError(null);
    setFeedback("Sugestão de tarefa aplicada. Ajuste e salve para concluir a integração prazo?tarefa.");
  }

  async function handleRowAction(item: any, action: AgendaRowAction) {
    setError(null);
    setFeedback(null);

    if (isSharedView) {
      if (sharedPermission !== "COMENTARIOS") {
        setError("Visualizacao compartilhada somente leitura.");
        return;
      }
      if (action !== "COMENTAR") {
        setError("Somente comentarios estao disponiveis nesta visualizacao.");
        return;
      }
      const comentario = window.prompt("Digite o comentario:");
      if (!comentario?.trim()) return;
      await sharedCommentMutation.mutateAsync({
        token: shareToken,
        itemId: item.id,
        itemTipo: item.itemTipo,
        comentario: comentario.trim(),
      });
      await utils.prazos.agendaSharedList.invalidate();
      setFeedback("Comentario registrado.");
      return;
    }

    if (action === "DELEGAR") {
      handleEdit(item);
      setFeedback("Item aberto em modo de edição. Ajuste o responsável e salve para delegar.");
      return;
    }

    if (action === "REAGENDAR") {
      const suggestedDate = toDateInputValue(item.dataLimite ?? item.dataPrevista);
      const nextDate = window.prompt("Informe a nova data (AAAA-MM-DD):", suggestedDate);
      if (!nextDate) return;
      if (item.itemTipo === "TAREFA_EQUIPE") {
        await taskSetStatusMutation.mutateAsync({
          tarefaId: item.id,
          status: item.status,
          dataEntrega: nextDate,
        });
      } else {
        await saveMutation.mutateAsync({
          prazoId: item.id,
          processoId: Number(item.processoId),
          tipo: item.tipo,
          titulo: item.titulo,
          dataPrevista: nextDate,
          responsavelId: item.responsavelId ? Number(item.responsavelId) : undefined,
          observacao: item.observacao || undefined,
          lembretes: Array.isArray(item.alertasConfig?.lembretes) ? item.alertasConfig.lembretes : [7, 3, 1],
        });
      }
      return;
    }

    if (action === "COMENTAR") {
      const comentario = window.prompt("Digite o comentário:");
      if (!comentario?.trim()) return;
      if (item.itemTipo === "TAREFA_EQUIPE") {
        await taskSetStatusMutation.mutateAsync({
          tarefaId: item.id,
          status: item.status,
          comentario: comentario.trim(),
        });
      } else {
        const observacaoAtualizada = [item.observacao, comentario.trim()].filter(Boolean).join("\n");
        await saveMutation.mutateAsync({
          prazoId: item.id,
          processoId: Number(item.processoId),
          tipo: item.tipo,
          titulo: item.titulo,
          dataPrevista: toDateInputValue(item.dataPrevista),
          responsavelId: item.responsavelId ? Number(item.responsavelId) : undefined,
          observacao: observacaoAtualizada,
          lembretes: Array.isArray(item.alertasConfig?.lembretes) ? item.alertasConfig.lembretes : [7, 3, 1],
        });
      }
      return;
    }

    if (action === "CONCLUIR") {
      if (item.itemTipo === "TAREFA_EQUIPE") {
        await handleTaskStatus(item.id, "CONCLUIDO");
        return;
      }
      const arquivarRelacionadas = window.confirm("Deseja arquivar automaticamente as tarefas relacionadas a este prazo?");
      await handleConclude(item.id, arquivarRelacionadas);
      return;
    }

    if (action === "EXCLUIR") {
      if (item.itemTipo === "TAREFA_EQUIPE") {
        await handleTaskRemove(item.id);
      } else {
        await handleRemove(item.id);
      }
    }
  }

  function buildExportColumns() {
    return [
      { key: "tipo", label: "Tipo" },
      { key: "processo", label: "Processo / Tarefa" },
      { key: "objeto", label: "Objeto do processo" },
      { key: "responsavel", label: "Responsável" },
      { key: "dataPrevista", label: "Data prevista" },
      { key: "status", label: "Status" },
      { key: "dias", label: "Dias" },
      { key: "lembretes", label: "Lembretes" },
    ];
  }

  function buildExportRows(items: any[]) {
    return items.map((item) => ({
      tipo: item.itemTipo === "TAREFA_EQUIPE" ? "Tarefa" : "Prazo",
      processo: item.titulo,
      objeto: item.objeto ?? "-",
      responsavel: item.responsavelNome ?? "-",
      dataPrevista: formatShortDateBR(item.dataLimite ?? item.dataPrevista),
      status:
        item.itemTipo === "TAREFA_EQUIPE"
          ? tarefaEquipeStatusLabels[item.status as keyof typeof tarefaEquipeStatusLabels] ?? item.status
          : prazoProcessualStatusLabels[item.status as keyof typeof prazoProcessualStatusLabels] ?? item.status,
      dias: item.daysRemaining ?? "-",
      lembretes:
        item.itemTipo === "PRAZO_PROCESSUAL"
          ? Array.isArray(item.alertasConfig?.lembretes)
            ? item.alertasConfig.lembretes.join(", ")
            : "-"
          : item.notificarResponsavel
            ? "Ativo"
            : "Desativado",
    }));
  }

  async function fetchRowsForExport() {
    const exported = await utils.prazos.agendaList.fetch({
      ...filters,
      pagina: 1,
      limite: 500,
    } as any);
    return exported.items ?? [];
  }

  async function handleExport() {
    if (isSharedView) {
      setError("Visualizacao compartilhada nao permite exportacao.");
      return;
    }
    if (!exportAction) return;
    setExporting(exportAction);
    setError(null);
    try {
      const rowsToExport = await fetchRowsForExport();
      const exportRows = buildExportRows(rowsToExport);
      const columns = buildExportColumns();
      const stamp = new Date().toISOString().slice(0, 10);
      if (exportAction === "CSV") {
        exportReportToCsv(`sirel-prazos-agenda-${stamp}.csv`, columns, exportRows as Record<string, unknown>[]);
        setFeedback("Exportação CSV concluída.");
      } else if (exportAction === "PDF") {
        await exportReportToPdf(
          `sirel-prazos-agenda-${stamp}.pdf`,
          "Agenda operacional de prazos e tarefas",
          columns,
          exportRows as Record<string, unknown>[],
          [
            { label: "Total de itens", value: exportRows.length },
            { label: "Escopo", value: tab },
          ],
        );
        setFeedback("Exportação PDF concluída.");
      } else {
        const url = new URL(window.location.href);
        url.searchParams.set("tab", tab);
        if (busca.trim()) url.searchParams.set("busca", busca.trim());
        if (tipo) url.searchParams.set("tipo", tipo);
        if (status) url.searchParams.set("status", status);
        if (statusTarefa) url.searchParams.set("statusTarefa", statusTarefa);
        if (prioridadeTarefa) url.searchParams.set("prioridade", prioridadeTarefa);
        if (responsavelFiltro) url.searchParams.set("responsavelId", responsavelFiltro);
        await navigator.clipboard.writeText(url.toString());
        setFeedback("Link da visão filtrada copiado para a área de transferência.");
      }
    } catch (requestError: any) {
      setFeedback(null);
      setError(requestError?.message ?? "Falha ao exportar dados da agenda.");
    } finally {
      setExporting(null);
      setExportAction("");
    }
  }

    async function handleShareLink() {
    if (isSharedView) {
      setError("Visualizacao compartilhada nao permite novo compartilhamento.");
      return;
    }
    if (!shareMemberId) {
      setError("Selecione um membro da equipe para compartilhar.");
      return;
    }
    const member = teamMembersQuery.data?.find((item) => String(item.id) === shareMemberId);
    if (!member) {
      setError("Membro selecionado invalido.");
      return;
    }

    setError(null);
    const shareFilters = {
      escopo: tab === "NOVO" || tab === "HISTORICO" ? "DASHBOARD" : tab,
      busca: busca.trim() || undefined,
      prazoTipo: tipo || undefined,
      statusPrazo: status || undefined,
      statusTarefa: statusTarefa || undefined,
      prioridadeTarefa: prioridadeTarefa || undefined,
      responsavelId: responsavelFiltro ? Number(responsavelFiltro) : undefined,
      somenteCriticos: somenteCriticos || undefined,
      somenteDelegadosPorMim: somenteDelegadosPorMim || undefined,
      ocultarConcluidos: ocultarConcluidos || undefined,
      somenteMeusItens: tab === "MEUS_PRAZOS" ? true : undefined,
    };

    const response = await shareCreateMutation.mutateAsync({
      compartilhadoComId: Number(shareMemberId),
      permissao: sharePermission,
      filtros: shareFilters,
    });

    const url = new URL(window.location.href);
    url.searchParams.set("share", response.token);
    await navigator.clipboard.writeText(url.toString());
    setFeedback(`Link seguro copiado para compartilhar com ${member.name}. Permissao: ${sharePermission === "COMENTARIOS" ? "Comentarios" : "Somente visualizacao"}.`);
  }
  const rows = listQuery.data?.items ?? [];
  const historyRows = (historyQuery.data?.items ?? []).filter((item) => item.tabela === "prazos_processuais" || item.tabela === "tarefas_equipe");
  const workloadRows = teamWorkloadQuery.data?.items ?? [];
  const workloadChartItems = workloadRows.map((item) => ({
    id: item.responsavelId,
    label: item.responsavelNome,
    value: item.abertos,
  }));
  const workloadPeriodLabel =
    teamWorkloadQuery.data?.periodo
      ? `${formatShortDateBR(teamWorkloadQuery.data.periodo.inicio)} - ${formatShortDateBR(teamWorkloadQuery.data.periodo.fim)}`
      : "";

  return (
    <div className="space-y-6">
      <SectionCard
        title="Painel Integrado de Prazos + Tarefas"
        description="Visão executiva de prazos críticos, delegações e itens concluídos da semana."
        action={
          <div className="inline-flex items-center gap-2 rounded-full bg-[rgba(245,158,11,0.16)] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[color:var(--color-warning)]">
            <Clock3 className="h-4 w-4" />
            Monitoramento ativo
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Atrasados", value: summaryQuery.data?.atrasados ?? 0, icon: Siren, tone: "border-[rgba(239,68,68,0.2)]", onClick: () => { setTab("ALERTAS"); setSomenteCriticos(true); } },
            { label: "Próximas 48h", value: summaryQuery.data?.em48h ?? 0, icon: Clock3, tone: "border-[rgba(245,158,11,0.22)]", onClick: () => { setTab("ALERTAS"); setSomenteCriticos(true); } },
            { label: "Esta semana", value: summaryQuery.data?.estaSemana ?? 0, icon: CalendarRange, tone: "border-[rgba(204,225,255,0.95)]", onClick: () => { setTab("DASHBOARD"); setSomenteCriticos(false); } },
            { label: "Delegados", value: summaryQuery.data?.delegados ?? 0, icon: Users2, tone: "border-[rgba(56,189,248,0.24)]", onClick: () => { setTab("TAREFAS_EQUIPE"); setSomenteDelegadosPorMim(true); } },
            { label: "Concluídos", value: summaryQuery.data?.concluidosSemana ?? 0, icon: CheckCircle2, tone: "border-[rgba(16,185,129,0.24)]", onClick: () => { setTab("DASHBOARD"); setOcultarConcluidos(false); } },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button type="button" key={item.label} onClick={item.onClick} className={`rounded-[28px] border ${item.tone} bg-white px-4 py-4 text-left shadow-[0_12px_28px_-24px_rgba(15,26,109,0.22)] transition hover:-translate-y-0.5`}>
                <div className="inline-flex rounded-2xl bg-[linear-gradient(135deg,var(--color-primary-900),var(--color-primary-700))] p-3 text-white"><Icon className="h-4 w-4" /></div>
                <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">{item.label}</p>
                {summaryQuery.isLoading ? <Skeleton className="mt-3 h-10 w-16" /> : <p className="mt-3 text-3xl font-black text-[var(--color-primary-900)]">{item.value}</p>}
              </button>
            );
          })}
        </div>
      </SectionCard>

      <div className="flex flex-wrap gap-2 rounded-[22px] border border-[rgba(204,225,255,0.92)] bg-white p-2">
        {([
          { value: "DASHBOARD", label: "Dashboard", icon: Clock3 },
          { value: "MEUS_PRAZOS", label: "Meus Prazos", icon: UserCircle2 },
          { value: "TAREFAS_EQUIPE", label: "Tarefas da Equipe", icon: Users2 },
          { value: "NOVO", label: "Novo", icon: Plus },
          { value: "ALERTAS", label: "Alertas", icon: Bell },
          { value: "HISTORICO", label: "Histórico", icon: History },
        ] as Array<{ value: PrazosTab; label: string; icon: any }>).map((item) => {
          const Icon = item.icon;
          const isActive = item.value === "NOVO" ? isCreateModalOpen : tab === item.value;
          return (
            <button
              key={item.value}
              type="button"
              disabled={isSharedView && item.value !== tab}
              onClick={() => {
                if (isSharedView && item.value !== tab) {
                  setError("Visualizacao compartilhada nao permite trocar de aba.");
                  return;
                }
                if (item.value === "NOVO") {
                  openCreateModal("PRAZO_PROCESSUAL");
                  return;
                }
                setTab(item.value);
              }}
              className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold transition ${isActive ? "bg-[var(--color-primary-600)] text-white" : "text-[var(--color-neutral-700)] hover:bg-[var(--color-primary-50)] hover:text-[var(--color-primary-800)]"}`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {isSharedView ? (
        <Alert variant={sharedReadOnly ? "info" : "success"}>
          Visualizacao compartilhada por {shareResolveQuery.data?.compartilhadoPor ?? "outro usuario"}. Permissao: {sharedPermission === "COMENTARIOS" ? "Comentarios" : "Somente visualizacao"}.
        </Alert>
      ) : null}

      {tab === "HISTORICO" ? (
        <SectionCard title="Histórico de Ações" description="Auditoria de mudanças em prazos processuais e tarefas delegadas.">
          <div className="overflow-x-auto rounded-[24px] border border-[rgba(204,225,255,0.92)] bg-white">
            <Table className="min-w-[940px]">
              <TableHead>
                <tr>
                  <TableHeaderCell>Data</TableHeaderCell>
                  <TableHeaderCell>Tabela</TableHeaderCell>
                  <TableHeaderCell>Ação</TableHeaderCell>
                  <TableHeaderCell>Descrição</TableHeaderCell>
                  <TableHeaderCell>Usuário</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {historyQuery.isLoading
                  ? Array.from({ length: 6 }).map((_, index) => (
                      <TableRow key={index}><TableCell colSpan={5}><Skeleton className="h-10 w-full" /></TableCell></TableRow>
                    ))
                  : historyRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{formatShortDateTimeBR(row.criadoEm)}</TableCell>
                        <TableCell>{row.tabela}</TableCell>
                        <TableCell>{row.acao}</TableCell>
                        <TableCell>{row.descricao ?? "-"}</TableCell>
                        <TableCell>{row.usuarioNome ?? "-"}</TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 flex justify-end">
            <Pagination page={historyPage} totalPages={Math.max(1, Math.ceil((historyQuery.data?.total ?? 0) / 20))} onPageChange={setHistoryPage} />
          </div>
        </SectionCard>
      ) : (
      <div className="space-y-6">
        <SectionCard title="Alertas prioritários" description="Fila resumida com itens vencendo em 48h ou já atrasados.">
          <div className="space-y-3">
            {summaryQuery.isLoading
              ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-20 w-full rounded-[24px]" />)
              : summaryQuery.data?.alerts.map((item) => (
                  <article key={`${item.itemTipo}-${item.id}`} className="rounded-[24px] border border-[rgba(204,225,255,0.92)] bg-[linear-gradient(180deg,rgba(230,240,255,0.54),rgba(255,255,255,0.96))] px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-[var(--color-primary-900)]">{item.numeroSirel ?? "Sem processo"} · {item.itemTipo === "TAREFA_EQUIPE" ? "Tarefa" : "Prazo"}</p>
                        <p className="mt-1 text-sm text-[var(--color-neutral-700)]">{item.titulo}</p>
                        <p className="mt-1 text-xs text-[var(--color-neutral-500)]">
                          {formatShortDateBR(item.dataLimite ?? item.dataPrevista)}
                          {" · "}
                          {item.responsavelNome ?? "Sem responsável"}
                        </p>
                      </div>
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${alertBadge(item.alertLevel)}`}>
                        {item.daysRemaining === null ? "-" : item.daysRemaining === 0 ? "Hoje" : `${item.daysRemaining} dia(s)`}
                      </span>
                    </div>
                  </article>
                ))}
            {!summaryQuery.isLoading && !summaryQuery.data?.alerts.length ? <Alert variant="info">Nenhum alerta crítico na semana.</Alert> : null}
          </div>
        </SectionCard>
        {!isSharedView ? (
          <SectionCard title="Gestão da equipe e comunicação" description="Exportação, compartilhamento seguro, carga por responsável e preferências de notificação.">
                    <div className="grid gap-3 xl:grid-cols-3">
                      <article className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] p-4">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-primary-700)]">Exportar visão atual</p>
                        <div className="mt-3 flex items-center gap-2">
                          <Select value={exportAction} onChange={(event) => setExportAction(event.target.value as any)} className="min-w-[180px]">
                            <option value="">Selecione</option>
                            <option value="CSV">CSV</option>
                            <option value="PDF">PDF</option>
                            <option value="LINK">Link filtrado</option>
                          </Select>
                          <Button type="button" size="sm" onClick={() => void handleExport()} disabled={!exportAction || exporting !== null}>
                            <Download className="h-4 w-4" />
                            {exporting ? "Gerando..." : "Exportar"}
                          </Button>
                        </div>
                      </article>
          
                      <article className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-white p-4">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-primary-700)]">Compartilhar com a equipe</p>
                        <div className="mt-3 grid gap-2">
                          <Select value={shareMemberId} onChange={(event) => setShareMemberId(event.target.value)}>
                            <option value="">Selecione um membro</option>
                            {teamMembersQuery.data?.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                          </Select>
                          <Select value={sharePermission} onChange={(event) => setSharePermission(event.target.value as any)}>
                            <option value="SOMENTE_VISUALIZACAO">Somente visualização</option>
                            <option value="COMENTARIOS">Permitir comentários</option>
                          </Select>
                          <Button type="button" size="sm" variant="outline" onClick={() => void handleShareLink()}>
                            <Share2 className="h-4 w-4" />
                            Copiar link seguro
                          </Button>
                        </div>
                      </article>
          
                      <article className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-white p-4">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-primary-700)]">Preferências de notificação</p>
                        <div className="mt-3 grid gap-2">
                          <Select
                            value={notificationPreferences.frequencia}
                            onChange={(event) =>
                              persistNotificationPreferences({
                                ...notificationPreferences,
                                frequencia: event.target.value as NotificationPreferences["frequencia"],
                              })
                            }
                          >
                            <option value="IMEDIATA">Imediata</option>
                            <option value="RESUMO_DIARIO">Resumo diário</option>
                            <option value="RESUMO_SEMANAL">Resumo semanal</option>
                          </Select>
                          <Select
                            value={notificationPreferences.escopo}
                            onChange={(event) =>
                              persistNotificationPreferences({
                                ...notificationPreferences,
                                escopo: event.target.value as NotificationPreferences["escopo"],
                              })
                            }
                          >
                            <option value="MEUS_ITENS">Apenas meus itens</option>
                            <option value="EQUIPE">Todos da equipe</option>
                            <option value="CRITICOS">Somente críticos</option>
                          </Select>
                          <div className="flex flex-wrap gap-3 text-xs font-semibold text-[var(--color-neutral-700)]">
                            <label className="inline-flex items-center gap-1.5">
                              <Checkbox
                                checked={notificationPreferences.canais.inApp}
                                onChange={(event) =>
                                  persistNotificationPreferences({
                                    ...notificationPreferences,
                                    canais: { ...notificationPreferences.canais, inApp: event.target.checked },
                                  })
                                }
                              />
                              <BellRing className="h-3.5 w-3.5" />
                              In-app
                            </label>
                            <label className="inline-flex items-center gap-1.5">
                              <Checkbox
                                checked={notificationPreferences.canais.email}
                                onChange={(event) =>
                                  persistNotificationPreferences({
                                    ...notificationPreferences,
                                    canais: { ...notificationPreferences.canais, email: event.target.checked },
                                  })
                                }
                              />
                              <Mail className="h-3.5 w-3.5" />
                              E-mail
                            </label>
                            <label className="inline-flex items-center gap-1.5">
                              <Checkbox
                                checked={notificationPreferences.canais.push}
                                onChange={(event) => void handlePushToggle(event.target.checked)}
                              />
                              <Smartphone className="h-3.5 w-3.5" />
                              Push
                            </label>
                          </div>
                        </div>
                      </article>
                    </div>
          
                    <div className="mt-4 rounded-2xl border border-[rgba(204,225,255,0.92)] bg-white p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-2">
                          <BarChart3 className="h-4 w-4 text-[var(--color-primary-700)]" />
                          <p className="text-sm font-semibold text-[var(--color-primary-900)]">Distribuição de carga por responsável</p>
                        </div>
                        <span className="text-xs text-[var(--color-neutral-500)]">{workloadPeriodLabel}</span>
                      </div>
                      {teamWorkloadQuery.isLoading ? (
                        <Skeleton className="h-28 w-full" />
                      ) : workloadChartItems.length ? (
                        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                          <SimpleBarChart items={workloadChartItems} />
                          <div className="overflow-x-auto rounded-2xl border border-[rgba(204,225,255,0.92)]">
                            <Table className="min-w-[320px]">
                              <TableHead>
                                <tr>
                                  <TableHeaderCell>Responsável</TableHeaderCell>
                                  <TableHeaderCell>Pendente</TableHeaderCell>
                                  <TableHeaderCell>Em andamento</TableHeaderCell>
                                  <TableHeaderCell>Concluído</TableHeaderCell>
                                </tr>
                              </TableHead>
                              <TableBody>
                                {workloadRows.map((item) => (
                                  <TableRow key={item.responsavelId}>
                                    <TableCell>{item.responsavelNome}</TableCell>
                                    <TableCell>{item.pendente + item.aguardando + item.bloqueado}</TableCell>
                                    <TableCell>{item.emAndamento}</TableCell>
                                    <TableCell>{item.concluido}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      ) : (
                        <Alert variant="info">Sem tarefas da semana para calcular carga por responsável.</Alert>
                      )}
                    </div>
                  </SectionCard>
        ) : null}

        <SectionCard title="Agenda operacional unificada" description="Acompanhe prazos processuais e tarefas delegadas em uma única fila.">
          <div className="space-y-4">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px]">
              <FormField label="Busca textual" className="w-full">
                <div className="flex items-center gap-2 rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(230,240,255,0.65))] px-3 py-2 shadow-[0_8px_18px_-18px_rgba(15,26,109,0.4)]">
                  <Search className="h-4 w-4 text-[var(--color-primary-500)]" />
                  <input
                    value={busca}
                    onChange={(event) => { setPagina(1); setBusca(event.target.value); }}
                    placeholder="Processo, título ou secretaria"
                    className="w-full border-none bg-transparent text-sm text-[var(--color-neutral-700)] outline-none placeholder:text-[var(--color-neutral-400)]"
                  />
                </div>
              </FormField>
              <FormField label="Listagem">
                <Select value={String(limite)} onChange={(event) => { setPagina(1); setLimite(Number(event.target.value)); }}>
                  {[10, 20, 30].map((option) => <option key={option} value={option}>{option} por página</option>)}
                </Select>
              </FormField>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <FormField label="Tipo de prazo">
                <Select value={tipo} disabled={isSharedView} onChange={(event) => { setPagina(1); setTipo(event.target.value as "" | PrazoTipo); }}>
                  <option value="">Todos</option>
                  {Object.entries(prazoProcessualTipoLabels).map(([codigo, label]) => <option key={codigo} value={codigo}>{label}</option>)}
                </Select>
              </FormField>
              <FormField label="Status prazo">
                <Select value={status} disabled={isSharedView} onChange={(event) => { setPagina(1); setStatus(event.target.value as "" | PrazoStatus); }}>
                  <option value="">Todos</option>
                  {Object.entries(prazoProcessualStatusLabels).map(([codigo, label]) => <option key={codigo} value={codigo}>{label}</option>)}
                </Select>
              </FormField>
              <FormField label="Status tarefa">
                <Select value={statusTarefa} disabled={isSharedView} onChange={(event) => { setPagina(1); setStatusTarefa(event.target.value as "" | TarefaStatus); }}>
                  <option value="">Todos</option>
                  {Object.entries(tarefaEquipeStatusLabels).map(([codigo, label]) => <option key={codigo} value={codigo}>{label}</option>)}
                </Select>
              </FormField>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="Prioridade tarefa">
                <Select value={prioridadeTarefa} disabled={isSharedView} onChange={(event) => { setPagina(1); setPrioridadeTarefa(event.target.value as "" | TarefaPrioridade); }}>
                  <option value="">Todas</option>
                  {Object.entries(tarefaEquipePrioridadeLabels).map(([codigo, label]) => <option key={codigo} value={codigo}>{label}</option>)}
                </Select>
              </FormField>
              <FormField label="Responsável">
                <Select value={responsavelFiltro} disabled={isSharedView} onChange={(event) => { setPagina(1); setResponsavelFiltro(event.target.value); }}>
                  <option value="">Todos</option>
                  {teamMembersQuery.data?.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                </Select>
              </FormField>
            </div>

            <div className="flex flex-wrap gap-4 rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[linear-gradient(180deg,rgba(230,240,255,0.52),rgba(255,255,255,0.96))] px-4 py-3">
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-neutral-700)]">
                <Checkbox checked={somenteCriticos} disabled={isSharedView} onChange={(event) => { setPagina(1); setSomenteCriticos(event.target.checked); }} />
                Somente críticos
              </label>
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-neutral-700)]">
                <Checkbox checked={somenteDelegadosPorMim} disabled={isSharedView} onChange={(event) => { setPagina(1); setSomenteDelegadosPorMim(event.target.checked); }} />
                Delegados por mim
              </label>
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-neutral-700)]">
                <Checkbox checked={ocultarConcluidos} disabled={isSharedView} onChange={(event) => { setPagina(1); setOcultarConcluidos(event.target.checked); }} />
                Ocultar concluídos
              </label>
            </div>

            {listQuery.error ? <Alert variant="error">Falha ao carregar a agenda unificada.</Alert> : null}
            {feedback ? <Alert variant="success">{feedback}</Alert> : null}
            {error ? <Alert variant="error">{error}</Alert> : null}

            {selectedTaskIds.length && !isSharedView ? (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-3 py-2">
                <span className="text-sm font-semibold text-[var(--color-primary-900)]">Selecionados: {selectedTaskIds.length}</span>
                <Select value={bulkAction} onChange={(event) => setBulkAction(event.target.value as any)} className="min-w-[150px]">
                  <option value="">Ação em lote</option>
                  <option value="CONCLUIR">Concluir</option>
                  <option value="DELEGAR">Delegar</option>
                  <option value="REAGENDAR">Reagendar</option>
                </Select>
                {bulkAction === "DELEGAR" ? (
                  <Select value={bulkResponsavelId} onChange={(event) => setBulkResponsavelId(event.target.value)} className="min-w-[220px]">
                    <option value="">Selecione responsável</option>
                    {teamMembersQuery.data?.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                  </Select>
                ) : null}
                {bulkAction === "REAGENDAR" ? (
                  <Input type="date" value={bulkDataEntrega} onChange={(event) => setBulkDataEntrega(event.target.value)} className="max-w-[180px]" />
                ) : null}
                <Button size="sm" onClick={handleBulkAction} disabled={!bulkAction || taskBulkMutation.isPending}>Aplicar</Button>
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white shadow-[0_14px_30px_-26px_rgba(15,26,109,0.22)]">
              <Table className="min-w-[1120px]">
                <TableHead>
                  <tr>
                    <TableHeaderCell><Checkbox checked={rows.length > 0 && rows.filter((item: any) => item.itemTipo === "TAREFA_EQUIPE").every((item: any) => selectedTaskIds.includes(item.id))} disabled={isSharedView} onChange={(event) => setSelectedTaskIds(event.target.checked ? rows.filter((item: any) => item.itemTipo === "TAREFA_EQUIPE").map((item: any) => item.id) : [])} /></TableHeaderCell>
                    <TableHeaderCell>Tipo</TableHeaderCell>
                    <TableHeaderCell>Processo / Tarefa</TableHeaderCell>
                    <TableHeaderCell>Objeto do processo</TableHeaderCell>
                    <TableHeaderCell>Responsável</TableHeaderCell>
                    <TableHeaderCell>Data prevista</TableHeaderCell>
                    <TableHeaderCell>Status / Dias</TableHeaderCell>
                    <TableHeaderCell>Lembretes</TableHeaderCell>
                    <TableHeaderCell>Ações</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {listQuery.isLoading
                    ? Array.from({ length: 6 }).map((_, index) => (
                        <TableRow key={index}><TableCell colSpan={9}><Skeleton className="h-12 w-full" /></TableCell></TableRow>
                      ))
                    : rows.map((item) => (
                        <TableRow key={`${item.itemTipo}-${item.id}`}>
                          <TableCell>
                            {item.itemTipo === "TAREFA_EQUIPE" ? (
                              <Checkbox
                                checked={selectedTaskIds.includes(item.id)} disabled={isSharedView}
                                onChange={(event) => {
                                  setSelectedTaskIds((current) =>
                                    event.target.checked ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id),
                                  );
                                }}
                              />
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex rounded-full bg-[var(--color-neutral-100)] px-3 py-1 text-xs font-bold">
                              {item.itemTipo === "TAREFA_EQUIPE" ? "Tarefa" : "Prazo"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="font-semibold text-[var(--color-primary-900)]">{item.titulo}</div>
                            <div className="text-xs text-[var(--color-neutral-500)]">
                              {item.numeroSirel ?? "-"} {item.itemTipo !== "TAREFA_EQUIPE" && item.tipo ? `· ${prazoProcessualTipoLabels[item.tipo as keyof typeof prazoProcessualTipoLabels]}` : ""}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-[320px] truncate text-sm text-[var(--color-neutral-700)]" title={item.objeto ?? ""}>
                              {item.objeto ?? "-"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="inline-flex items-center gap-1.5">
                              <UserCircle2 className="h-4 w-4 text-[var(--color-primary-500)]" />
                              <span>{item.responsavelNome ?? "-"}</span>
                            </div>
                          </TableCell>
                          <TableCell>{formatShortDateBR(item.dataLimite ?? item.dataPrevista)}</TableCell>
                          <TableCell>
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${alertBadge(item.alertLevel)}`}>
                              {item.itemTipo === "TAREFA_EQUIPE"
                                ? tarefaEquipeStatusLabels[item.status as keyof typeof tarefaEquipeStatusLabels] ?? item.status
                                : prazoProcessualStatusLabels[item.status as keyof typeof prazoProcessualStatusLabels]}
                              {" · "}
                              {item.daysRemaining === null ? "-" : item.daysRemaining}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary-50)] px-3 py-1 text-xs font-semibold text-[var(--color-primary-800)]">
                              <Bell className="h-3.5 w-3.5" />
                              {item.itemTipo === "PRAZO_PROCESSUAL"
                                ? Array.isArray(item.alertasConfig?.lembretes) && item.alertasConfig.lembretes.length
                                  ? `${item.alertasConfig.lembretes.join(", ")} dia(s)`
                                  : "Sem lembrete"
                                : item.notificarResponsavel
                                  ? "Notificação ativa"
                                  : "Notificação off"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Select
                              defaultValue=""
                              onChange={(event) => {
                                const value = event.target.value as AgendaRowAction;
                                event.target.value = "";
                                if (!value) return;
                                void handleRowAction(item, value);
                              }}
                            >
                              <option value="">Selecionar ação</option>
                              <option value="CONCLUIR">Concluir</option>
                              <option value="REAGENDAR">Reagendar</option>
                              <option value="DELEGAR">Delegar</option>
                              <option value="COMENTAR">Comentar</option>
                              <option value="EXCLUIR">Excluir</option>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                  {!listQuery.isLoading && !rows.length ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-8 text-center text-[var(--color-neutral-500)]">Nenhum item encontrado com os filtros aplicados.</TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[var(--color-neutral-600)]">Total monitorado: <span className="font-bold text-[var(--color-primary-900)]">{listQuery.data?.total ?? 0}</span></p>
              <Pagination page={pagina} totalPages={listQuery.data?.totalPages ?? 1} onPageChange={setPagina} />
            </div>
          </div>
        </SectionCard>
      </div>
      )}

      <Modal
        open={isCreateModalOpen}
        onClose={closeCreateModal}
        size="xl"
        title={formMode === "PRAZO_PROCESSUAL" ? (form.prazoId ? "Editar prazo processual" : "Novo prazo processual") : (taskForm.tarefaId ? "Editar tarefa da equipe" : "Nova tarefa da equipe")}
        description="Formulário unificado para criar ou editar prazo processual e tarefa interna sem tirar espaço da agenda."
      >
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="inline-flex rounded-2xl border border-[rgba(204,225,255,0.92)] p-1">
            <button type="button" className={`rounded-xl px-3 py-2 text-sm font-semibold ${formMode === "PRAZO_PROCESSUAL" ? "bg-[var(--color-primary-600)] text-white" : "text-[var(--color-neutral-700)]"}`} onClick={() => setFormMode("PRAZO_PROCESSUAL")}>Prazo</button>
            <button type="button" className={`rounded-xl px-3 py-2 text-sm font-semibold ${formMode === "TAREFA_EQUIPE" ? "bg-[var(--color-primary-600)] text-white" : "text-[var(--color-neutral-700)]"}`} onClick={() => setFormMode("TAREFA_EQUIPE")}>Tarefa</button>
          </div>

          {formMode === "PRAZO_PROCESSUAL" ? (
            <>
              <FormField label="Processo">
                <ProcessAutocompleteField
                  value={form.processoId}
                  onChange={(value) => setForm((current) => ({ ...current, processoId: value }))}
                  options={processOptions as ProcessOption[]}
                  placeholder="Buscar por número SIREL, objeto ou secretaria"
                />
              </FormField>
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="Tipo do prazo">
                  <Select value={form.tipo} onChange={(event) => setForm((current) => ({ ...current, tipo: event.target.value as PrazoTipo }))}>
                    {Object.entries(prazoProcessualTipoLabels).map(([codigo, label]) => <option key={codigo} value={codigo}>{label}</option>)}
                  </Select>
                </FormField>
                <FormField label="Responsável">
                  <Select value={form.responsavelId} onChange={(event) => setForm((current) => ({ ...current, responsavelId: event.target.value }))}>
                    <option value="">Automático</option>
                    {teamMembersQuery.data?.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                  </Select>
                </FormField>
              </div>
              <FormField label="Título operacional">
                <Input value={form.titulo} onChange={(event) => setForm((current) => ({ ...current, titulo: event.target.value }))} placeholder="Ex.: Publicação do aviso no DOM" />
              </FormField>
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="Data prevista">
                  <Input type="date" value={form.dataPrevista} onChange={(event) => setForm((current) => ({ ...current, dataPrevista: event.target.value }))} />
                </FormField>
                <FormField label="Lembretes (dias antes)">
                  <Input value={form.lembretes} onChange={(event) => setForm((current) => ({ ...current, lembretes: event.target.value }))} placeholder="7,3,1" />
                </FormField>
              </div>
              <FormField label="Observação">
                <Input value={form.observacao} onChange={(event) => setForm((current) => ({ ...current, observacao: event.target.value }))} placeholder="Informações complementares para a equipe" />
              </FormField>
              <div className="rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3">
                <p className="text-sm font-semibold text-[var(--color-primary-900)]">Integração prazo ? tarefa</p>
                <p className="mt-1 text-xs text-[var(--color-neutral-600)]">
                  Gere automaticamente uma tarefa de apoio com entrega antecipada para evitar atraso no prazo principal.
                </p>
                <Button type="button" size="sm" variant="outline" className="mt-3" onClick={suggestTaskFromPrazo}>
                  Sugerir tarefa vinculada
                </Button>
              </div>
            </>
          ) : (
            <>
              <FormField label="Título da tarefa">
                <Input value={taskForm.titulo} onChange={(event) => setTaskForm((current) => ({ ...current, titulo: event.target.value }))} placeholder="Ex.: Revisar minuta de edital" />
              </FormField>
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="Processo relacionado">
                  <ProcessAutocompleteField
                    value={taskForm.processoId}
                    onChange={(value) => setTaskForm((current) => ({ ...current, processoId: value }))}
                    options={processOptions as ProcessOption[]}
                    placeholder="Buscar processo opcional"
                  />
                </FormField>
                <FormField label="Responsável">
                  <Select value={taskForm.responsavelId} onChange={(event) => setTaskForm((current) => ({ ...current, responsavelId: event.target.value }))}>
                    <option value="">Selecione</option>
                    {teamMembersQuery.data?.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                  </Select>
                </FormField>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="Prioridade">
                  <Select value={taskForm.prioridade} onChange={(event) => setTaskForm((current) => ({ ...current, prioridade: event.target.value as TarefaPrioridade }))}>
                    {Object.entries(tarefaEquipePrioridadeLabels).map(([codigo, label]) => <option key={codigo} value={codigo}>{label}</option>)}
                  </Select>
                </FormField>
                <FormField label="Data de entrega">
                  <Input type="date" value={taskForm.dataEntrega} onChange={(event) => setTaskForm((current) => ({ ...current, dataEntrega: event.target.value }))} />
                </FormField>
              </div>
              <FormField label="Descrição">
                <Input value={taskForm.descricao} onChange={(event) => setTaskForm((current) => ({ ...current, descricao: event.target.value }))} placeholder="Contexto da tarefa para a equipe" />
              </FormField>
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-neutral-700)]">
                <Checkbox checked={taskForm.notificarResponsavel} onChange={(event) => setTaskForm((current) => ({ ...current, notificarResponsavel: event.target.checked }))} />
                Notificar responsável
              </label>
            </>
          )}

          {error ? <Alert variant="error">{error}</Alert> : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saveMutation.isPending || taskSaveMutation.isPending}>
              {formMode === "PRAZO_PROCESSUAL" ? (saveMutation.isPending ? "Salvando..." : "Salvar prazo") : (taskSaveMutation.isPending ? "Salvando..." : "Salvar tarefa")}
            </Button>
            {formMode === "PRAZO_PROCESSUAL" && form.prazoId ? <Button type="button" variant="outline" onClick={() => setForm(initialPrazoForm)}>Cancelar edição</Button> : null}
            {formMode === "TAREFA_EQUIPE" && taskForm.tarefaId ? <Button type="button" variant="outline" onClick={() => setTaskForm({ ...initialTaskForm, notificarResponsavel: notifyResponsibleDefault })}>Cancelar edição</Button> : null}
            <Button type="button" variant="outline" onClick={closeCreateModal}>Fechar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}






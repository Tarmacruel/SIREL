import { Clock3, Siren, CheckCircle2, CalendarRange, Trash2, Pencil, Search } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { prazoProcessualStatusLabels, prazoProcessualStatusOptions, prazoProcessualTipoLabels, prazoProcessualTipoOptions } from "@sirel/shared/const";
import { formatShortDateBR } from "@/lib/formatters";
import { trpc } from "@/lib/trpc";

type PrazoTipo = (typeof prazoProcessualTipoOptions)[number];
type PrazoStatus = (typeof prazoProcessualStatusOptions)[number];

const initialForm = {
  prazoId: null as number | null,
  processoId: "",
  tipo: "PUBLICACAO_EDITAL" as PrazoTipo,
  titulo: "",
  dataPrevista: "",
  observacao: "",
  lembretes: "7,3,1",
};

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
      return "bg-rose-100 text-rose-700";
    case "critical":
      return "bg-amber-100 text-amber-800";
    case "warning":
      return "bg-orange-100 text-orange-800";
    case "info":
      return "bg-sky-100 text-sky-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function PrazosPage() {
  const utils = trpc.useUtils();
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(10);
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<"" | PrazoTipo>("");
  const [status, setStatus] = useState<"" | PrazoStatus>("");
  const [somenteCriticos, setSomenteCriticos] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const summaryQuery = trpc.prazos.summary.useQuery(undefined, { retry: false });
  const processOptionsQuery = trpc.prazos.processOptions.useQuery(undefined, { retry: false });
  const filters = useMemo(
    () => ({ pagina, limite, busca: busca.trim() || undefined, tipo: tipo || undefined, status: status || undefined, somenteCriticos: somenteCriticos || undefined }),
    [busca, limite, pagina, somenteCriticos, status, tipo],
  );
  const listQuery = trpc.prazos.list.useQuery(filters, { retry: false, placeholderData: (previous) => previous });

  const saveMutation = trpc.prazos.save.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.prazos.summary.invalidate(), utils.prazos.list.invalidate()]);
      setForm(initialForm);
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
      await Promise.all([utils.prazos.summary.invalidate(), utils.prazos.list.invalidate()]);
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
      await Promise.all([utils.prazos.summary.invalidate(), utils.prazos.list.invalidate()]);
      setFeedback("Prazo removido com sucesso.");
      setError(null);
    },
    onError: (mutationError) => {
      setFeedback(null);
      setError(mutationError.message);
    },
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setError(null);

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
      observacao: form.observacao || undefined,
      lembretes: lembretes.length ? lembretes : [7, 3, 1],
    });
  }

  function handleEdit(item: any) {
    setForm({
      prazoId: item.id,
      processoId: String(item.processoId),
      tipo: item.tipo,
      titulo: item.titulo,
      dataPrevista: toDateInputValue(item.dataPrevista),
      observacao: item.observacao ?? "",
      lembretes: Array.isArray(item.alertasConfig?.lembretes) ? item.alertasConfig.lembretes.join(",") : "7,3,1",
    });
    setFeedback(null);
    setError(null);
  }

  async function handleConclude(itemId: number) {
    await concludeMutation.mutateAsync({ prazoId: itemId });
  }

  async function handleRemove(itemId: number) {
    if (!window.confirm("Deseja realmente remover este prazo processual?")) return;
    await removeMutation.mutateAsync({ prazoId: itemId });
  }

  const rows = listQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      <SectionCard
        title="Painel de Prazos e Alertas"
        description="Controle de datas críticas, vencimentos e acompanhamento semanal da operação licitatória."
        action={
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-amber-800">
            <Clock3 className="h-4 w-4" />
            Monitoramento ativo
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Vencendo hoje", value: summaryQuery.data?.hoje ?? 0, icon: Siren, tone: "border-rose-200" },
            { label: "Próximas 48h", value: summaryQuery.data?.proximas48h ?? 0, icon: Clock3, tone: "border-amber-200" },
            { label: "Em atraso", value: summaryQuery.data?.atrasados ?? 0, icon: CalendarRange, tone: "border-orange-200" },
            { label: "Na semana", value: summaryQuery.data?.semana ?? 0, icon: CalendarRange, tone: "border-sky-200" },
            { label: "Concluídos", value: summaryQuery.data?.concluidosSemana ?? 0, icon: CheckCircle2, tone: "border-emerald-200" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.label} className={`rounded-[28px] border ${item.tone} bg-white px-4 py-4 shadow-sm`}>
                <div className="inline-flex rounded-2xl bg-slate-900 p-3 text-white"><Icon className="h-4 w-4" /></div>
                <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                {summaryQuery.isLoading ? <Skeleton className="mt-3 h-10 w-16" /> : <p className="mt-3 text-3xl font-black text-slate-950">{item.value}</p>}
              </article>
            );
          })}
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="Agenda operacional" description="Acompanhe prazos, destaque criticidade e finalize eventos diretamente da fila.">
          <div className="space-y-4">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px]">
              <FormField label="Busca textual" className="w-full">
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    value={busca}
                    onChange={(event) => { setPagina(1); setBusca(event.target.value); }}
                    placeholder="Processo, título ou secretaria"
                    className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                  />
                </div>
              </FormField>
              <FormField label="Listagem">
                <Select value={String(limite)} onChange={(event) => { setPagina(1); setLimite(Number(event.target.value)); }}>
                  {[10, 20, 30].map((option) => <option key={option} value={option}>{option} por página</option>)}
                </Select>
              </FormField>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="Tipo">
                <Select value={tipo} onChange={(event) => { setPagina(1); setTipo(event.target.value as "" | PrazoTipo); }}>
                  <option value="">Todos</option>
                  {Object.entries(prazoProcessualTipoLabels).map(([codigo, label]) => <option key={codigo} value={codigo}>{label}</option>)}
                </Select>
              </FormField>
              <FormField label="Status">
                <Select value={status} onChange={(event) => { setPagina(1); setStatus(event.target.value as "" | PrazoStatus); }}>
                  <option value="">Todos</option>
                  {Object.entries(prazoProcessualStatusLabels).map(([codigo, label]) => <option key={codigo} value={codigo}>{label}</option>)}
                </Select>
              </FormField>
            </div>

            <label className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={somenteCriticos} onChange={(event) => { setPagina(1); setSomenteCriticos(event.target.checked); }} className="h-4 w-4 rounded border-slate-300 text-sky-600" />
              Mostrar apenas prazos críticos (atrasados ou vencendo em 48 horas)
            </label>

            {listQuery.error ? <Alert variant="error">Falha ao carregar a agenda de prazos.</Alert> : null}
            {feedback ? <Alert variant="success">{feedback}</Alert> : null}
            {error ? <Alert variant="error">{error}</Alert> : null}

            <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white">
              <Table className="min-w-[920px]">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Prazo</TableHeaderCell>
                    <TableHeaderCell>Processo</TableHeaderCell>
                    <TableHeaderCell>Data prevista</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Dias</TableHeaderCell>
                    <TableHeaderCell className="text-right">Ações</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {listQuery.isLoading
                    ? Array.from({ length: 6 }).map((_, index) => (
                        <TableRow key={index}><TableCell colSpan={6}><Skeleton className="h-12 w-full" /></TableCell></TableRow>
                      ))
                    : rows.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="font-semibold text-slate-900">{item.titulo}</div>
                            <div className="text-xs text-slate-500">{prazoProcessualTipoLabels[item.tipo as keyof typeof prazoProcessualTipoLabels]}</div>
                          </TableCell>
                          <TableCell>
                            <div className="font-semibold text-slate-900">{item.numeroSirel}</div>
                            <div className="text-xs text-slate-500">{item.secretariaNome}</div>
                          </TableCell>
                          <TableCell>{formatShortDateBR(item.dataPrevista)}</TableCell>
                          <TableCell>
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${alertBadge(item.alertLevel)}`}>
                              {prazoProcessualStatusLabels[item.status as keyof typeof prazoProcessualStatusLabels]}
                            </span>
                          </TableCell>
                          <TableCell>{item.daysRemaining === null ? "-" : item.daysRemaining}</TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Button type="button" size="sm" variant="outline" onClick={() => handleEdit(item)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {item.status !== "CONCLUIDO" ? (
                                <Button type="button" size="sm" onClick={() => handleConclude(item.id)} disabled={concludeMutation.isPending}>
                                  Concluir
                                </Button>
                              ) : null}
                              <Button type="button" size="sm" variant="outline" onClick={() => handleRemove(item.id)} disabled={removeMutation.isPending}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  {!listQuery.isLoading && !rows.length ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-slate-500">Nenhum prazo encontrado com os filtros aplicados.</TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600">Total monitorado: <span className="font-bold text-slate-950">{listQuery.data?.total ?? 0}</span></p>
              <Pagination page={pagina} totalPages={listQuery.data?.totalPages ?? 1} onPageChange={setPagina} />
            </div>
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title={form.prazoId ? "Editar prazo" : "Novo prazo processual"} description="Cadastre eventos críticos do processo e configure lembretes internos em dias antes do vencimento.">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <FormField label="Processo">
                <Select value={form.processoId} onChange={(event) => setForm((current) => ({ ...current, processoId: event.target.value }))}>
                  <option value="">Selecione um processo</option>
                  {processOptionsQuery.data?.map((item) => (
                    <option key={item.id} value={item.id}>{item.numeroSirel} - {item.objeto.slice(0, 72)}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Tipo do prazo">
                <Select value={form.tipo} onChange={(event) => setForm((current) => ({ ...current, tipo: event.target.value as PrazoTipo }))}>
                  {Object.entries(prazoProcessualTipoLabels).map(([codigo, label]) => <option key={codigo} value={codigo}>{label}</option>)}
                </Select>
              </FormField>
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
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? "Salvando..." : "Salvar prazo"}</Button>
                {form.prazoId ? <Button type="button" variant="outline" onClick={() => setForm(initialForm)}>Cancelar edição</Button> : null}
              </div>
            </form>
          </SectionCard>

          <SectionCard title="Alertas da semana" description="Fila resumida dos prazos que já exigem ação operacional. ">
            <div className="space-y-3">
              {summaryQuery.isLoading
                ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-20 w-full rounded-[24px]" />)
                : summaryQuery.data?.alerts.map((item) => (
                    <article key={item.id} className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{item.numeroSirel}</p>
                          <p className="mt-1 text-sm text-slate-700">{item.titulo}</p>
                          <p className="mt-1 text-xs text-slate-500">{formatShortDateBR(item.dataPrevista)} · {prazoProcessualTipoLabels[item.tipo as keyof typeof prazoProcessualTipoLabels]}</p>
                        </div>
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${alertBadge(item.alertLevel)}`}>
                          {item.status === "EM_ATRASO" ? "Atrasado" : item.daysRemaining === 0 ? "Hoje" : `${item.daysRemaining} dia(s)`}
                        </span>
                      </div>
                    </article>
                  ))}
              {!summaryQuery.isLoading && !summaryQuery.data?.alerts.length ? <Alert variant="info">Nenhum alerta crítico na semana.</Alert> : null}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}





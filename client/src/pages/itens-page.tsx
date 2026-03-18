import { useDeferredValue, useEffect, useMemo, useState, type FormEvent } from "react";
import { Boxes, PencilLine, Search, ShieldCheck, Trash2 } from "lucide-react";

import { SectionCard } from "@/components/shared/section-card";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { type ContratoItemFormState, type ItemFormState, validateContratoItemForm, validateItemForm } from "@/features/itens/form";
import { formatCurrencyBRL, formatNumberBR, formatShortDateBR, formatShortDateTimeBR } from "@/lib/formatters";
import { trpc } from "@/lib/trpc";
import { mapZodFieldErrors } from "@/lib/zod-errors";

const initialItemForm: ItemFormState = { descricao: "", unidadePadrao: "", valorReferencia: "", ativo: true };
const initialControleForm: ContratoItemFormState = {
  contratoId: "",
  descricao: "",
  unidade: "",
  quantidadeContratada: "",
  quantidadeConsumida: "0",
  valorUnitario: "",
  ativo: true,
};

export function ItensPage() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [ativoFiltro, setAtivoFiltro] = useState<"" | "true" | "false">("true");
  const [vigenteFiltro, setVigenteFiltro] = useState<"" | "true" | "false">("");
  const [saldoFiltro, setSaldoFiltro] = useState<"" | "true" | "false">("");
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [itemForm, setItemForm] = useState<ItemFormState>(initialItemForm);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const [itemMessage, setItemMessage] = useState<string | null>(null);
  const [itemErrorMessage, setItemErrorMessage] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const [controleDialogOpen, setControleDialogOpen] = useState(false);
  const [editingControleId, setEditingControleId] = useState<number | null>(null);
  const [controleForm, setControleForm] = useState<ContratoItemFormState>(initialControleForm);
  const [controleErrors, setControleErrors] = useState<Record<string, string>>({});
  const [controleErrorMessage, setControleErrorMessage] = useState<string | null>(null);

  const deferredSearch = useDeferredValue(search.trim());
  const filters = useMemo(
    () => ({
      page,
      pageSize,
      search: deferredSearch || undefined,
      ativo: ativoFiltro === "" ? undefined : ativoFiltro === "true",
      vigente: vigenteFiltro === "" ? undefined : vigenteFiltro === "true",
      comSaldo: saldoFiltro === "" ? undefined : saldoFiltro === "true",
    }),
    [ativoFiltro, deferredSearch, page, pageSize, saldoFiltro, vigenteFiltro],
  );

  const summaryQuery = trpc.itens.summary.useQuery(undefined, { retry: false });
  const listQuery = trpc.itens.list.useQuery(filters, { retry: false, placeholderData: (previous) => previous });
  const rows = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, ativoFiltro, vigenteFiltro, saldoFiltro, pageSize]);

  useEffect(() => {
    if (!rows.length) {
      setSelectedItemId(null);
      return;
    }
    if (!selectedItemId || !rows.some((row) => row.id === selectedItemId)) {
      setSelectedItemId(rows[0].id);
    }
  }, [rows, selectedItemId]);

  const detailQuery = trpc.itens.detail.useQuery({ itemId: selectedItemId ?? 0 }, { enabled: Boolean(selectedItemId), retry: false });

  const saveItemMutation = trpc.itens.save.useMutation({
    onSuccess: async (saved) => {
      await Promise.all([utils.itens.summary.invalidate(), utils.itens.list.invalidate(), utils.itens.detail.invalidate()]);
      setSelectedItemId(saved.id);
      setEditingItemId(null);
      setItemForm(initialItemForm);
      setItemErrors({});
      setItemErrorMessage(null);
      setItemMessage(`Item ${saved.id} salvo no catálogo central.`);
    },
    onError: (error) => {
      setItemMessage(null);
      setItemErrorMessage(error.message);
    },
  });

  const toggleItemMutation = trpc.itens.toggleAtivo.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.itens.summary.invalidate(), utils.itens.list.invalidate(), utils.itens.detail.invalidate()]);
    },
    onError: (error) => setItemErrorMessage(error.message),
  });

  const deleteItemMutation = trpc.itens.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.itens.summary.invalidate(), utils.itens.list.invalidate()]);
      setDeleteDialogOpen(false);
      setSelectedItemId(null);
      setItemMessage("Item removido do catálogo.");
    },
    onError: (error) => setItemErrorMessage(error.message),
  });

  const saveControleMutation = trpc.itens.saveContratoControle.useMutation({
    onSuccess: async () => {
      await utils.itens.detail.invalidate();
      setControleDialogOpen(false);
      setEditingControleId(null);
      setControleErrors({});
      setControleErrorMessage(null);
      setControleForm(initialControleForm);
    },
    onError: (error) => setControleErrorMessage(error.message),
  });

  const deleteControleMutation = trpc.itens.deleteContratoControle.useMutation({
    onSuccess: async () => {
      await utils.itens.detail.invalidate();
    },
    onError: (error) => setControleErrorMessage(error.message),
  });

  const selectedItem = detailQuery.data;

  function resetItemForm() {
    setEditingItemId(null);
    setItemForm(initialItemForm);
    setItemErrors({});
    setItemMessage(null);
    setItemErrorMessage(null);
  }

  function startEditingSelectedItem() {
    if (!selectedItem?.item) return;
    setEditingItemId(selectedItem.item.id);
    setItemForm({
      descricao: selectedItem.item.descricao,
      unidadePadrao: selectedItem.item.unidadePadrao,
      valorReferencia: selectedItem.item.valorReferencia ? formatNumberBR(selectedItem.item.valorReferencia, 2) : "",
      ativo: selectedItem.item.ativo,
    });
  }

  function openControleDialog(row?: any) {
    if (!selectedItem?.item) return;
    setEditingControleId(row?.controleSaldoId ?? null);
    setControleForm({
      contratoId: row ? String(row.contratoId) : "",
      descricao: selectedItem.item.descricao,
      unidade: selectedItem.item.unidadePadrao,
      quantidadeContratada: row?.quantidadeContratada ? formatNumberBR(row.quantidadeContratada, 3) : "",
      quantidadeConsumida: row?.quantidadeConsumida ? formatNumberBR(row.quantidadeConsumida, 3) : "0",
      valorUnitario: row?.valorUnitario ? formatNumberBR(row.valorUnitario, 2) : "",
      ativo: row?.ativoControle ?? true,
    });
    setControleErrors({});
    setControleErrorMessage(null);
    setControleDialogOpen(true);
  }

  async function handleSubmitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setItemMessage(null);
    setItemErrorMessage(null);
    const parsed = validateItemForm(itemForm, editingItemId ?? undefined);
    if (!parsed.success) {
      setItemErrors(mapZodFieldErrors(parsed.error));
      setItemErrorMessage("Revise os campos destacados antes de salvar o item.");
      return;
    }
    setItemErrors({});
    await saveItemMutation.mutateAsync(parsed.data);
  }

  async function handleSubmitControle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedItem?.item) return;
    setControleErrorMessage(null);
    const parsed = validateContratoItemForm(controleForm, selectedItem.item.id, editingControleId ?? undefined);
    if (!parsed.success) {
      setControleErrors(mapZodFieldErrors(parsed.error));
      setControleErrorMessage("Revise os campos destacados antes de salvar o controle de saldo.");
      return;
    }
    setControleErrors({});
    await saveControleMutation.mutateAsync(parsed.data);
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Itens" description="Catálogo central com rastreabilidade por processo, contrato, fornecedores e saldo controlado.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Catálogo total", value: summaryQuery.data?.total, icon: Boxes },
            { label: "Ativos", value: summaryQuery.data?.ativos, icon: Boxes },
            { label: "Em processos", value: summaryQuery.data?.emProcessos, icon: ShieldCheck },
            { label: "Contratos vigentes", value: summaryQuery.data?.vigentes, icon: ShieldCheck },
            { label: "Com saldo", value: summaryQuery.data?.comSaldo, icon: ShieldCheck },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.label} className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="inline-flex rounded-2xl bg-slate-950 p-3 text-white"><Icon className="h-4 w-4" /></div>
                <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{card.label}</p>
                {summaryQuery.isLoading ? <Skeleton className="mt-3 h-10 w-20" /> : <p className="mt-3 text-3xl font-black text-slate-950">{card.value ?? 0}</p>}
              </article>
            );
          })}
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <SectionCard
          title="Consulta do catálogo"
          description="Filtre itens ativos, vigentes e com saldo para acompanhar a utilização ao longo dos processos."
          action={
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[220px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar item" className="pl-9" />
              </div>
              <Select value={ativoFiltro} onChange={(event) => setAtivoFiltro(event.target.value as typeof ativoFiltro)} className="max-w-[150px]">
                <option value="">Todos</option>
                <option value="true">Ativos</option>
                <option value="false">Inativos</option>
              </Select>
              <Select value={vigenteFiltro} onChange={(event) => setVigenteFiltro(event.target.value as typeof vigenteFiltro)} className="max-w-[180px]">
                <option value="">Qualquer vigência</option>
                <option value="true">Com vigência</option>
                <option value="false">Sem vigência</option>
              </Select>
              <Select value={saldoFiltro} onChange={(event) => setSaldoFiltro(event.target.value as typeof saldoFiltro)} className="max-w-[160px]">
                <option value="">Qualquer saldo</option>
                <option value="true">Com saldo</option>
                <option value="false">Sem saldo</option>
              </Select>
            </div>
          }
        >
          <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white">
            <Table className="min-w-[860px]">
              <TableHead>
                <tr>
                  <TableHeaderCell>Item</TableHeaderCell>
                  <TableHeaderCell>Unidade</TableHeaderCell>
                  <TableHeaderCell>Processos</TableHeaderCell>
                  <TableHeaderCell>Contratos</TableHeaderCell>
                  <TableHeaderCell>Fornecedores</TableHeaderCell>
                  <TableHeaderCell>Saldo</TableHeaderCell>
                  <TableHeaderCell>Vigência</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {listQuery.isLoading
                  ? Array.from({ length: 5 }).map((_, index) => (
                      <TableRow key={index}>
                        <TableCell colSpan={7}><Skeleton className="h-12 w-full" /></TableCell>
                      </TableRow>
                    ))
                  : rows.map((row) => (
                      <TableRow key={row.id} onClick={() => setSelectedItemId(row.id)} className={row.id === selectedItemId ? "cursor-pointer bg-sky-50/80" : "cursor-pointer transition hover:bg-slate-50"}>
                        <TableCell>
                          <div className="font-bold text-slate-950">{row.descricao}</div>
                          <div className="text-xs text-slate-500">Ref.: {row.valorReferencia ? formatCurrencyBRL(row.valorReferencia) : "Não informada"}</div>
                        </TableCell>
                        <TableCell>{row.unidadePadrao}</TableCell>
                        <TableCell>{row.totalProcessos}</TableCell>
                        <TableCell>{row.totalContratos}</TableCell>
                        <TableCell>{row.totalFornecedores}</TableCell>
                        <TableCell>{row.saldoControlado ? formatNumberBR(row.saldoTotal, 3) : "Não controlado"}</TableCell>
                        <TableCell>{row.vigente ? "Vigente" : "Sem vigência"}</TableCell>
                      </TableRow>
                    ))}
                {!listQuery.isLoading && !rows.length ? <TableRow><TableCell colSpan={7} className="text-center text-slate-500">Nenhum item encontrado.</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">Exibindo <span className="font-bold text-slate-950">{rows.length}</span> de <span className="font-bold text-slate-950">{total}</span> itens.</p>
            <div className="flex items-center gap-3">
              <Select value={String(pageSize)} onChange={(event) => setPageSize(Number(event.target.value))} className="max-w-[140px]">
                {[10, 20, 40].map((option) => <option key={option} value={option}>{option} por página</option>)}
              </Select>
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard
            title="Painel do item"
            description="Rastreabilidade, contratos relacionados e operações de manutenção do cadastro."
            action={selectedItem?.item ? <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={startEditingSelectedItem}><PencilLine className="h-4 w-4" />Editar</Button><Button variant={selectedItem.item.ativo ? "secondary" : "default"} size="sm" onClick={() => toggleItemMutation.mutate({ itemId: selectedItem.item.id, ativo: !selectedItem.item.ativo })}>{selectedItem.item.ativo ? "Desativar" : "Reativar"}</Button><Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}><Trash2 className="h-4 w-4" />Excluir</Button></div> : null}
          >
            {!selectedItemId ? (
              <Alert variant="info">Selecione um item para visualizar a rastreabilidade.</Alert>
            ) : detailQuery.isLoading ? (
              <div className="space-y-3">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-20" />)}</div>
            ) : detailQuery.error ? (
              <Alert variant="error">Falha ao carregar o detalhe do item selecionado.</Alert>
            ) : !selectedItem ? (
              <Alert variant="warning">O item selecionado não foi encontrado.</Alert>
            ) : (
              <div className="space-y-4">
                <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-xl font-black text-slate-950">{selectedItem.item.descricao}</div>
                  <div className="mt-2 text-sm text-slate-600">Unidade padrão: <span className="font-semibold text-slate-950">{selectedItem.item.unidadePadrao}</span></div>
                </article>
                <div className="grid gap-3 sm:grid-cols-2">
                  <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Processos</p><p className="mt-2 text-2xl font-black text-slate-950">{selectedItem.metrics.totalProcessos}</p></article>
                  <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Saldo total</p><p className="mt-2 text-2xl font-black text-slate-950">{selectedItem.metrics.saldoControlado ? formatNumberBR(selectedItem.metrics.saldoTotal, 3) : "-"}</p></article>
                </div>
                <div className="flex justify-end"><Button size="sm" onClick={() => openControleDialog()}>Controlar saldo por contrato</Button></div>
                <div className="overflow-x-auto rounded-[24px] border border-slate-200 bg-white">
                  <Table className="min-w-[700px]">
                    <TableHead><tr><TableHeaderCell>Contrato</TableHeaderCell><TableHeaderCell>Fornecedor</TableHeaderCell><TableHeaderCell>Vigência</TableHeaderCell><TableHeaderCell>Saldo</TableHeaderCell><TableHeaderCell>Ações</TableHeaderCell></tr></TableHead>
                    <TableBody>
                      {selectedItem.contratos.map((row) => (
                        <TableRow key={`${row.contratoId}-${row.controleSaldoId ?? "base"}`}>
                          <TableCell><div className="font-semibold text-slate-950">{row.numeroContrato}</div><div className="text-xs text-slate-500">{row.processoNumeroSirel}</div></TableCell>
                          <TableCell>{row.fornecedor ?? "Sem fornecedor"}</TableCell>
                          <TableCell>{row.dataVigenciaInicio ? `${formatShortDateBR(row.dataVigenciaInicio)} a ${formatShortDateBR(row.dataVigenciaFim)}` : "Não informada"}</TableCell>
                          <TableCell>{row.saldoAtual === null ? "Não controlado" : formatNumberBR(row.saldoAtual, 3)}</TableCell>
                          <TableCell><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => openControleDialog(row)}>{row.controleSaldoId ? "Editar saldo" : "Vincular saldo"}</Button>{row.controleSaldoId ? <Button variant="destructive" size="sm" onClick={() => deleteControleMutation.mutate({ contratoItemId: row.controleSaldoId!, itemId: selectedItem.item.id })}>Remover</Button> : null}</div></TableCell>
                        </TableRow>
                      ))}
                      {!selectedItem.contratos.length ? <TableRow><TableCell colSpan={5} className="text-center text-slate-500">Ainda não há contratos relacionados a este item.</TableCell></TableRow> : null}
                    </TableBody>
                  </Table>
                </div>
                <div className="overflow-x-auto rounded-[24px] border border-slate-200 bg-white">
                  <Table className="min-w-[760px]">
                    <TableHead><tr><TableHeaderCell>Processo</TableHeaderCell><TableHeaderCell>Secretaria</TableHeaderCell><TableHeaderCell>Quantidade</TableHeaderCell><TableHeaderCell>Workflow</TableHeaderCell><TableHeaderCell>Parado há</TableHeaderCell></tr></TableHead>
                    <TableBody>
                      {selectedItem.processos.map((row) => (
                        <TableRow key={row.itemProcessoId}>
                          <TableCell><div className="font-semibold text-slate-950">{row.numeroSirel}</div><div className="text-xs text-slate-500">Item {row.numeroItem}</div></TableCell>
                          <TableCell>{row.secretaria}</TableCell>
                          <TableCell>{formatNumberBR(row.quantidade, 3)} {row.unidade}</TableCell>
                          <TableCell><div className="font-semibold text-slate-950">{row.moduloAtual ?? "Sem workflow"}</div><div className="text-xs text-slate-500">{row.etapaAtual ?? "Sem etapa"}</div></TableCell>
                          <TableCell>{row.diasParado} dia(s)</TableCell>
                        </TableRow>
                      ))}
                      {!selectedItem.processos.length ? <TableRow><TableCell colSpan={5} className="text-center text-slate-500">Este item ainda não está vinculado a processos.</TableCell></TableRow> : null}
                    </TableBody>
                  </Table>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <SectionCard title="Fornecedores" description="Base consolidada das pesquisas relacionadas ao item.">
                    <div className="space-y-3">
                      {selectedItem.fornecedores.map((row) => <article key={`${row.documento ?? row.nome}-${row.origem}`} className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="font-semibold text-slate-950">{row.nome}</div><div className="text-xs text-slate-500">{row.documento ?? "Sem documento informado"} | {row.origem}</div><div className="mt-2 text-xs text-slate-500">Ocorrências: {row.totalOcorrencias} | Última referência: {formatShortDateBR(row.ultimaReferencia)}</div></article>)}
                      {!selectedItem.fornecedores.length ? <Alert variant="info">Nenhum fornecedor identificado até o momento.</Alert> : null}
                    </div>
                  </SectionCard>
                  <SectionCard title="Rastreabilidade recente" description="Últimas movimentações dos processos que utilizam este item.">
                    <div className="space-y-3">
                      {selectedItem.rastreabilidade.map((row) => <article key={row.id} className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="font-semibold text-slate-950">{row.numeroSirel}</div><div className="text-sm text-slate-600">{row.descricao}</div><div className="mt-2 text-xs text-slate-500">{row.moduloDestino} | {formatShortDateTimeBR(row.criadoEm)}</div></article>)}
                      {!selectedItem.rastreabilidade.length ? <Alert variant="info">Sem movimentações recentes para este item.</Alert> : null}
                    </div>
                  </SectionCard>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title={editingItemId ? "Editar item do catálogo" : "Novo item do catálogo"} description="Cadastro mestre reutilizado em processos, contratos e rotinas administrativas.">
            <form className="space-y-4" onSubmit={handleSubmitItem}>
              <FormField label="Descrição" error={itemErrors.descricao}>
                <Textarea rows={4} value={itemForm.descricao} error={Boolean(itemErrors.descricao)} onChange={(event) => setItemForm((current) => ({ ...current, descricao: event.target.value }))} />
              </FormField>
              <div className="grid gap-3 md:grid-cols-3">
                <FormField label="Unidade padrão" error={itemErrors.unidadePadrao}>
                  <Input value={itemForm.unidadePadrao} error={Boolean(itemErrors.unidadePadrao)} onChange={(event) => setItemForm((current) => ({ ...current, unidadePadrao: event.target.value.toUpperCase() }))} />
                </FormField>
                <FormField label="Valor de referência" error={itemErrors.valorReferencia}>
                  <Input value={itemForm.valorReferencia} error={Boolean(itemErrors.valorReferencia)} placeholder="0,00" onChange={(event) => setItemForm((current) => ({ ...current, valorReferencia: event.target.value }))} />
                </FormField>
                <FormField label="Situação">
                  <Select value={itemForm.ativo ? "true" : "false"} onChange={(event) => setItemForm((current) => ({ ...current, ativo: event.target.value === "true" }))}>
                    <option value="true">Ativo</option>
                    <option value="false">Inativo</option>
                  </Select>
                </FormField>
              </div>
              {itemMessage ? <Alert variant="success">{itemMessage}</Alert> : null}
              {itemErrorMessage ? <Alert variant="error">{itemErrorMessage}</Alert> : null}
              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={saveItemMutation.isPending}>{saveItemMutation.isPending ? "Salvando item..." : editingItemId ? "Salvar alterações" : "Cadastrar item"}</Button>
                <Button type="button" variant="outline" onClick={resetItemForm}>Limpar formulário</Button>
              </div>
            </form>
          </SectionCard>
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} onConfirm={() => selectedItem?.item && deleteItemMutation.mutate({ itemId: selectedItem.item.id })} title="Excluir item do catálogo" description="A exclusão só é permitida quando o item ainda não tem rastreabilidade em processos ou contratos." confirmLabel="Excluir item" loading={deleteItemMutation.isPending}>
        <p className="text-sm text-slate-600">Se este item já estiver em uso, o sistema bloqueará a exclusão e recomendará a desativação.</p>
      </AlertDialog>

      <AlertDialog
        open={controleDialogOpen}
        onClose={() => { setControleDialogOpen(false); setEditingControleId(null); setControleErrors({}); setControleErrorMessage(null); }}
        onConfirm={() => { const form = document.getElementById("form-controle-item") as HTMLFormElement | null; form?.requestSubmit(); }}
        title={editingControleId ? "Editar controle de saldo" : "Controlar saldo por contrato"}
        description="Registre quantidade contratada, consumo atual e valor unitário do item neste contrato."
        confirmLabel={editingControleId ? "Salvar controle" : "Criar controle"}
        confirmVariant="default"
        loading={saveControleMutation.isPending}
      >
        <form id="form-controle-item" className="space-y-4" onSubmit={handleSubmitControle}>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Contrato" error={controleErrors.contratoId}>
              <Select value={controleForm.contratoId} error={Boolean(controleErrors.contratoId)} onChange={(event) => setControleForm((current) => ({ ...current, contratoId: event.target.value }))}>
                <option value="">Selecione</option>
                {selectedItem?.contratosDisponiveis.map((row) => <option key={row.id} value={row.id}>{row.numeroContrato} - {row.processoNumeroSirel}</option>)}
              </Select>
            </FormField>
            <FormField label="Unidade" error={controleErrors.unidade}>
              <Input value={controleForm.unidade} error={Boolean(controleErrors.unidade)} onChange={(event) => setControleForm((current) => ({ ...current, unidade: event.target.value.toUpperCase() }))} />
            </FormField>
          </div>
          <FormField label="Descrição do controle" error={controleErrors.descricao}>
            <Textarea rows={3} value={controleForm.descricao} error={Boolean(controleErrors.descricao)} onChange={(event) => setControleForm((current) => ({ ...current, descricao: event.target.value }))} />
          </FormField>
          <div className="grid gap-3 md:grid-cols-3">
            <FormField label="Quantidade contratada" error={controleErrors.quantidadeContratada}>
              <Input value={controleForm.quantidadeContratada} error={Boolean(controleErrors.quantidadeContratada)} onChange={(event) => setControleForm((current) => ({ ...current, quantidadeContratada: event.target.value }))} />
            </FormField>
            <FormField label="Quantidade consumida" error={controleErrors.quantidadeConsumida}>
              <Input value={controleForm.quantidadeConsumida} error={Boolean(controleErrors.quantidadeConsumida)} onChange={(event) => setControleForm((current) => ({ ...current, quantidadeConsumida: event.target.value }))} />
            </FormField>
            <FormField label="Valor unitário" error={controleErrors.valorUnitario}>
              <Input value={controleForm.valorUnitario} error={Boolean(controleErrors.valorUnitario)} placeholder="0,00" onChange={(event) => setControleForm((current) => ({ ...current, valorUnitario: event.target.value }))} />
            </FormField>
          </div>
          {controleErrorMessage ? <Alert variant="error">{controleErrorMessage}</Alert> : null}
        </form>
      </AlertDialog>
    </div>
  );
}

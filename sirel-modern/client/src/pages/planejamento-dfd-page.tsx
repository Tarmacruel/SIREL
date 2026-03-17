
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Building2, ChevronLeft, ChevronRight, ClipboardList, FilePenLine, PackagePlus, Plus, Search, ShoppingCart, Trash2, Users2 } from "lucide-react";
import { useLocation } from "wouter";

import { Modal } from "@/components/shared/modal";
import { SectionCard } from "@/components/shared/section-card";
import { trpc } from "@/lib/trpc";

interface PlanejamentoDfdPageProps {
  processoId: number;
}

interface CatalogCartItem {
  catalogoItemId: number;
  descricao: string;
  quantidade: string;
  unidade: string;
  valorUnitarioEstimado: string;
}

const initialDfdForm = {
  setorDemandante: "",
  grauPrioridade: "MEDIA",
  demandaSistemica: false,
  secretariasParticipantes: [] as number[],
  justificativa: "",
  observacoes: "",
  responsavelIds: [] as number[],
  dataNecessidade: "",
  dataPrevistaConclusao: "",
  concluir: false,
};

const initialCatalogItemForm = {
  descricao: "",
  unidadePadrao: "UN",
  valorReferencia: "",
};

const initialEditItemForm = {
  itemId: "",
  descricao: "",
  quantidade: "1",
  unidade: "UN",
  valorUnitarioEstimado: "",
};

function toggleNumberInArray(list: number[], value: number) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function parseOptionalDecimal(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatMoney(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parsed) : "-";
}

function findSecretariaAdministracao(secretarias: Array<{ id: number; nome: string; sigla: string }>) {
  return secretarias.find((item) => item.nome.toUpperCase().includes("ADMINISTRA") || item.sigla.toUpperCase().includes("ADM")) ?? null;
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
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogCart, setCatalogCart] = useState<CatalogCartItem[]>([]);
  const [form, setForm] = useState(initialDfdForm);
  const [newCatalogItemForm, setNewCatalogItemForm] = useState(initialCatalogItemForm);
  const [editItemForm, setEditItemForm] = useState(initialEditItemForm);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [itemMessage, setItemMessage] = useState<string | null>(null);
  const [itemErrorMessage, setItemErrorMessage] = useState<string | null>(null);
  const dadosSectionRef = useRef<HTMLElement | null>(null);
  const itensSectionRef = useRef<HTMLElement | null>(null);

  const catalogListQuery = trpc.planejamento.catalogList.useQuery({ search: catalogSearch.trim() || undefined }, { retry: false, enabled: openCatalogModal, placeholderData: (previous) => previous });

  useEffect(() => {
    const detail = detailQuery.data;
    if (!detail) return;
    setForm({
      setorDemandante: detail.dfd?.setorDemandante ?? detail.processo.secretaria,
      grauPrioridade: detail.dfd?.grauPrioridade ?? "MEDIA",
      demandaSistemica: detail.dfd?.demandaSistemica ?? false,
      secretariasParticipantes: detail.dfd?.secretariasParticipantes?.map((item) => item.id) ?? [],
      justificativa: detail.dfd?.justificativa ?? "",
      observacoes: detail.dfd?.observacoes ?? "",
      responsavelIds: detail.dfd?.responsaveis?.map((item) => item.id) ?? [],
      dataNecessidade: detail.dfd?.dataNecessidade ?? "",
      dataPrevistaConclusao: detail.dfd?.dataPrevistaConclusao ?? "",
      concluir: detail.dfd?.concluido ?? false,
    });
    setCatalogCart([]);
  }, [detailQuery.data]);

  const saveMutation = trpc.planejamento.saveDfd.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.planejamento.list.invalidate(),
        utils.planejamento.detail.invalidate({ processoId }),
        utils.workflow.byProcesso.invalidate({ processoId }),
        utils.processos.overview.invalidate({ processoId }),
      ]);
      setErrorMessage(null);
      setMessage(form.concluir ? "DFD salva e marcada como concluida." : "DFD salva em elaboracao.");
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
      setCatalogCart((current) => current.some((item) => item.catalogoItemId === created.id) ? current : [...current, { catalogoItemId: created.id, descricao: created.descricao, quantidade: "1", unidade: created.unidadePadrao, valorUnitarioEstimado: created.valorReferencia ? String(created.valorReferencia).replace(".", ",") : "" }]);
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
      setItemMessage("Itens adicionados a DFD com sucesso.");
    },
    onError: (error) => {
      setItemMessage(null);
      setItemErrorMessage(error.message);
    },
  });

  const saveItemMutation = trpc.planejamento.saveItem.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.planejamento.list.invalidate(),
        utils.planejamento.detail.invalidate({ processoId }),
      ]);
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
      await Promise.all([
        utils.planejamento.list.invalidate(),
        utils.planejamento.detail.invalidate({ processoId }),
      ]);
      setItemMessage("Item removido com sucesso.");
      setItemErrorMessage(null);
    },
    onError: (error) => {
      setItemMessage(null);
      setItemErrorMessage(error.message);
    },
  });

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setErrorMessage(null);

    await saveMutation.mutateAsync({
      processoId,
      setorDemandante: form.setorDemandante.trim(),
      grauPrioridade: form.grauPrioridade as "BAIXA" | "MEDIA" | "ALTA" | "URGENTE",
      demandaSistemica: form.demandaSistemica,
      secretariasParticipantes: form.secretariasParticipantes,
      justificativa: form.justificativa.trim(),
      observacoes: form.observacoes.trim() || undefined,
      responsavelIds: form.responsavelIds,
      dataNecessidade: form.dataNecessidade,
      dataPrevistaConclusao: form.dataPrevistaConclusao,
      concluir: form.concluir,
    });
  }

  async function handleAddCatalogItems() {
    if (!catalogCart.length) return;
    setItemMessage(null);
    setItemErrorMessage(null);

    await addCatalogItemsMutation.mutateAsync({
      processoId,
      itens: catalogCart.map((item) => ({
        catalogoItemId: item.catalogoItemId,
        quantidade: Number(item.quantidade.replace(",", ".")),
        unidade: item.unidade.trim(),
        valorUnitarioEstimado: parseOptionalDecimal(item.valorUnitarioEstimado),
      })),
    });
  }

  async function handleCreateCatalogItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createCatalogItemMutation.mutateAsync({
      descricao: newCatalogItemForm.descricao.trim(),
      unidadePadrao: newCatalogItemForm.unidadePadrao.trim(),
      valorReferencia: parseOptionalDecimal(newCatalogItemForm.valorReferencia),
    });
  }

  async function handleSaveEditedItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveItemMutation.mutateAsync({
      processoId,
      itemId: Number(editItemForm.itemId),
      descricao: editItemForm.descricao.trim(),
      quantidade: Number(editItemForm.quantidade.replace(",", ".")),
      unidade: editItemForm.unidade.trim(),
      valorUnitarioEstimado: parseOptionalDecimal(editItemForm.valorUnitarioEstimado),
    });
  }

  function toggleCatalogItem(item: { id: number; descricao: string; unidadePadrao: string; valorReferencia: string | null }) {
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
          valorUnitarioEstimado: item.valorReferencia ? String(item.valorReferencia).replace(".", ",") : "",
        },
      ];
    });
  }

  const detalhe = detailQuery.data;
  const itens = detalhe?.itens ?? [];
  const catalogItems = catalogListQuery.data ?? [];
  const solicitanteNome = detalhe?.dfd?.solicitante?.name ?? authQuery.data?.user.name ?? "Sera registrado ao salvar";
  const adminSecretaria = findSecretariaAdministracao(catalogQuery.data?.secretarias ?? []);
  const secretariaResponsavel = detalhe?.dfd?.secretariaResponsavel?.nome ?? (form.demandaSistemica ? adminSecretaria?.nome ?? "Secretaria de Administracao" : detalhe?.processo.secretaria ?? "-");
  const totalCarrinho = catalogCart.reduce((acc, item) => {
    const valor = parseOptionalDecimal(item.valorUnitarioEstimado) ?? 0;
    const quantidade = Number(item.quantidade.replace(",", ".")) || 0;
    return acc + valor * quantidade;
  }, 0);

  if (detailQuery.isLoading) {
    return <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">Carregando DFD...</div>;
  }

  if (detailQuery.error || !detalhe) {
    return <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 shadow-sm">Falha ao carregar o processo selecionado no Planejamento.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Planejamento</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">DFD do processo {detalhe.processo.numeroSirel}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Tela especifica da DFD, com dados gerais, seletores em modal e catalogo de itens em estilo carrinho.</p>
        </div>
        <button type="button" onClick={() => setLocation("/planejamento")} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700">
          <ArrowLeft className="h-4 w-4" />
          Voltar ao Planejamento
        </button>
      </div>

      <div className={["grid gap-6", navCollapsed ? "xl:grid-cols-[92px_1fr]" : "xl:grid-cols-[220px_1fr]"].join(" ")}>
        <aside className="rounded-[28px] border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            {!navCollapsed ? <p className="pl-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Navegacao</p> : null}
            <button type="button" onClick={() => setNavCollapsed((current) => !current)} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
              {navCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-3 space-y-2">
            <button type="button" onClick={() => dadosSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} className={["flex w-full items-center rounded-2xl border border-slate-200 bg-slate-50 text-left text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-800", navCollapsed ? "justify-center px-3 py-3" : "gap-3 px-4 py-3"].join(" ")}><ClipboardList className="h-4 w-4 shrink-0" />{!navCollapsed ? <span>Dados da DFD</span> : null}</button>
            <button type="button" onClick={() => itensSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} className={["flex w-full items-center rounded-2xl border border-slate-200 bg-slate-50 text-left text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-800", navCollapsed ? "justify-center px-3 py-3" : "gap-3 px-4 py-3"].join(" ")}><PackagePlus className="h-4 w-4 shrink-0" />{!navCollapsed ? <span>Itens da DFD</span> : null}</button>
            <button type="button" onClick={() => deleteDfdMutation.mutate({ processoId })} disabled={deleteDfdMutation.isPending || !detalhe.dfd} className={["flex w-full items-center rounded-2xl border border-rose-200 bg-rose-50 text-left text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-50", navCollapsed ? "justify-center px-3 py-3" : "gap-3 px-4 py-3"].join(" ")}><Trash2 className="h-4 w-4 shrink-0" />{!navCollapsed ? <span>Excluir DFD</span> : null}</button>
          </div>
        </aside>

        <div className="space-y-6">
          <section ref={dadosSectionRef} className="space-y-6">
            <SectionCard title="Dados da DFD" description="Preenchimento principal da demanda, com seletores em modal e regras automaticas de secretaria responsavel.">
              <div className="space-y-4">
                <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Processo selecionado</p>
                      <h4 className="mt-2 text-xl font-black text-slate-950">{detalhe.processo.numeroSirel}</h4>
                      <p className="mt-1 text-sm text-slate-600">{detalhe.processo.secretaria}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-950 p-3 text-white"><FilePenLine className="h-5 w-5" /></div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{detalhe.processo.objeto}</p>
                </article>

                <form className="space-y-4" onSubmit={handleSave}>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Solicitante</span><input value={solicitanteNome} disabled className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none" /></label>
                    <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Secretaria responsavel</span><input value={secretariaResponsavel} disabled className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none" /></label>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Setor demandante</span><input value={form.setorDemandante} onChange={(event) => setForm((current) => ({ ...current, setorDemandante: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400" /></label>
                    <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Grau de prioridade</span><select value={form.grauPrioridade} onChange={(event) => setForm((current) => ({ ...current, grauPrioridade: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400">{catalogQuery.data?.grauPrioridade.map((item) => <option key={item.codigo} value={item.codigo}>{item.nome}</option>)}</select></label>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Data da necessidade</span><input type="date" value={form.dataNecessidade} onChange={(event) => setForm((current) => ({ ...current, dataNecessidade: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400" /></label>
                    <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Data prevista para conclusao</span><input type="date" value={form.dataPrevistaConclusao} onChange={(event) => setForm((current) => ({ ...current, dataPrevistaConclusao: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400" /></label>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <label className="flex items-start gap-3">
                      <input type="checkbox" checked={form.demandaSistemica} onChange={(event) => setForm((current) => ({ ...current, demandaSistemica: event.target.checked, secretariasParticipantes: event.target.checked ? current.secretariasParticipantes : [] }))} className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                      <span className="space-y-1">
                        <span className="block text-sm font-semibold text-slate-800">Demanda sistemica</span>
                        <span className="block text-sm text-slate-600">Quando marcada, a Secretaria de Administracao assume a responsabilidade e as participantes sao escolhidas em modal.</span>
                      </span>
                    </label>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-3xl border border-slate-200 bg-white px-4 py-4">
                      <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Building2 className="h-4 w-4 text-sky-700" />Secretarias participantes</div><button type="button" onClick={() => setOpenSecretariasModal(true)} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700">Selecionar</button></div>
                      <div className="mt-3 flex flex-wrap gap-2">{form.secretariasParticipantes.length ? catalogQuery.data?.secretarias.filter((item) => form.secretariasParticipantes.includes(item.id)).map((item) => <span key={item.id} className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-800">{item.sigla}</span>) : <span className="text-sm text-slate-500">Nenhuma secretaria participante selecionada.</span>}</div>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-white px-4 py-4">
                      <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Users2 className="h-4 w-4 text-sky-700" />Responsaveis pela DFD</div><button type="button" onClick={() => setOpenResponsaveisModal(true)} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700">Selecionar</button></div>
                      <div className="mt-3 flex flex-wrap gap-2">{form.responsavelIds.length ? catalogQuery.data?.pessoas.filter((item) => form.responsavelIds.includes(item.id)).map((item) => <span key={item.id} className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{item.nome}</span>) : <span className="text-sm text-slate-500">Nenhum responsavel selecionado.</span>}</div>
                    </div>
                  </div>

                  <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Justificativa</span><textarea rows={6} value={form.justificativa} onChange={(event) => setForm((current) => ({ ...current, justificativa: event.target.value }))} className="w-full rounded-3xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 outline-none transition focus:border-sky-400" /></label>
                  <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Observacoes</span><textarea rows={4} value={form.observacoes} onChange={(event) => setForm((current) => ({ ...current, observacoes: event.target.value }))} className="w-full rounded-3xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 outline-none transition focus:border-sky-400" /></label>
                  <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={form.concluir} onChange={(event) => setForm((current) => ({ ...current, concluir: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />Marcar DFD como concluida</label>

                  {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div> : null}
                  {errorMessage ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{errorMessage}</div> : null}

                  <div className="flex flex-wrap gap-3">
                    <button type="submit" disabled={saveMutation.isPending} className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">{saveMutation.isPending ? "Salvando DFD..." : "Salvar DFD"}</button>
                    {detalhe.dfd ? <button type="button" onClick={() => deleteDfdMutation.mutate({ processoId })} disabled={deleteDfdMutation.isPending} className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-50">Excluir DFD</button> : null}
                  </div>
                </form>
              </div>
            </SectionCard>
          </section>

          <section ref={itensSectionRef} className="space-y-6">
            <SectionCard title="Selecao de itens da DFD" description="Escolha os itens a partir do catalogo do sistema. O carrinho permite conferir tudo antes da incorporacao ao processo." action={<button type="button" onClick={() => setOpenCatalogModal(true)} disabled={!detalhe.dfd} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"><ShoppingCart className="h-4 w-4" />Abrir catalogo</button>}>
              {!detalhe.dfd ? (
                <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">Salve a DFD primeiro. Depois disso os itens poderao ser escolhidos a partir do catalogo do sistema.</div>
              ) : (
                <div className="space-y-4">
                  {itemMessage ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{itemMessage}</div> : null}
                  {itemErrorMessage ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{itemErrorMessage}</div> : null}
                  <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500"><tr><th className="px-4 py-3">Item</th><th className="px-4 py-3">Qtd/Und</th><th className="px-4 py-3">Valor</th><th className="px-4 py-3 text-right">Acoes</th></tr></thead>
                      <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                        {itens.map((item) => (
                          <tr key={item.id}>
                            <td className="px-4 py-3 align-top"><div className="font-bold text-slate-950">Item {item.numeroItem}</div><div className="text-xs text-slate-500">{item.descricao}</div></td>
                            <td className="px-4 py-3 align-top">{item.quantidade} {item.unidade}</td>
                            <td className="px-4 py-3 align-top"><div>{formatMoney(item.valorUnitarioEstimado)}</div><div className="text-xs text-slate-500">Total: {formatMoney(item.valorTotalEstimado)}</div></td>
                            <td className="px-4 py-3 align-top"><div className="flex justify-end gap-2"><button type="button" onClick={() => { setEditItemForm({ itemId: String(item.id), descricao: item.descricao, quantidade: String(item.quantidade), unidade: item.unidade, valorUnitarioEstimado: item.valorUnitarioEstimado ? String(item.valorUnitarioEstimado).replace(".", ",") : "" }); setOpenEditItemModal(true); }} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700">Editar</button><button type="button" onClick={() => deleteItemMutation.mutate({ processoId, itemId: item.id })} disabled={deleteItemMutation.isPending} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />Remover</button></div></td>
                          </tr>
                        ))}
                        {!itens.length ? <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={4}>Nenhum item cadastrado ainda para esta DFD.</td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </SectionCard>
          </section>
        </div>
      </div>

      <Modal open={openSecretariasModal} onClose={() => setOpenSecretariasModal(false)} title="Secretarias participantes" description="Selecione as secretarias que participam da demanda sistemica." actions={<div className="flex justify-end"><button type="button" onClick={() => setOpenSecretariasModal(false)} className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">Concluir selecao</button></div>}>
        <div className="grid gap-3 md:grid-cols-2">{catalogQuery.data?.secretarias.map((item) => { const selected = form.secretariasParticipantes.includes(item.id); return <label key={item.id} className={["flex items-start gap-3 rounded-2xl border px-4 py-4 text-sm transition", selected ? "border-sky-300 bg-sky-50 text-sky-900" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"].join(" ")}><input type="checkbox" checked={selected} onChange={() => setForm((current) => ({ ...current, secretariasParticipantes: toggleNumberInArray(current.secretariasParticipantes, item.id) }))} className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" /><span><span className="block font-semibold">{item.sigla}</span><span className="block text-xs text-slate-500">{item.nome}</span></span></label>; })}</div>
      </Modal>

      <Modal open={openResponsaveisModal} onClose={() => setOpenResponsaveisModal(false)} title="Responsaveis pela DFD" description="Selecione um ou mais responsaveis para a elaboracao da DFD." actions={<div className="flex justify-end"><button type="button" onClick={() => setOpenResponsaveisModal(false)} className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">Concluir selecao</button></div>}>
        <div className="grid gap-3 md:grid-cols-2">{catalogQuery.data?.pessoas.map((item) => { const selected = form.responsavelIds.includes(item.id); return <label key={item.id} className={["flex items-start gap-3 rounded-2xl border px-4 py-4 text-sm transition", selected ? "border-sky-300 bg-sky-50 text-sky-900" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"].join(" ")}><input type="checkbox" checked={selected} onChange={() => setForm((current) => ({ ...current, responsavelIds: toggleNumberInArray(current.responsavelIds, item.id) }))} className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" /><span><span className="block font-semibold">{item.nome}</span><span className="block text-xs text-slate-500">{item.cargo ?? "Cargo nao informado"}</span></span></label>; })}</div>
      </Modal>

      <Modal open={openCatalogModal} onClose={() => setOpenCatalogModal(false)} title="Catalogo de itens" description="Selecione os itens existentes, confira no carrinho e so depois incorpore tudo a DFD." size="xl" actions={<div className="flex flex-wrap items-center justify-between gap-3"><div className="text-sm font-semibold text-slate-700">Total previsto do carrinho: <span className="text-slate-950">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalCarrinho)}</span></div><div className="flex gap-3"><button type="button" onClick={() => setOpenNewCatalogItemModal(true)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700"><Plus className="h-4 w-4" />Novo item</button><button type="button" onClick={handleAddCatalogItems} disabled={addCatalogItemsMutation.isPending || !catalogCart.length} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"><ShoppingCart className="h-4 w-4" />{addCatalogItemsMutation.isPending ? "Adicionando..." : "Adicionar carrinho a DFD"}</button></div></div>}>
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2"><Search className="h-4 w-4 text-slate-400" /><input value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Buscar item no catalogo" className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" /></label>
            <div className="space-y-3">{catalogItems.map((item) => { const selected = catalogCart.some((cartItem) => cartItem.catalogoItemId === item.id); return <button key={item.id} type="button" onClick={() => toggleCatalogItem(item)} className={["flex w-full items-start justify-between gap-4 rounded-3xl border px-4 py-4 text-left transition", selected ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white hover:border-slate-300"].join(" ")}><div><p className="font-semibold text-slate-950">{item.descricao}</p><p className="mt-1 text-xs text-slate-500">Unidade padrao: {item.unidadePadrao}</p></div><span className={["inline-flex rounded-full px-3 py-1 text-xs font-bold", selected ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-700"].join(" ")}>{selected ? "No carrinho" : "Selecionar"}</span></button>; })}{!catalogItems.length ? <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">Nenhum item encontrado no catalogo.</div> : null}</div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><ShoppingCart className="h-4 w-4 text-sky-700" />Carrinho de itens</div>
            {catalogCart.length ? catalogCart.map((item) => <div key={item.catalogoItemId} className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-950">{item.descricao}</p><p className="mt-1 text-xs text-slate-500">Catalogo #{item.catalogoItemId}</p></div><button type="button" onClick={() => setCatalogCart((current) => current.filter((cartItem) => cartItem.catalogoItemId !== item.catalogoItemId))} className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">Remover</button></div><div className="mt-3 grid gap-3 md:grid-cols-3"><label className="space-y-1 text-xs font-semibold text-slate-600"><span>Quantidade</span><input value={item.quantidade} onChange={(event) => setCatalogCart((current) => current.map((cartItem) => cartItem.catalogoItemId === item.catalogoItemId ? { ...cartItem, quantidade: event.target.value } : cartItem))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none" /></label><label className="space-y-1 text-xs font-semibold text-slate-600"><span>Unidade</span><input value={item.unidade} onChange={(event) => setCatalogCart((current) => current.map((cartItem) => cartItem.catalogoItemId === item.catalogoItemId ? { ...cartItem, unidade: event.target.value } : cartItem))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none" /></label><label className="space-y-1 text-xs font-semibold text-slate-600"><span>Valor unitario</span><input value={item.valorUnitarioEstimado} onChange={(event) => setCatalogCart((current) => current.map((cartItem) => cartItem.catalogoItemId === item.catalogoItemId ? { ...cartItem, valorUnitarioEstimado: event.target.value } : cartItem))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none" /></label></div></div>) : <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">Nenhum item selecionado ainda. Monte o carrinho e confirme antes de adicionar.</div>}
          </div>
        </div>
      </Modal>

      <Modal open={openNewCatalogItemModal} onClose={() => setOpenNewCatalogItemModal(false)} title="Novo item no catalogo" description="Cadastre um item para uso futuro no Planejamento." actions={null} size="md">
        <form className="space-y-4" onSubmit={handleCreateCatalogItem}><label className="space-y-2 text-sm font-semibold text-slate-700"><span>Descricao</span><textarea rows={4} value={newCatalogItemForm.descricao} onChange={(event) => setNewCatalogItemForm((current) => ({ ...current, descricao: event.target.value }))} className="w-full rounded-3xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 outline-none" /></label><div className="grid gap-3 md:grid-cols-2"><label className="space-y-2 text-sm font-semibold text-slate-700"><span>Unidade padrao</span><input value={newCatalogItemForm.unidadePadrao} onChange={(event) => setNewCatalogItemForm((current) => ({ ...current, unidadePadrao: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none" /></label><label className="space-y-2 text-sm font-semibold text-slate-700"><span>Valor referencia</span><input value={newCatalogItemForm.valorReferencia} onChange={(event) => setNewCatalogItemForm((current) => ({ ...current, valorReferencia: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none" /></label></div><div className="flex justify-end gap-3"><button type="button" onClick={() => setOpenNewCatalogItemModal(false)} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">Cancelar</button><button type="submit" disabled={createCatalogItemMutation.isPending} className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">{createCatalogItemMutation.isPending ? "Salvando..." : "Salvar item"}</button></div></form>
      </Modal>

      <Modal open={openEditItemModal} onClose={() => setOpenEditItemModal(false)} title="Editar item da DFD" description="Ajuste quantidade, unidade, valor ou descricao do item ja incorporado ao processo." size="md">
        <form className="space-y-4" onSubmit={handleSaveEditedItem}><label className="space-y-2 text-sm font-semibold text-slate-700"><span>Descricao</span><textarea rows={4} value={editItemForm.descricao} onChange={(event) => setEditItemForm((current) => ({ ...current, descricao: event.target.value }))} className="w-full rounded-3xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 outline-none" /></label><div className="grid gap-3 md:grid-cols-3"><label className="space-y-2 text-sm font-semibold text-slate-700"><span>Quantidade</span><input value={editItemForm.quantidade} onChange={(event) => setEditItemForm((current) => ({ ...current, quantidade: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none" /></label><label className="space-y-2 text-sm font-semibold text-slate-700"><span>Unidade</span><input value={editItemForm.unidade} onChange={(event) => setEditItemForm((current) => ({ ...current, unidade: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none" /></label><label className="space-y-2 text-sm font-semibold text-slate-700"><span>Valor unitario</span><input value={editItemForm.valorUnitarioEstimado} onChange={(event) => setEditItemForm((current) => ({ ...current, valorUnitarioEstimado: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none" /></label></div><div className="flex justify-end gap-3"><button type="button" onClick={() => setOpenEditItemModal(false)} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">Cancelar</button><button type="submit" disabled={saveItemMutation.isPending} className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">{saveItemMutation.isPending ? "Salvando..." : "Salvar alteracoes"}</button></div></form>
      </Modal>
    </div>
  );
}

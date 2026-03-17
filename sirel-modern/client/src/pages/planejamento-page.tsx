import { useDeferredValue, useMemo, useState } from "react";
import { ArrowRight, ClipboardList, Search } from "lucide-react";
import { Link } from "wouter";

import { SectionCard } from "@/components/shared/section-card";
import { trpc } from "@/lib/trpc";

function dfdStatusLabel(item: { dfdId: number | null; dfdConcluido: boolean | null }) {
  if (!item.dfdId) return "Nao iniciada";
  return item.dfdConcluido ? "Concluida" : "Em elaboracao";
}

function dfdStatusClass(item: { dfdId: number | null; dfdConcluido: boolean | null }) {
  if (!item.dfdId) return "bg-slate-100 text-slate-700";
  return item.dfdConcluido ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800";
}

export function PlanejamentoPage() {
  const [search, setSearch] = useState("");
  const [somenteSemDfd, setSomenteSemDfd] = useState(false);
  const deferredSearch = useDeferredValue(search.trim());
  const filters = useMemo(() => ({ search: deferredSearch || undefined, somenteSemDfd }), [deferredSearch, somenteSemDfd]);
  const listQuery = trpc.planejamento.list.useQuery(filters, { retry: false, placeholderData: (previous) => previous });
  const rows = listQuery.data ?? [];

  return (
    <div className="space-y-6">
      <SectionCard
        title="Planejamento"
        description="Fila da fase de Planejamento. Selecione um processo para abrir a tela especifica da DFD e das demais etapas iniciais."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex min-w-[240px] items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por processo, objeto ou secretaria" className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" />
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={somenteSemDfd} onChange={(event) => setSomenteSemDfd(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
              Somente sem DFD
            </label>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-4">
          <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Fila do Planejamento</p><p className="mt-2 text-2xl font-black text-slate-950">{rows.length}</p></article>
          <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">DFDs concluidas</p><p className="mt-2 text-2xl font-black text-slate-950">{rows.filter((item) => item.dfdConcluido).length}</p></article>
          <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Sistemicas</p><p className="mt-2 text-2xl font-black text-slate-950">{rows.filter((item) => item.demandaSistemica).length}</p></article>
          <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Itens cadastrados</p><p className="mt-2 text-2xl font-black text-slate-950">{rows.reduce((acc, item) => acc + item.itensCount, 0)}</p></article>
        </div>

        <div className="mt-4 overflow-hidden rounded-[28px] border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Processo</th>
                <th className="px-4 py-3">Etapa</th>
                <th className="px-4 py-3">DFD</th>
                <th className="px-4 py-3">Itens</th>
                <th className="px-4 py-3 text-right">Abrir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
              {rows.map((item) => (
                <tr key={item.processoId} className="transition hover:bg-slate-50">
                  <td className="px-4 py-3 align-top">
                    <div className="font-bold text-slate-950">{item.numeroSirel}</div>
                    <div className="text-xs text-slate-500">{item.secretaria}</div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="font-semibold text-slate-950">{item.etapaAtual}</div>
                    <div className="text-xs text-slate-500">{item.grauPrioridade ? `Prioridade ${item.grauPrioridade}` : item.situacao}</div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className={["inline-flex rounded-full px-3 py-1 text-xs font-bold", dfdStatusClass(item)].join(" ")}>{dfdStatusLabel(item)}</span>
                  </td>
                  <td className="px-4 py-3 align-top font-semibold text-slate-950">{item.itensCount}</td>
                  <td className="px-4 py-3 text-right align-top">
                    <Link href={`/planejamento/dfd/${item.processoId}`} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-sky-700">
                      Abrir DFD
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={5}>{listQuery.isFetching ? "Carregando processos do Planejamento..." : "Nenhum processo em Planejamento. Crie um processo no fluxo regular para iniciar a DFD."}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-3xl border border-sky-100 bg-sky-50 px-4 py-4 text-sm text-sky-900">
          <p className="font-semibold">Fluxo da fase</p>
          <p className="mt-1 leading-6 text-sky-800">Ao abrir um processo, a DFD passa a ser editada em tela propria. Os itens sao selecionados a partir do catalogo do sistema, com conferencia em formato de carrinho antes da incorporacao ao processo.</p>
        </div>
      </SectionCard>
    </div>
  );
}

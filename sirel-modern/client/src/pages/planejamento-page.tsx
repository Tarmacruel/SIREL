import { useDeferredValue, useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { Link } from "wouter";

import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";

function dfdStatusLabel(item: { dfdId: number | null; dfdConcluido: boolean | null }) {
  if (!item.dfdId) return "Não iniciada";
  return item.dfdConcluido ? "Concluída" : "Em elaboração";
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
        description="Fila da fase de Planejamento. Selecione um processo para abrir a tela específica da DFD e das demais etapas iniciais."
        action={
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <FormField label="Buscar">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Processo, objeto ou secretaria"
                  className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                />
              </div>
            </FormField>
            <FormField label="Filtro">
              <label className="flex h-11 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700">
                <Checkbox checked={somenteSemDfd} onChange={(event) => setSomenteSemDfd(event.target.checked)} />
                Somente sem DFD
              </label>
            </FormField>
          </div>
        }
      >
        {listQuery.isLoading ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              {[0, 1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-28" />
              ))}
            </div>
            <Skeleton className="h-80" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Fila do Planejamento</p>
                <p className="mt-2 text-2xl font-black text-slate-950">{rows.length}</p>
              </article>
              <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">DFDs concluídas</p>
                <p className="mt-2 text-2xl font-black text-slate-950">{rows.filter((item) => item.dfdConcluido).length}</p>
              </article>
              <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Sistêmicas</p>
                <p className="mt-2 text-2xl font-black text-slate-950">{rows.filter((item) => item.demandaSistemica).length}</p>
              </article>
              <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Itens cadastrados</p>
                <p className="mt-2 text-2xl font-black text-slate-950">{rows.reduce((acc, item) => acc + item.itensCount, 0)}</p>
              </article>
            </div>

            <div className="mt-4 overflow-hidden rounded-[28px] border border-slate-200 bg-white">
              <Table>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Processo</TableHeaderCell>
                    <TableHeaderCell>Etapa</TableHeaderCell>
                    <TableHeaderCell>DFD</TableHeaderCell>
                    <TableHeaderCell>Itens</TableHeaderCell>
                    <TableHeaderCell className="text-right">Abrir</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {rows.map((item) => (
                    <TableRow key={item.processoId} className="transition hover:bg-slate-50">
                      <TableCell className="align-top">
                        <div className="font-bold text-slate-950">{item.numeroSirel}</div>
                        <div className="text-xs text-slate-500">{item.secretaria}</div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="font-semibold text-slate-950">{item.etapaAtual}</div>
                        <div className="text-xs text-slate-500">{item.grauPrioridade ? `Prioridade ${item.grauPrioridade}` : item.situacao}</div>
                      </TableCell>
                      <TableCell className="align-top">
                        <span className={["inline-flex rounded-full px-3 py-1 text-xs font-bold", dfdStatusClass(item)].join(" ")}>
                          {dfdStatusLabel(item)}
                        </span>
                      </TableCell>
                      <TableCell className="align-top font-semibold text-slate-950">{item.itensCount}</TableCell>
                      <TableCell className="text-right align-top">
                        <Link
                          href={`/planejamento/dfd/${item.processoId}`}
                          className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-sky-700"
                        >
                          Abrir DFD
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!rows.length ? (
                    <TableRow>
                      <TableCell className="py-8 text-center text-slate-500" colSpan={5}>
                        Nenhum processo em Planejamento. Crie um processo no fluxo regular para iniciar a DFD.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4">
              <Alert variant="info" title="Fluxo da fase">
                Ao abrir um processo, a DFD passa a ser editada em tela própria. Os itens são selecionados a partir do catálogo do sistema, com conferência em formato de carrinho antes da incorporação ao processo.
              </Alert>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}

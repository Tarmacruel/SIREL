import { useDeferredValue, useMemo, useState } from "react";

import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";

const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

function formatMoney(value: string | null) {
  if (!value) return "-";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? currencyFormatter.format(parsed) : "-";
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

export function ContratosPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [status, setStatus] = useState<"" | "ATIVO" | "ENCERRADO" | "SUSPENSO" | "RESCINDIDO">("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const filters = useMemo(() => ({ page, pageSize, status: status || undefined, search: deferredSearch || undefined }), [deferredSearch, page, pageSize, status]);

  const summaryQuery = trpc.contratos.summary.useQuery(undefined, { retry: false });
  const listQuery = trpc.contratos.list.useQuery(filters, { retry: false, placeholderData: (previous) => previous });
  const rows = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <SectionCard title="Contratos" description="Base de contratos da Beta 2.0 com filtros, resumo e paginacao para crescimento real da operacao.">
      <Tabs
        items={[
          {
            value: "visao-geral",
            label: "Visao geral",
            content: (
              <div className="grid gap-4 md:grid-cols-3">
                {[{ label: "Total", value: summaryQuery.data?.total }, { label: "Ativos", value: summaryQuery.data?.ativos }, { label: "Expirando em 30 dias", value: summaryQuery.data?.expirandoEm30Dias }].map((item) => (
                  <article key={item.label} className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                    {summaryQuery.isLoading ? <Skeleton className="mt-3 h-10 w-20" /> : <p className="mt-3 text-3xl font-black text-slate-950">{item.value ?? 0}</p>}
                  </article>
                ))}
                {summaryQuery.error ? <Alert variant="error" className="md:col-span-3">Falha ao consultar o resumo de contratos.</Alert> : null}
              </div>
            ),
          },
          {
            value: "registros",
            label: "Registros",
            content: (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por contrato, processo, fornecedor ou objeto" className="max-w-md" />
                  <Select value={status} onChange={(event) => setStatus(event.target.value as "" | "ATIVO" | "ENCERRADO" | "SUSPENSO" | "RESCINDIDO")} className="max-w-[180px]">
                    <option value="">Todos os status</option>
                    {["ATIVO", "ENCERRADO", "SUSPENSO", "RESCINDIDO"].map((option) => <option key={option} value={option}>{option}</option>)}
                  </Select>
                  <Select value={String(pageSize)} onChange={(event) => setPageSize(Number(event.target.value))} className="max-w-[140px]">
                    {[10, 20, 50].map((option) => <option key={option} value={option}>{option} por pagina</option>)}
                  </Select>
                </div>

                {listQuery.error ? <Alert variant="error">Falha ao carregar os contratos da base.</Alert> : null}

                <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white">
                  <Table>
                    <TableHead>
                      <tr>
                        <TableHeaderCell>Contrato</TableHeaderCell>
                        <TableHeaderCell>Processo</TableHeaderCell>
                        <TableHeaderCell>Fornecedor</TableHeaderCell>
                        <TableHeaderCell>Vigencia final</TableHeaderCell>
                        <TableHeaderCell className="text-right">Valor</TableHeaderCell>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {listQuery.isLoading
                        ? Array.from({ length: 5 }).map((_, index) => (
                            <TableRow key={index}>
                              <TableCell colSpan={5}><Skeleton className="h-12 w-full" /></TableCell>
                            </TableRow>
                          ))
                        : rows.map((row) => (
                            <TableRow key={row.id} className="transition hover:bg-slate-50">
                              <TableCell>
                                <div className="font-bold text-slate-950">{row.numeroContrato}</div>
                                <div className="text-xs text-slate-500">{row.status}</div>
                              </TableCell>
                              <TableCell>{row.processoNumeroSirel}</TableCell>
                              <TableCell>
                                <div className="max-w-[280px] truncate">{row.fornecedor}</div>
                                <div className="text-xs text-slate-500">{row.objeto}</div>
                              </TableCell>
                              <TableCell>{formatDate(row.dataVigenciaFim)}</TableCell>
                              <TableCell className="text-right font-semibold text-slate-950">{formatMoney(row.valorContrato)}</TableCell>
                            </TableRow>
                          ))}
                      {!listQuery.isLoading && !rows.length ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-slate-500">Nenhum contrato encontrado.</TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-600">Exibindo <span className="font-bold text-slate-950">{rows.length}</span> de <span className="font-bold text-slate-950">{total}</span> contratos.</p>
                  <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
                </div>
              </div>
            ),
          },
        ]}
      />
    </SectionCard>
  );
}

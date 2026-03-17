import { FileStack, ShieldCheck, Stamp } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";

const pillars = [
  { title: "Versionamento", icon: FileStack, body: "Cada documento passa a ter versoes, categoria, trilha e origem de upload." },
  { title: "Padrao e-TCM", icon: Stamp, body: "Capas, paginacao, OCR, compressao e fracionamento serao tratados no pipeline do backend." },
  { title: "Rastreabilidade", icon: ShieldCheck, body: "Toda inclusao, revisao e substituicao sera auditada por usuario, data e processo." },
];

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function formatDate(value: string | Date | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : dateFormatter.format(date);
}

export function DocumentosPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [tipo, setTipo] = useState<"" | "DFD" | "ETP" | "TR" | "EDITAL" | "COMUNICACAO_INTERNA" | "RESULTADO" | "CONTRATO" | "OUTRO">("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const filters = useMemo(() => ({ page, pageSize, tipo: tipo || undefined, search: deferredSearch || undefined }), [deferredSearch, page, pageSize, tipo]);

  const summaryQuery = trpc.documentos.summary.useQuery(undefined, { retry: false });
  const listQuery = trpc.documentos.list.useQuery(filters, { retry: false, placeholderData: (previous) => previous });
  const rows = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <SectionCard title="Gestao documental" description="Camada de documentos da Beta 2.0 com consulta real, versionamento e base pronta para upload padronizado.">
      <Tabs
        items={[
          {
            value: "visao-geral",
            label: "Visao geral",
            content: (
              <div className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-3">
                  {pillars.map((pillar) => {
                    const Icon = pillar.icon;
                    return (
                      <article key={pillar.title} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                        <div className="inline-flex rounded-2xl bg-slate-900 p-3 text-white"><Icon className="h-5 w-5" /></div>
                        <h4 className="mt-4 text-lg font-black text-slate-950">{pillar.title}</h4>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{pillar.body}</p>
                      </article>
                    );
                  })}
                </div>
                {summaryQuery.error ? <Alert variant="error">Falha ao consultar o resumo documental.</Alert> : null}
                <div className="grid gap-4 md:grid-cols-3">
                  {[{ label: "Documentos", value: summaryQuery.data?.total }, { label: "Processos com documentos", value: summaryQuery.data?.processosComDocumentos }, { label: "Editais", value: summaryQuery.data?.editais }].map((item) => (
                    <article key={item.label} className="rounded-3xl border border-slate-200 bg-white px-4 py-4">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                      {summaryQuery.isLoading ? <Skeleton className="mt-3 h-10 w-20" /> : <p className="mt-3 text-3xl font-black text-slate-950">{item.value ?? 0}</p>}
                    </article>
                  ))}
                </div>
              </div>
            ),
          },
          {
            value: "registros",
            label: "Registros",
            content: (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por processo, titulo ou categoria" className="max-w-md" />
                  <Select value={tipo} onChange={(event) => setTipo(event.target.value as "" | "DFD" | "ETP" | "TR" | "EDITAL" | "COMUNICACAO_INTERNA" | "RESULTADO" | "CONTRATO" | "OUTRO")} className="max-w-[220px]">
                    <option value="">Todos os tipos</option>
                    {[
                      "DFD",
                      "ETP",
                      "TR",
                      "EDITAL",
                      "COMUNICACAO_INTERNA",
                      "RESULTADO",
                      "CONTRATO",
                      "OUTRO",
                    ].map((option) => <option key={option} value={option}>{option}</option>)}
                  </Select>
                  <Select value={String(pageSize)} onChange={(event) => setPageSize(Number(event.target.value))} className="max-w-[140px]">
                    {[10, 20, 50].map((option) => <option key={option} value={option}>{option} por pagina</option>)}
                  </Select>
                </div>

                {listQuery.error ? <Alert variant="error">Falha ao carregar os documentos da base.</Alert> : null}

                <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white">
                  <Table>
                    <TableHead>
                      <tr>
                        <TableHeaderCell>Documento</TableHeaderCell>
                        <TableHeaderCell>Processo</TableHeaderCell>
                        <TableHeaderCell>Tipo</TableHeaderCell>
                        <TableHeaderCell>Versao</TableHeaderCell>
                        <TableHeaderCell>Criado em</TableHeaderCell>
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
                                <div className="font-bold text-slate-950">{row.titulo}</div>
                                <div className="text-xs text-slate-500">{row.categoria ?? "Sem categoria"}</div>
                              </TableCell>
                              <TableCell>{row.processoNumeroSirel}</TableCell>
                              <TableCell>{row.tipo}</TableCell>
                              <TableCell>v{row.versao}</TableCell>
                              <TableCell>{formatDate(row.criadoEm)}</TableCell>
                            </TableRow>
                          ))}
                      {!listQuery.isLoading && !rows.length ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-slate-500">Nenhum documento encontrado.</TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-600">Exibindo <span className="font-bold text-slate-950">{rows.length}</span> de <span className="font-bold text-slate-950">{total}</span> registros.</p>
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

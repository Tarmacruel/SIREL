import { BarChart3, Download, FileJson, FileSpreadsheet, Printer } from "lucide-react";
import { useMemo, useState } from "react";

import { relatorioTipoLabels, relatorioTipoOptions } from "@sirel/shared/const";

import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { formatCurrencyBRL, formatShortDateBR, formatShortDateTimeBR } from "@/lib/formatters";
import { exportReportToCsv, exportReportToJson, openPrintableReport } from "@/lib/report-export";
import { trpc } from "@/lib/trpc";

function formatReportValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (value instanceof Date) return formatShortDateTimeBR(value);
  if (typeof value === "number") {
    return key.toLowerCase().includes("valor") ? formatCurrencyBRL(value) : value.toLocaleString("pt-BR");
  }
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatShortDateBR(value);
    const asDate = new Date(value);
    if (!Number.isNaN(asDate.getTime()) && value.includes("T")) return formatShortDateTimeBR(asDate);
    return value;
  }
  return JSON.stringify(value);
}

export function RelatoriosPage() {
  const catalogQuery = trpc.cadastros.formOptions.useQuery(undefined, { retry: false });
  const [filters, setFilters] = useState({
    tipo: "PROCESSOS_POR_STATUS" as (typeof relatorioTipoOptions)[number],
    dataInicial: "",
    dataFinal: "",
    secretariaId: "",
    modalidadeId: "",
    statusId: "",
  });
  const queryInput = useMemo(
    () => ({
      tipo: filters.tipo,
      dataInicial: filters.dataInicial || undefined,
      dataFinal: filters.dataFinal || undefined,
      secretariaId: filters.secretariaId ? Number(filters.secretariaId) : undefined,
      modalidadeId: filters.modalidadeId ? Number(filters.modalidadeId) : undefined,
      statusId: filters.statusId ? Number(filters.statusId) : undefined,
    }),
    [filters],
  );

  const reportQuery = trpc.relatorios.run.useQuery(queryInput, {
    retry: false,
    placeholderData: (previous) => previous,
  });

  const report = reportQuery.data;

  function handleExportCsv() {
    if (!report) return;
    exportReportToCsv(`sirel-${filters.tipo.toLowerCase()}.csv`, report.columns, report.rows as Record<string, unknown>[]);
  }

  function handleExportJson() {
    if (!report) return;
    exportReportToJson(`sirel-${filters.tipo.toLowerCase()}.json`, {
      title: report.title,
      generatedAt: report.generatedAt,
      columns: report.columns,
      rows: report.rows as Record<string, unknown>[],
      summary: report.summary,
    });
  }

  function handlePrint() {
    if (!report) return;
    openPrintableReport(report.title, report.columns, report.rows as Record<string, unknown>[], report.summary);
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Central de Relatórios e Exportação"
        description="Gere consolidações operacionais da Beta 2.0 e exporte em formatos úteis para gestão interna."
        action={
          <div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-sky-800">
            <BarChart3 className="h-4 w-4" />
            Exportação local
          </div>
        }
      >
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_repeat(5,minmax(0,0.8fr))]">
          <FormField label="Tipo de relatório">
            <Select value={filters.tipo} onChange={(event) => setFilters((current) => ({ ...current, tipo: event.target.value as (typeof relatorioTipoOptions)[number] }))}>
              {relatorioTipoOptions.map((item) => (
                <option key={item} value={item}>
                  {relatorioTipoLabels[item]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Período inicial">
            <Input type="date" value={filters.dataInicial} onChange={(event) => setFilters((current) => ({ ...current, dataInicial: event.target.value }))} />
          </FormField>
          <FormField label="Período final">
            <Input type="date" value={filters.dataFinal} onChange={(event) => setFilters((current) => ({ ...current, dataFinal: event.target.value }))} />
          </FormField>
          <FormField label="Secretaria">
            <Select value={filters.secretariaId} onChange={(event) => setFilters((current) => ({ ...current, secretariaId: event.target.value }))}>
              <option value="">Todas</option>
              {catalogQuery.data?.secretarias.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sigla} - {item.nome}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Modalidade">
            <Select value={filters.modalidadeId} onChange={(event) => setFilters((current) => ({ ...current, modalidadeId: event.target.value }))}>
              <option value="">Todas</option>
              {catalogQuery.data?.modalidades.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Status do processo">
            <Select value={filters.statusId} onChange={(event) => setFilters((current) => ({ ...current, statusId: event.target.value }))}>
              <option value="">Todos</option>
              {catalogQuery.data?.statusProcesso.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={() => reportQuery.refetch()} disabled={reportQuery.isFetching}>
            <BarChart3 className="h-4 w-4" />
            Atualizar relatório
          </Button>
          <Button variant="outline" onClick={handleExportCsv} disabled={!report?.rows.length}>
            <FileSpreadsheet className="h-4 w-4" />
            Exportar CSV
          </Button>
          <Button variant="outline" onClick={handleExportJson} disabled={!report?.rows.length}>
            <FileJson className="h-4 w-4" />
            Exportar JSON
          </Button>
          <Button variant="outline" onClick={handlePrint} disabled={!report?.rows.length}>
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
        </div>
      </SectionCard>

      {reportQuery.error ? <Alert variant="error">Falha ao gerar o relatório solicitado.</Alert> : null}

      <SectionCard
        title={report?.title ?? "Resultado consolidado"}
        description="Visualização tabular pronta para conferência, exportação e impressão."
        action={
          report ? (
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-700">
              <Download className="h-4 w-4" />
              {report.rows.length} linhas
            </div>
          ) : null
        }
      >
        {reportQuery.isLoading ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-24 w-full rounded-[24px]" />
              ))}
            </div>
            <Skeleton className="h-72 w-full rounded-[28px]" />
          </div>
        ) : report ? (
          <div className="space-y-5">
            {report.summary?.length ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {report.summary.map((item) => (
                  <article key={item.label} className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                    <p className="mt-2 text-xl font-black text-slate-950">{formatReportValue(item.label, item.value)}</p>
                  </article>
                ))}
              </div>
            ) : null}

            <div className="rounded-[28px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Gerado em <span className="font-semibold text-slate-900">{formatShortDateTimeBR(report.generatedAt)}</span>
            </div>

            <div className="overflow-auto rounded-[28px] border border-slate-200">
              <Table>
                <TableHead>
                  <tr>
                    {report.columns.map((column) => (
                      <TableHeaderCell key={column.key}>{column.label}</TableHeaderCell>
                    ))}
                  </tr>
                </TableHead>
                <TableBody>
                  {report.rows.map((row, index) => (
                    <TableRow key={`${index}-${String((row as Record<string, unknown>)[report.columns[0]?.key] ?? index)}`}>
                      {report.columns.map((column) => (
                        <TableCell key={column.key}>{formatReportValue(column.key, (row as Record<string, unknown>)[column.key])}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {!report.rows.length ? (
                    <TableRow>
                      <TableCell colSpan={Math.max(1, report.columns.length)} className="text-slate-500">
                        Nenhum registro encontrado para os filtros informados.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <Alert variant="info">Selecione os filtros e aguarde a geração do relatório.</Alert>
        )}
      </SectionCard>
    </div>
  );
}

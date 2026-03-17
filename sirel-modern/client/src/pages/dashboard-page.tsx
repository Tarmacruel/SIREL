import { AlertTriangle, ArrowRight, BriefcaseBusiness, FolderOpenDot, Landmark } from "lucide-react";
import { Link } from "wouter";

import { KpiCard } from "@/components/dashboard/kpi-card";
import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";

const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function DashboardPage() {
  const summary = trpc.dashboard.summary.useQuery(undefined, { retry: false });
  const recentProcesses = trpc.processos.list.useQuery({ page: 1, pageSize: 5 }, { retry: false });
  const catalogos = trpc.cadastros.formOptions.useQuery(undefined, { retry: false });
  const data = summary.data ?? { processosAtivos: 0, contratosVigentes: 0, alertasPendentes: 0, valorGlobalEstimado: 0, porModulo: [] };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Processos ativos" value={String(data.processosAtivos)} hint="Monitoramento em tempo real da operacao do beta." icon={<FolderOpenDot className="h-5 w-5" />} />
        <KpiCard title="Contratos vigentes" value={String(data.contratosVigentes)} hint="Contratos vinculados aos processos recriados na nova base." icon={<BriefcaseBusiness className="h-5 w-5" />} />
        <KpiCard title="Alertas pendentes" value={String(data.alertasPendentes)} hint="Prazos, vencimentos e exigencias documentais futuras." icon={<AlertTriangle className="h-5 w-5" />} />
        <KpiCard title="Valor global" value={currencyFormatter.format(data.valorGlobalEstimado)} hint="Soma dos valores estimados em processos cadastrados no beta." icon={<Landmark className="h-5 w-5" />} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard title="Pronto para teste" description="A Beta 2.0 agora opera sem dependencia continua do legado.">
          <div className="grid gap-3 md:grid-cols-3">
            {[{ label: "Secretarias", value: catalogos.data?.secretarias.length }, { label: "Modalidades", value: catalogos.data?.modalidades.length }, { label: "Pessoas", value: catalogos.data?.pessoas.length }].map((item) => (
              <article key={item.label} className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                {catalogos.isLoading ? <Skeleton className="mt-3 h-10 w-20" /> : <p className="mt-2 text-2xl font-black text-slate-950">{item.value ?? 0}</p>}
              </article>
            ))}
          </div>

          <div className="mt-4 rounded-[28px] border border-slate-200 bg-white px-5 py-5">
            <p className="text-sm font-semibold text-slate-900">Roteiro rapido de validacao</p>
            <ol className="mt-3 space-y-3 text-sm text-slate-600">
              <li>1. Cadastre um processo novo no modulo de Processos.</li>
              <li>2. Inicie a DFD no modulo de Planejamento.</li>
              <li>3. Movimente o processo no Workflow ate a etapa de Licitacao.</li>
              <li>4. Execute a publicidade e os controles da fase no modulo de Licitacao.</li>
            </ol>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/planejamento"><Button variant="outline">Ir para Planejamento<ArrowRight className="h-4 w-4" /></Button></Link>
              <Link href="/processos"><Button>Ir para Processos<ArrowRight className="h-4 w-4" /></Button></Link>
              <Link href="/workflow"><Button variant="outline">Ir para Workflow<ArrowRight className="h-4 w-4" /></Button></Link>
              <Link href="/licitacao"><Button variant="outline">Ir para Licitacao<ArrowRight className="h-4 w-4" /></Button></Link>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Distribuicao operacional" description="Carga atual por modulo do workflow e aderencia do beta a operacao real.">
          {summary.error ? (
            <Alert variant="warning">Falha ao consultar os indicadores do PostgreSQL.</Alert>
          ) : summary.isLoading ? (
            <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24" />)}</div>
          ) : data.porModulo.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {data.porModulo.map((item) => (
                <div key={item.modulo} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">{item.modulo}</p>
                  <p className="mt-2 text-2xl font-black text-slate-950">{item.total}</p>
                </div>
              ))}
            </div>
          ) : (
            <Alert variant="info">Nenhum processo operacional ainda. O painel sera preenchido conforme os novos processos forem cadastrados.</Alert>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Processos recentes" description="Amostra operacional da nova base para conferencia rapida.">
        <div className="overflow-hidden rounded-[28px] border border-slate-200">
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Processo</TableHeaderCell>
                <TableHeaderCell>Secretaria</TableHeaderCell>
                <TableHeaderCell>Modulo</TableHeaderCell>
                <TableHeaderCell>Valor estimado</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {recentProcesses.isLoading ? Array.from({ length: 5 }).map((_, index) => <TableRow key={index}><TableCell colSpan={4}><Skeleton className="h-12 w-full" /></TableCell></TableRow>) : null}
              {recentProcesses.data?.items.map((row) => (
                <TableRow key={row.id} className="transition hover:bg-slate-50">
                  <TableCell>
                    <div className="font-bold text-slate-950">{row.numeroSirel}</div>
                    <div className="text-xs text-slate-500">{row.numeroEdital ?? "Sem edital"}</div>
                  </TableCell>
                  <TableCell>{row.secretaria}</TableCell>
                  <TableCell>{row.moduloAtual ?? "Sem workflow"}</TableCell>
                  <TableCell>{row.valorEstimado ? currencyFormatter.format(Number(row.valorEstimado)) : "-"}</TableCell>
                </TableRow>
              ))}
              {!recentProcesses.isLoading && !recentProcesses.data?.items.length ? <TableRow><TableCell colSpan={4} className="text-slate-500">Nenhum processo criado ainda. Inicie a operacao em Processos.</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </div>
  );
}

import { AlertTriangle, ArrowRight, BriefcaseBusiness, FolderOpenDot, Landmark } from "lucide-react";
import { Link } from "wouter";

import { KpiCard } from "@/components/dashboard/kpi-card";
import { SectionCard } from "@/components/shared/section-card";
import { trpc } from "@/lib/trpc";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function DashboardPage() {
  const summary = trpc.dashboard.summary.useQuery(undefined, { retry: false });
  const recentProcesses = trpc.processos.list.useQuery({ page: 1, pageSize: 5 }, { retry: false });
  const catalogos = trpc.cadastros.formOptions.useQuery(undefined, { retry: false });
  const data = summary.data ?? {
    processosAtivos: 0,
    contratosVigentes: 0,
    alertasPendentes: 0,
    valorGlobalEstimado: 0,
    porModulo: [],
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Processos ativos"
          value={String(data.processosAtivos)}
          hint="Monitoramento em tempo real da operacao do beta."
          icon={<FolderOpenDot className="h-5 w-5" />}
        />
        <KpiCard
          title="Contratos vigentes"
          value={String(data.contratosVigentes)}
          hint="Contratos vinculados aos processos recriados na nova base."
          icon={<BriefcaseBusiness className="h-5 w-5" />}
        />
        <KpiCard
          title="Alertas pendentes"
          value={String(data.alertasPendentes)}
          hint="Prazos, vencimentos e exigencias documentais futuras."
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <KpiCard
          title="Valor global"
          value={currencyFormatter.format(data.valorGlobalEstimado)}
          hint="Soma dos valores estimados em processos cadastrados no beta."
          icon={<Landmark className="h-5 w-5" />}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard title="Pronto para teste" description="A Beta 2.0 agora opera sem dependencia continua do legado.">
          <div className="grid gap-3 md:grid-cols-3">
            <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Secretarias</p>
              <p className="mt-2 text-2xl font-black text-slate-950">{catalogos.data?.secretarias.length ?? 0}</p>
            </article>
            <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Modalidades</p>
              <p className="mt-2 text-2xl font-black text-slate-950">{catalogos.data?.modalidades.length ?? 0}</p>
            </article>
            <article className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Pessoas</p>
              <p className="mt-2 text-2xl font-black text-slate-950">{catalogos.data?.pessoas.length ?? 0}</p>
            </article>
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
              <Link href="/planejamento" className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700">
                Ir para Planejamento
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/processos" className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700">
                Ir para Processos
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/workflow" className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700">
                Ir para Workflow
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/licitacao" className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700">
                Ir para Licitacao
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Distribuicao operacional" description="Carga atual por modulo do workflow e aderencia do beta a operacao real.">
          {summary.error ? (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
              Falha ao consultar os indicadores do PostgreSQL.
            </div>
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
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
              Nenhum processo operacional ainda. O painel sera preenchido conforme os novos processos forem cadastrados.
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Processos recentes" description="Amostra operacional da nova base para conferencia rapida.">
        <div className="overflow-hidden rounded-[28px] border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Processo</th>
                <th className="px-4 py-3">Secretaria</th>
                <th className="px-4 py-3">Modulo</th>
                <th className="px-4 py-3">Valor estimado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
              {recentProcesses.data?.items.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-950">{row.numeroSirel}</div>
                    <div className="text-xs text-slate-500">{row.numeroEdital ?? "Sem edital"}</div>
                  </td>
                  <td className="px-4 py-3">{row.secretaria}</td>
                  <td className="px-4 py-3">{row.moduloAtual ?? "Sem workflow"}</td>
                  <td className="px-4 py-3">
                    {row.valorEstimado ? currencyFormatter.format(Number(row.valorEstimado)) : "-"}
                  </td>
                </tr>
              ))}
              {!recentProcesses.data?.items.length && (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={4}>
                    {recentProcesses.isLoading ? "Carregando processos..." : "Nenhum processo criado ainda. Inicie a operacao em Processos."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

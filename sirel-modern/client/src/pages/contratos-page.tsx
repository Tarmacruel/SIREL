import { SectionCard } from "@/components/shared/section-card";
import { trpc } from "@/lib/trpc";

export function ContratosPage() {
  const query = trpc.contratos.listVigentes.useQuery(undefined, { retry: false });
  const rows = query.data ?? [];

  return (
    <SectionCard title="Contratos" description="Base para gestão de vigência, alertas de vencimento e aditivos.">
      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((row) => (
          <article key={row.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Contrato</p>
            <h4 className="mt-2 text-xl font-black text-slate-950">{row.numeroContrato}</h4>
            <p className="mt-2 text-sm text-slate-600">{row.objeto}</p>
            <div className="mt-4 flex items-center justify-between text-sm text-slate-600"><span>Status: {row.status}</span><span>Vigência final: {row.dataVigenciaFim ?? "-"}</span></div>
          </article>
        ))}
        {!rows.length && <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">Nenhum contrato ativo encontrado. O módulo já está pronto para receber carga inicial e alertas.</div>}
      </div>
    </SectionCard>
  );
}

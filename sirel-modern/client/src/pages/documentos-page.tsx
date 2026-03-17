import { FileStack, ShieldCheck, Stamp } from "lucide-react";

import { SectionCard } from "@/components/shared/section-card";

const pillars = [
  { title: "Versionamento", icon: FileStack, body: "Cada documento passa a ter versões, categoria, trilha e origem de upload." },
  { title: "Padrão e-TCM", icon: Stamp, body: "Capas, paginação, OCR, compressão e fracionamento serão tratados no pipeline do backend." },
  { title: "Rastreabilidade", icon: ShieldCheck, body: "Toda inclusão, revisão e substituição será auditada por usuário, data e processo." }
];

export function DocumentosPage() {
  return (
    <SectionCard title="Gestão documental" description="Camada preparada para upload, versionamento, consolidação e exportação padronizada.">
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
    </SectionCard>
  );
}

import { Search, FolderOpen, ArrowRight } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "wouter";

import { workflowModuleOptions } from "@sirel/shared/const";

import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrencyBRL, formatShortDateBR, formatShortDateTimeBR } from "@/lib/formatters";
import { trpc } from "@/lib/trpc";

function resolveModuloHref(moduloAtual: string) {
  switch (moduloAtual) {
    case "PLANEJAMENTO":
      return "/planejamento";
    case "LICITACAO":
      return "/licitacao";
    case "DOCUMENTOS":
      return "/documentos";
    case "CONTRATOS":
      return "/contratos";
    case "COMPRAS":
      return "/compras";
    case "PROCURADORIA":
    case "CONTROLADORIA":
    default:
      return "/workflow";
  }
}

export function ConsultasPage() {
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(10);
  const [termo, setTermo] = useState("");
  const [secretariaId, setSecretariaId] = useState("");
  const [modalidadeId, setModalidadeId] = useState("");
  const [statusId, setStatusId] = useState("");
  const [moduloAtual, setModuloAtual] = useState<"" | (typeof workflowModuleOptions)[number]>("");
  const [somenteComDocumentos, setSomenteComDocumentos] = useState(false);
  const termoDeferred = useDeferredValue(termo.trim());

  const catalogQuery = trpc.cadastros.formOptions.useQuery(undefined, { retry: false });
  const filters = useMemo(
    () => ({
      termo: termoDeferred || undefined,
      secretariaId: secretariaId ? Number(secretariaId) : undefined,
      modalidadeId: modalidadeId ? Number(modalidadeId) : undefined,
      statusId: statusId ? Number(statusId) : undefined,
      moduloAtual: moduloAtual || undefined,
      somenteComDocumentos: somenteComDocumentos || undefined,
      pagina,
      limite,
    }),
    [limite, modalidadeId, moduloAtual, pagina, secretariaId, somenteComDocumentos, statusId, termoDeferred],
  );

  const searchQuery = trpc.consultas.search.useQuery(filters, { retry: false, placeholderData: (previous) => previous });
  const rows = searchQuery.data?.dados ?? [];
  const totalPages = searchQuery.data?.metadados.totalPages ?? 1;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Central de Consultas"
        description="Busque processos por número, objeto, documentos, secretaria, modalidade e status em um único ponto de consulta."
        action={
          <div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-sky-800">
            <Search className="h-4 w-4" />
            Busca operacional
          </div>
        }
      >
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_repeat(4,minmax(0,0.8fr))]">
          <FormField label="Busca global">
            <Input value={termo} onChange={(event) => { setPagina(1); setTermo(event.target.value); }} placeholder="Número SIREL, objeto, secretaria ou documento" />
          </FormField>
          <FormField label="Secretaria">
            <Select value={secretariaId} onChange={(event) => { setPagina(1); setSecretariaId(event.target.value); }}>
              <option value="">Todas</option>
              {catalogQuery.data?.secretarias.map((item) => (
                <option key={item.id} value={item.id}>{item.sigla} - {item.nome}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Modalidade">
            <Select value={modalidadeId} onChange={(event) => { setPagina(1); setModalidadeId(event.target.value); }}>
              <option value="">Todas</option>
              {catalogQuery.data?.modalidades.map((item) => (
                <option key={item.id} value={item.id}>{item.nome}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Status">
            <Select value={statusId} onChange={(event) => { setPagina(1); setStatusId(event.target.value); }}>
              <option value="">Todos</option>
              {catalogQuery.data?.statusProcesso.map((item) => (
                <option key={item.id} value={item.id}>{item.nome}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Módulo atual">
            <Select value={moduloAtual} onChange={(event) => { setPagina(1); setModuloAtual(event.target.value as "" | (typeof workflowModuleOptions)[number]); }}>
              <option value="">Todos</option>
              {catalogQuery.data?.workflowModules.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </Select>
          </FormField>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3">
          <label className="inline-flex items-center gap-3 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={somenteComDocumentos}
              onChange={(event) => { setPagina(1); setSomenteComDocumentos(event.target.checked); }}
              className="h-4 w-4 rounded border-slate-300 text-sky-600"
            />
            Somente processos com documentos vinculados
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Resultados por página</span>
            <Select value={String(limite)} onChange={(event) => { setPagina(1); setLimite(Number(event.target.value)); }} className="w-[140px]">
              {[10, 20, 30].map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
          </div>
        </div>
      </SectionCard>

      {searchQuery.error ? <Alert variant="error">Falha ao carregar a Central de Consultas.</Alert> : null}

      <SectionCard title="Resultados" description="Visão rápida da situação atual, última movimentação e acervo vinculado ao processo.">
        <div className="space-y-4">
          {searchQuery.isLoading
            ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-36 w-full rounded-[28px]" />)
            : rows.map((row) => (
                <article key={row.id} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm transition hover:border-sky-200 hover:shadow-md">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white">{row.numeroSirel}</span>
                        <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-800">{row.modalidade}</span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{row.status}</span>
                        {row.foraDoFluxo ? <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">Fora do fluxo</span> : null}
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-slate-950">{row.objetoResumo}</h3>
                        <p className="mt-1 text-sm text-slate-600">{row.secretariaNome} · módulo atual: <span className="font-semibold text-slate-800">{row.moduloAtual}</span></p>
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Valor estimado</p>
                          <p className="mt-2 text-base font-bold text-slate-950">{formatCurrencyBRL(row.valorEstimado)}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Documentos</p>
                          <p className="mt-2 text-base font-bold text-slate-950">{row.documentos}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Criado em</p>
                          <p className="mt-2 text-base font-bold text-slate-950">{formatShortDateBR(row.dataCriacao)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex min-w-[280px] flex-col gap-3 rounded-[28px] border border-slate-200 bg-slate-50 p-4 xl:max-w-[360px]">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Última movimentação</p>
                        <p className="mt-2 text-sm font-semibold text-slate-800">{row.ultimaMovimentacao?.descricao ?? "Ainda sem movimentações registradas."}</p>
                        <p className="mt-1 text-xs text-slate-500">{row.ultimaMovimentacao?.criadoEm ? formatShortDateTimeBR(row.ultimaMovimentacao.criadoEm) : "Sem data registrada"}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link href={resolveModuloHref(row.moduloAtual)}>
                          <Button size="sm">
                            <FolderOpen className="mr-2 h-4 w-4" />
                            Abrir módulo
                          </Button>
                        </Link>
                        <Link href="/documentos">
                          <Button size="sm" variant="outline">
                            Documentos
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              ))}

          {!searchQuery.isLoading && !rows.length ? (
            <Alert variant="info">Nenhum processo encontrado com os filtros informados.</Alert>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            Total localizado: <span className="font-bold text-slate-950">{searchQuery.data?.metadados.total ?? 0}</span>
          </p>
          <Pagination page={pagina} totalPages={totalPages} onPageChange={setPagina} />
        </div>
      </SectionCard>
    </div>
  );
}



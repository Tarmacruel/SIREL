import { FileStack, Search, ShieldCheck, Stamp, Upload } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState, type FormEvent } from "react";

import { documentoAccessRoleOptions } from "@sirel/shared/schemas/documentos";

import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { deleteProcessoDocumento, uploadProcessoDocumento, type DocumentoTipo } from "@/lib/document-upload";
import { formatShortDateBR, formatShortDateTimeBR } from "@/lib/formatters";
import { resolveServerAssetUrl } from "@/lib/document-upload";
import { trpc } from "@/lib/trpc";

const pillars = [
  { title: "Versionamento", icon: FileStack, body: "Cada documento mantém processo, tipo, versão, data de referência e vínculo com o acervo." },
  { title: "Busca operacional", icon: Search, body: "Filtros por processo, tipo, categoria, publicidade e palavras-chave para localizar rápido o documento certo." },
  { title: "Controle de acesso", icon: ShieldCheck, body: "Metadados de publicidade e restrição por perfil já preparados para operação interna e portal público." },
  { title: "Padrão institucional", icon: Stamp, body: "O módulo centraliza documentos gerados pelo sistema e anexos externos em um único acervo operacional." },
];

const documentoTipos: DocumentoTipo[] = ["DFD", "ETP", "TR", "EDITAL", "COMUNICACAO_INTERNA", "RESULTADO", "CONTRATO", "OUTRO"];
type DocumentoAccessRole = (typeof documentoAccessRoleOptions)[number];
const accessRoles = documentoAccessRoleOptions as readonly DocumentoAccessRole[];

const initialUploadForm = {
  processoId: "",
  tipo: "OUTRO" as DocumentoTipo,
  titulo: "",
  categoria: "",
  descricao: "",
  dataReferencia: "",
  publico: false,
  palavrasChave: "",
  restritoA: [] as DocumentoAccessRole[],
  arquivo: null as File | null,
};

const initialMetadataForm = {
  titulo: "",
  categoria: "",
  descricao: "",
  dataReferencia: "",
  publico: false,
  palavrasChave: "",
  restritoA: [] as DocumentoAccessRole[],
};

function parseKeywords(value: string) {
  return Array.from(new Set(value.split(",").map((item) => item.trim()).filter(Boolean)));
}

export function DocumentosPage() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [tipo, setTipo] = useState<"" | DocumentoTipo>("");
  const [search, setSearch] = useState("");
  const [categoria, setCategoria] = useState("");
  const [publicoFilter, setPublicoFilter] = useState("todos");
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const [uploadForm, setUploadForm] = useState(initialUploadForm);
  const [metadataForm, setMetadataForm] = useState(initialMetadataForm);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search.trim());
  const deferredCategory = useDeferredValue(categoria.trim());

  const summaryQuery = trpc.documentos.summary.useQuery(undefined, { retry: false });
  const processOptionsQuery = trpc.documentos.processOptions.useQuery(undefined, { retry: false });
  const filters = useMemo(
    () => ({
      page,
      pageSize,
      tipo: tipo || undefined,
      search: deferredSearch || undefined,
      categoria: deferredCategory || undefined,
      publico: publicoFilter === "todos" ? undefined : publicoFilter === "publicos",
    }),
    [deferredCategory, deferredSearch, page, pageSize, publicoFilter, tipo],
  );
  const listQuery = trpc.documentos.list.useQuery(filters, { retry: false, placeholderData: (previous) => previous });
  const detailQuery = trpc.documentos.detail.useQuery({ documentoId: selectedDocumentId ?? 0 }, { enabled: Boolean(selectedDocumentId), retry: false });
  const rows = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (!rows.length) {
      setSelectedDocumentId(null);
      return;
    }
    if (!selectedDocumentId || !rows.some((item) => item.id === selectedDocumentId)) {
      setSelectedDocumentId(rows[0].id);
    }
  }, [rows, selectedDocumentId]);

  useEffect(() => {
    if (!detailQuery.data) return;
    setMetadataForm({
      titulo: detailQuery.data.titulo,
      categoria: detailQuery.data.categoria ?? "",
      descricao: detailQuery.data.descricao ?? "",
      dataReferencia: detailQuery.data.dataReferencia ? String(detailQuery.data.dataReferencia).slice(0, 10) : "",
      publico: detailQuery.data.publico,
      palavrasChave: Array.isArray(detailQuery.data.palavrasChave) ? detailQuery.data.palavrasChave.join(", ") : "",
      restritoA: Array.isArray(detailQuery.data.restritoA) ? detailQuery.data.restritoA.filter((item): item is DocumentoAccessRole => accessRoles.includes(item as DocumentoAccessRole)) : [],
    });
  }, [detailQuery.data]);

  const updateMetadataMutation = trpc.documentos.updateMetadata.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.documentos.list.invalidate(), utils.documentos.detail.invalidate(), utils.documentos.summary.invalidate()]);
      setFeedback("Metadados do documento atualizados.");
      setError(null);
    },
    onError: (mutationError) => {
      setFeedback(null);
      setError(mutationError.message);
    },
  });

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setError(null);

    if (!uploadForm.processoId || !uploadForm.titulo.trim() || !uploadForm.arquivo) {
      setError("Informe processo, título e arquivo para anexar o documento.");
      return;
    }

    try {
      await uploadProcessoDocumento({
        processoId: Number(uploadForm.processoId),
        tipo: uploadForm.tipo,
        titulo: uploadForm.titulo,
        categoria: uploadForm.categoria || undefined,
        descricao: uploadForm.descricao || undefined,
        dataReferencia: uploadForm.dataReferencia || undefined,
        publico: uploadForm.publico,
        palavrasChave: parseKeywords(uploadForm.palavrasChave),
        restritoA: uploadForm.restritoA,
        arquivo: uploadForm.arquivo,
      });
      await Promise.all([utils.documentos.list.invalidate(), utils.documentos.summary.invalidate(), utils.documentos.processOptions.invalidate()]);
      setUploadForm(initialUploadForm);
      setFeedback("Documento anexado ao acervo com sucesso.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Falha ao enviar o documento.");
    }
  }

  async function handleUpdateMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDocumentId) return;
    setFeedback(null);
    setError(null);

    await updateMetadataMutation.mutateAsync({
      documentoId: selectedDocumentId,
      titulo: metadataForm.titulo,
      categoria: metadataForm.categoria || undefined,
      descricao: metadataForm.descricao || undefined,
      dataReferencia: metadataForm.dataReferencia || undefined,
      publico: metadataForm.publico,
      palavrasChave: parseKeywords(metadataForm.palavrasChave),
      restritoA: metadataForm.restritoA,
    });
  }

  async function handleDeleteSelected() {
    if (!selectedDocumentId || !detailQuery.data) return;
    if (!window.confirm(`Deseja remover o documento ${detailQuery.data.titulo}?`)) return;

    try {
      await deleteProcessoDocumento(selectedDocumentId);
      await Promise.all([utils.documentos.list.invalidate(), utils.documentos.summary.invalidate(), utils.documentos.detail.invalidate()]);
      setSelectedDocumentId(null);
      setFeedback("Documento removido do acervo.");
      setError(null);
    } catch (deleteError) {
      setFeedback(null);
      setError(deleteError instanceof Error ? deleteError.message : "Falha ao remover o documento.");
    }
  }

  return (
    <SectionCard title="Central de Documentos" description="Acervo único da Beta 2.0 com metadados, filtros operacionais, upload local e edição do documento selecionado.">
      <Tabs
        items={[
          {
            value: "visao-geral",
            label: "Visão geral",
            content: (
              <div className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-4">
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
                <div className="grid gap-4 md:grid-cols-4">
                  {[
                    { label: "Documentos", value: summaryQuery.data?.total },
                    { label: "Processos com acervo", value: summaryQuery.data?.processosComDocumentos },
                    { label: "Documentos públicos", value: summaryQuery.data?.publicos },
                    { label: "Pendentes de metadados", value: summaryQuery.data?.semMetadados },
                  ].map((item) => (
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
            value: "acervo",
            label: "Acervo",
            content: (
              <div className="grid gap-6 xl:grid-cols-[1.2fr_0.85fr]">
                <div className="space-y-4">
                  <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_180px_180px_180px]">
                    <FormField label="Buscar">
                      <Input value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder="Processo, título, categoria ou palavra-chave" />
                    </FormField>
                    <FormField label="Tipo">
                      <Select value={tipo} onChange={(event) => { setPage(1); setTipo(event.target.value as typeof tipo); }}>
                        <option value="">Todos</option>
                        {documentoTipos.map((option) => <option key={option} value={option}>{option}</option>)}
                      </Select>
                    </FormField>
                    <FormField label="Categoria">
                      <Input value={categoria} onChange={(event) => { setPage(1); setCategoria(event.target.value); }} placeholder="Ex.: parecer, ata" />
                    </FormField>
                    <FormField label="Publicidade">
                      <Select value={publicoFilter} onChange={(event) => { setPage(1); setPublicoFilter(event.target.value); }}>
                        <option value="todos">Todos</option>
                        <option value="publicos">Somente públicos</option>
                        <option value="restritos">Somente restritos</option>
                      </Select>
                    </FormField>
                  </div>

                  <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white">
                    <Table className="min-w-[860px]">
                      <TableHead>
                        <tr>
                          <TableHeaderCell>Documento</TableHeaderCell>
                          <TableHeaderCell>Processo</TableHeaderCell>
                          <TableHeaderCell>Tipo</TableHeaderCell>
                          <TableHeaderCell>Referência</TableHeaderCell>
                          <TableHeaderCell>Publicidade</TableHeaderCell>
                          <TableHeaderCell>Atualizado em</TableHeaderCell>
                        </tr>
                      </TableHead>
                      <TableBody>
                        {listQuery.isLoading
                          ? Array.from({ length: 6 }).map((_, index) => (
                              <TableRow key={index}><TableCell colSpan={6}><Skeleton className="h-12 w-full" /></TableCell></TableRow>
                            ))
                          : rows.map((row) => (
                              <TableRow key={row.id} className={["cursor-pointer transition", row.id === selectedDocumentId ? "bg-sky-50/80" : "hover:bg-slate-50"].join(" ")} onClick={() => setSelectedDocumentId(row.id)}>
                                <TableCell>
                                  <div className="font-semibold text-slate-900">{row.titulo}</div>
                                  <div className="text-xs text-slate-500">{row.categoria ?? "Sem categoria"}</div>
                                </TableCell>
                                <TableCell>{row.processoNumeroSirel}</TableCell>
                                <TableCell>{row.tipo}</TableCell>
                                <TableCell>{formatShortDateBR(row.dataReferencia)}</TableCell>
                                <TableCell>{row.publico ? "Público" : "Restrito"}</TableCell>
                                <TableCell>{formatShortDateTimeBR(row.atualizadoEm)}</TableCell>
                              </TableRow>
                            ))}
                        {!listQuery.isLoading && !rows.length ? (
                          <TableRow>
                            <TableCell colSpan={6} className="py-8 text-center text-slate-500">Nenhum documento encontrado.</TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-slate-600">Exibindo <span className="font-bold text-slate-950">{rows.length}</span> de <span className="font-bold text-slate-950">{total}</span> registros.</p>
                    <div className="flex items-center gap-3">
                      <Select value={String(pageSize)} onChange={(event) => setPageSize(Number(event.target.value))} className="w-[140px]">
                        {[10, 20, 50].map((option) => <option key={option} value={option}>{option} por página</option>)}
                      </Select>
                      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {feedback ? <Alert variant="success">{feedback}</Alert> : null}
                  {error ? <Alert variant="error">{error}</Alert> : null}

                  <SectionCard title="Upload no acervo" description="Anexe documentos novos com metadados operacionais já na entrada do sistema.">
                    <form className="space-y-4" onSubmit={handleUpload}>
                      <FormField label="Processo">
                        <Select value={uploadForm.processoId} onChange={(event) => setUploadForm((current) => ({ ...current, processoId: event.target.value }))}>
                          <option value="">Selecione um processo</option>
                          {processOptionsQuery.data?.map((item) => (
                            <option key={item.id} value={item.id}>{item.numeroSirel} - {item.objeto.slice(0, 64)}</option>
                          ))}
                        </Select>
                      </FormField>
                      <div className="grid gap-3 md:grid-cols-2">
                        <FormField label="Tipo">
                          <Select value={uploadForm.tipo} onChange={(event) => setUploadForm((current) => ({ ...current, tipo: event.target.value as DocumentoTipo }))}>
                            {documentoTipos.map((option) => <option key={option} value={option}>{option}</option>)}
                          </Select>
                        </FormField>
                        <FormField label="Data de referência">
                          <Input type="date" value={uploadForm.dataReferencia} onChange={(event) => setUploadForm((current) => ({ ...current, dataReferencia: event.target.value }))} />
                        </FormField>
                      </div>
                      <FormField label="Título">
                        <Input value={uploadForm.titulo} onChange={(event) => setUploadForm((current) => ({ ...current, titulo: event.target.value }))} />
                      </FormField>
                      <div className="grid gap-3 md:grid-cols-2">
                        <FormField label="Categoria">
                          <Input value={uploadForm.categoria} onChange={(event) => setUploadForm((current) => ({ ...current, categoria: event.target.value }))} placeholder="Ex.: parecer jurídico" />
                        </FormField>
                        <FormField label="Palavras-chave">
                          <Input value={uploadForm.palavrasChave} onChange={(event) => setUploadForm((current) => ({ ...current, palavrasChave: event.target.value }))} placeholder="Ex.: licitação, edital, parecer" />
                        </FormField>
                      </div>
                      <FormField label="Descrição">
                        <Input value={uploadForm.descricao} onChange={(event) => setUploadForm((current) => ({ ...current, descricao: event.target.value }))} />
                      </FormField>
                      <FormField label="Arquivo">
                        <Input type="file" onChange={(event) => setUploadForm((current) => ({ ...current, arquivo: event.target.files?.[0] ?? null }))} />
                      </FormField>
                      <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                        <Checkbox checked={uploadForm.publico} onChange={(event) => setUploadForm((current) => ({ ...current, publico: event.target.checked }))} />
                        Documento público no portal
                      </label>
                      <div className="grid gap-2 md:grid-cols-2">
                        {accessRoles.map((role) => (
                          <label key={role} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                            <Checkbox
                              checked={uploadForm.restritoA.includes(role)}
                              onChange={(event) => setUploadForm((current) => ({
                                ...current,
                                restritoA: event.target.checked
                                  ? [...current.restritoA, role]
                                  : current.restritoA.filter((item) => item !== role),
                              }))}
                            />
                            Restrito a {role}
                          </label>
                        ))}
                      </div>
                      <Button type="submit">
                        <Upload className="mr-2 h-4 w-4" />
                        Anexar documento
                      </Button>
                    </form>
                  </SectionCard>

                  <SectionCard title="Metadados do selecionado" description="Revise e ajuste o documento selecionado na lista do acervo.">
                    {!selectedDocumentId || detailQuery.isLoading ? (
                      <Skeleton className="h-72 w-full rounded-[24px]" />
                    ) : !detailQuery.data ? (
                      <Alert variant="info">Selecione um documento para revisar os metadados.</Alert>
                    ) : (
                      <form className="space-y-4" onSubmit={handleUpdateMetadata}>
                        <FormField label="Título">
                          <Input value={metadataForm.titulo} onChange={(event) => setMetadataForm((current) => ({ ...current, titulo: event.target.value }))} />
                        </FormField>
                        <div className="grid gap-3 md:grid-cols-2">
                          <FormField label="Categoria">
                            <Input value={metadataForm.categoria} onChange={(event) => setMetadataForm((current) => ({ ...current, categoria: event.target.value }))} />
                          </FormField>
                          <FormField label="Data de referência">
                            <Input type="date" value={metadataForm.dataReferencia} onChange={(event) => setMetadataForm((current) => ({ ...current, dataReferencia: event.target.value }))} />
                          </FormField>
                        </div>
                        <FormField label="Descrição">
                          <Input value={metadataForm.descricao} onChange={(event) => setMetadataForm((current) => ({ ...current, descricao: event.target.value }))} />
                        </FormField>
                        <FormField label="Palavras-chave">
                          <Input value={metadataForm.palavrasChave} onChange={(event) => setMetadataForm((current) => ({ ...current, palavrasChave: event.target.value }))} placeholder="Separar por vírgula" />
                        </FormField>
                        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                          <Checkbox checked={metadataForm.publico} onChange={(event) => setMetadataForm((current) => ({ ...current, publico: event.target.checked }))} />
                          Documento público
                        </label>
                        <div className="grid gap-2 md:grid-cols-2">
                          {accessRoles.map((role) => (
                            <label key={role} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                              <Checkbox
                                checked={metadataForm.restritoA.includes(role)}
                                onChange={(event) => setMetadataForm((current) => ({
                                  ...current,
                                  restritoA: event.target.checked
                                    ? [...current.restritoA, role]
                                    : current.restritoA.filter((item) => item !== role),
                                }))}
                              />
                              Restrito a {role}
                            </label>
                          ))}
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                          <p><span className="font-semibold text-slate-800">Processo:</span> {detailQuery.data.processoNumeroSirel}</p>
                          <p className="mt-1"><span className="font-semibold text-slate-800">Criado em:</span> {formatShortDateTimeBR(detailQuery.data.criadoEm)}</p>
                          <p className="mt-1"><span className="font-semibold text-slate-800">Versão:</span> v{detailQuery.data.versao}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button type="submit" disabled={updateMetadataMutation.isPending}>{updateMetadataMutation.isPending ? "Salvando..." : "Salvar metadados"}</Button>
                          {detailQuery.data.arquivoUrl ? (
                            <a href={resolveServerAssetUrl(detailQuery.data.arquivoUrl) ?? "#"} target="_blank" rel="noreferrer">
                              <Button type="button" variant="outline">Abrir arquivo</Button>
                            </a>
                          ) : null}
                          <Button type="button" variant="outline" onClick={handleDeleteSelected}>Excluir</Button>
                        </div>
                      </form>
                    )}
                  </SectionCard>
                </div>
              </div>
            ),
          },
        ]}
      />
    </SectionCard>
  );
}



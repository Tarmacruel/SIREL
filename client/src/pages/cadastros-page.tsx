import {
  Boxes,
  Building2,
  Download,
  FolderTree,
  Landmark,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import type { CadastroEntity } from "@sirel/shared/schemas/cadastros";

import { Modal } from "@/components/shared/modal";
import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { maskCnpj, maskPhone, validateCadastroForm, type CadastroFormErrors } from "@/features/cadastros/form";
import { resolveCadastroAssetUrl, uploadCadastroAsset } from "@/lib/cadastros-upload";
import { exportCadastrosToCsv, exportCadastrosToXlsx } from "@/lib/export-cadastros";
import { formatCurrencyBRL, formatShortDateTimeBR } from "@/lib/formatters";
import { trpc } from "@/lib/trpc";

type FormState = Record<string, any>;

const entityMeta: Array<{ key: CadastroEntity; label: string; icon: typeof Boxes; singular: string; searchLabel: string }> = [
  { key: "itens", label: "Itens", icon: Boxes, singular: "item", searchLabel: "descrição, código ou unidade" },
  { key: "fornecedores", label: "Fornecedores", icon: Building2, singular: "fornecedor", searchLabel: "razão social, CNPJ ou e-mail" },
  { key: "secretarias", label: "Secretarias", icon: Landmark, singular: "secretaria", searchLabel: "nome, sigla ou responsável" },
  { key: "departamentos", label: "Departamentos", icon: FolderTree, singular: "departamento", searchLabel: "nome, centro de custo ou secretaria" },
  { key: "usuarios", label: "Usuários", icon: Users, singular: "usuário", searchLabel: "nome, login ou e-mail" },
  { key: "parametros", label: "Parâmetros", icon: Settings2, singular: "parâmetro", searchLabel: "categoria, chave ou valor" },
];

const roleLabels: Record<string, string> = {
  user: "Usuário",
  operador: "Operador",
  gestor: "Gestor",
  admin: "Administrador",
  auditor: "Auditor",
};

function getEntityMeta(entity: CadastroEntity) {
  return entityMeta.find((item) => item.key === entity) ?? entityMeta[0];
}

function getDefaultForm(entity: CadastroEntity): FormState {
  switch (entity) {
    case "itens":
      return { descricao: "", unidadePadrao: "UN", valorReferencia: "", ativo: true };
    case "fornecedores":
      return { razaoSocial: "", cnpj: "", email: "", telefone: "", cidade: "", estado: "BA", ativo: true };
    case "secretarias":
      return { sigla: "", nome: "", responsavel: "", email: "", telefone: "", descricao: "", ativo: true };
    case "departamentos":
      return { nome: "", codigoCentroCusto: "", secretariaId: "", responsavelId: "", descricao: "", ativo: true };
    case "usuarios":
      return { username: "", name: "", email: "", role: "operador", secretariaId: "", password: "", ativo: true };
    case "parametros":
      return { categoria: "", chave: "", valor: "", descricao: "", ativo: true };
  }
}

function mapRowToForm(entity: CadastroEntity, row: Record<string, any>): FormState {
  switch (entity) {
    case "itens":
      return {
        id: row.id,
        descricao: row.nome ?? "",
        unidadePadrao: row.unidade ?? "UN",
        valorReferencia: row.valorReferencia ?? "",
        ativo: row.status === "ativo",
      };
    case "fornecedores":
      return {
        id: row.id,
        razaoSocial: row.razaoSocial ?? "",
        cnpj: row.cnpj ?? "",
        email: row.email ?? "",
        telefone: row.telefone ?? "",
        cidade: row.cidade ?? "",
        estado: row.estado ?? "BA",
        ativo: row.status === "ativo",
      };
    case "secretarias":
      return {
        id: row.id,
        sigla: row.sigla ?? "",
        nome: row.nome ?? "",
        responsavel: row.responsavel ?? "",
        email: row.email ?? "",
        telefone: row.telefone ?? "",
        descricao: row.descricao ?? "",
        ativo: row.status === "ativo",
      };
    case "departamentos":
      return {
        id: row.id,
        nome: row.nome ?? "",
        codigoCentroCusto: row.codigoCentroCusto ?? "",
        secretariaId: row.secretariaId ? String(row.secretariaId) : "",
        responsavelId: row.responsavelId ? String(row.responsavelId) : "",
        descricao: row.descricao ?? "",
        ativo: row.status === "ativo",
      };
    case "usuarios":
      return {
        id: row.id,
        username: row.username ?? "",
        name: row.name ?? "",
        email: row.email ?? "",
        role: row.role ?? "operador",
        secretariaId: row.secretariaId ? String(row.secretariaId) : "",
        password: "",
        ativo: row.status === "ativo",
      };
    case "parametros":
      return {
        id: row.id,
        categoria: row.categoria ?? "",
        chave: row.chave ?? "",
        valor: row.valor ?? "",
        descricao: row.descricao ?? "",
        ativo: row.status === "ativo",
      };
  }
}

function highlightTerm(text: string, term: string) {
  if (!term.trim()) return text;
  const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
  const parts = text.split(regex);
  return parts.map((part, index) =>
    regex.test(part) ? (
      <mark key={`${part}-${index}`} className="rounded bg-[rgba(245,158,11,0.22)] px-1 text-[var(--color-primary-900)]">
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}

function formatCnpj(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length !== 14) return value ?? "-";
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function CadastroStatusBadge({ status }: { status: string }) {
  const active = status === "ativo";
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold",
        active
          ? "bg-[rgba(16,185,129,0.14)] text-[color:var(--color-success)]"
          : "bg-[var(--color-neutral-100)] text-[var(--color-neutral-600)]",
      ].join(" ")}
    >
      {active ? "Ativo" : "Inativo"}
    </span>
  );
}

function buildExportRows(entity: CadastroEntity, rows: Array<Record<string, any>>) {
  switch (entity) {
    case "itens":
      return rows.map((row) => ({
        Codigo: row.codigo,
        Item: row.nome,
        Unidade: row.unidade,
        "Valor de referencia": row.valorReferencia ?? "",
        Status: row.status,
      }));
    case "fornecedores":
      return rows.map((row) => ({
        "Razao social": row.razaoSocial,
        CNPJ: formatCnpj(row.cnpj),
        Email: row.email ?? "",
        Telefone: row.telefone ?? "",
        Cidade: row.cidade ?? "",
        Estado: row.estado ?? "",
        Status: row.status,
      }));
    case "secretarias":
      return rows.map((row) => ({
        Sigla: row.sigla,
        Secretaria: row.nome,
        Responsavel: row.responsavel ?? "",
        Email: row.email ?? "",
        Telefone: row.telefone ?? "",
        Status: row.status,
      }));
    case "departamentos":
      return rows.map((row) => ({
        Departamento: row.nome,
        "Centro de custo": row.codigoCentroCusto ?? "",
        Secretaria: row.secretariaNome ?? "",
        Responsavel: row.responsavelNome ?? "",
        Status: row.status,
      }));
    case "usuarios":
      return rows.map((row) => ({
        Login: row.username ?? "",
        Nome: row.name,
        Email: row.email ?? "",
        Perfil: roleLabels[row.role] ?? row.role,
        Secretaria: row.secretariaNome ?? "",
        Status: row.status,
      }));
    case "parametros":
      return rows.map((row) => ({
        Categoria: row.categoria,
        Chave: row.chave,
        Valor: row.valor,
        Descricao: row.descricao ?? "",
        Status: row.status,
      }));
  }
}

function CadastroMobileCard({
  entity,
  row,
  search,
  onEdit,
  onDelete,
}: {
  entity: CadastroEntity;
  row: Record<string, any>;
  search: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="md:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          {entity === "itens" ? (
            <>
              <p className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.nome, search)}</p>
              <p className="text-xs font-mono text-[var(--color-neutral-500)]">{row.codigo}</p>
              <p className="text-sm text-[var(--color-neutral-600)]">{row.unidade} · {row.valorReferencia ? formatCurrencyBRL(row.valorReferencia) : "Sem valor"}</p>
            </>
          ) : null}
          {entity === "fornecedores" ? (
            <>
              <p className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.razaoSocial, search)}</p>
              <p className="text-xs font-mono text-[var(--color-neutral-500)]">{formatCnpj(row.cnpj)}</p>
              <p className="text-sm text-[var(--color-neutral-600)]">{row.cidade ?? "Sem cidade"}{row.estado ? `/${row.estado}` : ""}</p>
            </>
          ) : null}
          {entity === "secretarias" ? (
            <>
              <p className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.nome, search)}</p>
              <p className="text-xs font-mono text-[var(--color-neutral-500)]">{row.sigla}</p>
              <p className="text-sm text-[var(--color-neutral-600)]">{row.responsavel ?? "Sem responsável"}</p>
            </>
          ) : null}
          {entity === "departamentos" ? (
            <>
              <p className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.nome, search)}</p>
              <p className="text-xs text-[var(--color-neutral-500)]">{row.secretariaNome ?? "Sem secretaria"}</p>
              <p className="text-sm text-[var(--color-neutral-600)]">{row.codigoCentroCusto ?? "Sem centro de custo"}</p>
            </>
          ) : null}
          {entity === "usuarios" ? (
            <>
              <p className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.name, search)}</p>
              <p className="text-xs font-mono text-[var(--color-neutral-500)]">{row.username ?? "Sem login"}</p>
              <p className="text-sm text-[var(--color-neutral-600)]">{roleLabels[row.role] ?? row.role}</p>
            </>
          ) : null}
          {entity === "parametros" ? (
            <>
              <p className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.chave, search)}</p>
              <p className="text-xs text-[var(--color-neutral-500)]">{row.categoria}</p>
              <p className="text-sm text-[var(--color-neutral-600)]">{row.valor}</p>
            </>
          ) : null}
        </div>
        <CadastroStatusBadge status={row.status} />
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onEdit} icon={<Pencil className="h-4 w-4" />}>
          Editar
        </Button>
        <Button variant="destructive" size="sm" className="flex-1" onClick={onDelete} icon={<Trash2 className="h-4 w-4" />}>
          Inativar
        </Button>
      </div>
    </Card>
  );
}

export function CadastrosPage() {
  const searchRef = useRef<HTMLInputElement | null>(null);
  const utils = trpc.useUtils();
  const [entity, setEntity] = useState<CadastroEntity>("itens");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | "ativo" | "inativo">("");
  const [secretariaId, setSecretariaId] = useState("");
  const [role, setRole] = useState("");
  const [cidade, setCidade] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>(() => getDefaultForm("itens"));
  const [formErrors, setFormErrors] = useState<CadastroFormErrors>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [assetPreviewUrl, setAssetPreviewUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search.trim());

  const optionsQuery = trpc.cadastros.formOptions.useQuery(undefined, { retry: false });
  const summaryQuery = trpc.cadastros.summary.useQuery({ entity }, { retry: false });

  const listQuery = trpc.cadastros.list.useQuery(
    {
      entity,
      search: deferredSearch || undefined,
      status: status || undefined,
      secretariaId: secretariaId ? Number(secretariaId) : undefined,
      role: role ? (role as any) : undefined,
      cidade: cidade.trim() || undefined,
      page,
      pageSize,
    },
    { retry: false, placeholderData: (previous) => previous },
  );

  const rows = (listQuery.data?.items ?? []) as Array<Record<string, any>>;
  const totalPages = listQuery.data?.totalPages ?? 1;
  const meta = getEntityMeta(entity);

  const saveMutation = trpc.cadastros.save.useMutation({
    onError: (mutationError) => {
      setFeedback(null);
      setError(mutationError.message);
    },
  });

  const removeMutation = trpc.cadastros.remove.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.cadastros.list.invalidate(), utils.cadastros.summary.invalidate()]);
      setError(null);
      setFeedback("Registro inativado com sucesso.");
    },
    onError: (mutationError) => {
      setFeedback(null);
      setError(mutationError.message);
    },
  });

  useEffect(() => {
    setPage(1);
    setSearch("");
    setStatus("");
    setSecretariaId("");
    setRole("");
    setCidade("");
    setEditingId(null);
    setModalOpen(false);
    setFormState(getDefaultForm(entity));
    setFormErrors({});
    setAssetFile(null);
    setAssetPreviewUrl(null);
    setFeedback(null);
    setError(null);
  }, [entity]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        openCreateModal();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape" && modalOpen) {
        event.preventDefault();
        closeModal();
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [modalOpen, entity]);

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setFormState(getDefaultForm(entity));
    setFormErrors({});
    setAssetFile(null);
    setAssetPreviewUrl(null);
  }

  function openCreateModal() {
    setEditingId(null);
    setFormState(getDefaultForm(entity));
    setFormErrors({});
    setAssetFile(null);
    setAssetPreviewUrl(null);
    setModalOpen(true);
    setFeedback(null);
    setError(null);
  }

  function openEditModal(row: Record<string, any>) {
    setEditingId(row.id);
    setFormState(mapRowToForm(entity, row));
    setFormErrors({});
    setAssetFile(null);
    setAssetPreviewUrl(resolveCadastroAssetUrl(entity === "itens" ? row.imagemUrl : entity === "fornecedores" ? row.logoUrl : null));
    setModalOpen(true);
    setFeedback(null);
    setError(null);
  }

  async function handleDelete(row: Record<string, any>) {
    const label =
      entity === "itens"
        ? row.nome
        : entity === "fornecedores"
          ? row.razaoSocial
          : entity === "secretarias"
            ? row.nome
            : entity === "departamentos"
              ? row.nome
              : entity === "usuarios"
                ? row.name
                : row.chave;

    if (!window.confirm(`Deseja inativar este registro?\n\n${label}`)) return;
    await removeMutation.mutateAsync({ entity, id: row.id });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setError(null);
    const validation = validateCadastroForm(entity, formState, editingId);
    if (!validation.success) {
      setFormErrors(validation.errors);
      setError("Revise os campos obrigatórios antes de salvar.");
      return;
    }

    setFormErrors({});
    try {
      const saved = await saveMutation.mutateAsync({ entity, data: validation.data } as any);

      if (assetFile && (entity === "itens" || entity === "fornecedores")) {
        const uploadResult = await uploadCadastroAsset({
          entity,
          recordId: Number(saved.id),
          arquivo: assetFile,
        });
        setAssetPreviewUrl(resolveCadastroAssetUrl(uploadResult.assetUrl));
      }

      await Promise.all([utils.cadastros.list.invalidate(), utils.cadastros.summary.invalidate()]);
      closeModal();
      setError(null);
      setFeedback(`${meta.singular.charAt(0).toUpperCase()}${meta.singular.slice(1)} salvo com sucesso.`);
    } catch (submitError) {
      setFeedback(null);
      setError(submitError instanceof Error ? submitError.message : "Falha ao salvar o cadastro.");
    }
  }

  async function handleExport(kind: "csv" | "xlsx") {
    const exportRows = buildExportRows(entity, rows);
    const filenameBase = `sirel-cadastros-${entity}-${new Date().toISOString().slice(0, 10)}`;
    if (kind === "csv") {
      exportCadastrosToCsv(`${filenameBase}.csv`, exportRows);
      return;
    }
    await exportCadastrosToXlsx(`${filenameBase}.xlsx`, meta.label, exportRows);
  }

  function updateForm(key: string, value: unknown) {
    setFormState((current) => ({ ...current, [key]: value }));
    setFormErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function handleAssetSelected(file: File | null) {
    setAssetFile(file);
    if (!file) {
      if (!editingId) {
        setAssetPreviewUrl(null);
      }
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setAssetPreviewUrl(objectUrl);
  }

  function fieldError(name: string) {
    return formErrors[name];
  }

  function renderToolbarFilters() {
    if (entity === "fornecedores") {
      return (
        <FormField label="Cidade">
          <Input value={cidade} onChange={(event) => { setPage(1); setCidade(event.target.value); }} placeholder="Filtrar por cidade" />
        </FormField>
      );
    }

    if (entity === "departamentos") {
      return (
        <FormField label="Secretaria">
          <Select value={secretariaId} onChange={(event) => { setPage(1); setSecretariaId(event.target.value); }}>
            <option value="">Todas</option>
            {optionsQuery.data?.secretarias.map((item) => (
              <option key={item.id} value={item.id}>{item.sigla} - {item.nome}</option>
            ))}
          </Select>
        </FormField>
      );
    }

    if (entity === "usuarios") {
      return (
        <>
          <FormField label="Secretaria">
            <Select value={secretariaId} onChange={(event) => { setPage(1); setSecretariaId(event.target.value); }}>
              <option value="">Todas</option>
              {optionsQuery.data?.secretarias.map((item) => (
                <option key={item.id} value={item.id}>{item.sigla} - {item.nome}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Perfil">
            <Select value={role} onChange={(event) => { setPage(1); setRole(event.target.value); }}>
              <option value="">Todos</option>
              {optionsQuery.data?.userRoles.map((item) => (
                <option key={item.codigo} value={item.codigo}>{item.nome}</option>
              ))}
            </Select>
          </FormField>
        </>
      );
    }

    return null;
  }

  function renderTableRows() {
    return rows.map((row) => (
      <TableRow key={row.id} className="transition hover:bg-[rgba(230,240,255,0.4)]">
        {entity === "itens" ? (
          <>
            <TableCell>
              <div className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.nome, search)}</div>
              <div className="text-xs font-mono text-[var(--color-neutral-500)]">{row.codigo}</div>
            </TableCell>
            <TableCell>{row.unidade}</TableCell>
            <TableCell>{row.valorReferencia ? formatCurrencyBRL(row.valorReferencia) : "-"}</TableCell>
          </>
        ) : null}
        {entity === "fornecedores" ? (
          <>
            <TableCell>
              <div className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.razaoSocial, search)}</div>
              <div className="text-xs font-mono text-[var(--color-neutral-500)]">{formatCnpj(row.cnpj)}</div>
            </TableCell>
            <TableCell>{row.cidade ?? "-"}</TableCell>
            <TableCell>{row.email ?? "-"}</TableCell>
          </>
        ) : null}
        {entity === "secretarias" ? (
          <>
            <TableCell>
              <div className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.nome, search)}</div>
              <div className="text-xs font-mono text-[var(--color-neutral-500)]">{row.sigla}</div>
            </TableCell>
            <TableCell>{row.responsavel ?? "-"}</TableCell>
            <TableCell>{row.email ?? "-"}</TableCell>
          </>
        ) : null}
        {entity === "departamentos" ? (
          <>
            <TableCell>
              <div className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.nome, search)}</div>
              <div className="text-xs text-[var(--color-neutral-500)]">{row.codigoCentroCusto ?? "Sem centro de custo"}</div>
            </TableCell>
            <TableCell>{row.secretariaNome ?? "-"}</TableCell>
            <TableCell>{row.responsavelNome ?? "-"}</TableCell>
          </>
        ) : null}
        {entity === "usuarios" ? (
          <>
            <TableCell>
              <div className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.name, search)}</div>
              <div className="text-xs font-mono text-[var(--color-neutral-500)]">{row.username ?? "-"}</div>
            </TableCell>
            <TableCell>{roleLabels[row.role] ?? row.role}</TableCell>
            <TableCell>{row.secretariaNome ?? "-"}</TableCell>
          </>
        ) : null}
        {entity === "parametros" ? (
          <>
            <TableCell>
              <div className="font-semibold text-[var(--color-primary-900)]">{highlightTerm(row.chave, search)}</div>
              <div className="text-xs text-[var(--color-neutral-500)]">{row.categoria}</div>
            </TableCell>
            <TableCell>{row.valor}</TableCell>
            <TableCell>{row.descricao ?? "-"}</TableCell>
          </>
        ) : null}
        <TableCell><CadastroStatusBadge status={row.status} /></TableCell>
        <TableCell>{row.atualizadoEm ? formatShortDateTimeBR(row.atualizadoEm) : "-"}</TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => openEditModal(row)} icon={<Pencil className="h-4 w-4" />}>
              Editar
            </Button>
            <Button variant="destructive" size="sm" onClick={() => void handleDelete(row)} icon={<Trash2 className="h-4 w-4" />}>
              Inativar
            </Button>
          </div>
        </TableCell>
      </TableRow>
    ));
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Módulo de Cadastros"
        description="Centralize a manutenção das entidades mestres do SIREL em um único ponto operacional."
        action={
          <div className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary-100)] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary-800)]">
            <Settings2 className="h-4 w-4" />
            Dados mestres
          </div>
        }
      >
        <div className="flex gap-2 overflow-x-auto pb-1">
          {entityMeta.map((item) => {
            const Icon = item.icon;
            const active = entity === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setEntity(item.key)}
                className={[
                  "inline-flex min-w-fit items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition",
                  active
                    ? "border-[rgba(47,84,196,0.32)] bg-[var(--color-primary-50)] text-[var(--color-primary-800)]"
                    : "border-[rgba(209,213,219,0.92)] bg-white text-[var(--color-neutral-700)] hover:border-[rgba(47,84,196,0.24)] hover:bg-[var(--color-primary-50)] hover:text-[var(--color-primary-800)]",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
        <Card>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Entidade ativa</p>
          <p className="mt-2 text-2xl font-black text-[var(--color-primary-900)]">{meta.label}</p>
        </Card>
        <Card>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Total</p>
          {summaryQuery.isLoading ? <Skeleton className="mt-2 h-8 w-20" /> : <p className="mt-2 text-2xl font-black text-[var(--color-primary-900)]">{summaryQuery.data?.total ?? 0}</p>}
        </Card>
        <Card>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Ativos</p>
          {summaryQuery.isLoading ? <Skeleton className="mt-2 h-8 w-20" /> : <p className="mt-2 text-2xl font-black text-[var(--color-primary-900)]">{summaryQuery.data?.ativos ?? 0}</p>}
        </Card>
        <Card>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Inativos</p>
          {summaryQuery.isLoading ? <Skeleton className="mt-2 h-8 w-20" /> : <p className="mt-2 text-2xl font-black text-[var(--color-primary-900)]">{Math.max(0, (summaryQuery.data?.total ?? 0) - (summaryQuery.data?.ativos ?? 0))}</p>}
        </Card>
      </div>

      <SectionCard title={`Consulta de ${meta.label}`} description="Busca textual, filtros rápidos e exportação local da entidade selecionada.">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_180px_220px_220px]">
          <FormField label={`Buscar em ${meta.label.toLowerCase()}`}>
            <div className="flex items-center gap-2 rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(230,240,255,0.65))] px-3 py-2 shadow-[0_8px_18px_-18px_rgba(15,26,109,0.4)]">
              <Search className="h-4 w-4 text-[var(--color-primary-500)]" />
              <input
                ref={searchRef}
                value={search}
                onChange={(event) => { setPage(1); setSearch(event.target.value); }}
                placeholder={`Ex.: ${meta.searchLabel}`}
                className="w-full border-none bg-transparent text-sm text-[var(--color-neutral-700)] outline-none placeholder:text-[var(--color-neutral-400)]"
              />
            </div>
          </FormField>
          <FormField label="Status">
            <Select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value as any); }}>
              <option value="">Todos</option>
              <option value="ativo">Ativos</option>
              <option value="inativo">Inativos</option>
            </Select>
          </FormField>
          {renderToolbarFilters()}
          <FormField label="Por página">
            <Select value={String(pageSize)} onChange={(event) => { setPage(1); setPageSize(Number(event.target.value)); }}>
              {[10, 20, 30].map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
          </FormField>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void handleExport("csv")} disabled={!rows.length} icon={<Download className="h-4 w-4" />}>
            Exportar CSV
          </Button>
          <Button variant="outline" onClick={() => void handleExport("xlsx")} disabled={!rows.length} icon={<Download className="h-4 w-4" />}>
            Exportar XLSX
          </Button>
          <Button onClick={openCreateModal} icon={<Plus className="h-4 w-4" />}>
            Novo {meta.singular}
          </Button>
        </div>
      </SectionCard>

      {feedback ? <Alert variant="success">{feedback}</Alert> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      {listQuery.error ? <Alert variant="error">Falha ao carregar os cadastros da entidade selecionada.</Alert> : null}

      <SectionCard title={`Lista de ${meta.label}`} description="Listagem paginada com ações de edição, inativação e atualização rápida.">
        {listQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 w-full rounded-[24px]" />)}
          </div>
        ) : rows.length ? (
          <>
            <div className="space-y-3 md:hidden">
              {rows.map((row) => (
                <CadastroMobileCard key={row.id} entity={entity} row={row} search={search} onEdit={() => openEditModal(row)} onDelete={() => void handleDelete(row)} />
              ))}
            </div>

            <div className="hidden overflow-x-auto rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white shadow-[0_14px_30px_-26px_rgba(15,26,109,0.22)] md:block">
              <Table className="min-w-[960px]">
                <TableHead>
                  <tr>
                    <TableHeaderCell>{entity === "parametros" ? "Registro" : meta.singular.charAt(0).toUpperCase() + meta.singular.slice(1)}</TableHeaderCell>
                    <TableHeaderCell>{entity === "itens" ? "Unidade" : entity === "fornecedores" ? "Cidade" : entity === "secretarias" ? "Responsável" : entity === "departamentos" ? "Secretaria" : entity === "usuarios" ? "Perfil" : "Valor"}</TableHeaderCell>
                    <TableHeaderCell>{entity === "itens" ? "Valor ref." : entity === "fornecedores" ? "E-mail" : entity === "secretarias" ? "E-mail" : entity === "departamentos" ? "Responsável" : entity === "usuarios" ? "Secretaria" : "Descrição"}</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Atualizado</TableHeaderCell>
                    <TableHeaderCell className="text-right">Ações</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>{renderTableRows()}</TableBody>
              </Table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[var(--color-neutral-600)]">
                Exibindo <span className="font-bold text-[var(--color-primary-900)]">{rows.length}</span> de <span className="font-bold text-[var(--color-primary-900)]">{listQuery.data?.total ?? 0}</span> registros.
              </p>
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </>
        ) : (
          <Alert variant="info">Nenhum registro encontrado com os filtros atuais.</Alert>
        )}
      </SectionCard>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        size="lg"
        title={`${editingId ? "Editar" : "Novo"} ${meta.singular}`}
        description="Preencha os campos abaixo. Todas as alterações ficam registradas na auditoria do sistema."
      >
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            {entity === "itens" ? (
              <>
                <FormField label="Descrição" error={fieldError("descricao")}>
                  <Input value={formState.descricao ?? ""} onChange={(event) => updateForm("descricao", event.target.value)} placeholder="Ex.: Cartucho de toner HP 85A" />
                </FormField>
                <FormField label="Unidade padrão" error={fieldError("unidadePadrao")}>
                  <Input value={formState.unidadePadrao ?? ""} onChange={(event) => updateForm("unidadePadrao", event.target.value.toUpperCase())} placeholder="UN" />
                </FormField>
                <FormField label="Valor de referência (R$)" error={fieldError("valorReferencia")}>
                  <Input type="number" step="0.01" min="0" value={formState.valorReferencia ?? ""} onChange={(event) => updateForm("valorReferencia", event.target.value)} placeholder="0,00" />
                </FormField>
              </>
            ) : null}

            {entity === "fornecedores" ? (
              <>
                <FormField label="Razão social" className="md:col-span-2" error={fieldError("razaoSocial")}>
                  <Input value={formState.razaoSocial ?? ""} onChange={(event) => updateForm("razaoSocial", event.target.value)} />
                </FormField>
                <FormField label="CNPJ" error={fieldError("cnpj")}>
                  <Input value={formState.cnpj ?? ""} onChange={(event) => updateForm("cnpj", maskCnpj(event.target.value))} />
                </FormField>
                <FormField label="Telefone" error={fieldError("telefone")}>
                  <Input value={formState.telefone ?? ""} onChange={(event) => updateForm("telefone", maskPhone(event.target.value))} />
                </FormField>
                <FormField label="E-mail" className="md:col-span-2" error={fieldError("email")}>
                  <Input type="email" value={formState.email ?? ""} onChange={(event) => updateForm("email", event.target.value)} />
                </FormField>
                <FormField label="Cidade" error={fieldError("cidade")}>
                  <Input value={formState.cidade ?? ""} onChange={(event) => updateForm("cidade", event.target.value)} />
                </FormField>
                <FormField label="UF" error={fieldError("estado")}>
                  <Input value={formState.estado ?? ""} onChange={(event) => updateForm("estado", event.target.value.toUpperCase())} maxLength={2} />
                </FormField>
              </>
            ) : null}

            {entity === "secretarias" ? (
              <>
                <FormField label="Sigla" error={fieldError("sigla")}>
                  <Input value={formState.sigla ?? ""} onChange={(event) => updateForm("sigla", event.target.value.toUpperCase())} />
                </FormField>
                <FormField label="Nome da secretaria" error={fieldError("nome")}>
                  <Input value={formState.nome ?? ""} onChange={(event) => updateForm("nome", event.target.value)} />
                </FormField>
                <FormField label="Responsável" error={fieldError("responsavel")}>
                  <Input value={formState.responsavel ?? ""} onChange={(event) => updateForm("responsavel", event.target.value)} />
                </FormField>
                <FormField label="Telefone" error={fieldError("telefone")}>
                  <Input value={formState.telefone ?? ""} onChange={(event) => updateForm("telefone", maskPhone(event.target.value))} />
                </FormField>
                <FormField label="E-mail" className="md:col-span-2" error={fieldError("email")}>
                  <Input type="email" value={formState.email ?? ""} onChange={(event) => updateForm("email", event.target.value)} />
                </FormField>
                <FormField label="Descrição" className="md:col-span-2" error={fieldError("descricao")}>
                  <Textarea value={formState.descricao ?? ""} onChange={(event) => updateForm("descricao", event.target.value)} className="border-[rgba(204,225,255,0.92)] text-[var(--color-neutral-800)] focus:border-[var(--color-primary-400)]" />
                </FormField>
              </>
            ) : null}

            {entity === "departamentos" ? (
              <>
                <FormField label="Nome do departamento" error={fieldError("nome")}>
                  <Input value={formState.nome ?? ""} onChange={(event) => updateForm("nome", event.target.value)} />
                </FormField>
                <FormField label="Centro de custo" error={fieldError("codigoCentroCusto")}>
                  <Input value={formState.codigoCentroCusto ?? ""} onChange={(event) => updateForm("codigoCentroCusto", event.target.value.toUpperCase())} />
                </FormField>
                <FormField label="Secretaria" error={fieldError("secretariaId")}>
                  <Select value={formState.secretariaId ?? ""} onChange={(event) => updateForm("secretariaId", event.target.value)}>
                    <option value="">Selecione</option>
                    {optionsQuery.data?.secretarias.map((item) => (
                      <option key={item.id} value={item.id}>{item.sigla} - {item.nome}</option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Responsável" error={fieldError("responsavelId")}>
                  <Select value={formState.responsavelId ?? ""} onChange={(event) => updateForm("responsavelId", event.target.value)}>
                    <option value="">Não definir</option>
                    {optionsQuery.data?.pessoas.map((item) => (
                      <option key={item.id} value={item.id}>{item.nome}{item.cargo ? ` - ${item.cargo}` : ""}</option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Descrição" className="md:col-span-2" error={fieldError("descricao")}>
                  <Textarea value={formState.descricao ?? ""} onChange={(event) => updateForm("descricao", event.target.value)} className="border-[rgba(204,225,255,0.92)] text-[var(--color-neutral-800)] focus:border-[var(--color-primary-400)]" />
                </FormField>
              </>
            ) : null}

            {entity === "usuarios" ? (
              <>
                {!editingId ? (
                  <FormField label="Login" error={fieldError("username")}>
                    <Input value={formState.username ?? ""} onChange={(event) => updateForm("username", event.target.value)} />
                  </FormField>
                ) : null}
                <FormField label="Nome" error={fieldError("name")}>
                  <Input value={formState.name ?? ""} onChange={(event) => updateForm("name", event.target.value)} />
                </FormField>
                <FormField label="Perfil" error={fieldError("role")}>
                  <Select value={formState.role ?? "operador"} onChange={(event) => updateForm("role", event.target.value)}>
                    {optionsQuery.data?.userRoles.map((item) => (
                      <option key={item.codigo} value={item.codigo}>{item.nome}</option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Secretaria" error={fieldError("secretariaId")}>
                  <Select value={formState.secretariaId ?? ""} onChange={(event) => updateForm("secretariaId", event.target.value)}>
                    <option value="">Sem vínculo</option>
                    {optionsQuery.data?.secretarias.map((item) => (
                      <option key={item.id} value={item.id}>{item.sigla} - {item.nome}</option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="E-mail" className="md:col-span-2" error={fieldError("email")}>
                  <Input type="email" value={formState.email ?? ""} onChange={(event) => updateForm("email", event.target.value)} />
                </FormField>
                {!editingId ? (
                  <FormField label="Senha inicial" className="md:col-span-2" error={fieldError("password")}>
                    <Input type="password" value={formState.password ?? ""} onChange={(event) => updateForm("password", event.target.value)} />
                  </FormField>
                ) : null}
              </>
            ) : null}

            {entity === "parametros" ? (
              <>
                <FormField label="Categoria" error={fieldError("categoria")}>
                  <Input value={formState.categoria ?? ""} onChange={(event) => updateForm("categoria", event.target.value.toUpperCase())} />
                </FormField>
                <FormField label="Chave" error={fieldError("chave")}>
                  <Input value={formState.chave ?? ""} onChange={(event) => updateForm("chave", event.target.value.toUpperCase())} />
                </FormField>
                <FormField label="Valor" className="md:col-span-2" error={fieldError("valor")}>
                  <Input value={formState.valor ?? ""} onChange={(event) => updateForm("valor", event.target.value)} />
                </FormField>
                <FormField label="Descrição" className="md:col-span-2" error={fieldError("descricao")}>
                  <Textarea value={formState.descricao ?? ""} onChange={(event) => updateForm("descricao", event.target.value)} className="border-[rgba(204,225,255,0.92)] text-[var(--color-neutral-800)] focus:border-[var(--color-primary-400)]" />
                </FormField>
              </>
            ) : null}
          </div>

          {(entity === "itens" || entity === "fornecedores") ? (
            <div className="rounded-[24px] border border-[rgba(204,225,255,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(230,240,255,0.68))] p-4">
              <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)] md:items-start">
                <div className="overflow-hidden rounded-[22px] border border-[rgba(204,225,255,0.92)] bg-white p-3">
                  {assetPreviewUrl ? (
                    <img
                      src={assetPreviewUrl}
                      alt={entity === "itens" ? "Imagem do item" : "Logo do fornecedor"}
                      className="h-36 w-full rounded-[16px] object-cover"
                    />
                  ) : (
                    <div className="flex h-36 items-center justify-center rounded-[16px] bg-[var(--color-neutral-50)] text-center text-sm font-semibold text-[var(--color-neutral-500)]">
                      Nenhum arquivo selecionado
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <FormField
                    label={entity === "itens" ? "Imagem de referência" : "Logo do fornecedor"}
                    description="Envie PNG, JPG ou WEBP com até 10 MB. O novo arquivo substitui o anterior."
                  >
                    <Input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => handleAssetSelected(event.target.files?.[0] ?? null)}
                    />
                  </FormField>
                  <p className="text-sm text-[var(--color-neutral-600)]">
                    {entity === "itens"
                      ? "A imagem ajuda na identificação rápida do item no catálogo e nas próximas seleções da DFD."
                      : "A logo facilita a conferência visual do fornecedor nas consultas e cadastros relacionados."}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <label className="inline-flex items-center gap-3 rounded-2xl border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-3 text-sm font-semibold text-[var(--color-neutral-700)]">
            <input type="checkbox" checked={!!formState.ativo} onChange={(event) => updateForm("ativo", event.target.checked)} className="h-4 w-4 rounded border-[var(--color-neutral-300)] text-[var(--color-primary-600)]" />
            Registro ativo
          </label>

          <div className="flex flex-wrap justify-end gap-2 border-t border-[rgba(204,225,255,0.92)] pt-4">
            <Button variant="outline" onClick={closeModal}>Cancelar</Button>
            <Button type="submit" loading={saveMutation.isPending} icon={<UserCog className="h-4 w-4" />}>
              {editingId ? "Salvar alterações" : `Cadastrar ${meta.singular}`}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

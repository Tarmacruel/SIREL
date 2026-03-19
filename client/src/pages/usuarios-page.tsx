import { useEffect, useMemo, useState, type FormEvent } from "react";
import { KeyRound, Shield, UserCog, Users } from "lucide-react";

import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import {
  validateChangePasswordForm,
  validateCreateUserForm,
  validateUpdateUserForm,
} from "@/features/usuarios/form";
import { formatShortDateTimeBR } from "@/lib/formatters";
import { trpc } from "@/lib/trpc";
import { mapZodFieldErrors } from "@/lib/zod-errors";

function toOptionalId(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

const roleLabels = {
  admin: "Administrador",
  gestor: "Gestor",
  operador: "Operador",
  auditor: "Auditor",
  user: "Usuário",
} as const;

const accessEventLabels = {
  LOGIN_SUCCESS: "Login concluído",
  LOGIN_FAILURE: "Tentativa inválida",
  LOGIN_BLOCKED: "Bloqueio temporário",
  PASSWORD_CHANGE: "Troca de senha",
  PASSWORD_RESET: "Redefinição de senha",
} as const;

const initialCreateForm = {
  username: "",
  name: "",
  email: "",
  role: "operador",
  secretariaId: "",
  ativo: true,
  password: "",
};

const initialPasswordForm = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

export function UsuariosPage() {
  const utils = trpc.useUtils();
  const meQuery = trpc.auth.me.useQuery(undefined, { retry: false });
  const catalogQuery = trpc.cadastros.formOptions.useQuery(undefined, { retry: false });
  const [search, setSearch] = useState("");
  const [filterSecretariaId, setFilterSecretariaId] = useState("");
  const [filterAtivo, setFilterAtivo] = useState("todos");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [createForm, setCreateForm] = useState(initialCreateForm);
  const [editForm, setEditForm] = useState({ name: "", email: "", role: "operador", secretariaId: "", ativo: true });
  const [resetPassword, setResetPassword] = useState("");
  const [ownPasswordForm, setOwnPasswordForm] = useState(initialPasswordForm);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});

  const currentRole = meQuery.data?.user.role;
  const isAdmin = currentRole === "admin";
  const canAudit = currentRole === "admin" || currentRole === "auditor";
  const userFilters = useMemo(
    () => ({
      search: search.trim() || undefined,
      secretariaId: toOptionalId(filterSecretariaId),
      ativo: filterAtivo === "todos" ? undefined : filterAtivo === "ativos",
    }),
    [filterAtivo, filterSecretariaId, search],
  );
  const usersQuery = trpc.usuarios.list.useQuery(userFilters, { enabled: isAdmin, retry: false });
  const accessLogQuery = trpc.usuarios.accessLog.useQuery({ limit: 20 }, { enabled: canAudit, retry: false });
  const users = usersQuery.data ?? [];
  const accessLog = accessLogQuery.data ?? [];
  const selectedUser = users.find((item) => item.id === selectedUserId) ?? null;

  useEffect(() => {
    if (!users.length) {
      setSelectedUserId(null);
      return;
    }

    if (!selectedUserId || !users.some((item) => item.id === selectedUserId)) {
      setSelectedUserId(users[0].id);
    }
  }, [selectedUserId, users]);

  useEffect(() => {
    if (!selectedUser) return;
    setEditForm({
      name: selectedUser.name,
      email: selectedUser.email ?? "",
      role: selectedUser.role,
      secretariaId: selectedUser.secretariaId ? String(selectedUser.secretariaId) : "",
      ativo: selectedUser.ativo,
    });
  }, [selectedUser]);

  useEffect(() => {
    if (!catalogQuery.data?.secretarias.length) return;

    setCreateForm((current) => ({
      ...current,
      secretariaId: current.secretariaId || String(catalogQuery.data?.secretarias[0]?.id ?? ""),
    }));
  }, [catalogQuery.data]);

  const createMutation = trpc.usuarios.create.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.usuarios.list.invalidate(), utils.usuarios.accessLog.invalidate()]);
      setCreateForm((current) => ({ ...initialCreateForm, role: current.role, secretariaId: current.secretariaId }));
      setCreateErrors({});
      setAdminError(null);
      setAdminMessage("Usuário criado com sucesso.");
    },
    onError: (error) => {
      setAdminMessage(null);
      setAdminError(error.message);
    },
  });

  const updateMutation = trpc.usuarios.update.useMutation({
    onSuccess: async (updated) => {
      await Promise.all([utils.usuarios.list.invalidate(), utils.auth.me.invalidate()]);
      setSelectedUserId(updated.id);
      setEditErrors({});
      setAdminError(null);
      setAdminMessage(`Usuário ${updated.username} atualizado.`);
    },
    onError: (error) => {
      setAdminMessage(null);
      setAdminError(error.message);
    },
  });

  const resetMutation = trpc.usuarios.resetPassword.useMutation({
    onSuccess: async (updated) => {
      await Promise.all([utils.usuarios.list.invalidate(), utils.usuarios.accessLog.invalidate()]);
      setResetPassword("");
      setAdminError(null);
      setAdminMessage(`Senha do usuário ${updated.username} redefinida.`);
    },
    onError: (error) => {
      setAdminMessage(null);
      setAdminError(error.message);
    },
  });

  const changeOwnPasswordMutation = trpc.usuarios.changePassword.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.auth.me.invalidate(), utils.usuarios.accessLog.invalidate()]);
      setOwnPasswordForm(initialPasswordForm);
      setPasswordErrors({});
      setPasswordError(null);
      setPasswordMessage("Sua senha foi atualizada.");
    },
    onError: (error) => {
      setPasswordMessage(null);
      setPasswordError(error.message);
    },
  });

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdminMessage(null);
    setAdminError(null);

    const parsed = validateCreateUserForm({
      username: createForm.username.trim().toLowerCase(),
      name: createForm.name.trim(),
      email: createForm.email.trim() || undefined,
      role: createForm.role,
      secretariaId: toOptionalId(createForm.secretariaId),
      ativo: createForm.ativo,
      password: createForm.password,
    });

    if (!parsed.success) {
      setCreateErrors(mapZodFieldErrors(parsed.error));
      setAdminError("Revise os campos do cadastro antes de criar o usuário.");
      return;
    }

    setCreateErrors({});
    await createMutation.mutateAsync(parsed.data);
  }

  async function handleUpdateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUser) return;
    setAdminMessage(null);
    setAdminError(null);

    const parsed = validateUpdateUserForm({
      userId: selectedUser.id,
      name: editForm.name.trim(),
      email: editForm.email.trim() || undefined,
      role: editForm.role,
      secretariaId: toOptionalId(editForm.secretariaId) ?? null,
      ativo: editForm.ativo,
    });

    if (!parsed.success) {
      setEditErrors(mapZodFieldErrors(parsed.error));
      setAdminError("Revise os dados do usuário selecionado antes de salvar.");
      return;
    }

    setEditErrors({});
    await updateMutation.mutateAsync(parsed.data);
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUser) return;
    setAdminMessage(null);
    setAdminError(null);

    if (resetPassword.length < 8) {
      setAdminError("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }

    await resetMutation.mutateAsync({ userId: selectedUser.id, newPassword: resetPassword });
  }

  async function handleOwnPasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage(null);
    setPasswordError(null);

    const parsed = validateChangePasswordForm(ownPasswordForm);
    if (!parsed.success) {
      setPasswordErrors(mapZodFieldErrors(parsed.error));
      setPasswordError("Revise os campos da troca de senha.");
      return;
    }

    setPasswordErrors({});
    await changeOwnPasswordMutation.mutateAsync(parsed.data);
  }

  if (meQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Usuários e segurança" description="Gestão administrativa de usuários, perfis e proteção básica de acesso da SIREL.">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.95fr]">
          <div className="space-y-4">
            <SectionCard
              title="Minha senha"
              description="Altere sua senha de acesso ao ambiente sistema."
              action={
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white">
                  <KeyRound className="h-4 w-4" />
                  Segurança
                </div>
              }
            >
              <form className="space-y-4" onSubmit={handleOwnPasswordChange}>
                <div className="grid gap-3 md:grid-cols-3">
                  <FormField label="Senha atual" error={passwordErrors.currentPassword}>
                    <Input
                      type="password"
                      error={Boolean(passwordErrors.currentPassword)}
                      value={ownPasswordForm.currentPassword}
                      onChange={(event) => setOwnPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
                    />
                  </FormField>
                  <FormField label="Nova senha" error={passwordErrors.newPassword}>
                    <Input
                      type="password"
                      error={Boolean(passwordErrors.newPassword)}
                      value={ownPasswordForm.newPassword}
                      onChange={(event) => setOwnPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                    />
                  </FormField>
                  <FormField label="Confirmação" error={passwordErrors.confirmPassword}>
                    <Input
                      type="password"
                      error={Boolean(passwordErrors.confirmPassword)}
                      value={ownPasswordForm.confirmPassword}
                      onChange={(event) => setOwnPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                    />
                  </FormField>
                </div>

                {passwordMessage ? <Alert variant="success">{passwordMessage}</Alert> : null}
                {passwordError ? <Alert variant="error">{passwordError}</Alert> : null}

                <Button type="submit" disabled={changeOwnPasswordMutation.isPending}>
                  {changeOwnPasswordMutation.isPending ? "Atualizando senha..." : "Atualizar senha"}
                </Button>
              </form>
            </SectionCard>

            {isAdmin ? (
              <SectionCard
                title="Usuários cadastrados"
                description="Administração de acessos, perfis e vinculação por secretaria."
                action={
                  <div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-sky-800">
                    <Users className="h-4 w-4" />
                    Administração
                  </div>
                }
              >
                <div className="space-y-4">
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px_180px]">
                    <FormField label="Buscar">
                      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Login, nome ou e-mail" />
                    </FormField>
                    <FormField label="Secretaria">
                      <Select value={filterSecretariaId} onChange={(event) => setFilterSecretariaId(event.target.value)}>
                        <option value="">Todas as secretarias</option>
                        {catalogQuery.data?.secretarias.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.sigla} - {item.nome}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                    <FormField label="Status">
                      <Select value={filterAtivo} onChange={(event) => setFilterAtivo(event.target.value)}>
                        <option value="todos">Todos</option>
                        <option value="ativos">Ativos</option>
                        <option value="inativos">Inativos</option>
                      </Select>
                    </FormField>
                  </div>

                  <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white">
                    <Table className="min-w-[720px]">
                      <TableHead>
                        <tr>
                          <TableHeaderCell>Usuário</TableHeaderCell>
                          <TableHeaderCell>Perfil</TableHeaderCell>
                          <TableHeaderCell>Secretaria</TableHeaderCell>
                          <TableHeaderCell>Status</TableHeaderCell>
                        </tr>
                      </TableHead>
                      <TableBody>
                        {users.map((item) => (
                          <TableRow
                            key={item.id}
                            onClick={() => setSelectedUserId(item.id)}
                            className={[
                              "cursor-pointer transition",
                              item.id === selectedUserId ? "bg-sky-50/80" : "hover:bg-slate-50",
                            ].join(" ")}
                          >
                            <TableCell className="align-top">
                              <div className="font-bold text-slate-950">{item.name}</div>
                              <div className="text-xs text-slate-500">
                                {item.username}
                                {item.email ? ` | ${item.email}` : ""}
                              </div>
                            </TableCell>
                            <TableCell className="align-top uppercase">{roleLabels[item.role] ?? item.role}</TableCell>
                            <TableCell className="align-top">{item.secretaria ?? "Não vinculada"}</TableCell>
                            <TableCell className="align-top">
                              <span
                                className={[
                                  "inline-flex rounded-full px-3 py-1 text-xs font-bold",
                                  item.ativo ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700",
                                ].join(" ")}
                              >
                                {item.ativo ? "Ativo" : "Inativo"}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                        {!users.length ? (
                          <TableRow>
                            <TableCell className="py-8 text-center text-slate-500" colSpan={4}>
                              {usersQuery.isFetching ? "Carregando usuários..." : "Nenhum usuário encontrado."}
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </SectionCard>
            ) : (
              <SectionCard
                title={canAudit ? "Consulta de segurança" : "Acesso administrativo"}
                description={
                  canAudit
                    ? "Seu perfil pode consultar o histórico de acessos e eventos sensíveis do sistema."
                    : "Seu perfil atual não possui permissão para gerenciar outros usuários."
                }
                action={
                  <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-amber-800">
                    <Shield className="h-4 w-4" />
                    {canAudit ? "Auditoria" : "Somente admin"}
                  </div>
                }
              >
                <Alert variant={canAudit ? "info" : "warning"}>
                  {canAudit
                    ? "Use o painel à direita para acompanhar logins, bloqueios temporários e trocas de senha do ambiente sistema."
                    : "A gestão de usuários fica disponível apenas para administradores. Seu acesso continua habilitado para troca da própria senha."}
                </Alert>
              </SectionCard>
            )}
          </div>

          <div className="space-y-4">
            {isAdmin ? (
              <>
                <SectionCard
                  title="Novo usuário"
                  description="Crie acessos locais para homologação do sistema."
                  action={
                    <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white">
                      <UserCog className="h-4 w-4" />
                      Cadastro
                    </div>
                  }
                >
                  <form className="space-y-4" onSubmit={handleCreateUser}>
                    <div className="grid gap-3 md:grid-cols-2">
                      <FormField label="Login" error={createErrors.username}>
                        <Input
                          value={createForm.username}
                          error={Boolean(createErrors.username)}
                          onChange={(event) => setCreateForm((current) => ({ ...current, username: event.target.value }))}
                        />
                      </FormField>
                      <FormField label="Nome" error={createErrors.name}>
                        <Input
                          value={createForm.name}
                          error={Boolean(createErrors.name)}
                          onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                        />
                      </FormField>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <FormField label="E-mail" error={createErrors.email}>
                        <Input
                          value={createForm.email}
                          error={Boolean(createErrors.email)}
                          onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
                        />
                      </FormField>
                      <FormField label="Senha inicial" error={createErrors.password}>
                        <Input
                          type="password"
                          value={createForm.password}
                          error={Boolean(createErrors.password)}
                          onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
                        />
                      </FormField>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <FormField label="Perfil" error={createErrors.role}>
                        <Select
                          value={createForm.role}
                          error={Boolean(createErrors.role)}
                          onChange={(event) => setCreateForm((current) => ({ ...current, role: event.target.value }))}
                        >
                          <option value="admin">Administrador</option>
                          <option value="gestor">Gestor</option>
                          <option value="operador">Operador</option>
                          <option value="auditor">Auditor</option>
                          <option value="user">Usuário</option>
                        </Select>
                      </FormField>
                      <FormField label="Secretaria" error={createErrors.secretariaId}>
                        <Select
                          value={createForm.secretariaId}
                          error={Boolean(createErrors.secretariaId)}
                          onChange={(event) => setCreateForm((current) => ({ ...current, secretariaId: event.target.value }))}
                        >
                          <option value="">Sem vinculação</option>
                          {catalogQuery.data?.secretarias.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.sigla} - {item.nome}
                            </option>
                          ))}
                        </Select>
                      </FormField>
                    </div>

                    <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                      <Checkbox
                        checked={createForm.ativo}
                        onChange={(event) => setCreateForm((current) => ({ ...current, ativo: event.target.checked }))}
                      />
                      Usuário ativo
                    </label>

                    {adminMessage ? <Alert variant="success">{adminMessage}</Alert> : null}
                    {adminError ? <Alert variant="error">{adminError}</Alert> : null}

                    <Button type="submit" disabled={createMutation.isPending}>
                      {createMutation.isPending ? "Criando usuário..." : "Criar usuário"}
                    </Button>
                  </form>
                </SectionCard>

                <SectionCard title="Editar usuário" description="Atualize perfil, secretaria, status e senha do usuário selecionado.">
                  {!selectedUser ? (
                    <Alert variant="info">Selecione um usuário na lista para editar.</Alert>
                  ) : (
                    <div className="space-y-4">
                      <form className="space-y-4" onSubmit={handleUpdateUser}>
                        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Selecionado</p>
                          <p className="mt-2 text-lg font-black text-slate-950">{selectedUser.name}</p>
                          <p className="mt-1 text-sm text-slate-600">{selectedUser.username}</p>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <FormField label="Nome" error={editErrors.name}>
                            <Input
                              value={editForm.name}
                              error={Boolean(editErrors.name)}
                              onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
                            />
                          </FormField>
                          <FormField label="E-mail" error={editErrors.email}>
                            <Input
                              value={editForm.email}
                              error={Boolean(editErrors.email)}
                              onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))}
                            />
                          </FormField>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <FormField label="Perfil" error={editErrors.role}>
                            <Select
                              value={editForm.role}
                              error={Boolean(editErrors.role)}
                              onChange={(event) => setEditForm((current) => ({ ...current, role: event.target.value }))}
                            >
                              <option value="admin">Administrador</option>
                              <option value="gestor">Gestor</option>
                              <option value="operador">Operador</option>
                              <option value="auditor">Auditor</option>
                              <option value="user">Usuário</option>
                            </Select>
                          </FormField>
                          <FormField label="Secretaria" error={editErrors.secretariaId}>
                            <Select
                              value={editForm.secretariaId}
                              error={Boolean(editErrors.secretariaId)}
                              onChange={(event) => setEditForm((current) => ({ ...current, secretariaId: event.target.value }))}
                            >
                              <option value="">Sem vinculação</option>
                              {catalogQuery.data?.secretarias.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.sigla} - {item.nome}
                                </option>
                              ))}
                            </Select>
                          </FormField>
                        </div>

                        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                          <Checkbox
                            checked={editForm.ativo}
                            onChange={(event) => setEditForm((current) => ({ ...current, ativo: event.target.checked }))}
                          />
                          Usuário ativo
                        </label>

                        <Button type="submit" disabled={updateMutation.isPending}>
                          {updateMutation.isPending ? "Salvando alterações..." : "Salvar alterações"}
                        </Button>
                      </form>

                      <form className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4" onSubmit={handleResetPassword}>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Reset de senha</p>
                          <p className="mt-2 text-sm text-slate-600">Defina uma nova senha para o usuário selecionado.</p>
                        </div>

                        <FormField label="Nova senha">
                          <Input type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} />
                        </FormField>

                        <Button type="submit" variant="outline" disabled={resetMutation.isPending || !resetPassword}>
                          {resetMutation.isPending ? "Redefinindo senha..." : "Redefinir senha"}
                        </Button>
                      </form>
                    </div>
                  )}
                </SectionCard>
              </>
            ) : null}

            {canAudit ? (
              <SectionCard
                title="Acessos recentes"
                description="Log local de autenticação, tentativas inválidas e eventos sensíveis de senha."
                action={
                  <div className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-indigo-800">
                    <Shield className="h-4 w-4" />
                    Auditoria
                  </div>
                }
              >
                <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white">
                  <Table className="min-w-[720px]">
                    <TableHead>
                      <tr>
                        <TableHeaderCell>Evento</TableHeaderCell>
                        <TableHeaderCell>Usuário</TableHeaderCell>
                        <TableHeaderCell>Origem</TableHeaderCell>
                        <TableHeaderCell>Data</TableHeaderCell>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {accessLog.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="align-top">
                            <div className="font-semibold text-slate-900">{accessEventLabels[item.evento] ?? item.evento}</div>
                            <div className="text-xs text-slate-500">{item.detalhe || "Sem detalhe adicional."}</div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="font-medium text-slate-800">{item.userName ?? item.loginInformado ?? "Usuário não identificado"}</div>
                            <div className="text-xs text-slate-500">{item.username ?? item.loginInformado ?? "-"}</div>
                          </TableCell>
                          <TableCell className="align-top text-sm text-slate-600">{item.ipAddress ?? "local"}</TableCell>
                          <TableCell className="align-top text-sm text-slate-600">{formatShortDateTimeBR(item.criadoEm)}</TableCell>
                        </TableRow>
                      ))}
                      {!accessLog.length ? (
                        <TableRow>
                          <TableCell className="py-8 text-center text-slate-500" colSpan={4}>
                            {accessLogQuery.isFetching ? "Carregando eventos de acesso..." : "Nenhum evento registrado até o momento."}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </SectionCard>
            ) : null}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { KeyRound, Shield, UserCog, Users } from "lucide-react";

import { SectionCard } from "@/components/shared/section-card";
import { trpc } from "@/lib/trpc";

function toOptionalId(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

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

  const isAdmin = meQuery.data?.user.role === "admin";
  const userFilters = useMemo(() => ({ search: search.trim() || undefined, secretariaId: toOptionalId(filterSecretariaId), ativo: filterAtivo === "todos" ? undefined : filterAtivo === "ativos" }), [filterAtivo, filterSecretariaId, search]);
  const usersQuery = trpc.usuarios.list.useQuery(userFilters, { enabled: isAdmin, retry: false });
  const users = usersQuery.data ?? [];
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
    setCreateForm((current) => ({ ...current, secretariaId: current.secretariaId || String(catalogQuery.data?.secretarias[0]?.id ?? "") }));
  }, [catalogQuery.data]);

  const createMutation = trpc.usuarios.create.useMutation({
    onSuccess: async () => {
      await utils.usuarios.list.invalidate();
      setCreateForm((current) => ({ ...initialCreateForm, role: current.role, secretariaId: current.secretariaId }));
      setAdminError(null);
      setAdminMessage("Usuario criado com sucesso.");
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
      setAdminError(null);
      setAdminMessage(`Usuario ${updated.username} atualizado.`);
    },
    onError: (error) => {
      setAdminMessage(null);
      setAdminError(error.message);
    },
  });

  const resetMutation = trpc.usuarios.resetPassword.useMutation({
    onSuccess: async (updated) => {
      await utils.usuarios.list.invalidate();
      setResetPassword("");
      setAdminError(null);
      setAdminMessage(`Senha do usuario ${updated.username} redefinida.`);
    },
    onError: (error) => {
      setAdminMessage(null);
      setAdminError(error.message);
    },
  });

  const changeOwnPasswordMutation = trpc.usuarios.changePassword.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      setOwnPasswordForm(initialPasswordForm);
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
    await createMutation.mutateAsync({
      username: createForm.username.trim().toLowerCase(),
      name: createForm.name.trim(),
      email: createForm.email.trim() || undefined,
      role: createForm.role as "user" | "admin" | "gestor" | "operador",
      secretariaId: toOptionalId(createForm.secretariaId),
      ativo: createForm.ativo,
      password: createForm.password,
    });
  }

  async function handleUpdateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUser) return;
    setAdminMessage(null);
    setAdminError(null);
    await updateMutation.mutateAsync({
      userId: selectedUser.id,
      name: editForm.name.trim(),
      email: editForm.email.trim() || undefined,
      role: editForm.role as "user" | "admin" | "gestor" | "operador",
      secretariaId: toOptionalId(editForm.secretariaId) ?? null,
      ativo: editForm.ativo,
    });
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUser) return;
    setAdminMessage(null);
    setAdminError(null);
    await resetMutation.mutateAsync({ userId: selectedUser.id, newPassword: resetPassword });
  }

  async function handleOwnPasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage(null);
    setPasswordError(null);
    await changeOwnPasswordMutation.mutateAsync(ownPasswordForm);
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Usuarios e seguranca" description="Gestao administrativa de usuarios e troca de senha da Beta 2.0.">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.95fr]">
          <div className="space-y-4">
            <SectionCard title="Minha senha" description="Altere sua senha de acesso ao beta." action={<div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white"><KeyRound className="h-4 w-4" />Seguranca</div>}>
              <form className="space-y-4" onSubmit={handleOwnPasswordChange}>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Senha atual</span><input type="password" value={ownPasswordForm.currentPassword} onChange={(event) => setOwnPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400" /></label>
                  <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Nova senha</span><input type="password" value={ownPasswordForm.newPassword} onChange={(event) => setOwnPasswordForm((current) => ({ ...current, newPassword: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400" /></label>
                  <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Confirmacao</span><input type="password" value={ownPasswordForm.confirmPassword} onChange={(event) => setOwnPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400" /></label>
                </div>
                {passwordMessage ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{passwordMessage}</div> : null}
                {passwordError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{passwordError}</div> : null}
                <button type="submit" disabled={changeOwnPasswordMutation.isPending} className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">{changeOwnPasswordMutation.isPending ? "Atualizando senha..." : "Atualizar senha"}</button>
              </form>
            </SectionCard>
            {isAdmin ? (
              <SectionCard title="Usuarios cadastrados" description="Administracao de acessos, perfis e vinculacao por secretaria." action={<div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-sky-800"><Users className="h-4 w-4" />Admin</div>}>
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por login, nome ou e-mail" className="min-w-[260px] rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400" />
                    <select value={filterSecretariaId} onChange={(event) => setFilterSecretariaId(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400"><option value="">Todas as secretarias</option>{catalogQuery.data?.secretarias.map((item) => <option key={item.id} value={item.id}>{item.sigla} - {item.nome}</option>)}</select>
                    <select value={filterAtivo} onChange={(event) => setFilterAtivo(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400"><option value="todos">Todos</option><option value="ativos">Ativos</option><option value="inativos">Inativos</option></select>
                  </div>
                  <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500"><tr><th className="px-4 py-3">Usuario</th><th className="px-4 py-3">Perfil</th><th className="px-4 py-3">Secretaria</th><th className="px-4 py-3">Status</th></tr></thead>
                      <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                        {users.map((item) => <tr key={item.id} onClick={() => setSelectedUserId(item.id)} className={["cursor-pointer transition", item.id === selectedUserId ? "bg-sky-50/80" : "hover:bg-slate-50"].join(" ")}><td className="px-4 py-3 align-top"><div className="font-bold text-slate-950">{item.name}</div><div className="text-xs text-slate-500">{item.username} {item.email ? `| ${item.email}` : ""}</div></td><td className="px-4 py-3 align-top">{item.role}</td><td className="px-4 py-3 align-top">{item.secretaria ?? "Nao vinculada"}</td><td className="px-4 py-3 align-top"><span className={["inline-flex rounded-full px-3 py-1 text-xs font-bold", item.ativo ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"].join(" ")}>{item.ativo ? "Ativo" : "Inativo"}</span></td></tr>)}
                        {!users.length && <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={4}>{usersQuery.isFetching ? "Carregando usuarios..." : "Nenhum usuario encontrado."}</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </SectionCard>
            ) : (
              <SectionCard title="Acesso administrativo" description="Seu perfil atual nao possui permissao para gerenciar outros usuarios." action={<div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-amber-800"><Shield className="h-4 w-4" />Somente admin</div>}>
                <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-900">A gestao de usuarios fica disponivel apenas para administradores. Seu acesso continua habilitado para troca da propria senha.</div>
              </SectionCard>
            )}
          </div>

          <div className="space-y-4">
            {isAdmin ? (
              <>
                <SectionCard title="Novo usuario" description="Crie acessos locais para homologacao do beta." action={<div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white"><UserCog className="h-4 w-4" />Cadastro</div>}>
                  <form className="space-y-4" onSubmit={handleCreateUser}>
                    <div className="grid gap-3 md:grid-cols-2"><label className="space-y-2 text-sm font-semibold text-slate-700"><span>Login</span><input value={createForm.username} onChange={(event) => setCreateForm((current) => ({ ...current, username: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400" /></label><label className="space-y-2 text-sm font-semibold text-slate-700"><span>Nome</span><input value={createForm.name} onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400" /></label></div>
                    <div className="grid gap-3 md:grid-cols-2"><label className="space-y-2 text-sm font-semibold text-slate-700"><span>E-mail</span><input value={createForm.email} onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400" /></label><label className="space-y-2 text-sm font-semibold text-slate-700"><span>Senha inicial</span><input type="password" value={createForm.password} onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400" /></label></div>
                    <div className="grid gap-3 md:grid-cols-2"><label className="space-y-2 text-sm font-semibold text-slate-700"><span>Perfil</span><select value={createForm.role} onChange={(event) => setCreateForm((current) => ({ ...current, role: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400"><option value="admin">admin</option><option value="gestor">gestor</option><option value="operador">operador</option><option value="user">user</option></select></label><label className="space-y-2 text-sm font-semibold text-slate-700"><span>Secretaria</span><select value={createForm.secretariaId} onChange={(event) => setCreateForm((current) => ({ ...current, secretariaId: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400"><option value="">Sem vinculacao</option>{catalogQuery.data?.secretarias.map((item) => <option key={item.id} value={item.id}>{item.sigla} - {item.nome}</option>)}</select></label></div>
                    <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={createForm.ativo} onChange={(event) => setCreateForm((current) => ({ ...current, ativo: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />Usuario ativo</label>
                    {adminMessage ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{adminMessage}</div> : null}
                    {adminError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{adminError}</div> : null}
                    <button type="submit" disabled={createMutation.isPending} className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">{createMutation.isPending ? "Criando usuario..." : "Criar usuario"}</button>
                  </form>
                </SectionCard>
                <SectionCard title="Editar usuario" description="Atualize perfil, secretaria e status do usuario selecionado.">
                  {!selectedUser ? (
                    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">Selecione um usuario na lista para editar.</div>
                  ) : (
                    <div className="space-y-4">
                      <form className="space-y-4" onSubmit={handleUpdateUser}>
                        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Selecionado</p><p className="mt-2 text-lg font-black text-slate-950">{selectedUser.name}</p><p className="mt-1 text-sm text-slate-600">{selectedUser.username}</p></div>
                        <div className="grid gap-3 md:grid-cols-2"><label className="space-y-2 text-sm font-semibold text-slate-700"><span>Nome</span><input value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400" /></label><label className="space-y-2 text-sm font-semibold text-slate-700"><span>E-mail</span><input value={editForm.email} onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400" /></label></div>
                        <div className="grid gap-3 md:grid-cols-2"><label className="space-y-2 text-sm font-semibold text-slate-700"><span>Perfil</span><select value={editForm.role} onChange={(event) => setEditForm((current) => ({ ...current, role: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400"><option value="admin">admin</option><option value="gestor">gestor</option><option value="operador">operador</option><option value="user">user</option></select></label><label className="space-y-2 text-sm font-semibold text-slate-700"><span>Secretaria</span><select value={editForm.secretariaId} onChange={(event) => setEditForm((current) => ({ ...current, secretariaId: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400"><option value="">Sem vinculacao</option>{catalogQuery.data?.secretarias.map((item) => <option key={item.id} value={item.id}>{item.sigla} - {item.nome}</option>)}</select></label></div>
                        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={editForm.ativo} onChange={(event) => setEditForm((current) => ({ ...current, ativo: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />Usuario ativo</label>
                        <button type="submit" disabled={updateMutation.isPending} className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">{updateMutation.isPending ? "Salvando alteracoes..." : "Salvar alteracoes"}</button>
                      </form>

                      <form className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4" onSubmit={handleResetPassword}>
                        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Reset de senha</p><p className="mt-2 text-sm text-slate-600">Defina uma nova senha para o usuario selecionado.</p></div>
                        <input type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} placeholder="Nova senha" className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400" />
                        <button type="submit" disabled={resetMutation.isPending || !resetPassword} className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50">{resetMutation.isPending ? "Redefinindo senha..." : "Redefinir senha"}</button>
                      </form>
                    </div>
                  )}
                </SectionCard>
              </>
            ) : null}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

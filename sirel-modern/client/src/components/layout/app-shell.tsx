import { useEffect, useState, type PropsWithChildren } from "react";
import { Link, useLocation } from "wouter";
import { Bell, FileText, FolderKanban, LayoutDashboard, ListTodo, LogOut, PanelLeftClose, PanelLeftOpen, ScrollText, Users, Workflow } from "lucide-react";

import { appModules } from "@sirel/shared/const";
import type { AuthUser } from "@/lib/auth-session";

const icons: Record<string, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  planejamento: FolderKanban,
  compras: ListTodo,
  licitacao: ScrollText,
  documentos: FileText,
  contratos: Bell,
  workflow: Workflow,
  usuarios: Users,
};

interface AppShellProps extends PropsWithChildren {
  user: AuthUser;
  onLogout: () => void;
}

export function AppShell({ children, user, onLogout }: AppShellProps) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sirel.beta.sidebar.collapsed") === "1";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("sirel.beta.sidebar.collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className={["mx-auto grid min-h-screen max-w-[1600px] grid-cols-1 gap-6 px-4 py-4 lg:px-6", collapsed ? "lg:grid-cols-[96px_1fr]" : "lg:grid-cols-[280px_1fr]"].join(" ")}>
        <aside className={["rounded-[28px] border border-slate-200 bg-slate-950 py-6 text-white shadow-2xl shadow-slate-900/15 transition-all", collapsed ? "px-3" : "px-5"].join(" ")}>
          <div className="mb-8">
            <div className={["flex items-center", collapsed ? "justify-center" : "justify-between gap-3"].join(" ")}>
              {!collapsed ? <div className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Beta 2.0</div> : null}
              <button
                type="button"
                onClick={() => setCollapsed((current) => !current)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition hover:border-cyan-300/30 hover:bg-white/10 hover:text-white"
                title={collapsed ? "Expandir menu" : "Recolher menu"}
              >
                {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </button>
            </div>
            {!collapsed ? (
              <>
                <h1 className="mt-4 text-2xl font-black tracking-tight">SIREL Modern</h1>
                <p className="mt-2 text-sm leading-6 text-slate-300">Base executiva para licitacoes, documentos, contratos, workflow e auditoria.</p>
              </>
            ) : null}
          </div>

          <nav className={collapsed ? "space-y-2" : "space-y-2"}>
            {appModules.map((item) => {
              const Icon = icons[item.key] ?? LayoutDashboard;
              const active = location === item.href;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={[
                    "flex items-center rounded-2xl border text-sm font-semibold transition",
                    collapsed ? "w-full justify-start px-3 py-3" : "gap-3 px-4 py-3",
                    active
                      ? "border-cyan-300/50 bg-cyan-400/20 text-white shadow-lg shadow-cyan-500/10"
                      : "border-white/8 bg-white/5 text-slate-300 hover:border-cyan-300/20 hover:bg-white/10 hover:text-white",
                  ].join(" ")}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed ? <span>{item.label}</span> : null}
                </Link>
              );
            })}
          </nav>

          {!collapsed ? (
            <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Cenario de teste</p>
              <p className="mt-2 text-sm text-slate-300">Cadastros basicos importados. Processos e movimentacoes devem ser recriados no novo sistema.</p>
            </div>
          ) : null}
        </aside>

        <main className="space-y-6 rounded-[32px] border border-white/60 bg-white/80 p-4 shadow-xl shadow-slate-200/50 backdrop-blur md:p-6">
          <header className="flex flex-col gap-4 rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-sky-700">Prefeitura Municipal</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">SIREL - Gestao integrada de licitacoes</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Ambiente de homologacao da Beta 2.0 com PostgreSQL, React, tRPC e fluxo operacional recriado do zero.</p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <div className="rounded-3xl bg-slate-950 px-5 py-4 text-right text-white">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Sessao autenticada</p>
                <p className="mt-1 text-lg font-bold">{user.name}</p>
                <p className="text-sm text-slate-300">{user.role} | {user.username}</p>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-rose-300 hover:text-rose-700"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            </div>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}

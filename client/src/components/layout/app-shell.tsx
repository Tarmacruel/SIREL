import { useEffect, useState, type PropsWithChildren } from "react";
import { Link, useLocation } from "wouter";
import {
  Bell,
  Boxes,
  Clock3,
  FileText,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ScrollText,
  Users,
  Workflow,
  X,
} from "lucide-react";

import { appModules } from "@sirel/shared/const";
import type { AuthUser } from "@/lib/auth-session";

const icons: Record<string, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  consultas: Search,
  prazos: Clock3,
  itens: Boxes,
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

interface SidebarContentProps {
  collapsed: boolean;
  location: string;
  onToggleCollapse: () => void;
  onNavigate?: () => void;
}

function SidebarContent({ collapsed, location, onToggleCollapse, onNavigate }: SidebarContentProps) {
  return (
    <div className={["flex h-full flex-col rounded-[28px] border border-slate-800 bg-slate-950 py-6 text-white shadow-2xl shadow-slate-900/15", collapsed ? "px-3" : "px-5"].join(" ")}>
      <div className="mb-8">
        <div className={["flex items-center", collapsed ? "justify-center" : "justify-between gap-3"].join(" ")}>
          {!collapsed ? <div className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Beta 2.0</div> : null}
          <button
            type="button"
            onClick={onToggleCollapse}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition hover:border-cyan-300/30 hover:bg-white/10 hover:text-white"
            title={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
        {!collapsed ? (
          <>
            <h1 className="mt-4 text-2xl font-black tracking-tight">SIREL Modern</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">Base executiva para licitações, documentos, contratos, workflow e auditoria.</p>
          </>
        ) : null}
      </div>

      <nav className="space-y-2">
        {appModules.map((item) => {
          const Icon = icons[item.key] ?? LayoutDashboard;
          const active = location === item.href;
          return (
            <Link
              key={item.key}
              href={item.href}
              onClick={onNavigate}
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
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Cenário de teste</p>
          <p className="mt-2 text-sm text-slate-300">Cadastros básicos importados. Processos e movimentações devem ser recriados no novo sistema.</p>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({ children, user, onLogout }: AppShellProps) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sirel.beta.sidebar.collapsed") === "1";
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("sirel.beta.sidebar.collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = mobileMenuOpen ? "hidden" : previousOverflow;
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className={["mx-auto grid min-h-screen max-w-[1600px] grid-cols-1 gap-4 px-3 py-3 md:px-4 md:py-4 lg:px-6", collapsed ? "lg:grid-cols-[96px_1fr]" : "lg:grid-cols-[280px_1fr]"].join(" ")}>
        <div className="hidden lg:block">
          <SidebarContent collapsed={collapsed} location={location} onToggleCollapse={() => setCollapsed((current) => !current)} />
        </div>

        {mobileMenuOpen ? (
          <div className="fixed inset-0 z-[120] lg:hidden">
            <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
            <div className="relative h-full max-w-[320px] p-3">
              <SidebarContent collapsed={false} location={location} onToggleCollapse={() => setCollapsed((current) => !current)} onNavigate={() => setMobileMenuOpen(false)} />
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="absolute right-7 top-7 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}

        <main className="space-y-4 rounded-[28px] border border-white/60 bg-white/85 p-3 shadow-xl shadow-slate-200/50 backdrop-blur md:space-y-6 md:p-5 lg:p-6">
          <header className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-sm md:px-5 md:py-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-start gap-3">
                <button type="button" onClick={() => setMobileMenuOpen(true)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 lg:hidden">
                  <Menu className="h-5 w-5" />
                </button>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-sky-700">Prefeitura Municipal</p>
                  <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 md:text-2xl">SIREL - Gestão integrada de licitações</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Ambiente de homologação da Beta 2.0 com PostgreSQL, React, tRPC e fluxo operacional recriado do zero. A interface deve operar de forma nativa em desktop, tablet e smartphone.</p>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end xl:items-center">
                <div className="rounded-3xl bg-slate-950 px-5 py-4 text-left text-white sm:text-right">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Sessão autenticada</p>
                  <p className="mt-1 text-lg font-bold">{user.name}</p>
                  <p className="text-sm text-slate-300">{user.role} | {user.username}</p>
                </div>
                <button
                  type="button"
                  onClick={onLogout}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-rose-300 hover:text-rose-700"
                >
                  <LogOut className="h-4 w-4" />
                  Sair
                </button>
              </div>
            </div>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}

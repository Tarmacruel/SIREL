import { useEffect, useState, type PropsWithChildren } from "react";
import { Link, useLocation } from "wouter";
import {
  Bell,
  BellRing,
  BarChart3,
  Boxes,
  Clock3,
  Database,
  FileText,
  FolderOpenDot,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ScrollText,
  ShieldCheck,
  RefreshCcw,
  Users,
  Workflow,
  X,
} from "lucide-react";

import { appModules } from "@sirel/shared/const";
import type { AuthUser } from "@/lib/auth-session";
import { prefeituraLines, prefeituraLogoUrl, systemFooterText, systemName } from "@/lib/branding";
import { trpc } from "@/lib/trpc";

const icons: Record<string, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  notificacoes: BellRing,
  consultas: Search,
  relatorios: BarChart3,
  prazos: Clock3,
  importacoes: RefreshCcw,
  cadastros: Database,
  processos: FolderOpenDot,
  itens: Boxes,
  planejamento: FolderKanban,
  compras: ListTodo,
  licitacao: ScrollText,
  documentos: FileText,
  contratos: Bell,
  workflow: Workflow,
  auditoria: ShieldCheck,
  usuarios: Users,
};

interface AppShellProps extends PropsWithChildren {
  user: AuthUser;
  onLogout: () => void;
}

interface SidebarContentProps {
  collapsed: boolean;
  location: string;
  unreadNotifications: number;
  onToggleCollapse: () => void;
  onNavigate?: () => void;
}

function formatBadgeCount(value: number) {
  if (value > 99) return "99+";
  return String(value);
}

function SidebarContent({ collapsed, location, unreadNotifications, onToggleCollapse, onNavigate }: SidebarContentProps) {
  return (
    <div className={["flex h-full flex-col rounded-[28px] border border-[rgba(36,64,167,0.7)] bg-[linear-gradient(180deg,var(--color-primary-900),var(--color-primary-700))] py-6 text-white shadow-2xl shadow-[rgba(15,26,109,0.28)]", collapsed ? "px-3" : "px-5"].join(" ")}>
      <div className="mb-8">
        <div className={["flex items-center", collapsed ? "justify-center" : "justify-between gap-3"].join(" ")}>
          {!collapsed ? <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-100">{systemName}</div> : null}
          <button
            type="button"
            onClick={onToggleCollapse}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-white/8 text-blue-100 transition hover:border-white/30 hover:bg-white/15 hover:text-white"
            title={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
        {!collapsed ? (
          <>
            <h1 className="mt-4 text-2xl font-black tracking-tight">{systemName}</h1>
            <p className="mt-2 text-sm leading-6 text-blue-100/85">Base executiva para licitações, documentos, contratos, workflow e auditoria.</p>
          </>
        ) : null}
      </div>

      <nav className="space-y-2">
        {appModules.map((item) => {
          const Icon = icons[item.key] ?? LayoutDashboard;
          const active = item.href === "/" ? location === "/" : location === item.href || location.startsWith(`${item.href}/`);
          const showNotificationBadge = item.key === "notificacoes" && unreadNotifications > 0;
          return (
            <Link
              key={item.key}
              href={item.href}
              onClick={onNavigate}
              className={[
                "flex items-center rounded-2xl border text-sm font-semibold transition",
                collapsed ? "w-full justify-start px-3 py-3" : "gap-3 px-4 py-3",
                active
                  ? "border-white/28 bg-white/18 text-white shadow-lg shadow-[rgba(15,26,109,0.18)]"
                  : "border-white/10 bg-white/6 text-blue-100/88 hover:border-white/20 hover:bg-white/12 hover:text-white",
              ].join(" ")}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed ? <span className="flex-1">{item.label}</span> : null}
              {showNotificationBadge ? (
                <span
                  className={[
                    "inline-flex min-w-[1.75rem] items-center justify-center rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-black text-white",
                    collapsed ? "ml-auto" : "",
                  ].join(" ")}
                >
                  {formatBadgeCount(unreadNotifications)}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {!collapsed ? <div className="mt-8 rounded-3xl border border-white/12 bg-white/8 p-4 text-xs leading-6 text-blue-100/78">{systemFooterText}</div> : null}
    </div>
  );
}

export function AppShell({ children, user, onLogout }: AppShellProps) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sirel.sidebar.collapsed") === "1";
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const notificationsSummary = trpc.notificacoes.summary.useQuery(undefined, {
    retry: false,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const unreadNotifications = notificationsSummary.data?.unread ?? 0;

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("sirel.sidebar.collapsed", collapsed ? "1" : "0");
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
    <div className="min-h-screen bg-transparent text-[var(--color-neutral-900)]">
      <div className={["mx-auto grid min-h-screen max-w-[1600px] grid-cols-1 gap-4 px-3 py-3 md:px-4 md:py-4 lg:px-6", collapsed ? "lg:grid-cols-[96px_1fr]" : "lg:grid-cols-[280px_1fr]"].join(" ")}>
        <div className="hidden lg:block">
          <SidebarContent
            collapsed={collapsed}
            location={location}
            unreadNotifications={unreadNotifications}
            onToggleCollapse={() => setCollapsed((current) => !current)}
          />
        </div>

        {mobileMenuOpen ? (
          <div className="fixed inset-0 z-[120] lg:hidden">
            <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-[rgba(15,26,109,0.42)] backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
            <div className="relative h-full max-w-[320px] p-3">
              <SidebarContent
                collapsed={false}
                location={location}
                unreadNotifications={unreadNotifications}
                onToggleCollapse={() => setCollapsed((current) => !current)}
                onNavigate={() => setMobileMenuOpen(false)}
              />
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="absolute right-7 top-7 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}

        <main className="space-y-4 rounded-[30px] border border-white/70 bg-white/88 p-3 shadow-[0_18px_45px_-30px_rgba(15,26,109,0.34)] backdrop-blur md:space-y-6 md:p-5 lg:p-6">
          <header className="rounded-[28px] border border-[rgba(204,225,255,0.95)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(230,240,255,0.78))] px-4 py-4 shadow-[0_14px_32px_-28px_rgba(15,26,109,0.35)] md:px-5 md:py-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-start gap-3">
                <button type="button" onClick={() => setMobileMenuOpen(true)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[rgba(204,225,255,0.95)] bg-white text-[var(--color-primary-700)] lg:hidden">
                  <Menu className="h-5 w-5" />
                </button>
                <div>
                  <img src={prefeituraLogoUrl} alt="Prefeitura Municipal de Teixeira de Freitas" className="mb-3 h-14 w-auto rounded-xl bg-white/90 p-1 shadow-sm" />
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-[var(--color-primary-600)]">{prefeituraLines[0]}</p>
                  <h2 className="mt-1 font-[var(--font-heading)] text-xl font-black tracking-tight text-[var(--color-primary-900)] md:text-2xl">{systemName} - Gestão integrada de licitações</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-neutral-600)]">{prefeituraLines[1]} · {prefeituraLines[2]}</p>
                  <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--color-neutral-500)]">{prefeituraLines[3]}</p>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end xl:items-center">
                <Link
                  href="/notificacoes"
                  className="relative inline-flex h-12 w-12 items-center justify-center self-start rounded-2xl border border-[rgba(204,225,255,0.95)] bg-white text-[var(--color-primary-700)] transition hover:border-[rgba(65,105,225,0.35)] hover:text-[var(--color-primary-800)] sm:self-auto"
                  title="Abrir central de notificações"
                >
                  <BellRing className="h-5 w-5" />
                  {unreadNotifications > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-black text-white">
                      {formatBadgeCount(unreadNotifications)}
                    </span>
                  ) : null}
                </Link>
                <div className="rounded-3xl bg-[linear-gradient(135deg,var(--color-primary-900),var(--color-primary-700))] px-5 py-4 text-left text-white shadow-[0_18px_30px_-18px_rgba(15,26,109,0.55)] sm:text-right">
                  <p className="text-xs uppercase tracking-[0.2em] text-blue-100/70">Sessão autenticada</p>
                  <p className="mt-1 text-lg font-bold">{user.name}</p>
                  <p className="text-sm text-blue-100/85">{user.role} | {user.username}</p>
                </div>
                <button
                  type="button"
                  onClick={onLogout}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[rgba(204,225,255,0.95)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-neutral-700)] transition hover:border-rose-300 hover:text-rose-700"
                >
                  <LogOut className="h-4 w-4" />
                  Sair
                </button>
              </div>
            </div>
          </header>
          {children}
          <footer className="rounded-[24px] border border-[rgba(204,225,255,0.95)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(230,240,255,0.7))] px-4 py-4 text-center text-sm text-[var(--color-neutral-600)]">
            {systemFooterText}
          </footer>
        </main>
      </div>
    </div>
  );
}

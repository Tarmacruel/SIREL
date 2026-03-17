import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";

import { AppShell } from "@/components/layout/app-shell";
import { clearStoredSession, loadStoredSession, saveStoredSession, type AuthSession } from "@/lib/auth-session";
import { queryClient } from "@/lib/query-client";
import { trpc, trpcClient } from "@/lib/trpc";
import { ContratosPage } from "@/pages/contratos-page";
import { DashboardPage } from "@/pages/dashboard-page";
import { DocumentosPage } from "@/pages/documentos-page";
import { LoginPage } from "@/pages/login-page";
import { LicitacaoPage } from "@/pages/licitacao-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { PlanejamentoDfdPage } from "@/pages/planejamento-dfd-page";
import { PlanejamentoPage } from "@/pages/planejamento-page";
import { ProcessosPage } from "@/pages/processos-page";
import { UsuariosPage } from "@/pages/usuarios-page";
import { WorkflowPage } from "@/pages/workflow-page";

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
      {title} sera detalhado nas proximas iteracoes da Beta 2.0.
    </div>
  );
}

function AuthenticatedApp({ session, onLogout }: { session: AuthSession; onLogout: () => void }) {
  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (meQuery.error) {
      onLogout();
    }
  }, [meQuery.error, onLogout]);

  if (meQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">
          Validando sessao...
        </div>
      </div>
    );
  }

  const user = meQuery.data?.user ?? session.user;

  return (
    <AppShell user={user} onLogout={onLogout}>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/planejamento/dfd/:processoId">
          {(params) => <PlanejamentoDfdPage processoId={Number(params.processoId)} />}
        </Route>
        <Route path="/planejamento" component={PlanejamentoPage} />
        <Route path="/compras">{() => <PlaceholderPage title="Modulo de Compras" />}</Route>
        <Route path="/processos" component={ProcessosPage} />
        <Route path="/licitacao" component={LicitacaoPage} />
        <Route path="/documentos" component={DocumentosPage} />
        <Route path="/contratos" component={ContratosPage} />
        <Route path="/workflow" component={WorkflowPage} />
        <Route path="/usuarios" component={UsuariosPage} />
        <Route component={NotFoundPage} />
      </Switch>
    </AppShell>
  );
}

function AppContent() {
  const [session, setSession] = useState<AuthSession | null>(() => loadStoredSession());

  function handleLogin(nextSession: AuthSession) {
    saveStoredSession(nextSession);
    setSession(nextSession);
  }

  function handleLogout() {
    clearStoredSession();
    queryClient.clear();
    setSession(null);
  }

  if (!session) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return <AuthenticatedApp session={session} onLogout={handleLogout} />;
}

export default function App() {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </trpc.Provider>
  );
}

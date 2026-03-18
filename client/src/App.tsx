import { Suspense, lazy, useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";

import { AppShell } from "@/components/layout/app-shell";
import { clearStoredSession, loadStoredSession, saveStoredSession, type AuthSession } from "@/lib/auth-session";
import { queryClient } from "@/lib/query-client";
import { trpc, trpcClient } from "@/lib/trpc";

const ContratosPage = lazy(() => import("@/pages/contratos-page").then((module) => ({ default: module.ContratosPage })));
const DashboardPage = lazy(() => import("@/pages/dashboard-page").then((module) => ({ default: module.DashboardPage })));
const DocumentosPage = lazy(() => import("@/pages/documentos-page").then((module) => ({ default: module.DocumentosPage })));
const ItensPage = lazy(() => import("@/pages/itens-page").then((module) => ({ default: module.ItensPage })));
const LoginPage = lazy(() => import("@/pages/login-page").then((module) => ({ default: module.LoginPage })));
const LicitacaoPage = lazy(() => import("@/pages/licitacao-page").then((module) => ({ default: module.LicitacaoPage })));
const NotFoundPage = lazy(() => import("@/pages/not-found-page").then((module) => ({ default: module.NotFoundPage })));
const PlanejamentoCotacoesPage = lazy(() =>
  import("@/pages/planejamento-cotacoes-page").then((module) => ({ default: module.PlanejamentoCotacoesPage })),
);
const PlanejamentoDfdPage = lazy(() =>
  import("@/pages/planejamento-dfd-page").then((module) => ({ default: module.PlanejamentoDfdPage })),
);
const PlanejamentoEtpPage = lazy(() =>
  import("@/pages/planejamento-etp-page").then((module) => ({ default: module.PlanejamentoEtpPage })),
);
const PlanejamentoTrPage = lazy(() =>
  import("@/pages/planejamento-tr-page").then((module) => ({ default: module.PlanejamentoTrPage })),
);
const PlanejamentoPage = lazy(() => import("@/pages/planejamento-page").then((module) => ({ default: module.PlanejamentoPage })));
const ProcessosPage = lazy(() => import("@/pages/processos-page").then((module) => ({ default: module.ProcessosPage })));
const UsuariosPage = lazy(() => import("@/pages/usuarios-page").then((module) => ({ default: module.UsuariosPage })));
const WorkflowPage = lazy(() => import("@/pages/workflow-page").then((module) => ({ default: module.WorkflowPage })));

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
      {title} será detalhado nas próximas iterações da Beta 2.0.
    </div>
  );
}

function RouteFallback() {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
      Carregando módulo...
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
          Validando sessão...
        </div>
      </div>
    );
  }

  const user = meQuery.data?.user ?? session.user;

  return (
    <AppShell user={user} onLogout={onLogout}>
      <Suspense fallback={<RouteFallback />}>
        <Switch>
          <Route path="/" component={DashboardPage} />
          <Route path="/planejamento/dfd/:processoId">
            {(params) => <PlanejamentoDfdPage processoId={Number(params.processoId)} />}
          </Route>
          <Route path="/planejamento/etp/:processoId">
            {(params) => <PlanejamentoEtpPage processoId={Number(params.processoId)} />}
          </Route>
          <Route path="/planejamento/cotacoes/:processoId">
            {(params) => <PlanejamentoCotacoesPage processoId={Number(params.processoId)} />}
          </Route>
          <Route path="/planejamento/tr/:processoId">
            {(params) => <PlanejamentoTrPage processoId={Number(params.processoId)} />}
          </Route>
          <Route path="/itens" component={ItensPage} />
          <Route path="/planejamento" component={PlanejamentoPage} />
          <Route path="/compras">{() => <PlaceholderPage title="Módulo de Compras" />}</Route>
          <Route path="/processos" component={ProcessosPage} />
          <Route path="/licitacao" component={LicitacaoPage} />
          <Route path="/documentos" component={DocumentosPage} />
          <Route path="/contratos" component={ContratosPage} />
          <Route path="/workflow" component={WorkflowPage} />
          <Route path="/usuarios" component={UsuariosPage} />
          <Route component={NotFoundPage} />
        </Switch>
      </Suspense>
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
    return (
      <Suspense fallback={<RouteFallback />}>
        <LoginPage onLogin={handleLogin} />
      </Suspense>
    );
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


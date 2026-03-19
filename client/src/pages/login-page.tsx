import { useState, type FormEvent } from "react";
import { LockKeyhole, LogIn, ShieldCheck, Zap } from "lucide-react";

import type { AuthSession } from "@/lib/auth-session";
import { trpc } from "@/lib/trpc";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { prefeituraLines, prefeituraLogoUrl, systemName } from "@/lib/branding";

interface LoginPageProps {
  onLogin: (session: AuthSession) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const mutation = trpc.auth.login.useMutation({
    onSuccess: (session) => {
      onLogin(session);
    },
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutation.mutateAsync({ login, password });
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,_#e2e8f0_0%,_#cce1ff_25%,_#dbeafe_50%,_#e0e7ff_75%,_#f3e8ff_100%)] px-4 py-6 md:py-10">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl gap-6 lg:min-h-[calc(100vh-5rem)] lg:grid-cols-[1.05fr_0.95fr]">
        {/* Left Side - Brand & Features */}
        <section className="flex flex-col justify-between rounded-[32px] border border-white/80 bg-[linear-gradient(135deg,_#0f1a6d_0%,_#192d8a_50%,_#2440a7_100%)] px-6 py-6 text-white shadow-2xl shadow-slate-900/30 md:px-8 md:py-8">
          <div>
            <div className="flex items-center gap-3">
              <img src={prefeituraLogoUrl} alt="Prefeitura Municipal de Teixeira de Freitas" className="h-16 w-auto rounded-2xl bg-white px-3 py-2 shadow-lg" />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-sky-200">Sistema oficial</p>
                <h1 className="text-lg font-black leading-tight text-white">{systemName}</h1>
              </div>
            </div>

            <div className="mt-8 space-y-4">
              <p className="text-base font-bold leading-relaxed text-white">Gestão transparente de licitações e contratações públicas.</p>
              <p className="text-sm leading-7 text-sky-100">{prefeituraLines[1]}</p>
              <p className="text-xs leading-6 text-sky-200">{prefeituraLines[2]} · {prefeituraLines[3]}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <article className="group rounded-2xl border border-white/15 bg-white/8 px-5 py-5 transition hover:bg-white/12">
              <div className="rounded-xl bg-sky-400/20 p-2 w-fit">
                <ShieldCheck className="h-5 w-5 text-sky-300" />
              </div>
              <p className="mt-3 text-sm font-bold text-white">Segurança robusta</p>
              <p className="mt-2 text-xs leading-6 text-sky-100">Autenticação segura com sessões assinadas e controle de acesso por perfil de operação.</p>
            </article>

            <article className="group rounded-2xl border border-white/15 bg-white/8 px-5 py-5 transition hover:bg-white/12">
              <div className="rounded-xl bg-sky-400/20 p-2 w-fit">
                <Zap className="h-5 w-5 text-sky-300" />
              </div>
              <p className="mt-3 text-sm font-bold text-white">Performance</p>
              <p className="mt-2 text-xs leading-6 text-sky-100">Interface responsiva e otimizada para desktop, tablet e smartphone com operação contínua.</p>
            </article>
          </div>
        </section>

        {/* Right Side - Login Form */}
        <section className="flex items-center justify-center rounded-[32px] border border-white/80 bg-white/95 px-5 py-6 shadow-2xl shadow-slate-200/50 backdrop-blur md:px-6 md:py-8">
          <div className="w-full max-w-md space-y-6">
            <div>
              <div className="inline-flex rounded-full bg-[var(--color-primary-50)] px-4 py-2">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--color-primary-700)]">🔐 Acesso seguro</p>
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-tight text-[var(--color-neutral-950)]">Entrar no {systemName}</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--color-neutral-600)]">Informe seus dados de acesso para explorar o sistema de gestão de licitações.</p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <FormField label="Usuário ou e-mail">
                <Input
                  required
                  autoFocus
                  value={login}
                  onChange={(event) => setLogin(event.target.value)}
                  placeholder="seu.usuario"
                  className="border-[var(--color-primary-200)] focus:border-[var(--color-primary-500)]"
                />
              </FormField>

              <FormField label="Senha">
                <Input
                  required
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="border-[var(--color-primary-200)] focus:border-[var(--color-primary-500)]"
                />
              </FormField>

              {mutation.error ? <Alert variant="error">{mutation.error.message}</Alert> : null}

              <Button type="submit" className="w-full bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)]" disabled={mutation.isPending}>
                <LogIn className="h-4 w-4" />
                {mutation.isPending ? "Validando acesso..." : "Entrar"}
              </Button>
            </form>

            <div className="pt-4 border-t border-[var(--color-neutral-200)]">
              <p className="text-xs text-[var(--color-neutral-500)]">
                Sistema seguro de gestão de licitações da Prefeitura Municipal de Teixeira de Freitas. Todos os acessos são registrados.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

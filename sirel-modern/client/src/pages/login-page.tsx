import { useState, type FormEvent } from "react";
import { LockKeyhole, LogIn, ShieldCheck } from "lucide-react";

import type { AuthSession } from "@/lib/auth-session";
import { trpc } from "@/lib/trpc";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(2,132,199,0.18),_transparent_24%),linear-gradient(160deg,_#eff6ff_0%,_#dbeafe_45%,_#e2e8f0_100%)] px-4 py-10">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="flex flex-col justify-between rounded-[36px] border border-white/70 bg-slate-950 px-8 py-8 text-white shadow-2xl shadow-slate-900/20">
          <div>
            <div className="inline-flex rounded-full border border-sky-300/30 bg-sky-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-200">SIREL Beta 2.0</div>
            <h1 className="mt-6 max-w-lg text-4xl font-black leading-tight">Gestao moderna de licitacoes, documentos e workflow.</h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">A homologacao agora comeca pelo mesmo ponto do uso real: autenticacao, entrada no painel e operacao por perfil.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <article className="rounded-3xl border border-white/10 bg-white/5 px-5 py-5">
              <ShieldCheck className="h-5 w-5 text-sky-300" />
              <p className="mt-3 text-sm font-semibold">Perfil com permissao real</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">O acesso agora depende de sessao assinada, sem cabecalho demo no cliente.</p>
            </article>
            <article className="rounded-3xl border border-white/10 bg-white/5 px-5 py-5">
              <LockKeyhole className="h-5 w-5 text-sky-300" />
              <p className="mt-3 text-sm font-semibold">Ambiente beta controlado</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">Cadastros basicos importados; processos e movimentacoes serao recriados diretamente na nova base.</p>
            </article>
          </div>
        </section>

        <section className="flex items-center justify-center rounded-[36px] border border-white/70 bg-white/90 px-6 py-8 shadow-xl shadow-slate-200/60 backdrop-blur">
          <div className="w-full max-w-md space-y-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-sky-700">Acesso</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Entrar no SIREL Modern</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">Use as credenciais beta configuradas no seed local para iniciar os testes.</p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <FormField label="Usuario ou e-mail">
                <Input required autoFocus value={login} onChange={(event) => setLogin(event.target.value)} placeholder="jonatas.sousa" />
              </FormField>

              <FormField label="Senha">
                <Input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="SirelBeta@2026" />
              </FormField>

              {mutation.error ? <Alert variant="error">{mutation.error.message}</Alert> : null}

              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                <LogIn className="h-4 w-4" />
                {mutation.isPending ? "Validando acesso..." : "Entrar"}
              </Button>
            </form>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">Credencial beta padrao</p>
              <p className="mt-2">Usuario: <span className="font-semibold text-slate-950">jonatas.sousa</span></p>
              <p>Senha: <span className="font-semibold text-slate-950">SirelBeta@2026</span></p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

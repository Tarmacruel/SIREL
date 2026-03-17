import { Link } from "wouter";

export function NotFoundPage() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-[32px] border border-dashed border-slate-300 bg-white text-center">
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">404</p>
      <h2 className="mt-3 text-3xl font-black text-slate-950">Rota nao encontrada</h2>
      <p className="mt-2 text-sm text-slate-600">A tela solicitada ainda nao foi implementada na Beta 2.0.</p>
      <Link href="/" className="mt-6 rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white">Voltar ao dashboard</Link>
    </div>
  );
}

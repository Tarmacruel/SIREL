import { metodologiaCotacaoLabels } from "../const.js";

export function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrencyBRL(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parsed)
    : "-";
}

function formatNumberBR(value: number | string | null | undefined, maximumFractionDigits = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(parsed);
}

function formatShortDateBR(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}

function paragraphsFromText(value: string | null | undefined) {
  const safeValue = escapeHtml(value ?? "");
  return safeValue
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

export function buildPrintableShell(title: string, bodyHtml: string) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #0f172a;
        --muted: #475569;
        --line: #cbd5e1;
        --soft: #e2e8f0;
        --panel: #f8fafc;
        --brand: #0f766e;
      }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #eef2ff; color: var(--ink); font: 14px/1.6 "Segoe UI", Tahoma, sans-serif; }
      .page {
        width: 210mm;
        min-height: 297mm;
        margin: 12mm auto;
        background: #fff;
        border: 1px solid var(--soft);
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
        padding: 18mm 16mm 18mm;
      }
      .header { border-bottom: 3px solid var(--brand); padding-bottom: 12px; margin-bottom: 18px; }
      .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.24em; text-transform: uppercase; color: var(--brand); }
      h1 { margin: 8px 0 0; font-size: 28px; line-height: 1.15; }
      h2 { margin: 22px 0 8px; font-size: 15px; text-transform: uppercase; letter-spacing: 0.12em; }
      p { margin: 0 0 10px; text-align: justify; }
      .grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 16px 0; }
      .card { border: 1px solid var(--line); border-radius: 16px; padding: 12px 14px; background: var(--panel); }
      .label { font-size: 10px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted); }
      .value { margin-top: 4px; font-size: 14px; font-weight: 600; color: var(--ink); }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border: 1px solid var(--line); padding: 9px 10px; vertical-align: top; }
      th { background: var(--panel); text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; }
      td { font-size: 13px; }
      .muted { color: var(--muted); }
      .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid var(--line); font-size: 11px; color: var(--muted); }
      @page { size: A4; margin: 12mm; }
      @media print {
        body { background: #fff; }
        .page { margin: 0; border: 0; box-shadow: none; width: auto; min-height: auto; padding: 0; }
      }
    </style>
  </head>
  <body>
    <main class="page">${bodyHtml}</main>
  </body>
</html>`;
}

export function buildDfdHtml(detail: any) {
  const processo = detail.processo;
  const dfd = detail.dfd;
  const itens = detail.itens ?? [];
  const responsaveis = dfd?.responsaveis ?? [];
  const secretariasParticipantes = dfd?.secretariasParticipantes ?? [];

  return `
    <header class="header">
      <div class="eyebrow">Planejamento · Documento de Formalização da Demanda</div>
      <h1>DFD ${escapeHtml(processo.numeroSirel)}</h1>
      <p class="muted">Processo administrativo ${escapeHtml(processo.numeroAdministrativo ?? "-")}</p>
    </header>

    <section class="grid">
      <article class="card">
        <div class="label">Atendente</div>
        <div class="value">${escapeHtml(dfd?.atendente?.name ?? "-")}</div>
      </article>
      <article class="card">
        <div class="label">Solicitante</div>
        <div class="value">${escapeHtml(dfd?.solicitante?.nome ?? "-")}</div>
      </article>
      <article class="card">
        <div class="label">Secretaria demandante</div>
        <div class="value">${escapeHtml(dfd?.secretariaDemandante?.nome ?? processo.secretaria ?? "-")}</div>
      </article>
      <article class="card">
        <div class="label">Secretaria responsável</div>
        <div class="value">${escapeHtml(dfd?.secretariaResponsavel?.nome ?? "-")}</div>
      </article>
      <article class="card">
        <div class="label">Prioridade</div>
        <div class="value">${escapeHtml(dfd?.grauPrioridade ?? "-")}</div>
      </article>
      <article class="card">
        <div class="label">Data da necessidade</div>
        <div class="value">${escapeHtml(formatShortDateBR(dfd?.dataNecessidade))}</div>
      </article>
      <article class="card">
        <div class="label">Previsão de conclusão</div>
        <div class="value">${escapeHtml(formatShortDateBR(dfd?.dataPrevistaConclusao))}</div>
      </article>
    </section>

    <h2>Objeto</h2>
    <p>${escapeHtml(processo.objeto)}</p>

    <h2>Justificativa</h2>
    ${paragraphsFromText(dfd?.justificativa)}

    <h2>Responsáveis</h2>
    <p>${responsaveis.length ? responsaveis.map((item: any) => `${escapeHtml(item.nome)}${item.cargo ? ` - ${escapeHtml(item.cargo)}` : ""}`).join("<br/>") : "-"}</p>

    <h2>Secretarias participantes</h2>
    <p>${secretariasParticipantes.length ? secretariasParticipantes.map((item: any) => escapeHtml(item.nome)).join("<br/>") : "Não se aplica."}</p>

    <h2>Itens da DFD</h2>
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Descrição</th>
          <th>Quantidade</th>
          <th>Unidade</th>
        </tr>
      </thead>
      <tbody>
        ${
          itens.length
            ? itens
                .map(
                  (item: any) => `
              <tr>
                <td>${escapeHtml(item.numeroItem)}</td>
                <td>${escapeHtml(item.descricao)}</td>
                <td>${escapeHtml(formatNumberBR(item.quantidade, 3))}</td>
                <td>${escapeHtml(item.unidade)}</td>
              </tr>`,
                )
                .join("")
            : `<tr><td colspan="4">Nenhum item registrado.</td></tr>`
        }
      </tbody>
    </table>

    ${
      dfd?.observacoes
        ? `<h2>Observações complementares</h2>${paragraphsFromText(dfd.observacoes)}`
        : ""
    }

    <h2>Assinatura</h2>
    <p>${
      dfd?.assinaturaResponsavel
        ? `${escapeHtml(dfd.assinaturaResponsavel.nome)}<br/>${escapeHtml(dfd.assinaturaResponsavel.cargo ?? "Cargo não informado")}`
        : "-"
    }</p>

    <div class="footer">Documento gerado pelo SIREL Beta 2.0 em ${escapeHtml(formatShortDateBR(new Date()))}.</div>
  `;
}

export function buildMapaComparativoHtml(detail: any, metodologiaLabel: string) {
  const processo = detail.processo;
  const mapa = detail.mapaComparativo ?? [];

  return `
    <header class="header">
      <div class="eyebrow">Planejamento · Mapa comparativo</div>
      <h1>Mapa comparativo ${escapeHtml(processo.numeroSirel)}</h1>
      <p class="muted">Metodologia adotada: ${escapeHtml(metodologiaLabel)}</p>
    </header>

    <section class="grid">
      <article class="card">
        <div class="label">Processo</div>
        <div class="value">${escapeHtml(processo.numeroSirel)}</div>
      </article>
      <article class="card">
        <div class="label">Secretaria</div>
        <div class="value">${escapeHtml(processo.secretaria)}</div>
      </article>
      <article class="card">
        <div class="label">Objeto</div>
        <div class="value">${escapeHtml(processo.objeto)}</div>
      </article>
      <article class="card">
        <div class="label">Valor estimado consolidado</div>
        <div class="value">${escapeHtml(formatCurrencyBRL(processo.valorEstimado))}</div>
      </article>
    </section>

    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Descrição</th>
          <th>Qtd.</th>
          <th>Menor</th>
          <th>Média</th>
          <th>Mediana</th>
          <th>Selecionado</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${
          mapa.length
            ? mapa
                .map(
                  (item: any) => `
              <tr>
                <td>${escapeHtml(item.numeroItem)}</td>
                <td>${escapeHtml(item.descricao)}</td>
                <td>${escapeHtml(formatNumberBR(item.quantidade, 3))} ${escapeHtml(item.unidade)}</td>
                <td>${escapeHtml(formatCurrencyBRL(item.menorValorUnitario))}</td>
                <td>${escapeHtml(formatCurrencyBRL(item.valorMedioUnitario))}</td>
                <td>${escapeHtml(formatCurrencyBRL(item.valorMedianoUnitario))}</td>
                <td>${escapeHtml(formatCurrencyBRL(item.valorSelecionadoUnitario))}</td>
                <td>${escapeHtml(formatCurrencyBRL(item.valorReferenciaTotal))}</td>
              </tr>`,
                )
                .join("")
            : `<tr><td colspan="8">Nenhum item com cotação preliminar considerada.</td></tr>`
        }
      </tbody>
    </table>

    <div class="footer">Documento gerado pelo SIREL Beta 2.0 em ${escapeHtml(formatShortDateBR(new Date()))}.</div>
  `;
}

export function buildTrHtml(detail: any) {
  const processo = detail.processo;
  const tr = detail.tr;
  const itens = detail.itens ?? [];
  const metodologiaCodigo = (detail.etp?.metodologiaCotacao ?? "MEDIA") as keyof typeof metodologiaCotacaoLabels;
  const metodologiaNome = metodologiaCotacaoLabels[metodologiaCodigo] ?? detail.etp?.metodologiaCotacao ?? "-";
  const orcamentoSigiloso = Boolean(tr?.orcamentoSigiloso);

  return `
    <header class="header">
      <div class="eyebrow">Planejamento · Termo de Referência</div>
      <h1>TR ${escapeHtml(processo.numeroSirel)}</h1>
      <p class="muted">Processo administrativo ${escapeHtml(processo.numeroAdministrativo ?? "-")}</p>
    </header>

    <section class="grid">
      <article class="card">
        <div class="label">Processo</div>
        <div class="value">${escapeHtml(processo.numeroSirel)}</div>
      </article>
      <article class="card">
        <div class="label">Secretaria</div>
        <div class="value">${escapeHtml(processo.secretaria)}</div>
      </article>
      <article class="card">
        <div class="label">Valor estimado</div>
        <div class="value">${escapeHtml(orcamentoSigiloso ? "Sigiloso" : formatCurrencyBRL(processo.valorEstimado))}</div>
      </article>
      <article class="card">
        <div class="label">Metodologia de cotação</div>
        <div class="value">${escapeHtml(metodologiaNome)}</div>
      </article>
    </section>

    <h2>Objeto</h2>
    <p>${escapeHtml(tr?.objetoTermo || processo.objeto)}</p>

    <h2>Fundamentação da contratação</h2>
    ${paragraphsFromText(tr?.fundamentacaoContratacao)}

    <h2>Descrição da solução</h2>
    ${paragraphsFromText(tr?.descricaoSolucao)}

    <h2>Requisitos da contratação</h2>
    ${paragraphsFromText(tr?.requisitosContratacao)}

    <h2>Modelo de execução</h2>
    ${paragraphsFromText(tr?.modeloExecucao)}

    <h2>Critérios de medição e pagamento</h2>
    ${paragraphsFromText(tr?.criteriosMedicaoPagamento)}

    <h2>Adequação orçamentária</h2>
    ${paragraphsFromText(tr?.adequacaoOrcamentaria)}

    ${tr?.observacoes ? `<h2>Observações complementares</h2>${paragraphsFromText(tr.observacoes)}` : ""}

    <h2>Itens consolidados</h2>
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Descrição</th>
          <th>Quantidade</th>
          <th>Unidade</th>
          <th>Valor unitário</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${
          itens.length
            ? itens.map((item: any) => `
              <tr>
                <td>${escapeHtml(item.numeroItem)}</td>
                <td>${escapeHtml(item.descricao)}</td>
                <td>${escapeHtml(formatNumberBR(item.quantidade, 3))}</td>
                <td>${escapeHtml(item.unidade)}</td>
                <td>${escapeHtml(orcamentoSigiloso ? "Sigiloso" : formatCurrencyBRL(item.valorUnitarioEstimado))}</td>
                <td>${escapeHtml(orcamentoSigiloso ? "Sigiloso" : formatCurrencyBRL(item.valorTotalEstimado))}</td>
              </tr>
            `).join("")
            : `<tr><td colspan="6">Nenhum item consolidado.</td></tr>`
        }
      </tbody>
    </table>

    <div class="footer">Documento gerado pelo SIREL Beta 2.0 em ${escapeHtml(formatShortDateBR(new Date()))}.</div>
  `;
}


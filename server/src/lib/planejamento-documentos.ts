import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import PDFDocument from "pdfkit";
import {
  buildDfdHtml,
  buildMapaComparativoHtml,
  buildPrintableShell,
  buildTrHtml,
} from "@sirel/shared/document-templates/planejamento";
import { metodologiaCotacaoLabels } from "@sirel/shared/const";
import { desc, eq } from "drizzle-orm";

import type { AppContext } from "../_core/context.js";
import { requireDb } from "../db/client.js";
import { documentos } from "../db/schema.js";

type PdfDoc = InstanceType<typeof PDFDocument>;

const currentDir = dirname(fileURLToPath(import.meta.url));
const uploadsRoot = resolve(currentDir, "../../../storage/uploads");

function ensureUploadsRoot() {
  if (!existsSync(uploadsRoot)) {
    mkdirSync(uploadsRoot, { recursive: true });
  }
}

function slugifyFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function formatCurrencyBRL(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parsed)
    : "-";
}

function formatNumberBR(value: number | string | null | undefined, maximumFractionDigits = 2) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits }).format(parsed)
    : "-";
}

function textValue(value: string | null | undefined) {
  return value?.trim() || "-";
}

function linesFromText(value: string | null | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned.split(/\n{2,}|\n/).map((line) => line.trim()).filter(Boolean) : ["-"];
}

function createPdfBuffer(render: (doc: PdfDoc) => void) {
  return new Promise<Buffer>((resolvePromise, rejectPromise) => {
    const doc = new PDFDocument({ size: "A4", margin: 42, compress: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on("end", () => resolvePromise(Buffer.concat(chunks)));
    doc.on("error", rejectPromise);
    render(doc);
    doc.end();
  });
}

function ensureSpace(doc: PdfDoc, height = 24) {
  if (doc.y + height > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function drawHeader(doc: PdfDoc, eyebrow: string, title: string, subtitle?: string) {
  doc.fillColor("#0f766e").font("Helvetica-Bold").fontSize(9).text(eyebrow.toUpperCase(), { characterSpacing: 1.4 });
  doc.moveDown(0.5);
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(22).text(title);
  if (subtitle) {
    doc.moveDown(0.2);
    doc.fillColor("#475569").font("Helvetica").fontSize(10).text(subtitle);
  }
  doc.moveDown(0.8);
  const y = doc.y;
  doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).strokeColor("#0f766e").lineWidth(2).stroke();
  doc.moveDown(1.2);
}

function drawMetaGrid(doc: PdfDoc, entries: Array<{ label: string; value: string }>) {
  const columnGap = 16;
  const columnWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right - columnGap) / 2;

  for (let index = 0; index < entries.length; index += 2) {
    ensureSpace(doc, 58);
    const rowTop = doc.y;
    const pair = entries.slice(index, index + 2);

    pair.forEach((entry, pairIndex) => {
      const x = doc.page.margins.left + pairIndex * (columnWidth + columnGap);
      doc.roundedRect(x, rowTop, columnWidth, 48, 10).fillAndStroke("#f8fafc", "#cbd5e1");
      doc.fillColor("#475569").font("Helvetica-Bold").fontSize(8).text(entry.label.toUpperCase(), x + 10, rowTop + 8, { width: columnWidth - 20 });
      doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(11).text(entry.value, x + 10, rowTop + 22, { width: columnWidth - 20 });
    });

    doc.y = rowTop + 60;
  }
}

function drawSectionTitle(doc: PdfDoc, title: string) {
  ensureSpace(doc, 28);
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(11).text(title.toUpperCase(), { characterSpacing: 1.2 });
  doc.moveDown(0.5);
}

function drawParagraphs(doc: PdfDoc, text: string | null | undefined) {
  for (const line of linesFromText(text)) {
    ensureSpace(doc, 18);
    doc.fillColor("#1e293b").font("Helvetica").fontSize(10).text(line, { align: "justify" });
    doc.moveDown(0.45);
  }
}

function drawItemTable(doc: PdfDoc, rows: Array<Array<string>>, headers: string[]) {
  const widths = [42, 186, 66, 54, 78, 78];
  const drawRow = (cells: string[], header = false) => {
    const font = header ? "Helvetica-Bold" : "Helvetica";
    const fontSize = header ? 8.5 : 8.8;
    const lineHeight = header ? 12 : 11.5;
    const heights = cells.map((cell, index) => doc.font(font).fontSize(fontSize).heightOfString(cell, { width: widths[index] - 8, lineGap: 1 }));
    const rowHeight = Math.max(...heights, lineHeight) + 10;
    ensureSpace(doc, rowHeight + 4);
    let x = doc.page.margins.left;
    const y = doc.y;
    cells.forEach((cell, index) => {
      doc.rect(x, y, widths[index], rowHeight).fillAndStroke(header ? "#e2e8f0" : "#ffffff", "#cbd5e1");
      doc.fillColor("#0f172a").font(font).fontSize(fontSize).text(cell, x + 4, y + 5, { width: widths[index] - 8, align: index >= 2 ? "right" : "left" });
      x += widths[index];
    });
    doc.y = y + rowHeight;
  };

  drawRow(headers, true);
  rows.forEach((row) => drawRow(row));
  doc.moveDown(0.8);
}

function drawMapCards(doc: PdfDoc, detail: any, metodologiaLabel: string) {
  drawMetaGrid(doc, [
    { label: "Processo", value: String(detail.processo.numeroSirel ?? "-") },
    { label: "Secretaria", value: String(detail.processo.secretaria ?? "-") },
    { label: "Metodologia", value: metodologiaLabel },
    { label: "Valor estimado", value: formatCurrencyBRL(detail.processo.valorEstimado) },
  ]);

  const mapa = detail.mapaComparativo ?? [];
  if (!mapa.length) {
    drawParagraphs(doc, "Nenhum item com cotação preliminar considerada.");
    return;
  }

  mapa.forEach((item: any) => {
    ensureSpace(doc, 110);
    drawSectionTitle(doc, `Item ${item.numeroItem}`);
    drawParagraphs(doc, item.descricao);
    drawMetaGrid(doc, [
      { label: "Quantidade", value: `${formatNumberBR(item.quantidade, 3)} ${item.unidade}` },
      { label: "Menor preço", value: formatCurrencyBRL(item.menorValorUnitario) },
      { label: "Média", value: formatCurrencyBRL(item.valorMedioUnitario) },
      { label: "Mediana", value: formatCurrencyBRL(item.valorMedianoUnitario) },
      { label: "Selecionado", value: formatCurrencyBRL(item.valorSelecionadoUnitario) },
      { label: "Total", value: formatCurrencyBRL(item.valorReferenciaTotal) },
    ]);
  });
}

async function buildDfdPdf(detail: any) {
  return createPdfBuffer((doc) => {
    drawHeader(doc, "Planejamento · Documento de Formalização da Demanda", `DFD ${detail.processo.numeroSirel}`, `Processo administrativo ${detail.processo.numeroAdministrativo ?? "-"}`);
    drawMetaGrid(doc, [
      { label: "Atendente", value: String(detail.dfd?.atendente?.name ?? "-") },
      { label: "Solicitante", value: String(detail.dfd?.solicitante?.nome ?? "-") },
      { label: "Secretaria demandante", value: String(detail.dfd?.secretariaDemandante?.nome ?? detail.processo.secretaria ?? "-") },
      { label: "Secretaria responsável", value: String(detail.dfd?.secretariaResponsavel?.nome ?? "-") },
      { label: "Prioridade", value: String(detail.dfd?.grauPrioridade ?? "-") },
      { label: "Data da necessidade", value: String(detail.dfd?.dataNecessidade ?? "-") },
      { label: "Previsão de conclusão", value: String(detail.dfd?.dataPrevistaConclusao ?? "-") },
    ]);
    drawSectionTitle(doc, "Objeto");
    drawParagraphs(doc, detail.processo.objeto);
    drawSectionTitle(doc, "Justificativa");
    drawParagraphs(doc, detail.dfd?.justificativa);
    drawSectionTitle(doc, "Responsáveis");
    drawParagraphs(doc, (detail.dfd?.responsaveis ?? []).map((item: any) => `${item.nome}${item.cargo ? ` - ${item.cargo}` : ""}`).join("\n"));
    drawSectionTitle(doc, "Secretarias participantes");
    drawParagraphs(doc, (detail.dfd?.secretariasParticipantes ?? []).map((item: any) => item.nome).join("\n") || "Não se aplica.");
    drawSectionTitle(doc, "Itens da DFD");
    drawItemTable(
      doc,
      (detail.itens ?? []).length
        ? (detail.itens ?? []).map((item: any) => [
            String(item.numeroItem),
            String(item.descricao ?? "-"),
            formatNumberBR(item.quantidade, 3),
            String(item.unidade ?? "-"),
            "-",
            "-",
          ])
        : [["-", "Nenhum item registrado.", "-", "-", "-", "-"]],
      ["Item", "Descrição", "Qtd.", "Un.", "Vlr. unit.", "Total"],
    );
    if (detail.dfd?.observacoes) {
      drawSectionTitle(doc, "Observações complementares");
      drawParagraphs(doc, detail.dfd.observacoes);
    }
    drawSectionTitle(doc, "Assinatura");
    drawParagraphs(
      doc,
      detail.dfd?.assinaturaResponsavel
        ? `${detail.dfd.assinaturaResponsavel.nome}\n${detail.dfd.assinaturaResponsavel.cargo ?? "Cargo não informado"}`
        : "-",
    );
  });
}

async function buildMapaPdf(detail: any, metodologiaLabel: string) {
  return createPdfBuffer((doc) => {
    drawHeader(doc, "Planejamento · Mapa comparativo", `Mapa comparativo ${detail.processo.numeroSirel}`, `Metodologia adotada: ${metodologiaLabel}`);
    drawMapCards(doc, detail, metodologiaLabel);
  });
}

async function buildTrPdf(detail: any) {
  return createPdfBuffer((doc) => {
    const orcamentoSigiloso = Boolean(detail.tr?.orcamentoSigiloso);
    drawHeader(doc, "Planejamento · Termo de Referência", `TR ${detail.processo.numeroSirel}`, `Processo administrativo ${detail.processo.numeroAdministrativo ?? "-"}`);
    drawMetaGrid(doc, [
      { label: "Processo", value: String(detail.processo.numeroSirel ?? "-") },
      { label: "Secretaria", value: String(detail.processo.secretaria ?? "-") },
      { label: "Valor estimado", value: orcamentoSigiloso ? "Sigiloso" : formatCurrencyBRL(detail.processo.valorEstimado) },
      { label: "Metodologia", value: metodologiaCotacaoLabels[(detail.etp?.metodologiaCotacao ?? "MEDIA") as keyof typeof metodologiaCotacaoLabels] ?? String(detail.etp?.metodologiaCotacao ?? "-") },
    ]);
    drawSectionTitle(doc, "Objeto");
    drawParagraphs(doc, detail.tr?.objetoTermo || detail.processo.objeto);
    drawSectionTitle(doc, "Fundamentação da contratação");
    drawParagraphs(doc, detail.tr?.fundamentacaoContratacao);
    drawSectionTitle(doc, "Descrição da solução");
    drawParagraphs(doc, detail.tr?.descricaoSolucao);
    drawSectionTitle(doc, "Requisitos da contratação");
    drawParagraphs(doc, detail.tr?.requisitosContratacao);
    drawSectionTitle(doc, "Modelo de execução");
    drawParagraphs(doc, detail.tr?.modeloExecucao);
    drawSectionTitle(doc, "Critérios de medição e pagamento");
    drawParagraphs(doc, detail.tr?.criteriosMedicaoPagamento);
    drawSectionTitle(doc, "Adequação orçamentária");
    drawParagraphs(doc, detail.tr?.adequacaoOrcamentaria);
    if (detail.tr?.observacoes) {
      drawSectionTitle(doc, "Observações complementares");
      drawParagraphs(doc, detail.tr.observacoes);
    }
    drawSectionTitle(doc, "Itens consolidados");
    drawItemTable(
      doc,
      (detail.itens ?? []).length
        ? (detail.itens ?? []).map((item: any) => [
            String(item.numeroItem),
            textValue(item.descricao),
            formatNumberBR(item.quantidade, 3),
            textValue(item.unidade),
            orcamentoSigiloso ? "Sigiloso" : formatCurrencyBRL(item.valorUnitarioEstimado),
            orcamentoSigiloso ? "Sigiloso" : formatCurrencyBRL(item.valorTotalEstimado),
          ])
        : [["-", "Nenhum item consolidado.", "-", "-", "-", "-"]],
      ["Item", "Descrição", "Qtd.", "Un.", "Vlr. unit.", "Total"],
    );
  });
}

export async function saveGeneratedPlanejamentoDocumento({
  ctx,
  processoId,
  documento,
  formato,
  detail,
}: {
  ctx: AppContext;
  processoId: number;
  documento: "DFD" | "MAPA_COMPARATIVO" | "TR";
  formato: "HTML" | "PDF";
  detail: any;
}) {
  ensureUploadsRoot();
  const db = requireDb();
  const baseUrl = `${ctx.req.protocol}://${ctx.req.get("host")}`;
  const processoDir = join(uploadsRoot, `processo-${processoId}`, "gerados");
  mkdirSync(processoDir, { recursive: true });

  const metodologiaLabel = metodologiaCotacaoLabels[(detail.etp?.metodologiaCotacao ?? "MEDIA") as keyof typeof metodologiaCotacaoLabels] ?? "Média";

  let bodyHtml = "";
  let fileBuffer: Uint8Array = new Uint8Array();
  let extension = "html";
  let mimeType = "text/html; charset=utf-8";
  let titulo = "";
  let categoria = "";
  let tipo: "DFD" | "ETP" | "TR" | "EDITAL" | "COMUNICACAO_INTERNA" | "RESULTADO" | "CONTRATO" | "OUTRO" = "OUTRO";

  if (documento === "DFD") {
    titulo = `DFD ${detail.processo.numeroSirel}`;
    categoria = formato === "HTML" ? "DFD_GERADO_HTML" : "DFD_GERADO_PDF";
    tipo = "DFD";
    bodyHtml = buildDfdHtml(detail);
    fileBuffer = formato === "HTML"
      ? Buffer.from(buildPrintableShell(titulo, bodyHtml), "utf8")
      : await buildDfdPdf(detail);
  } else if (documento === "MAPA_COMPARATIVO") {
    titulo = `Mapa comparativo ${detail.processo.numeroSirel}`;
    categoria = formato === "HTML" ? "MAPA_COMPARATIVO_HTML" : "MAPA_COMPARATIVO_PDF";
    tipo = "OUTRO";
    bodyHtml = buildMapaComparativoHtml(detail, metodologiaLabel);
    fileBuffer = formato === "HTML"
      ? Buffer.from(buildPrintableShell(titulo, bodyHtml), "utf8")
      : await buildMapaPdf(detail, metodologiaLabel);
  } else {
    titulo = `TR ${detail.processo.numeroSirel}`;
    categoria = formato === "HTML" ? "TR_GERADO_HTML" : "TR_GERADO_PDF";
    tipo = "TR";
    bodyHtml = buildTrHtml(detail);
    fileBuffer = formato === "HTML"
      ? Buffer.from(buildPrintableShell(titulo, bodyHtml), "utf8")
      : await buildTrPdf(detail);
  }

  if (formato === "PDF") {
    extension = "pdf";
    mimeType = "application/pdf";
  }

  const fileName = `${Date.now()}-${slugifyFileName(`${titulo}-${formato.toLowerCase()}`) || "documento"}.${extension}`;
  const absolutePath = join(processoDir, fileName);
  writeFileSync(absolutePath, fileBuffer);

  const relativePath = `processo-${processoId}/gerados/${fileName}`;
  const latest = await db
    .select({ versao: documentos.versao })
    .from(documentos)
    .where(eq(documentos.processoId, processoId))
    .orderBy(desc(documentos.versao))
    .limit(1);
  const nextVersion = Number(latest[0]?.versao ?? 0) + 1;

  const [created] = await db.insert(documentos).values({
    processoId,
    titulo,
    descricao: `Documento ${formato} gerado automaticamente pela etapa de Planejamento.`,
    tipo,
    categoria,
    versao: nextVersion,
    arquivoUrl: "",
    arquivoChave: relativePath,
    tamanhoBytes: fileBuffer.byteLength,
    mimeType,
    criadoPor: ctx.user?.id ?? null,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  }).returning();

  const arquivoUrl = `${baseUrl}/api/planejamento/documentos/${created.id}/download`;
  await db.update(documentos).set({ arquivoUrl, atualizadoEm: new Date() }).where(eq(documentos.id, created.id));

  return {
    ...created,
    arquivoUrl,
  };
}

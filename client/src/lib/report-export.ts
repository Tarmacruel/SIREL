interface ReportColumn {
  key: string;
  label: string;
}

interface ReportSummaryItem {
  label: string;
  value: unknown;
}

function toText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toLocaleString("pt-BR");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildSummaryLines(summary: ReportSummaryItem[]) {
  return summary.map((item) => `${item.label}: ${toText(item.value)}`);
}

export function exportReportToCsv(filename: string, columns: ReportColumn[], rows: Record<string, unknown>[]) {
  const lines = [
    columns.map((column) => `"${column.label.replaceAll('"', '""')}"`).join(";"),
    ...rows.map((row) =>
      columns
        .map((column) => `"${toText(row[column.key]).replaceAll('"', '""')}"`)
        .join(";"),
    ),
  ];

  downloadBlob(filename, new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8;" }));
}

export function exportReportToJson(
  filename: string,
  payload: {
    title: string;
    generatedAt: unknown;
    columns: ReportColumn[];
    rows: Record<string, unknown>[];
    summary?: ReportSummaryItem[];
  },
) {
  downloadBlob(filename, new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8;" }));
}

export async function exportReportToXlsx(
  filename: string,
  title: string,
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  summary: ReportSummaryItem[] = [],
) {
  const XLSX = await import("xlsx");
  const summaryLines = buildSummaryLines(summary);
  const sheetData = [
    [title],
    [`Gerado em ${new Date().toLocaleString("pt-BR")}`],
    [],
    ...summaryLines.map((line) => [line]),
    ...(summaryLines.length ? [[]] : []),
    columns.map((column) => column.label),
    ...rows.map((row) => columns.map((column) => toText(row[column.key]))),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  worksheet["!cols"] = columns.map((column) => ({
    wch: Math.max(column.label.length + 4, 20),
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Relatório");
  XLSX.writeFile(workbook, filename);
}

export async function exportReportToPdf(
  filename: string,
  title: string,
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  summary: ReportSummaryItem[] = [],
) {
  const [{ default: jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({
    orientation: columns.length > 6 ? "landscape" : "portrait",
    unit: "pt",
    format: "a4",
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, 40, 42);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 40, 60);

  let currentY = 82;
  if (summary.length) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("Totalizadores", 40, currentY);
    currentY += 14;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(51, 65, 85);
    summary.forEach((item) => {
      doc.text(`${item.label}: ${toText(item.value)}`, 40, currentY);
      currentY += 14;
    });
    currentY += 8;
  }

  autoTable(doc, {
    startY: currentY,
    head: [columns.map((column) => column.label)],
    body: rows.length
      ? rows.map((row) => columns.map((column) => toText(row[column.key])))
      : [["Nenhum registro encontrado para os filtros informados."]],
    theme: "grid",
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: 255,
      fontStyle: "bold",
    },
    bodyStyles: {
      textColor: [15, 23, 42],
      fontSize: 9,
      cellPadding: 6,
      valign: "top",
    },
    styles: {
      lineColor: [203, 213, 225],
      lineWidth: 0.5,
      overflow: "linebreak",
    },
    margin: { left: 40, right: 40, top: 40, bottom: 40 },
  });

  doc.save(filename);
}

export function openPrintableReport(
  title: string,
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  summary: ReportSummaryItem[] = [],
) {
  const printableHtml = `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: "Segoe UI", Arial, sans-serif; margin: 24px; color: #0f172a; }
          h1 { margin: 0 0 8px; font-size: 24px; }
          p { margin: 0 0 16px; color: #475569; }
          .summary { display: flex; flex-wrap: wrap; gap: 12px; margin: 0 0 20px; }
          .summary-card { border: 1px solid #cbd5e1; border-radius: 12px; padding: 12px 16px; min-width: 180px; background: #f8fafc; }
          .summary-label { font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #475569; }
          .summary-value { margin-top: 8px; font-size: 18px; font-weight: 700; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #cbd5e1; padding: 10px 12px; text-align: left; vertical-align: top; }
          th { background: #e2e8f0; font-size: 12px; text-transform: uppercase; letter-spacing: .12em; }
          tfoot td { background: #f8fafc; font-weight: 600; }
          .footer-summary { margin-top: 20px; border-top: 2px solid #cbd5e1; padding-top: 16px; display: grid; gap: 8px; }
          .footer-line { display: flex; justify-content: space-between; gap: 16px; font-size: 14px; }
          @media print { body { margin: 12px; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <p>Gerado em ${new Date().toLocaleString("pt-BR")}</p>
        ${
          summary.length
            ? `<section class="summary">${summary
                .map(
                  (item) => `
                    <article class="summary-card">
                      <div class="summary-label">${escapeHtml(item.label)}</div>
                      <div class="summary-value">${escapeHtml(toText(item.value))}</div>
                    </article>
                  `,
                )
                .join("")}</section>`
            : ""
        }
        <table>
          <thead>
            <tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${
              rows.length
                ? rows
                    .map(
                      (row) => `<tr>${columns.map((column) => `<td>${escapeHtml(toText(row[column.key]))}</td>`).join("")}</tr>`,
                    )
                    .join("")
                : `<tr><td colspan="${columns.length}">Nenhum registro para impressão.</td></tr>`
            }
          </tbody>
          ${
            summary.length
              ? `<tfoot><tr><td colspan="${columns.length}">${summary
                  .map((item) => `${escapeHtml(item.label)}: ${escapeHtml(toText(item.value))}`)
                  .join(" • ")}</td></tr></tfoot>`
              : ""
          }
        </table>
        ${
          summary.length
            ? `<section class="footer-summary">${summary
                .map(
                  (item) => `<div class="footer-line"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(toText(item.value))}</span></div>`,
                )
                .join("")}</section>`
            : ""
        }
      </body>
    </html>
  `;

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  printWindow.document.open();
  printWindow.document.write(printableHtml);
  printWindow.document.close();

  window.setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 250);
}

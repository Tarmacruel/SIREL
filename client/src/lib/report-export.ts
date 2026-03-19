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

  const blob = new Blob([printableHtml], { type: "text/html;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, "_blank", "noopener,noreferrer");
  if (!printWindow) {
    URL.revokeObjectURL(url);
    return;
  }

  const cleanup = () => {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  printWindow.addEventListener("load", () => {
    printWindow.focus();
    printWindow.print();
    cleanup();
  });
}

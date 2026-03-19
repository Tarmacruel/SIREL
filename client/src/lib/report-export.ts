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
  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printWindow) return;

  const summaryHtml = summary.length
    ? `
      <section class="summary">
        ${summary
          .map(
            (item) => `
              <article class="summary-card">
                <div class="summary-label">${item.label}</div>
                <div class="summary-value">${toText(item.value)}</div>
              </article>
            `,
          )
          .join("")}
      </section>
    `
    : "";

  const tableHtml = `
    <table>
      <thead>
        <tr>${columns.map((column) => `<th>${column.label}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${
          rows.length
            ? rows
                .map(
                  (row) => `
                    <tr>${columns.map((column) => `<td>${toText(row[column.key])}</td>`).join("")}</tr>
                  `,
                )
                .join("")
            : `<tr><td colspan="${columns.length}">Nenhum registro para impressão.</td></tr>`
        }
      </tbody>
    </table>
  `;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>${title}</title>
        <style>
          body { font-family: "Segoe UI", Arial, sans-serif; margin: 24px; color: #0f172a; }
          h1 { margin: 0 0 8px; font-size: 24px; }
          p { margin: 0 0 16px; color: #475569; }
          .summary { display: flex; flex-wrap: wrap; gap: 12px; margin: 0 0 20px; }
          .summary-card { border: 1px solid #cbd5e1; border-radius: 12px; padding: 12px 16px; min-width: 180px; }
          .summary-label { font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #475569; }
          .summary-value { margin-top: 8px; font-size: 18px; font-weight: 700; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #cbd5e1; padding: 10px 12px; text-align: left; vertical-align: top; }
          th { background: #e2e8f0; font-size: 12px; text-transform: uppercase; letter-spacing: .12em; }
          @media print { body { margin: 12px; } }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <p>Gerado em ${new Date().toLocaleString("pt-BR")}</p>
        ${summaryHtml}
        ${tableHtml}
        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

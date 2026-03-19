import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const normalized = String(value).replace(/\r?\n/g, " ").trim();
  if (!normalized) return "";
  if (/[",;]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

export function exportCadastrosToCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(";")];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsvCell(row[header])).join(";"));
  }
  downloadBlob(filename, new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" }));
}

export async function exportCadastrosToXlsx(filename: string, sheetName: string, rows: Record<string, unknown>[]) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  downloadBlob(filename, new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}

export async function exportCadastrosToPdf(
  filename: string,
  title: string,
  rows: Record<string, unknown>[],
  summary?: Array<{ label: string; value: string | number }>,
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const body = rows.map((row) => headers.map((header) => String(row[header] ?? "")));

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(title, 40, 42);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 40, 60);

  let startY = 78;
  if (summary?.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(
      summary.map((item) => `${item.label}: ${item.value}`).join("   |   "),
      40,
      startY,
      { maxWidth: 760 },
    );
    startY += 18;
  }

  autoTable(doc, {
    startY,
    head: headers.length ? [headers] : [["Sem dados"]],
    body: body.length ? body : [["Nenhum registro encontrado"]],
    styles: { fontSize: 9, cellPadding: 6, valign: "middle" },
    headStyles: { fillColor: [65, 105, 225], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 248, 255] },
    margin: { left: 40, right: 40 },
  });

  doc.save(filename);
}

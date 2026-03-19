import * as XLSX from "xlsx";

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

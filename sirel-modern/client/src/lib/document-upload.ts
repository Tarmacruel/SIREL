import { getStoredAuthToken, loadStoredSession } from "@/lib/auth-session";

type DocumentoTipo = "DFD" | "ETP" | "TR" | "EDITAL" | "COMUNICACAO_INTERNA" | "RESULTADO" | "CONTRATO" | "OUTRO";

interface UploadPlanejamentoDocumentoInput {
  processoId: number;
  tipo: DocumentoTipo;
  categoria?: string;
  titulo: string;
  descricao?: string;
  arquivo: File;
}

function resolveServerBaseUrl() {
  const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3030/api/trpc";
  return apiUrl.replace(/\/api\/trpc\/?$/, "");
}

function buildAuthHeaders() {
  const token = getStoredAuthToken();
  if (token) {
    return { Authorization: `Bearer ${token}` } satisfies Record<string, string>;
  }

  const session = loadStoredSession();
  if (!session) return {} as Record<string, string>;

  return {
    "x-sirel-role": session.user.role,
    "x-sirel-user-id": String(session.user.id),
    "x-sirel-user-name": session.user.name,
    "x-sirel-user-email": session.user.email ?? "",
    "x-sirel-username": session.user.username,
    "x-sirel-secretaria-id": String(session.user.secretariaId ?? ""),
  } satisfies Record<string, string>;
}

async function parseError(response: Response) {
  try {
    const payload = (await response.json()) as { message?: string };
    return payload.message ?? "Falha na operação com documentos.";
  } catch {
    return "Falha na operação com documentos.";
  }
}

export async function uploadPlanejamentoDocumento(input: UploadPlanejamentoDocumentoInput) {
  const formData = new FormData();
  formData.append("processoId", String(input.processoId));
  formData.append("tipo", input.tipo);
  formData.append("categoria", input.categoria ?? "");
  formData.append("titulo", input.titulo);
  formData.append("descricao", input.descricao ?? "");
  formData.append("arquivo", input.arquivo);

  const response = await fetch(`${resolveServerBaseUrl()}/api/planejamento/documentos/upload`, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json();
}

export async function deletePlanejamentoDocumento(documentoId: number) {
  const response = await fetch(`${resolveServerBaseUrl()}/api/planejamento/documentos/${documentoId}`, {
    method: "DELETE",
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json();
}

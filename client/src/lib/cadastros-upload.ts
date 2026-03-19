import { getStoredAuthToken, loadStoredSession } from "@/lib/auth-session";
import { resolveServerAssetUrl, resolveServerBaseUrl } from "@/lib/document-upload";

export type CadastroAssetEntity = "itens" | "fornecedores";

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
    return payload.message ?? "Falha ao enviar o arquivo do cadastro.";
  } catch {
    return "Falha ao enviar o arquivo do cadastro.";
  }
}

export async function uploadCadastroAsset(input: {
  entity: CadastroAssetEntity;
  recordId: number;
  arquivo: File;
}) {
  const formData = new FormData();
  formData.append("entity", input.entity);
  formData.append("recordId", String(input.recordId));
  formData.append("arquivo", input.arquivo);

  const response = await fetch(`${resolveServerBaseUrl()}/api/cadastros/assets/upload`, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json() as Promise<{ assetUrl: string | null }>;
}

export function resolveCadastroAssetUrl(url: string | null | undefined) {
  return resolveServerAssetUrl(url);
}

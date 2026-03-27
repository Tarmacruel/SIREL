import webpush from "web-push";

type PushSendResult = {
  status: "ENVIADO" | "FALHA" | "IGNORADO" | "REMOVER_ASSINATURA";
  error?: string | null;
};

type PushPayload = {
  endpoint: string;
  p256dh: string;
  auth: string;
  title: string;
  message: string;
  href?: string;
};

let vapidReady = false;

function ensureVapidConfig() {
  if (vapidReady) return true;
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  const subject = process.env.WEB_PUSH_SUBJECT ?? "mailto:admin@sirel.local";
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidReady = true;
  return true;
}

function resolveLink(href?: string) {
  if (!href) return null;
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  const baseUrl = process.env.CLIENT_URL ?? "http://localhost:5173";
  const trimmed = href.startsWith("/") ? href : `/${href}`;
  return `${baseUrl}${trimmed}`;
}

export async function sendPushNotification(payload: PushPayload): Promise<PushSendResult> {
  if (!ensureVapidConfig()) {
    return { status: "IGNORADO", error: "VAPID nao configurado." };
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: payload.endpoint,
        keys: {
          p256dh: payload.p256dh,
          auth: payload.auth,
        },
      },
      JSON.stringify({
        title: payload.title,
        body: payload.message,
        url: resolveLink(payload.href) ?? "/",
      }),
    );
    return { status: "ENVIADO" };
  } catch (error: any) {
    const statusCode = Number(error?.statusCode ?? 0);
    if (statusCode === 404 || statusCode === 410) {
      return { status: "REMOVER_ASSINATURA", error: "Assinatura expirada." };
    }
    return { status: "FALHA", error: error instanceof Error ? error.message : String(error) };
  }
}

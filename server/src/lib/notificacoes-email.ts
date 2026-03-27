import nodemailer from "nodemailer";

type EmailSendResult = {
  status: "ENVIADO" | "FALHA" | "IGNORADO";
  error?: string | null;
};

type EmailPayload = {
  to: string;
  title: string;
  message: string;
  href?: string;
  priority?: string;
};

let cachedTransport: nodemailer.Transporter | null = null;

function resolveTransport() {
  if (cachedTransport) return cachedTransport;

  const host = process.env.SMTP_HOST;
  if (!host) return null;

  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = String(process.env.SMTP_SECURE ?? "").toLowerCase() === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });

  return cachedTransport;
}

function resolveLink(href?: string) {
  if (!href) return null;
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  const baseUrl = process.env.CLIENT_URL ?? "http://localhost:5173";
  const trimmed = href.startsWith("/") ? href : `/${href}`;
  return `${baseUrl}${trimmed}`;
}

export async function sendEmailNotification(payload: EmailPayload): Promise<EmailSendResult> {
  const transport = resolveTransport();
  if (!transport) {
    return { status: "IGNORADO", error: "SMTP nao configurado." };
  }

  const from = process.env.SMTP_FROM ?? "SIREL <no-reply@sirel.local>";
  const link = resolveLink(payload.href);
  const subject = `[SIREL] ${payload.title}`;
  const textLines = [
    payload.title,
    "",
    payload.message,
    link ? "" : null,
    link ? `Acesse: ${link}` : null,
  ].filter((line) => line !== null) as string[];

  try {
    await transport.sendMail({
      from,
      to: payload.to,
      subject,
      text: textLines.join("\n"),
    });
    return { status: "ENVIADO" };
  } catch (error) {
    return { status: "FALHA", error: error instanceof Error ? error.message : String(error) };
  }
}

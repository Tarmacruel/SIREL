import { createHmac } from "node:crypto";

const TOKEN_VERSION = 1;
const SESSION_TTL_SECONDS = 60 * 60 * 12;

interface SessionPayload {
  sub: number;
  username: string;
  name: string;
  email: string | null;
  role: string;
  secretariaId: number | null;
  exp: number;
  ver: number;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf-8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf-8");
}

function getSecret() {
  return process.env.JWT_SECRET || "sirel-beta-secret";
}

function signPayload(payload: SessionPayload) {
  return createHmac("sha256", getSecret()).update(JSON.stringify(payload)).digest("base64url");
}

export function createSessionToken(user: {
  id: number;
  username: string;
  name: string;
  email: string | null;
  role: string;
  secretariaId: number | null;
}) {
  const payload: SessionPayload = {
    sub: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    secretariaId: user.secretariaId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    ver: TOKEN_VERSION,
  };
  return `${base64UrlEncode(JSON.stringify(payload))}.${signPayload(payload)}`;
}

export function verifySessionToken(token: string | null | undefined) {
  if (!token) return null;
  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(payloadPart)) as SessionPayload;
    if (payload.ver !== TOKEN_VERSION) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    const expectedSignature = signPayload(payload);
    if (expectedSignature !== signaturePart) return null;
    return payload;
  } catch {
    return null;
  }
}

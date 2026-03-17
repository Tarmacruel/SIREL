export interface AuthUser {
  id: number;
  username: string;
  name: string;
  email: string | null;
  role: string;
  secretariaId: number | null;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

const STORAGE_KEY = "sirel.beta.session";

export function loadStoredSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    if (!rawValue) return null;
    return JSON.parse(rawValue) as AuthSession;
  } catch {
    return null;
  }
}

export function saveStoredSession(session: AuthSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function getStoredAuthToken() {
  return loadStoredSession()?.token ?? "";
}

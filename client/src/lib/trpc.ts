import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";

import type { AppRouter } from "@sirel/server/routers/index";
import { getStoredAuthToken } from "./auth-session";

export const trpc = createTRPCReact<AppRouter>();

function resolveApiUrl() {
  const configuredUrl = String(import.meta.env.VITE_API_URL ?? "").trim();
  if (configuredUrl) return configuredUrl;

  if (typeof window !== "undefined") {
    const protocol = window.location.protocol || "http:";
    const hostname = window.location.hostname || "localhost";
    const port = String(import.meta.env.VITE_API_PORT ?? "3030").trim() || "3030";
    return `${protocol}//${hostname}:${port}/api/trpc`;
  }

  return "http://localhost:3030/api/trpc";
}

const apiUrl = resolveApiUrl();

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: apiUrl,
      transformer: superjson,
      headers() {
        const token = getStoredAuthToken();
        return token ? { authorization: `Bearer ${token}` } : {};
      },
    })
  ]
});

import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";

import type { AppRouter } from "@sirel/server/routers/index";
import { getStoredAuthToken } from "./auth-session";

export const trpc = createTRPCReact<AppRouter>();
const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3030/api/trpc";

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

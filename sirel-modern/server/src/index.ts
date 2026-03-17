import "./bootstrap/load-env.js";

import cors from "cors";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

import { createContext } from "./_core/context.js";
import { appRouter } from "./routers/index.js";

const app = express();
const port = Number(process.env.PORT ?? 3030);
const clientUrl = process.env.CLIENT_URL ?? "http://localhost:5173";

app.use(cors({ origin: clientUrl, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "sirel-modern-server", timestamp: new Date().toISOString() });
});

app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));

app.listen(port, () => {
  console.log(`SIREL Beta 2.0 server listening on http://localhost:${port}`);
});

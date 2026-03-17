import "./bootstrap/load-env.js";

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import cors from "cors";
import express from "express";
import multer from "multer";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { desc, eq } from "drizzle-orm";

import { createContext } from "./_core/context.js";
import { logAuditoria } from "./db/auditoria.js";
import { requireDb } from "./db/client.js";
import { documentos } from "./db/schema.js";
import { verifySessionToken } from "./lib/auth-session.js";
import { appRouter } from "./routers/index.js";

const app = express();
const port = Number(process.env.PORT ?? 3030);
const clientUrl = process.env.CLIENT_URL ?? "http://localhost:5173";
const currentDir = dirname(fileURLToPath(import.meta.url));
const uploadsRoot = resolve(currentDir, "../../../storage/uploads");

if (!existsSync(uploadsRoot)) {
  mkdirSync(uploadsRoot, { recursive: true });
}

function slugifyFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function resolveRequestUser(req: express.Request) {
  const authHeader = String(req.headers.authorization ?? "").trim();
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const sessionPayload = verifySessionToken(bearerToken);
  const roleHeader = String(req.headers["x-sirel-role"] ?? "").trim();
  const userId = Number(req.headers["x-sirel-user-id"] ?? 0) || 1;
  const secretariaId = Number(req.headers["x-sirel-secretaria-id"] ?? 0) || null;

  return sessionPayload
    ? {
        id: sessionPayload.sub,
        username: sessionPayload.username,
        name: sessionPayload.name,
        email: sessionPayload.email ?? "",
        role: sessionPayload.role,
        secretariaId: sessionPayload.secretariaId,
      }
    : roleHeader
      ? {
          id: userId,
          username: String(req.headers["x-sirel-username"] ?? "demo"),
          name: String(req.headers["x-sirel-user-name"] ?? "Usuario demo"),
          email: String(req.headers["x-sirel-user-email"] ?? "demo@sirel.local"),
          role: roleHeader,
          secretariaId,
        }
      : null;
}

function requireUploadUser(req: express.Request, res: express.Response) {
  const user = resolveRequestUser(req);
  if (!user) {
    res.status(401).json({ message: "Login obrigatorio." });
    return null;
  }
  if (!["admin", "gestor", "operador"].includes(user.role)) {
    res.status(403).json({ message: "Acesso restrito a operadores, gestores e administradores." });
    return null;
  }
  return user;
}

const storage = multer.diskStorage({
  destination(req, _file, callback) {
    const processoId = String(req.body.processoId ?? "geral").replace(/\D+/g, "") || "geral";
    const targetDir = join(uploadsRoot, `processo-${processoId}`);
    mkdirSync(targetDir, { recursive: true });
    callback(null, targetDir);
  },
  filename(_req, file, callback) {
    const extension = extname(file.originalname) || "";
    const baseName = slugifyFileName(file.originalname.replace(extension, "")) || "documento";
    callback(null, `${Date.now()}-${baseName}${extension.toLowerCase()}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

app.use(cors({ origin: clientUrl, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "sirel-modern-server", timestamp: new Date().toISOString() });
});

app.post("/api/planejamento/documentos/upload", upload.single("arquivo"), async (req, res) => {
  try {
    const user = requireUploadUser(req, res);
    if (!user) return;
    if (!req.file) {
      res.status(400).json({ message: "Selecione um arquivo para upload." });
      return;
    }

    const processoId = Number(req.body.processoId ?? 0);
    const tipo = String(req.body.tipo ?? "").trim();
    const categoria = String(req.body.categoria ?? "").trim() || null;
    const titulo = String(req.body.titulo ?? req.file.originalname).trim();
    const descricao = String(req.body.descricao ?? "").trim() || null;
    if (!processoId || !titulo || !tipo) {
      res.status(400).json({ message: "Informe processo, tipo e titulo do documento." });
      return;
    }

    const db = requireDb();
    const latest = await db
      .select({ versao: documentos.versao })
      .from(documentos)
      .where(eq(documentos.processoId, processoId))
      .orderBy(desc(documentos.versao))
      .limit(1);
    const nextVersion = Number(latest[0]?.versao ?? 0) + 1;
    const relativePath = req.file.path.replace(/\\/g, "/").split("/storage/uploads/").pop() ?? req.file.filename;

    const [created] = await db.insert(documentos).values({
      processoId,
      titulo,
      descricao,
      tipo: tipo as "DFD" | "ETP" | "TR" | "EDITAL" | "COMUNICACAO_INTERNA" | "RESULTADO" | "CONTRATO" | "OUTRO",
      categoria,
      versao: nextVersion,
      arquivoUrl: "",
      arquivoChave: relativePath,
      tamanhoBytes: req.file.size,
      mimeType: req.file.mimetype,
      criadoPor: user.id,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    }).returning();

    const downloadUrl = `${req.protocol}://${req.get("host")}/api/planejamento/documentos/${created.id}/download`;
    await db.update(documentos).set({ arquivoUrl: downloadUrl, atualizadoEm: new Date() }).where(eq(documentos.id, created.id));

    await logAuditoria({ user } as any, {
      tabela: "documentos",
      registroId: created.id,
      acao: "CREATE",
      dadosNovos: { ...created, arquivoUrl: downloadUrl },
      descricao: `Documento ${titulo} enviado por upload local`,
    });

    res.status(201).json({ ...created, arquivoUrl: downloadUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Falha ao salvar o documento enviado." });
  }
});

app.get("/api/planejamento/documentos/:documentoId/download", async (req, res) => {
  try {
    const db = requireDb();
    const documentoId = Number(req.params.documentoId ?? 0);
    const [documento] = await db.select().from(documentos).where(eq(documentos.id, documentoId)).limit(1);
    if (!documento?.arquivoChave) {
      res.status(404).json({ message: "Documento nao encontrado." });
      return;
    }

    const absolutePath = join(uploadsRoot, documento.arquivoChave);
    if (!existsSync(absolutePath)) {
      res.status(404).json({ message: "Arquivo fisico nao encontrado." });
      return;
    }

    const extension = extname(documento.arquivoChave || "") || extname(absolutePath);
    const downloadName = `${slugifyFileName(documento.titulo || "documento") || "documento"}${extension}`;
    const forceDownload = String(req.query.download ?? "").trim() === "1";
    const mimeType = documento.mimeType?.trim() || "application/octet-stream";

    res.setHeader("Content-Type", mimeType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `${forceDownload ? "attachment" : "inline"}; filename=\"${downloadName}\"`);
    res.sendFile(absolutePath);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Falha ao disponibilizar o documento." });
  }
});

app.delete("/api/planejamento/documentos/:documentoId", async (req, res) => {
  try {
    const user = requireUploadUser(req, res);
    if (!user) return;

    const db = requireDb();
    const documentoId = Number(req.params.documentoId ?? 0);
    const [documento] = await db.select().from(documentos).where(eq(documentos.id, documentoId)).limit(1);
    if (!documento) {
      res.status(404).json({ message: "Documento nao encontrado." });
      return;
    }

    if (documento.arquivoChave) {
      const absolutePath = join(uploadsRoot, documento.arquivoChave);
      if (existsSync(absolutePath)) {
        rmSync(absolutePath, { force: true });
      }
    }

    await db.delete(documentos).where(eq(documentos.id, documentoId));
    await logAuditoria({ user } as any, {
      tabela: "documentos",
      registroId: documentoId,
      acao: "DELETE",
      dadosAnteriores: documento,
      descricao: `Documento ${documento.titulo} removido do acervo do processo`,
    });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Falha ao excluir o documento." });
  }
});

app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));

app.listen(port, () => {
  console.log(`SIREL Beta 2.0 server listening on http://localhost:${port}`);
});

import "../bootstrap/load-env.js";

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { and, eq } from "drizzle-orm";

import { modalidadeCatalog } from "@sirel/shared/const";

import * as schema from "../db/schema.js";
import { requireDb } from "../db/client.js";
import { resetBetaDatabase } from "../db/reset.js";
import { hashPassword } from "../lib/auth-password.js";
import { normalizeLegacyCatalogLabel, toCleanString } from "../lib/legacy-text-normalizer.js";

const {
  contratos,
  documentos,
  modalidades,
  movimentacoesWorkflow,
  pessoas,
  processos,
  secretarias,
  statusProcesso,
  users,
  workflowProcesso,
  fornecedores,
} = schema;

const canonicalModalidadeByCode = new Map(modalidadeCatalog.map((item) => [item.codigo, item]));

type LegacyRecord = Record<string, unknown>;

interface LegacySnapshot {
  meta: {
    generated_at: string;
    source_database: string;
    sync?: {
      mode?: "full" | "incremental";
      since?: string | null;
      until?: string | null;
      summary?: Record<string, number>;
    };
  };
  users: LegacyRecord[];
  secretarias: LegacyRecord[];
  modalidades: LegacyRecord[];
  status_processo: LegacyRecord[];
  pessoas: LegacyRecord[];
  processos: LegacyRecord[];
  workflow: LegacyRecord[];
  movimentacoes_workflow: LegacyRecord[];
  fornecedores: LegacyRecord[];
  documentos: LegacyRecord[];
  contratos: LegacyRecord[];
}

type ImportScope = "basics" | "full";

interface ImportArgs {
  scope: ImportScope;
  reset: boolean;
  snapshotPath?: string;
}

function toNullableString(value: unknown): string | null {
  const text = toCleanString(value);
  return text ? text : null;
}

function toDateOnly(value: unknown): string | null {
  const text = toCleanString(value);
  return text ? text.slice(0, 10) : null;
}

function toDateTime(value: unknown): Date | null {
  const text = toCleanString(value);
  return text ? new Date(text) : null;
}

function toMoney(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function isPositiveMoney(value: unknown): boolean {
  const amount = Number.parseFloat(String(value ?? "0").replace(",", "."));
  return Number.isFinite(amount) && amount > 0;
}

function toBoolean(value: unknown): boolean {
  return Boolean(value);
}

function normalizeWorkflowModule(value: unknown): "PLANEJAMENTO" | "COMPRAS" | "LICITACAO" | "PROCURADORIA" | "CONTROLADORIA" | "CONTRATOS" | "DOCUMENTOS" {
  const text = toCleanString(value).toUpperCase();
  if (["PLANEJAMENTO", "COMPRAS", "LICITACAO", "PROCURADORIA", "CONTROLADORIA", "CONTRATOS", "DOCUMENTOS"].includes(text)) {
    return text as never;
  }
  return "PLANEJAMENTO";
}

function normalizeWorkflowStatus(value: unknown): "RASCUNHO" | "EM_ANDAMENTO" | "AGUARDANDO" | "CONCLUIDO" | "SUSPENSO" {
  const text = toCleanString(value).toUpperCase();
  if (["RASCUNHO", "EM_ANDAMENTO", "AGUARDANDO", "CONCLUIDO", "SUSPENSO"].includes(text)) {
    return text as never;
  }
  return "RASCUNHO";
}

function normalizeDocumentType(value: unknown): "DFD" | "ETP" | "TR" | "EDITAL" | "COMUNICACAO_INTERNA" | "RESULTADO" | "CONTRATO" | "OUTRO" {
  const text = toCleanString(value).toUpperCase();
  if (text.includes("DFD")) return "DFD";
  if (text.includes("ETP")) return "ETP";
  if (text.includes("TERMO DE REFER") || text === "TR" || text.includes("TERMO_REFER")) return "TR";
  if (text.includes("EDITAL")) return "EDITAL";
  if (text.includes("COMUNIC") || text.includes("C.I") || text.includes("CI ")) return "COMUNICACAO_INTERNA";
  if (text.includes("RESULTADO") || text.includes("HOMOLOG")) return "RESULTADO";
  if (text.includes("CONTRATO")) return "CONTRATO";
  return "OUTRO";
}

function normalizeUsername(value: unknown, fallback: string) {
  const clean = toCleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .toLowerCase();
  return clean || fallback;
}

function normalizeKey(value: unknown) {
  return toCleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function resolveCanonicalModalidadeCode(value: unknown) {
  const key = normalizeKey(value);
  if (canonicalModalidadeByCode.has(key as (typeof modalidadeCatalog)[number]["codigo"])) {
    return key as (typeof modalidadeCatalog)[number]["codigo"];
  }
  if (key.includes("PREGAO") && key.includes("ELETRON")) return "PREGAO_ELETRONICO";
  if (key.includes("PREGAO") && key.includes("PRESENC")) return "PREGAO_PRESENCIAL";
  if (key.includes("CONCORRENCIA") && key.includes("ELETRON")) return "CONCORRENCIA_ELETRONICA";
  if (key.includes("CONCORRENCIA") && key.includes("PRESENC")) return "CONCORRENCIA_PRESENCIAL";
  if (key.includes("DISPENSA") && key.includes("SIMPLIFIC")) return "DISPENSA_SIMPLIFICADA";
  if (key.includes("DISPENSA") && key.includes("ELETRON")) return "DISPENSA_ELETRONICA";
  if (key.includes("INEXIG")) return "INEXIGIBILIDADE";
  if (key.includes("LEILAO") && key.includes("ELETRON")) return "LEILAO_ELETRONICO";
  if (key.includes("CREDENCI")) return "CREDENCIAMENTO";
  return null;
}

function parseArgs(argv: string[]): ImportArgs {
  const args: ImportArgs = { scope: "full", reset: false };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--scope") {
      const nextToken = argv[index + 1];
      if (nextToken === "basics" || nextToken === "full") {
        args.scope = nextToken;
        index += 1;
      }
      continue;
    }
    if (token === "--reset") {
      args.reset = true;
      continue;
    }
    if (!token.startsWith("--") && !args.snapshotPath) {
      args.snapshotPath = token;
    }
  }

  return args;
}

async function main() {
  const db = requireDb();
  const cliArgs = parseArgs(process.argv.slice(2));
  const defaultPassword = process.env.BETA_DEFAULT_PASSWORD || "SirelBeta@2026";
  const defaultPasswordHash = hashPassword(defaultPassword);
  const betaAdminUsername = normalizeUsername(process.env.BETA_ADMIN_USERNAME || "jonatas.sousa", "jonatas.sousa");
  const betaAdminName = toCleanString(process.env.BETA_ADMIN_NAME || "Jonatas Sousa");
  const betaAdminEmail = toCleanString(process.env.BETA_ADMIN_EMAIL || "jonatassousa@outlook.com").toLowerCase();
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const defaultSnapshotPath = resolve(currentDir, "../../../storage/migration/legacy_snapshot.json");
  const snapshotPath = resolve(process.cwd(), cliArgs.snapshotPath ?? defaultSnapshotPath);
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf-8")) as LegacySnapshot;

  if (cliArgs.reset) {
    await resetBetaDatabase(db);
  }

  const secretariaMap = new Map<number, number>();
  const modalidadeMap = new Map<number, number>();
  const statusMap = new Map<number, number>();
  const userMap = new Map<number, number>();
  const pessoaMap = new Map<number, number>();
  const fornecedorMap = new Map<number, number>();
  const processoMap = new Map<number, number>();
  const existingProcessRows = await db.select({ id: processos.id, numeroSirel: processos.numeroSirel }).from(processos);
  const existingProcessByNumero = new Map(existingProcessRows.map((row) => [toCleanString(row.numeroSirel), row.id]));
  const existingFornecedorRows = await db.select({ id: fornecedores.id, cnpj: fornecedores.cnpj }).from(fornecedores);
  const existingFornecedorByCnpj = new Map(existingFornecedorRows.map((row) => [toCleanString(row.cnpj), row.id]));

  for (const row of snapshot.secretarias) {
    const legacyId = Number(row.legacy_id);
    const [record] = await db
      .insert(secretarias)
      .values({
        sigla: toCleanString(row.sigla),
        nome: normalizeLegacyCatalogLabel("secretaria", row.nome),
      })
      .onConflictDoUpdate({
        target: secretarias.sigla,
        set: { nome: normalizeLegacyCatalogLabel("secretaria", row.nome), atualizadoEm: new Date() },
      })
      .returning({ id: secretarias.id });
    secretariaMap.set(legacyId, record.id);
  }

  let fallbackSecretariaId = Array.from(secretariaMap.values())[0] ?? null;
  if (cliArgs.scope === "full") {
    const [fallbackSecretaria] = await db
      .insert(secretarias)
      .values({
        sigla: "SEMSECRET",
        nome: "Secretaria nao informada",
        descricao: "Registro tecnico para migracao do legado",
        ativo: true,
      })
      .onConflictDoUpdate({
        target: secretarias.sigla,
        set: { nome: "Secretaria nao informada", atualizadoEm: new Date() },
      })
      .returning({ id: secretarias.id });
    fallbackSecretariaId = fallbackSecretaria.id;
  }
  const resolveSecretariaId = (legacyId: number | null | undefined) =>
    secretariaMap.get(Number(legacyId ?? 0)) ?? fallbackSecretariaId ?? null;

  for (const row of snapshot.modalidades) {
    const legacyId = Number(row.legacy_id);
    const codigo = resolveCanonicalModalidadeCode(row.nome);
    if (!codigo) continue;
    const [record] = await db
      .insert(modalidades)
      .values({
        codigo,
        nome: canonicalModalidadeByCode.get(codigo)?.nome ?? normalizeLegacyCatalogLabel("modalidade", row.nome),
        ativo: true,
      })
      .onConflictDoUpdate({
        target: modalidades.codigo,
        set: {
          nome: canonicalModalidadeByCode.get(codigo)?.nome ?? normalizeLegacyCatalogLabel("modalidade", row.nome),
          ativo: true,
        },
      })
      .returning({ id: modalidades.id });
    modalidadeMap.set(legacyId, record.id);
  }

  for (const item of modalidadeCatalog) {
    await db
      .insert(modalidades)
      .values({
        codigo: item.codigo,
        nome: item.nome,
        ativo: true,
      })
      .onConflictDoUpdate({
        target: modalidades.codigo,
        set: { nome: item.nome, ativo: true },
      });
  }

  const modalidadeRows = await db.select({ id: modalidades.id, codigo: modalidades.codigo }).from(modalidades);
  const modalidadeIdByCode = new Map(modalidadeRows.map((row) => [row.codigo, row.id]));
  for (const row of snapshot.modalidades) {
    const legacyId = Number(row.legacy_id);
    const codigo = resolveCanonicalModalidadeCode(row.nome);
    if (codigo) {
      const modalidadeId = modalidadeIdByCode.get(codigo);
      if (modalidadeId) modalidadeMap.set(legacyId, modalidadeId);
    }
  }

  for (const row of snapshot.status_processo) {
    const legacyId = Number(row.legacy_id);
    const codigo = `STATUS_${legacyId}`;
    const [record] = await db
      .insert(statusProcesso)
      .values({
        codigo,
        nome: normalizeLegacyCatalogLabel("statusProcesso", row.nome),
        ativo: true,
      })
      .onConflictDoUpdate({
        target: statusProcesso.codigo,
        set: { nome: normalizeLegacyCatalogLabel("statusProcesso", row.nome), ativo: true },
      })
      .returning({ id: statusProcesso.id });
    statusMap.set(legacyId, record.id);
  }

  const existingUsers = await db.select().from(users);
  const existingUserByLogin = new Map(existingUsers.map((row) => [toCleanString(row.loginMethod), row.id]));
  for (const row of snapshot.users) {
    const legacyId = Number(row.legacy_id);
    const loginMethod = `legacy_django:${toCleanString(row.username, String(legacyId))}`;
    const username = normalizeUsername(row.username || row.email || `legacy.${legacyId}`, `legacy.${legacyId}`);
    const currentId = existingUserByLogin.get(loginMethod);
    if (currentId) {
      await db
        .update(users)
        .set({
          username,
          name: toCleanString(row.name || row.username || `Usuario ${legacyId}`),
          email: toNullableString(String(row.email ?? "").toLowerCase()),
          role: toCleanString(row.suggested_role, "operador") as never,
          passwordHash: defaultPasswordHash,
          ativo: toBoolean(row.is_active),
          updatedAt: new Date(),
          lastSignedIn: toDateTime(row.last_login),
        })
        .where(eq(users.id, currentId));
      userMap.set(legacyId, currentId);
      continue;
    }
    const [created] = await db
      .insert(users)
      .values({
        username,
        name: toCleanString(row.name || row.username || `Usuario ${legacyId}`),
        email: toNullableString(String(row.email ?? "").toLowerCase()),
        loginMethod,
        passwordHash: defaultPasswordHash,
        role: toCleanString(row.suggested_role, "operador") as never,
        ativo: toBoolean(row.is_active),
        createdAt: toDateTime(row.date_joined) ?? new Date(),
        lastSignedIn: toDateTime(row.last_login),
      })
      .returning({ id: users.id });
    existingUserByLogin.set(loginMethod, created.id);
    userMap.set(legacyId, created.id);
  }

  await db
    .insert(users)
    .values({
      username: betaAdminUsername,
      name: betaAdminName,
      email: betaAdminEmail || null,
      loginMethod: "local_beta_admin",
      passwordHash: defaultPasswordHash,
      role: "admin",
      secretariaId: Array.from(secretariaMap.values())[0] ?? null,
      ativo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: users.username,
      set: {
        name: betaAdminName,
        email: betaAdminEmail || null,
        passwordHash: defaultPasswordHash,
        role: "admin",
        secretariaId: Array.from(secretariaMap.values())[0] ?? null,
        ativo: true,
        updatedAt: new Date(),
      },
    });

  const existingPessoas = await db.select().from(pessoas);
  const pessoaKey = (row: LegacyRecord, secretariaId: number | null) =>
    toCleanString(row.cpf)
      ? `cpf:${toCleanString(row.cpf)}`
      : `nome:${toCleanString(row.nome).toLowerCase()}|cargo:${toCleanString(row.cargo).toLowerCase()}|sec:${secretariaId ?? 0}`;
  const existingPessoaByKey = new Map(
    existingPessoas.map((row) => [
      row.cpf ? `cpf:${row.cpf}` : `nome:${row.nome.trim().toLowerCase()}|cargo:${(row.cargo ?? "").trim().toLowerCase()}|sec:${row.secretariaId ?? 0}`,
      row.id,
    ]),
  );
  for (const row of snapshot.pessoas) {
    const legacyId = Number(row.legacy_id);
    const secretariaId = secretariaMap.get(Number(row.secretaria_legacy_id ?? 0)) ?? null;
    const key = pessoaKey(row, secretariaId);
    const currentId = existingPessoaByKey.get(key);
    if (currentId) {
      await db
        .update(pessoas)
        .set({
          nome: toCleanString(row.nome || `Pessoa ${legacyId}`),
          cpf: toNullableString(row.cpf),
          cargo: toNullableString(row.cargo),
          secretariaId,
          atualizadoEm: new Date(),
        })
        .where(eq(pessoas.id, currentId));
      pessoaMap.set(legacyId, currentId);
      continue;
    }
    const [created] = await db
      .insert(pessoas)
      .values({
        nome: toCleanString(row.nome || `Pessoa ${legacyId}`),
        cpf: toNullableString(row.cpf),
        cargo: toNullableString(row.cargo),
        secretariaId,
        ativo: true,
      })
      .returning({ id: pessoas.id });
    existingPessoaByKey.set(key, created.id);
    pessoaMap.set(legacyId, created.id);
  }

  if (cliArgs.scope === "basics") {
    const resumoBasico = {
      scope: cliArgs.scope,
      reset: cliArgs.reset,
      secretarias: snapshot.secretarias.length,
      modalidades: modalidadeCatalog.length,
      status: snapshot.status_processo.length,
      users: snapshot.users.length,
      pessoas: snapshot.pessoas.length,
      processos: 0,
      workflow: 0,
      movimentacoes: 0,
      documentos: 0,
      contratos: 0,
      snapshot: snapshotPath,
    };

    console.log("Importação básica concluída.");
    console.table(resumoBasico);
    return;
  }

  for (const row of snapshot.fornecedores) {
    const legacyId = Number(row.legacy_id);
    const [record] = await db
      .insert(fornecedores)
      .values({
        razaoSocial: toCleanString(row.razao_social),
        cnpj: toCleanString(row.cnpj),
        email: toNullableString(row.email),
        telefone: toNullableString(row.telefone),
        cidade: toNullableString(row.cidade),
        estado: toNullableString(row.estado),
      })
      .onConflictDoUpdate({
        target: fornecedores.cnpj,
        set: {
          razaoSocial: toCleanString(row.razao_social),
          email: toNullableString(row.email),
          telefone: toNullableString(row.telefone),
          cidade: toNullableString(row.cidade),
          estado: toNullableString(row.estado),
          atualizadoEm: new Date(),
        },
      })
      .returning({ id: fornecedores.id });
    fornecedorMap.set(legacyId, record.id);
    existingFornecedorByCnpj.set(toCleanString(row.cnpj), record.id);
  }

  for (const row of snapshot.processos) {
    const legacyId = Number(row.legacy_id);
    const valorHomologado = toMoney(row.valor_homologado);
    const [record] = await db
      .insert(processos)
      .values({
        numeroSirel: toCleanString(row.numero_sirel),
        numeroAdministrativo: toNullableString(row.numero_administrativo),
        numeroEdital: toNullableString(row.numero_edital),
        anoReferencia: Number(row.ano_referencia),
        secretariaId: resolveSecretariaId(Number(row.secretaria_legacy_id ?? 0)),
        modalidadeId: modalidadeMap.get(Number(row.modalidade_legacy_id ?? 0)) ?? null,
        statusId: statusMap.get(Number(row.status_legacy_id ?? 0)) ?? null,
        objeto: toCleanString(row.objeto),
        valorEstimado: toMoney(row.valor_estimado),
        valorHomologado,
        escopoDisputa: toCleanString(row.escopo_disputa, "GLOBAL") as never,
        criterioJulgamento: toNullableString(row.criterio_julgamento),
        modoDisputa: toNullableString(row.modo_disputa),
        tipoObjeto: toCleanString(row.tipo_objeto, "PRODUTO") as never,
        tipoContratacao: toCleanString(row.tipo_contratacao, "AQUISICAO") as never,
        autoridadeCompetenteId: pessoaMap.get(Number(row.autoridade_competente_legacy_id ?? 0)) ?? null,
        condutorProcessoId: pessoaMap.get(Number(row.condutor_processo_legacy_id ?? 0)) ?? null,
        dataAbertura: toDateOnly(row.data_hora_abertura),
        dataEncerramento: toDateOnly(row.fim_recolhimento_propostas),
        publicado: Boolean(row.data_publicacao),
        homologado: isPositiveMoney(valorHomologado),
        finalizado: false,
        criadoPor: null,
        criadoEm: toDateTime(row.criado_em) ?? new Date(),
        atualizadoEm: toDateTime(row.atualizado_em) ?? new Date(),
      })
      .onConflictDoUpdate({
        target: processos.numeroSirel,
        set: {
          numeroAdministrativo: toNullableString(row.numero_administrativo),
          numeroEdital: toNullableString(row.numero_edital),
          secretariaId: resolveSecretariaId(Number(row.secretaria_legacy_id ?? 0)),
          modalidadeId: modalidadeMap.get(Number(row.modalidade_legacy_id ?? 0)) ?? null,
          statusId: statusMap.get(Number(row.status_legacy_id ?? 0)) ?? null,
          objeto: toCleanString(row.objeto),
          valorEstimado: toMoney(row.valor_estimado),
          valorHomologado,
          criterioJulgamento: toNullableString(row.criterio_julgamento),
          modoDisputa: toNullableString(row.modo_disputa),
          autoridadeCompetenteId: pessoaMap.get(Number(row.autoridade_competente_legacy_id ?? 0)) ?? null,
          condutorProcessoId: pessoaMap.get(Number(row.condutor_processo_legacy_id ?? 0)) ?? null,
          dataAbertura: toDateOnly(row.data_hora_abertura),
          dataEncerramento: toDateOnly(row.fim_recolhimento_propostas),
          homologado: isPositiveMoney(valorHomologado),
          atualizadoEm: toDateTime(row.atualizado_em) ?? new Date(),
        },
      })
      .returning({ id: processos.id });
    processoMap.set(legacyId, record.id);
    existingProcessByNumero.set(toCleanString(row.numero_sirel), record.id);
  }

  const resolveProcessId = (row: LegacyRecord) => {
    const byLegacyId = processoMap.get(Number(row.processo_legacy_id ?? 0));
    if (byLegacyId) return byLegacyId;
    return existingProcessByNumero.get(toCleanString(row.processo_numero_sirel));
  };

  const resolveFornecedorId = (row: LegacyRecord) => {
    const byLegacyId = fornecedorMap.get(Number(row.fornecedor_legacy_id ?? 0));
    if (byLegacyId) return byLegacyId;
    return existingFornecedorByCnpj.get(toCleanString(row.fornecedor_cnpj));
  };

  for (const row of snapshot.workflow) {
    const processoId = resolveProcessId(row);
    if (!processoId) continue;
    await db
      .insert(workflowProcesso)
      .values({
        processoId,
        moduloAtual: normalizeWorkflowModule(row.modulo_atual),
        situacao: normalizeWorkflowStatus(row.situacao),
        etapaAtual: normalizeLegacyCatalogLabel("workflowEtapa", row.etapa_atual, "Cadastro inicial"),
        dataInicio: toDateOnly(row.criado_em),
        dataConclusao: normalizeWorkflowStatus(row.situacao) === "CONCLUIDO" ? toDateOnly(row.atualizado_em) : null,
        criadoEm: toDateTime(row.criado_em) ?? new Date(),
        atualizadoEm: toDateTime(row.atualizado_em) ?? new Date(),
      })
      .onConflictDoUpdate({
        target: workflowProcesso.processoId,
        set: {
          moduloAtual: normalizeWorkflowModule(row.modulo_atual),
          situacao: normalizeWorkflowStatus(row.situacao),
          etapaAtual: normalizeLegacyCatalogLabel("workflowEtapa", row.etapa_atual, "Cadastro inicial"),
          atualizadoEm: toDateTime(row.atualizado_em) ?? new Date(),
        },
      });
  }

  const existingMovements = await db.select().from(movimentacoesWorkflow);
  const movementKey = (processoId: number, row: LegacyRecord) =>
    [
      processoId,
      toCleanString(row.modulo_origem),
      toCleanString(row.modulo_destino),
      toCleanString(row.descricao),
      toCleanString(row.criado_em),
    ].join("|");
  const movementSet = new Set(existingMovements.map((row) => [row.processoId, row.moduloOrigem ?? "", row.moduloDestino, row.descricao, row.criadoEm.toISOString()].join("|")));

  for (const row of snapshot.movimentacoes_workflow) {
    const processoId = resolveProcessId(row);
    if (!processoId) continue;
    const key = movementKey(processoId, row);
    if (movementSet.has(key)) continue;
    await db.insert(movimentacoesWorkflow).values({
      processoId,
      moduloOrigem: toNullableString(row.modulo_origem),
      moduloDestino: toCleanString(row.modulo_destino, "PLANEJAMENTO"),
      descricao: toCleanString(row.descricao, "Movimentacao migrada"),
      observacao: toNullableString(row.observacao),
      usuarioId: null,
      criadoEm: toDateTime(row.criado_em) ?? new Date(),
    });
    movementSet.add(key);
  }

  const existingDocuments = await db.select().from(documentos);
  const documentSet = new Set(existingDocuments.map((row) => [row.processoId, row.titulo, row.tipo, row.versao, row.arquivoChave ?? ""].join("|")));
  for (const row of snapshot.documentos) {
    const processoId = resolveProcessId(row);
    if (!processoId) continue;
    const arquivo = (row.arquivo ?? {}) as LegacyRecord;
    const key = [processoId, toCleanString(row.titulo), normalizeDocumentType(row.tipo), Number(row.versao ?? 1), toCleanString(arquivo.path)].join("|");
    if (documentSet.has(key)) continue;
    await db.insert(documentos).values({
      processoId,
      titulo: toCleanString(row.titulo || row.tipo || "Documento migrado"),
      descricao: toNullableString(row.descricao),
      tipo: normalizeDocumentType(row.tipo),
      categoria: toNullableString(row.categoria),
      versao: Number(row.versao ?? 1),
      arquivoUrl: toNullableString(arquivo.url) ?? toNullableString(arquivo.absolute_path),
      arquivoChave: toNullableString(arquivo.path),
      tamanhoBytes: Number(arquivo.size_bytes ?? 0) || null,
      mimeType: toNullableString(arquivo.mime_type),
      criadoPor: null,
      criadoEm: toDateTime(row.criado_em) ?? new Date(),
      atualizadoEm: toDateTime(row.criado_em) ?? new Date(),
    });
    documentSet.add(key);
  }

  for (const row of snapshot.contratos) {
    const processoId = resolveProcessId(row);
    const fornecedorId = resolveFornecedorId(row);
    if (!processoId || !fornecedorId) continue;
    const numeroContrato = toCleanString(row.numero || `LEGADO-${row.legacy_id}`);
    await db
      .insert(contratos)
      .values({
        numeroContrato,
        processoId,
        fornecedorId,
        valorContrato: toMoney(row.valor_atual) ?? toMoney(row.valor_inicial),
        dataAssinatura: toDateOnly(row.data_assinatura),
        dataVigenciaInicio: toDateOnly(row.vigencia_inicio),
        dataVigenciaFim: toDateOnly(row.vigencia_fim),
        objeto: toCleanString(row.objeto || "Contrato migrado"),
        status: "ATIVO",
        criadoEm: toDateTime(row.data_assinatura) ?? new Date(),
        atualizadoEm: new Date(),
      })
      .onConflictDoUpdate({
        target: contratos.numeroContrato,
        set: {
          processoId,
          fornecedorId,
          valorContrato: toMoney(row.valor_atual) ?? toMoney(row.valor_inicial),
          dataAssinatura: toDateOnly(row.data_assinatura),
          dataVigenciaInicio: toDateOnly(row.vigencia_inicio),
          dataVigenciaFim: toDateOnly(row.vigencia_fim),
          objeto: toCleanString(row.objeto || "Contrato migrado"),
          atualizadoEm: new Date(),
        },
      });
  }

  const resumo = {
    scope: cliArgs.scope,
    reset: cliArgs.reset,
    secretarias: snapshot.secretarias.length,
      modalidades: modalidadeCatalog.length,
    status: snapshot.status_processo.length,
    users: snapshot.users.length,
    pessoas: snapshot.pessoas.length,
    fornecedores: snapshot.fornecedores.length,
    processos: snapshot.processos.length,
    workflow: snapshot.workflow.length,
    movimentacoes: snapshot.movimentacoes_workflow.length,
    documentos: snapshot.documentos.length,
    contratos: snapshot.contratos.length,
    modo: snapshot.meta.sync?.mode ?? "full",
    ate: snapshot.meta.sync?.until ?? snapshot.meta.generated_at,
  };

  console.log("Importação do snapshot legado concluída.");
  console.table(resumo);
}

main().catch((error) => {
  console.error("Falha na importacao do snapshot legado:", error);
  process.exitCode = 1;
});


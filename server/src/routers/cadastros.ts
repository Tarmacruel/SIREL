import { TRPCError } from "@trpc/server";
import { and, asc, count, eq, ilike, or } from "drizzle-orm";

import {
  cadastroDeleteInputSchema,
  cadastroSaveInputSchema,
  cadastrosListInputSchema,
} from "@sirel/shared/schemas/cadastros";
import {
  grauPrioridadeLabels,
  grauPrioridadeOptions,
  metodologiaCotacaoLabels,
  metodologiaCotacaoOptions,
  modoDisputaLabels,
  modoDisputaOptions,
  modalidadeCatalog,
  workflowModuleOptions,
} from "@sirel/shared/const";

import { logAuditoria } from "../db/auditoria.js";
import { requireDb } from "../db/client.js";
import {
  catalogoItens,
  departamentos,
  fornecedores,
  modalidades,
  parametrosSistema,
  pessoas,
  secretarias,
  statusProcesso,
  users,
} from "../db/schema.js";
import { hashPassword } from "../lib/auth-password.js";
import { adminProcedure, gestorProcedure, protectedProcedure, router } from "../trpc.js";

function toNullableString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toNullableNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toNullableDecimal(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : null;
}

function itemCodeFromId(id: number) {
  return `ITM-${new Date().getFullYear()}-${String(id).padStart(5, "0")}`;
}

function buildAtivoFilter(status: "ativo" | "inativo" | undefined, column: any) {
  if (!status) return undefined;
  return eq(column, status === "ativo");
}

function withPagination(page: number, pageSize: number) {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  return {
    limit: safePageSize,
    offset: (safePage - 1) * safePageSize,
  };
}

export const cadastrosRouter = router({
  formOptions: protectedProcedure.query(async () => {
    const db = requireDb();

    const [secretariaRows, modalidadeRows, statusRows, pessoaRows, fornecedorRows, departamentoRows] = await Promise.all([
      db
        .select({ id: secretarias.id, nome: secretarias.nome, sigla: secretarias.sigla })
        .from(secretarias)
        .where(eq(secretarias.ativo, true))
        .orderBy(asc(secretarias.nome)),
      db
        .select({ id: modalidades.id, nome: modalidades.nome, codigo: modalidades.codigo })
        .from(modalidades)
        .where(eq(modalidades.ativo, true))
        .orderBy(asc(modalidades.nome)),
      db
        .select({ id: statusProcesso.id, nome: statusProcesso.nome, codigo: statusProcesso.codigo })
        .from(statusProcesso)
        .where(eq(statusProcesso.ativo, true))
        .orderBy(asc(statusProcesso.nome)),
      db
        .select({
          id: pessoas.id,
          nome: pessoas.nome,
          cargo: pessoas.cargo,
          secretariaId: pessoas.secretariaId,
        })
        .from(pessoas)
        .where(eq(pessoas.ativo, true))
        .orderBy(asc(pessoas.nome)),
      db
        .select({
          id: fornecedores.id,
          razaoSocial: fornecedores.razaoSocial,
          cnpj: fornecedores.cnpj,
        })
        .from(fornecedores)
        .where(eq(fornecedores.ativo, true))
        .orderBy(asc(fornecedores.razaoSocial)),
      db
        .select({
          id: departamentos.id,
          nome: departamentos.nome,
          secretariaId: departamentos.secretariaId,
        })
        .from(departamentos)
        .where(eq(departamentos.ativo, true))
        .orderBy(asc(departamentos.nome)),
    ]);

    return {
      secretarias: secretariaRows,
      modalidades: modalidadeRows.sort((left, right) => {
        const leftIndex = modalidadeCatalog.findIndex((item) => item.codigo === left.codigo);
        const rightIndex = modalidadeCatalog.findIndex((item) => item.codigo === right.codigo);
        return leftIndex - rightIndex;
      }),
      statusProcesso: statusRows,
      pessoas: pessoaRows,
      fornecedores: fornecedorRows,
      departamentos: departamentoRows,
      workflowModules: workflowModuleOptions,
      modoDisputa: modoDisputaOptions.map((codigo) => ({ codigo, nome: modoDisputaLabels[codigo] })),
      grauPrioridade: grauPrioridadeOptions.map((codigo) => ({ codigo, nome: grauPrioridadeLabels[codigo] })),
      metodologiaCotacao: metodologiaCotacaoOptions.map((codigo) => ({ codigo, nome: metodologiaCotacaoLabels[codigo] })),
      userRoles: [
        { codigo: "user", nome: "Usuário" },
        { codigo: "operador", nome: "Operador" },
        { codigo: "gestor", nome: "Gestor" },
        { codigo: "admin", nome: "Administrador" },
        { codigo: "auditor", nome: "Auditor" },
      ],
    };
  }),

  summary: protectedProcedure
    .input(cadastrosListInputSchema.pick({ entity: true }))
    .query(async ({ input }) => {
      const db = requireDb();

      switch (input.entity) {
        case "itens": {
          const [totalRow] = await db.select({ total: count() }).from(catalogoItens);
          const [ativosRow] = await db.select({ total: count() }).from(catalogoItens).where(eq(catalogoItens.ativo, true));
          return { total: Number(totalRow?.total ?? 0), ativos: Number(ativosRow?.total ?? 0) };
        }
        case "fornecedores": {
          const [totalRow] = await db.select({ total: count() }).from(fornecedores);
          const [ativosRow] = await db.select({ total: count() }).from(fornecedores).where(eq(fornecedores.ativo, true));
          return { total: Number(totalRow?.total ?? 0), ativos: Number(ativosRow?.total ?? 0) };
        }
        case "secretarias": {
          const [totalRow] = await db.select({ total: count() }).from(secretarias);
          const [ativosRow] = await db.select({ total: count() }).from(secretarias).where(eq(secretarias.ativo, true));
          return { total: Number(totalRow?.total ?? 0), ativos: Number(ativosRow?.total ?? 0) };
        }
        case "departamentos": {
          const [totalRow] = await db.select({ total: count() }).from(departamentos);
          const [ativosRow] = await db.select({ total: count() }).from(departamentos).where(eq(departamentos.ativo, true));
          return { total: Number(totalRow?.total ?? 0), ativos: Number(ativosRow?.total ?? 0) };
        }
        case "usuarios": {
          const [totalRow] = await db.select({ total: count() }).from(users);
          const [ativosRow] = await db.select({ total: count() }).from(users).where(eq(users.ativo, true));
          return { total: Number(totalRow?.total ?? 0), ativos: Number(ativosRow?.total ?? 0) };
        }
        case "parametros": {
          const [totalRow] = await db.select({ total: count() }).from(parametrosSistema);
          const [ativosRow] = await db.select({ total: count() }).from(parametrosSistema).where(eq(parametrosSistema.ativo, true));
          return { total: Number(totalRow?.total ?? 0), ativos: Number(ativosRow?.total ?? 0) };
        }
      }
    }),

  list: protectedProcedure.input(cadastrosListInputSchema).query(async ({ input }) => {
    const db = requireDb();
    const pagination = withPagination(input.page, input.pageSize);

    switch (input.entity) {
      case "itens": {
        const filters = [
          buildAtivoFilter(input.status, catalogoItens.ativo),
          input.search ? ilike(catalogoItens.descricao, `%${input.search}%`) : undefined,
        ].filter(Boolean) as any[];
        const whereClause = filters.length ? and(...filters) : undefined;

        const [totalRows, rows] = await Promise.all([
          db.select({ total: count() }).from(catalogoItens).where(whereClause),
          db
            .select({
              id: catalogoItens.id,
              descricao: catalogoItens.descricao,
              unidadePadrao: catalogoItens.unidadePadrao,
              valorReferencia: catalogoItens.valorReferencia,
              imagemUrl: catalogoItens.imagemUrl,
              ativo: catalogoItens.ativo,
              atualizadoEm: catalogoItens.atualizadoEm,
            })
            .from(catalogoItens)
            .where(whereClause)
            .orderBy(asc(catalogoItens.descricao))
            .limit(pagination.limit)
            .offset(pagination.offset),
        ]);

        const total = Number(totalRows[0]?.total ?? 0);
        return {
          page: input.page,
          pageSize: input.pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
          items: rows.map((row) => ({
            id: row.id,
            nome: row.descricao,
            codigo: itemCodeFromId(row.id),
            unidade: row.unidadePadrao,
            valorReferencia: row.valorReferencia ? Number(row.valorReferencia) : null,
            imagemUrl: row.imagemUrl,
            status: row.ativo ? "ativo" : "inativo",
            atualizadoEm: row.atualizadoEm,
          })),
        };
      }

      case "fornecedores": {
        const filters = [
          buildAtivoFilter(input.status, fornecedores.ativo),
          input.search
            ? or(
                ilike(fornecedores.razaoSocial, `%${input.search}%`),
                ilike(fornecedores.cnpj, `%${input.search}%`),
                ilike(fornecedores.email, `%${input.search}%`),
              )
            : undefined,
          input.cidade ? ilike(fornecedores.cidade, `%${input.cidade}%`) : undefined,
        ].filter(Boolean) as any[];
        const whereClause = filters.length ? and(...filters) : undefined;

        const [totalRows, rows] = await Promise.all([
          db.select({ total: count() }).from(fornecedores).where(whereClause),
          db.select().from(fornecedores).where(whereClause).orderBy(asc(fornecedores.razaoSocial)).limit(pagination.limit).offset(pagination.offset),
        ]);

        const total = Number(totalRows[0]?.total ?? 0);
        return {
          page: input.page,
          pageSize: input.pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
          items: rows.map((row) => ({
            id: row.id,
            razaoSocial: row.razaoSocial,
            cnpj: row.cnpj,
            email: row.email,
            telefone: row.telefone,
            cidade: row.cidade,
            estado: row.estado,
            logoUrl: row.logoUrl,
            status: row.ativo ? "ativo" : "inativo",
            atualizadoEm: row.atualizadoEm,
          })),
        };
      }

      case "secretarias": {
        const filters = [
          buildAtivoFilter(input.status, secretarias.ativo),
          input.search
            ? or(
                ilike(secretarias.nome, `%${input.search}%`),
                ilike(secretarias.sigla, `%${input.search}%`),
                ilike(secretarias.responsavel, `%${input.search}%`),
              )
            : undefined,
        ].filter(Boolean) as any[];
        const whereClause = filters.length ? and(...filters) : undefined;

        const [totalRows, rows] = await Promise.all([
          db.select({ total: count() }).from(secretarias).where(whereClause),
          db.select().from(secretarias).where(whereClause).orderBy(asc(secretarias.nome)).limit(pagination.limit).offset(pagination.offset),
        ]);

        const total = Number(totalRows[0]?.total ?? 0);
        return {
          page: input.page,
          pageSize: input.pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
          items: rows.map((row) => ({
            id: row.id,
            sigla: row.sigla,
            nome: row.nome,
            descricao: row.descricao,
            responsavel: row.responsavel,
            email: row.email,
            telefone: row.telefone,
            status: row.ativo ? "ativo" : "inativo",
            atualizadoEm: row.atualizadoEm,
          })),
        };
      }

      case "departamentos": {
        const filters = [
          buildAtivoFilter(input.status, departamentos.ativo),
          input.search
            ? or(
                ilike(departamentos.nome, `%${input.search}%`),
                ilike(departamentos.codigoCentroCusto, `%${input.search}%`),
                ilike(secretarias.nome, `%${input.search}%`),
              )
            : undefined,
          input.secretariaId ? eq(departamentos.secretariaId, input.secretariaId) : undefined,
        ].filter(Boolean) as any[];
        const whereClause = filters.length ? and(...filters) : undefined;

        const [totalRows, rows] = await Promise.all([
          db.select({ total: count() }).from(departamentos).leftJoin(secretarias, eq(secretarias.id, departamentos.secretariaId)).where(whereClause),
          db
            .select({
              id: departamentos.id,
              nome: departamentos.nome,
              codigoCentroCusto: departamentos.codigoCentroCusto,
              secretariaId: departamentos.secretariaId,
              secretariaNome: secretarias.nome,
              responsavelId: departamentos.responsavelId,
              responsavelNome: pessoas.nome,
              descricao: departamentos.descricao,
              ativo: departamentos.ativo,
              atualizadoEm: departamentos.atualizadoEm,
            })
            .from(departamentos)
            .leftJoin(secretarias, eq(secretarias.id, departamentos.secretariaId))
            .leftJoin(pessoas, eq(pessoas.id, departamentos.responsavelId))
            .where(whereClause)
            .orderBy(asc(departamentos.nome))
            .limit(pagination.limit)
            .offset(pagination.offset),
        ]);

        const total = Number(totalRows[0]?.total ?? 0);
        return {
          page: input.page,
          pageSize: input.pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
          items: rows.map((row) => ({
            id: row.id,
            nome: row.nome,
            codigoCentroCusto: row.codigoCentroCusto,
            secretariaId: row.secretariaId,
            secretariaNome: row.secretariaNome,
            responsavelId: row.responsavelId,
            responsavelNome: row.responsavelNome,
            descricao: row.descricao,
            status: row.ativo ? "ativo" : "inativo",
            atualizadoEm: row.atualizadoEm,
          })),
        };
      }

      case "usuarios": {
        const filters = [
          buildAtivoFilter(input.status, users.ativo),
          input.search
            ? or(
                ilike(users.username, `%${input.search}%`),
                ilike(users.name, `%${input.search}%`),
                ilike(users.email, `%${input.search}%`),
              )
            : undefined,
          input.secretariaId ? eq(users.secretariaId, input.secretariaId) : undefined,
          input.role ? eq(users.role, input.role) : undefined,
        ].filter(Boolean) as any[];
        const whereClause = filters.length ? and(...filters) : undefined;

        const [totalRows, rows] = await Promise.all([
          db.select({ total: count() }).from(users).leftJoin(secretarias, eq(secretarias.id, users.secretariaId)).where(whereClause),
          db
            .select({
              id: users.id,
              username: users.username,
              name: users.name,
              email: users.email,
              role: users.role,
              secretariaId: users.secretariaId,
              secretariaNome: secretarias.nome,
              ativo: users.ativo,
              lastSignedIn: users.lastSignedIn,
              updatedAt: users.updatedAt,
            })
            .from(users)
            .leftJoin(secretarias, eq(secretarias.id, users.secretariaId))
            .where(whereClause)
            .orderBy(asc(users.name))
            .limit(pagination.limit)
            .offset(pagination.offset),
        ]);

        const total = Number(totalRows[0]?.total ?? 0);
        return {
          page: input.page,
          pageSize: input.pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
          items: rows.map((row) => ({
            id: row.id,
            username: row.username,
            name: row.name,
            email: row.email,
            role: row.role,
            secretariaId: row.secretariaId,
            secretariaNome: row.secretariaNome,
            status: row.ativo ? "ativo" : "inativo",
            lastSignedIn: row.lastSignedIn,
            atualizadoEm: row.updatedAt,
          })),
        };
      }

      case "parametros": {
        const filters = [
          buildAtivoFilter(input.status, parametrosSistema.ativo),
          input.search
            ? or(
                ilike(parametrosSistema.categoria, `%${input.search}%`),
                ilike(parametrosSistema.chave, `%${input.search}%`),
                ilike(parametrosSistema.valor, `%${input.search}%`),
              )
            : undefined,
        ].filter(Boolean) as any[];
        const whereClause = filters.length ? and(...filters) : undefined;

        const [totalRows, rows] = await Promise.all([
          db.select({ total: count() }).from(parametrosSistema).where(whereClause),
          db
            .select()
            .from(parametrosSistema)
            .where(whereClause)
            .orderBy(asc(parametrosSistema.categoria), asc(parametrosSistema.chave))
            .limit(pagination.limit)
            .offset(pagination.offset),
        ]);

        const total = Number(totalRows[0]?.total ?? 0);
        return {
          page: input.page,
          pageSize: input.pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
          items: rows.map((row) => ({
            id: row.id,
            categoria: row.categoria,
            chave: row.chave,
            valor: row.valor,
            descricao: row.descricao,
            status: row.ativo ? "ativo" : "inativo",
            atualizadoEm: row.atualizadoEm,
          })),
        };
      }
    }
  }),

  save: gestorProcedure.input(cadastroSaveInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();

    switch (input.entity) {
      case "itens": {
        const payload = {
          descricao: input.data.descricao,
          unidadePadrao: input.data.unidadePadrao,
          valorReferencia: toNullableDecimal(input.data.valorReferencia ?? null),
          ativo: input.data.ativo,
          atualizadoEm: new Date(),
        };

        if (input.data.id) {
          const [before] = await db.select().from(catalogoItens).where(eq(catalogoItens.id, input.data.id)).limit(1);
          const [updated] = await db.update(catalogoItens).set(payload).where(eq(catalogoItens.id, input.data.id)).returning();
          if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado." });
          await logAuditoria(ctx, {
            tabela: "catalogo_itens",
            registroId: updated.id,
            acao: "UPDATE",
            dadosAnteriores: before,
            dadosNovos: updated,
            descricao: `Cadastro do item ${updated.descricao} atualizado`,
          });
          return updated;
        }

        const [created] = await db
          .insert(catalogoItens)
          .values({ ...payload, criadoEm: new Date(), criadoPor: ctx.user?.id ?? null })
          .returning();
        await logAuditoria(ctx, {
          tabela: "catalogo_itens",
          registroId: created.id,
          acao: "CREATE",
          dadosNovos: created,
          descricao: `Cadastro do item ${created.descricao} criado`,
        });
        return created;
      }

      case "fornecedores": {
        const normalizedCnpj = input.data.cnpj.replace(/\D/g, "");
        const existing = await db.select({ id: fornecedores.id }).from(fornecedores).where(eq(fornecedores.cnpj, normalizedCnpj));
        if (existing.some((row) => row.id !== input.data.id)) {
          throw new TRPCError({ code: "CONFLICT", message: "Já existe fornecedor com este CNPJ." });
        }

        const payload = {
          razaoSocial: input.data.razaoSocial,
          cnpj: normalizedCnpj,
          email: toNullableString(input.data.email),
          telefone: toNullableString(input.data.telefone),
          cidade: toNullableString(input.data.cidade),
          estado: toNullableString(input.data.estado)?.toUpperCase() ?? null,
          ativo: input.data.ativo,
          atualizadoEm: new Date(),
        };

        if (input.data.id) {
          const [before] = await db.select().from(fornecedores).where(eq(fornecedores.id, input.data.id)).limit(1);
          const [updated] = await db.update(fornecedores).set(payload).where(eq(fornecedores.id, input.data.id)).returning();
          if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Fornecedor não encontrado." });
          await logAuditoria(ctx, {
            tabela: "fornecedores",
            registroId: updated.id,
            acao: "UPDATE",
            dadosAnteriores: before,
            dadosNovos: updated,
            descricao: `Cadastro do fornecedor ${updated.razaoSocial} atualizado`,
          });
          return updated;
        }

        const [created] = await db.insert(fornecedores).values({ ...payload, criadoEm: new Date() }).returning();
        await logAuditoria(ctx, {
          tabela: "fornecedores",
          registroId: created.id,
          acao: "CREATE",
          dadosNovos: created,
          descricao: `Cadastro do fornecedor ${created.razaoSocial} criado`,
        });
        return created;
      }

      case "secretarias": {
        const normalizedSigla = input.data.sigla.trim().toUpperCase();
        const existing = await db.select({ id: secretarias.id }).from(secretarias).where(eq(secretarias.sigla, normalizedSigla));
        if (existing.some((row) => row.id !== input.data.id)) {
          throw new TRPCError({ code: "CONFLICT", message: "Já existe secretaria com esta sigla." });
        }

        const payload = {
          sigla: normalizedSigla,
          nome: input.data.nome,
          descricao: toNullableString(input.data.descricao),
          responsavel: toNullableString(input.data.responsavel),
          email: toNullableString(input.data.email),
          telefone: toNullableString(input.data.telefone),
          ativo: input.data.ativo,
          atualizadoEm: new Date(),
        };

        if (input.data.id) {
          const [before] = await db.select().from(secretarias).where(eq(secretarias.id, input.data.id)).limit(1);
          const [updated] = await db.update(secretarias).set(payload).where(eq(secretarias.id, input.data.id)).returning();
          if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Secretaria não encontrada." });
          await logAuditoria(ctx, {
            tabela: "secretarias",
            registroId: updated.id,
            acao: "UPDATE",
            dadosAnteriores: before,
            dadosNovos: updated,
            descricao: `Cadastro da secretaria ${updated.nome} atualizado`,
          });
          return updated;
        }

        const [created] = await db.insert(secretarias).values({ ...payload, criadoEm: new Date() }).returning();
        await logAuditoria(ctx, {
          tabela: "secretarias",
          registroId: created.id,
          acao: "CREATE",
          dadosNovos: created,
          descricao: `Cadastro da secretaria ${created.nome} criado`,
        });
        return created;
      }

      case "departamentos": {
        const payload = {
          nome: input.data.nome,
          codigoCentroCusto: toNullableString(input.data.codigoCentroCusto),
          secretariaId: input.data.secretariaId,
          responsavelId: input.data.responsavelId ?? null,
          descricao: toNullableString(input.data.descricao),
          ativo: input.data.ativo,
          atualizadoEm: new Date(),
        };

        if (input.data.id) {
          const [before] = await db.select().from(departamentos).where(eq(departamentos.id, input.data.id)).limit(1);
          const [updated] = await db.update(departamentos).set(payload).where(eq(departamentos.id, input.data.id)).returning();
          if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Departamento não encontrado." });
          await logAuditoria(ctx, {
            tabela: "departamentos",
            registroId: updated.id,
            acao: "UPDATE",
            dadosAnteriores: before,
            dadosNovos: updated,
            descricao: `Cadastro do departamento ${updated.nome} atualizado`,
          });
          return updated;
        }

        const [created] = await db.insert(departamentos).values({ ...payload, criadoEm: new Date() }).returning();
        await logAuditoria(ctx, {
          tabela: "departamentos",
          registroId: created.id,
          acao: "CREATE",
          dadosNovos: created,
          descricao: `Cadastro do departamento ${created.nome} criado`,
        });
        return created;
      }

      case "usuarios": {
        if (input.data.id) {
          const [before] = await db.select().from(users).where(eq(users.id, input.data.id)).limit(1);
          const [updated] = await db
            .update(users)
            .set({
              name: input.data.name,
              email: toNullableString(input.data.email),
              role: input.data.role,
              secretariaId: input.data.secretariaId ?? null,
              ativo: input.data.ativo,
              updatedAt: new Date(),
            })
            .where(eq(users.id, input.data.id))
            .returning();

          if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
          await logAuditoria(ctx, {
            tabela: "users",
            registroId: updated.id,
            acao: "UPDATE",
            dadosAnteriores: before,
            dadosNovos: updated,
            descricao: `Cadastro do usuário ${updated.name} atualizado`,
          });
          return updated;
        }

        const normalizedUsername = input.data.username?.trim().toLowerCase();
        if (!normalizedUsername || !input.data.password) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Informe login e senha inicial para criar o usuário." });
        }

        const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, normalizedUsername)).limit(1);
        if (existing.length) {
          throw new TRPCError({ code: "CONFLICT", message: "Já existe usuário com este login." });
        }

        const [created] = await db
          .insert(users)
          .values({
            username: normalizedUsername,
            name: input.data.name,
            email: toNullableString(input.data.email),
            loginMethod: "local_password",
            passwordHash: hashPassword(input.data.password),
            role: input.data.role,
            secretariaId: input.data.secretariaId ?? null,
            ativo: input.data.ativo,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        await logAuditoria(ctx, {
          tabela: "users",
          registroId: created.id,
          acao: "CREATE",
          dadosNovos: created,
          descricao: `Cadastro do usuário ${created.name} criado`,
        });
        return created;
      }

      case "parametros": {
        const normalizedKey = input.data.chave.trim().toUpperCase();
        const existing = await db.select({ id: parametrosSistema.id }).from(parametrosSistema).where(eq(parametrosSistema.chave, normalizedKey));
        if (existing.some((row) => row.id !== input.data.id)) {
          throw new TRPCError({ code: "CONFLICT", message: "Já existe parâmetro com esta chave." });
        }

        const payload = {
          categoria: input.data.categoria,
          chave: normalizedKey,
          valor: input.data.valor,
          descricao: toNullableString(input.data.descricao),
          ativo: input.data.ativo,
          atualizadoEm: new Date(),
        };

        if (input.data.id) {
          const [before] = await db.select().from(parametrosSistema).where(eq(parametrosSistema.id, input.data.id)).limit(1);
          const [updated] = await db.update(parametrosSistema).set(payload).where(eq(parametrosSistema.id, input.data.id)).returning();
          if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Parâmetro não encontrado." });
          await logAuditoria(ctx, {
            tabela: "parametros_sistema",
            registroId: updated.id,
            acao: "UPDATE",
            dadosAnteriores: before,
            dadosNovos: updated,
            descricao: `Parâmetro ${updated.chave} atualizado`,
          });
          return updated;
        }

        const [created] = await db.insert(parametrosSistema).values({ ...payload, criadoEm: new Date() }).returning();
        await logAuditoria(ctx, {
          tabela: "parametros_sistema",
          registroId: created.id,
          acao: "CREATE",
          dadosNovos: created,
          descricao: `Parâmetro ${created.chave} criado`,
        });
        return created;
      }
    }
  }),

  remove: adminProcedure.input(cadastroDeleteInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();

    switch (input.entity) {
      case "itens": {
        const [before] = await db.select().from(catalogoItens).where(eq(catalogoItens.id, input.id)).limit(1);
        const [updated] = await db.update(catalogoItens).set({ ativo: false, atualizadoEm: new Date() }).where(eq(catalogoItens.id, input.id)).returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado." });
        await logAuditoria(ctx, {
          tabela: "catalogo_itens",
          registroId: updated.id,
          acao: "DELETE",
          dadosAnteriores: before,
          dadosNovos: updated,
          descricao: `Cadastro do item ${updated.descricao} inativado`,
        });
        return { success: true };
      }
      case "fornecedores": {
        const [before] = await db.select().from(fornecedores).where(eq(fornecedores.id, input.id)).limit(1);
        const [updated] = await db.update(fornecedores).set({ ativo: false, atualizadoEm: new Date() }).where(eq(fornecedores.id, input.id)).returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Fornecedor não encontrado." });
        await logAuditoria(ctx, {
          tabela: "fornecedores",
          registroId: updated.id,
          acao: "DELETE",
          dadosAnteriores: before,
          dadosNovos: updated,
          descricao: `Cadastro do fornecedor ${updated.razaoSocial} inativado`,
        });
        return { success: true };
      }
      case "secretarias": {
        const [before] = await db.select().from(secretarias).where(eq(secretarias.id, input.id)).limit(1);
        const [updated] = await db.update(secretarias).set({ ativo: false, atualizadoEm: new Date() }).where(eq(secretarias.id, input.id)).returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Secretaria não encontrada." });
        await logAuditoria(ctx, {
          tabela: "secretarias",
          registroId: updated.id,
          acao: "DELETE",
          dadosAnteriores: before,
          dadosNovos: updated,
          descricao: `Cadastro da secretaria ${updated.nome} inativado`,
        });
        return { success: true };
      }
      case "departamentos": {
        const [before] = await db.select().from(departamentos).where(eq(departamentos.id, input.id)).limit(1);
        const [updated] = await db.update(departamentos).set({ ativo: false, atualizadoEm: new Date() }).where(eq(departamentos.id, input.id)).returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Departamento não encontrado." });
        await logAuditoria(ctx, {
          tabela: "departamentos",
          registroId: updated.id,
          acao: "DELETE",
          dadosAnteriores: before,
          dadosNovos: updated,
          descricao: `Cadastro do departamento ${updated.nome} inativado`,
        });
        return { success: true };
      }
      case "usuarios": {
        if (ctx.user?.id === input.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Não é permitido inativar o usuário autenticado." });
        }
        const [before] = await db.select().from(users).where(eq(users.id, input.id)).limit(1);
        const [updated] = await db.update(users).set({ ativo: false, updatedAt: new Date() }).where(eq(users.id, input.id)).returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
        await logAuditoria(ctx, {
          tabela: "users",
          registroId: updated.id,
          acao: "DELETE",
          dadosAnteriores: before,
          dadosNovos: updated,
          descricao: `Cadastro do usuário ${updated.name} inativado`,
        });
        return { success: true };
      }
      case "parametros": {
        const [before] = await db.select().from(parametrosSistema).where(eq(parametrosSistema.id, input.id)).limit(1);
        const [updated] = await db.update(parametrosSistema).set({ ativo: false, atualizadoEm: new Date() }).where(eq(parametrosSistema.id, input.id)).returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Parâmetro não encontrado." });
        await logAuditoria(ctx, {
          tabela: "parametros_sistema",
          registroId: updated.id,
          acao: "DELETE",
          dadosAnteriores: before,
          dadosNovos: updated,
          descricao: `Parâmetro ${updated.chave} inativado`,
        });
        return { success: true };
      }
    }
  }),
});

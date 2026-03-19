import { and, count, countDistinct, desc, eq, gte, lte, sql, sum } from "drizzle-orm";

import { relatorioTipoLabels } from "@sirel/shared/const";
import { relatorioRunInputSchema } from "@sirel/shared/schemas/relatorios";

import { requireDb } from "../db/client.js";
import {
  auditoriaLog,
  documentos,
  processos,
  prazosProcessuais,
  secretarias,
  statusProcesso,
  users,
  workflowProcesso,
  modalidades,
} from "../db/schema.js";
import { protectedProcedure, router } from "../trpc.js";

function formatDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(value?: string) {
  if (!value?.trim()) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export const relatoriosRouter = router({
  run: protectedProcedure.input(relatorioRunInputSchema).query(async ({ input }) => {
    const db = requireDb();
    const dataInicial = parseDate(input.dataInicial);
    const dataFinal = parseDate(input.dataFinal);

    if (input.tipo === "PROCESSOS_POR_STATUS") {
      const filters: any[] = [];
      if (input.secretariaId) filters.push(eq(processos.secretariaId, input.secretariaId));
      if (input.modalidadeId) filters.push(eq(processos.modalidadeId, input.modalidadeId));
      if (input.statusId) filters.push(eq(processos.statusId, input.statusId));
      if (dataInicial) filters.push(gte(processos.criadoEm, dataInicial));
      if (dataFinal) filters.push(lte(processos.criadoEm, new Date(`${input.dataFinal}T23:59:59`)));

      const whereClause = filters.length ? and(...filters) : undefined;
      const rows = await db
        .select({
          numeroSirel: processos.numeroSirel,
          numeroAdministrativo: processos.numeroAdministrativo,
          objeto: processos.objeto,
          secretaria: secretarias.nome,
          modalidade: modalidades.nome,
          status: statusProcesso.nome,
          moduloAtual: workflowProcesso.moduloAtual,
          valorEstimado: processos.valorEstimado,
          publicado: processos.publicado,
          homologado: processos.homologado,
          finalizado: processos.finalizado,
          criadoEm: processos.criadoEm,
        })
        .from(processos)
        .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
        .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
        .leftJoin(statusProcesso, eq(statusProcesso.id, processos.statusId))
        .leftJoin(workflowProcesso, eq(workflowProcesso.processoId, processos.id))
        .where(whereClause)
        .orderBy(desc(processos.criadoEm), desc(processos.id));

      return {
        title: relatorioTipoLabels[input.tipo],
        generatedAt: new Date(),
        columns: [
          { key: "numeroSirel", label: "Processo" },
          { key: "numeroAdministrativo", label: "Número administrativo" },
          { key: "objeto", label: "Objeto" },
          { key: "secretaria", label: "Secretaria" },
          { key: "modalidade", label: "Modalidade" },
          { key: "status", label: "Status" },
          { key: "moduloAtual", label: "Módulo atual" },
          { key: "valorEstimado", label: "Valor estimado" },
          { key: "criadoEm", label: "Criado em" },
        ],
        rows: rows.map((row) => ({
          numeroSirel: row.numeroSirel,
          numeroAdministrativo: row.numeroAdministrativo ?? "-",
          objeto: row.objeto,
          secretaria: row.secretaria,
          modalidade: row.modalidade ?? "Sem modalidade",
          status: row.status ?? "Sem status",
          moduloAtual: row.moduloAtual ?? "SEM_WORKFLOW",
          valorEstimado: Number(row.valorEstimado ?? 0),
          criadoEm: row.criadoEm,
        })),
        summary: [
          { label: "Período inicial", value: input.dataInicial || "-" },
          { label: "Período final", value: input.dataFinal || "-" },
          { label: "Processos listados", value: rows.length },
          { label: "Valor total estimado", value: rows.reduce((acc, row) => acc + Number(row.valorEstimado ?? 0), 0) },
          { label: "Publicados", value: rows.filter((row) => row.publicado).length },
          { label: "Homologados", value: rows.filter((row) => row.homologado).length },
        ],
      };
    }

    if (input.tipo === "PRAZOS_CRITICOS") {
      const filters: any[] = [];
      if (input.secretariaId) filters.push(eq(processos.secretariaId, input.secretariaId));
      if (input.statusId) filters.push(eq(processos.statusId, input.statusId));
      if (dataInicial) filters.push(gte(prazosProcessuais.dataPrevista, formatDateString(dataInicial)));
      if (dataFinal) filters.push(lte(prazosProcessuais.dataPrevista, formatDateString(dataFinal)));

      const whereClause = filters.length ? and(...filters) : undefined;
      const rows = await db
        .select({
          processoNumeroSirel: processos.numeroSirel,
          objeto: processos.objeto,
          secretaria: secretarias.nome,
          titulo: prazosProcessuais.titulo,
          tipo: prazosProcessuais.tipo,
          dataPrevista: prazosProcessuais.dataPrevista,
          status: prazosProcessuais.status,
        })
        .from(prazosProcessuais)
        .innerJoin(processos, eq(processos.id, prazosProcessuais.processoId))
        .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
        .where(whereClause)
        .orderBy(prazosProcessuais.dataPrevista, processos.numeroSirel);

      return {
        title: relatorioTipoLabels[input.tipo],
        generatedAt: new Date(),
        columns: [
          { key: "processoNumeroSirel", label: "Processo" },
          { key: "objeto", label: "Objeto" },
          { key: "secretaria", label: "Secretaria" },
          { key: "titulo", label: "Prazo" },
          { key: "tipo", label: "Tipo" },
          { key: "dataPrevista", label: "Data prevista" },
          { key: "status", label: "Status" },
        ],
        rows,
        summary: [
          { label: "Prazos listados", value: rows.length },
          { label: "Em atraso", value: rows.filter((row) => row.status === "EM_ATRASO").length },
          { label: "Pendentes", value: rows.filter((row) => row.status === "PENDENTE").length },
        ],
      };
    }

    if (input.tipo === "VALORES_POR_SECRETARIA") {
      const filters: any[] = [];
      if (input.modalidadeId) filters.push(eq(processos.modalidadeId, input.modalidadeId));
      if (input.statusId) filters.push(eq(processos.statusId, input.statusId));
      if (dataInicial) filters.push(gte(processos.criadoEm, dataInicial));
      if (dataFinal) filters.push(lte(processos.criadoEm, new Date(`${input.dataFinal}T23:59:59`)));

      const whereClause = filters.length ? and(...filters) : undefined;
      const rows = await db
        .select({
          secretaria: secretarias.nome,
          totalProcessos: count(),
          valorEstimado: sum(processos.valorEstimado),
        })
        .from(processos)
        .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
        .where(whereClause)
        .groupBy(secretarias.nome)
        .orderBy(desc(sum(processos.valorEstimado)));

      return {
        title: relatorioTipoLabels[input.tipo],
        generatedAt: new Date(),
        columns: [
          { key: "secretaria", label: "Secretaria" },
          { key: "totalProcessos", label: "Total de processos" },
          { key: "valorEstimado", label: "Valor estimado" },
        ],
        rows: rows.map((row) => ({
          secretaria: row.secretaria,
          totalProcessos: Number(row.totalProcessos ?? 0),
          valorEstimado: Number(row.valorEstimado ?? 0),
        })),
        summary: [
          { label: "Secretarias no relatório", value: rows.length },
          { label: "Valor global", value: rows.reduce((acc, row) => acc + Number(row.valorEstimado ?? 0), 0) },
        ],
      };
    }

    if (input.tipo === "DOCUMENTOS_POR_TIPO") {
      const filters: any[] = [];
      if (input.secretariaId) filters.push(eq(processos.secretariaId, input.secretariaId));
      if (dataInicial) filters.push(gte(documentos.criadoEm, dataInicial));
      if (dataFinal) filters.push(lte(documentos.criadoEm, new Date(`${input.dataFinal}T23:59:59`)));

      const whereClause = filters.length ? and(...filters) : undefined;
      const rows = await db
        .select({
          tipo: documentos.tipo,
          categoria: documentos.categoria,
          totalDocumentos: count(),
          processosDistintos: countDistinct(documentos.processoId),
        })
        .from(documentos)
        .innerJoin(processos, eq(processos.id, documentos.processoId))
        .where(whereClause)
        .groupBy(documentos.tipo, documentos.categoria)
        .orderBy(desc(count()), documentos.tipo);

      return {
        title: relatorioTipoLabels[input.tipo],
        generatedAt: new Date(),
        columns: [
          { key: "tipo", label: "Tipo" },
          { key: "categoria", label: "Categoria" },
          { key: "totalDocumentos", label: "Documentos" },
          { key: "processosDistintos", label: "Processos distintos" },
        ],
        rows: rows.map((row) => ({
          tipo: row.tipo,
          categoria: row.categoria ?? "-",
          totalDocumentos: Number(row.totalDocumentos ?? 0),
          processosDistintos: Number(row.processosDistintos ?? 0),
        })),
        summary: [
          { label: "Linhas consolidadas", value: rows.length },
          { label: "Documentos totais", value: rows.reduce((acc, row) => acc + Number(row.totalDocumentos ?? 0), 0) },
        ],
      };
    }

    const filters: any[] = [];
    if (input.dataInicial) filters.push(gte(auditoriaLog.criadoEm, new Date(`${input.dataInicial}T00:00:00`)));
    if (input.dataFinal) filters.push(lte(auditoriaLog.criadoEm, new Date(`${input.dataFinal}T23:59:59`)));
    const whereClause = filters.length ? and(...filters) : undefined;

    const rows = await db
      .select({
        usuario: users.name,
        tabela: auditoriaLog.tabela,
        acao: auditoriaLog.acao,
        total: count(),
        ultimaAcaoEm: sql<Date>`max(${auditoriaLog.criadoEm})`,
      })
      .from(auditoriaLog)
      .leftJoin(users, eq(users.id, auditoriaLog.usuarioId))
      .where(whereClause)
      .groupBy(users.name, auditoriaLog.tabela, auditoriaLog.acao)
      .orderBy(desc(count()));

    return {
      title: relatorioTipoLabels[input.tipo],
      generatedAt: new Date(),
      columns: [
        { key: "usuario", label: "Usuário" },
        { key: "tabela", label: "Entidade" },
        { key: "acao", label: "Ação" },
        { key: "total", label: "Ocorrências" },
        { key: "ultimaAcaoEm", label: "Última ação" },
      ],
      rows: rows.map((row) => ({
        usuario: row.usuario ?? "Sistema",
        tabela: row.tabela,
        acao: row.acao,
        total: Number(row.total ?? 0),
        ultimaAcaoEm: row.ultimaAcaoEm,
      })),
      summary: [
        { label: "Usuários com atividade", value: new Set(rows.map((row) => row.usuario ?? "Sistema")).size },
        { label: "Entidades auditadas", value: new Set(rows.map((row) => row.tabela)).size },
      ],
    };
  }),
});

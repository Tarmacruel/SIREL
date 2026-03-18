import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { consultaSearchInputSchema } from "@sirel/shared/schemas/consultas";

import { requireDb } from "../db/client.js";
import { documentos, modalidades, movimentacoesWorkflow, processos, secretarias, statusProcesso, workflowProcesso } from "../db/schema.js";
import { publicProcedure, router } from "../trpc.js";

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const consultasRouter = router({
  search: publicProcedure.input(consultaSearchInputSchema).query(async ({ input }) => {
    const db = requireDb();
    const filters: any[] = [];

    if (input.secretariaId) filters.push(eq(processos.secretariaId, input.secretariaId));
    if (input.modalidadeId) filters.push(eq(processos.modalidadeId, input.modalidadeId));
    if (input.statusId) filters.push(eq(processos.statusId, input.statusId));
    if (input.moduloAtual) filters.push(eq(workflowProcesso.moduloAtual, input.moduloAtual as never));
    if (input.dataInicio) filters.push(sql`${processos.criadoEm} >= ${new Date(`${input.dataInicio}T00:00:00`)}`);
    if (input.dataFim) filters.push(sql`${processos.criadoEm} <= ${new Date(`${input.dataFim}T23:59:59`)}`);

    let matchingDocumentProcessIds: number[] = [];
    if (input.termo) {
      const pattern = `%${input.termo}%`;
      const matchingDocs = await db
        .selectDistinct({ processoId: documentos.processoId })
        .from(documentos)
        .where(
          or(
            ilike(documentos.titulo, pattern),
            ilike(documentos.descricao, pattern),
            ilike(documentos.categoria, pattern),
            sql`coalesce(${documentos.palavrasChave}::text, '') ilike ${pattern}`,
          ),
        );
      matchingDocumentProcessIds = matchingDocs.map((row) => row.processoId);

      const termFilters: any[] = [
        ilike(processos.numeroSirel, pattern),
        ilike(processos.numeroAdministrativo, pattern),
        ilike(processos.objeto, pattern),
        ilike(secretarias.nome, pattern),
        ilike(modalidades.nome, pattern),
      ];
      if (matchingDocumentProcessIds.length) {
        termFilters.push(inArray(processos.id, matchingDocumentProcessIds));
      }
      filters.push(or(...termFilters));
    }

    const whereClause = filters.length ? and(...filters) : undefined;
    const rows = await db
      .select({
        id: processos.id,
        numeroSirel: processos.numeroSirel,
        numeroAdministrativo: processos.numeroAdministrativo,
        objeto: processos.objeto,
        valorEstimado: processos.valorEstimado,
        foraDoFluxo: processos.foraDoFluxo,
        publicado: processos.publicado,
        homologado: processos.homologado,
        finalizado: processos.finalizado,
        criadoEm: processos.criadoEm,
        secretariaNome: secretarias.nome,
        modalidadeNome: modalidades.nome,
        statusNome: statusProcesso.nome,
        moduloAtual: workflowProcesso.moduloAtual,
        situacao: workflowProcesso.situacao,
      })
      .from(processos)
      .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
      .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
      .leftJoin(statusProcesso, eq(statusProcesso.id, processos.statusId))
      .leftJoin(workflowProcesso, eq(workflowProcesso.processoId, processos.id))
      .where(whereClause)
      .orderBy(desc(processos.criadoEm), desc(processos.id));

    const processIds = rows.map((row) => row.id);
    const [documentRows, movementRows] = processIds.length
      ? await Promise.all([
          db
            .select({ processoId: documentos.processoId, total: count() })
            .from(documentos)
            .where(inArray(documentos.processoId, processIds))
            .groupBy(documentos.processoId),
          db
            .select({
              processoId: movimentacoesWorkflow.processoId,
              descricao: movimentacoesWorkflow.descricao,
              criadoEm: movimentacoesWorkflow.criadoEm,
            })
            .from(movimentacoesWorkflow)
            .where(inArray(movimentacoesWorkflow.processoId, processIds))
            .orderBy(desc(movimentacoesWorkflow.criadoEm)),
        ])
      : [[], []];

    const docsMap = new Map(documentRows.map((row) => [row.processoId, Number(row.total)]));
    const movementMap = new Map<number, { descricao: string; criadoEm: Date | null }>();
    for (const row of movementRows) {
      if (!movementMap.has(row.processoId)) {
        movementMap.set(row.processoId, { descricao: row.descricao, criadoEm: row.criadoEm });
      }
    }

    let items = rows.map((row) => ({
      id: row.id,
      numeroSirel: row.numeroSirel,
      numeroAdministrativo: row.numeroAdministrativo,
      objetoResumo: row.objeto.length > 180 ? `${row.objeto.slice(0, 177)}...` : row.objeto,
      modalidade: row.modalidadeNome ?? "Sem modalidade",
      status: row.statusNome ?? "Sem status",
      moduloAtual: row.moduloAtual ?? "SEM_WORKFLOW",
      situacao: row.situacao ?? "SEM_SITUACAO",
      valorEstimado: row.valorEstimado ? toNumber(row.valorEstimado) : 0,
      dataCriacao: row.criadoEm,
      secretariaNome: row.secretariaNome,
      foraDoFluxo: row.foraDoFluxo,
      publicado: row.publicado,
      homologado: row.homologado,
      finalizado: row.finalizado,
      documentos: docsMap.get(row.id) ?? 0,
      ultimaMovimentacao: movementMap.get(row.id) ?? null,
    }));

    if (typeof input.valorMin === "number") {
      items = items.filter((item) => item.valorEstimado >= input.valorMin!);
    }
    if (typeof input.valorMax === "number") {
      items = items.filter((item) => item.valorEstimado <= input.valorMax!);
    }
    if (input.somenteComDocumentos) {
      items = items.filter((item) => item.documentos > 0);
    }

    const total = items.length;
    const offset = (input.pagina - 1) * input.limite;
    items = items.slice(offset, offset + input.limite);

    return {
      dados: items,
      metadados: {
        total,
        pagina: input.pagina,
        limite: input.limite,
        totalPages: Math.max(1, Math.ceil(total / input.limite)),
      },
    };
  }),
});

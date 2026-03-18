import { asc, eq } from "drizzle-orm";

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

import { modalidades, pessoas, secretarias, statusProcesso } from "../db/schema.js";
import { requireDb } from "../db/client.js";
import { publicProcedure, router } from "../trpc.js";

export const cadastrosRouter = router({
  formOptions: publicProcedure.query(async () => {
    const db = requireDb();

    const [secretariaRows, modalidadeRows, statusRows, pessoaRows] = await Promise.all([
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
      workflowModules: workflowModuleOptions,
      modoDisputa: modoDisputaOptions.map((codigo) => ({ codigo, nome: modoDisputaLabels[codigo] })),
      grauPrioridade: grauPrioridadeOptions.map((codigo) => ({ codigo, nome: grauPrioridadeLabels[codigo] })),
      metodologiaCotacao: metodologiaCotacaoOptions.map((codigo) => ({ codigo, nome: metodologiaCotacaoLabels[codigo] })),
    };
  }),
});

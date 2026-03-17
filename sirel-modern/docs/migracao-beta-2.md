# Plano de migracao para a Beta 2.0

## Estrategia

Migracao incremental por modulo, mantendo o Django como sistema principal ate a cobertura funcional estar completa.

## Fases

### Fase 1 - Fundacao
- Monorepo `sirel-modern/`
- PostgreSQL + Drizzle
- tRPC + RBAC
- Dashboard executivo inicial
- Cadastro de processos, documentos e contratos
- Exportador do legado Django para snapshot JSON
- Importador inicial do snapshot para PostgreSQL

### Fase 2 - Fluxo licitatorio
- Planejamento
- Compras
- Licitacoes
- Workflow completo
- Auditoria e alertas

### Fase 3 - Integracoes
- PNCP
- BLL
- e-TCM Bahia
- Portal publico

### Fase 4 - Migracao assistida
- leitura paralela dos dados do Django
- sincronizacao incremental
- homologacao por secretaria
- virada definitiva

## Sincronizacao incremental implementada

Arquivos envolvidos:

- `scripts/export_legacy_snapshot.py`
- `scripts/sync_legacy_pipeline.mjs`
- `server/src/scripts/import-legacy-snapshot.ts`
- `storage/migration/legacy_sync_state.json`

Comandos:

- `npm run legacy:sync:full`
- `npm run legacy:sync`

Regras atuais:

- cadastros-base pequenos sao sincronizados integralmente em toda execucao
- blocos transacionais usam janela temporal incremental
- vinculacoes de filhos usam `processo_numero_sirel` e `fornecedor_cnpj` como apoio de reconciliacao
- delecao no legado ainda nao e propagada automaticamente para a Beta 2.0

## Snapshot legado implementado

Arquivo gerado:

- `storage/migration/legacy_snapshot.json`

Conjuntos exportados:

- orgao
- usuarios
- secretarias
- modalidades
- status de processo
- pessoas
- processos
- workflow
- movimentacoes
- fornecedores
- documentos
- contratos

Scripts:

- `python scripts/export_legacy_snapshot.py`
- `npm run legacy:import`
- `npm run legacy:sync:full`
- `npm run legacy:sync`

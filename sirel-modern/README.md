# SIREL Beta 2.0

Base inicial da nova arquitetura do SIREL em monorepo full-stack.

## Objetivo

Criar uma camada moderna e desacoplada para evolucao gradual do sistema atual em Django, sem interromper a operacao existente.

## Stack

- React 19
- Tailwind CSS 4
- Wouter
- TanStack Query
- Express 4
- tRPC 11
- Drizzle ORM
- PostgreSQL
- TypeScript

## Estrutura

- `client/`: frontend React
- `server/`: backend Express + tRPC
- `shared/`: contratos, tipos e schemas compartilhados
- `drizzle/`: schema PostgreSQL e migrations
- `docs/`: plano de migracao e backlog da Beta 2.0

## Estado atual

Esta entrega ja possui:

- monorepo funcional com `client`, `server`, `shared` e `drizzle`
- PostgreSQL 16 provisionado localmente
- migrations aplicadas no banco `sirel_db`
- snapshot do legado Django exportado e importado
- sincronizacao incremental Django -> Beta 2.0 com estado persistido
- workflow operacional com filtros, paginação e histórico
- saneamento semântico controlado para catálogos e textos administrativos degradados
- routers tRPC validados contra dados reais
- dashboard e modulo de processos conectados ao PostgreSQL

## Fluxo de migracao inicial

- `npm run legacy:export`: exporta o banco Django atual para `storage/migration/legacy_snapshot.json`
- `npm run legacy:import`: importa o snapshot para o PostgreSQL da Beta 2.0
- `npm run legacy:sync:full`: executa exportacao completa + importacao + atualizacao do estado local
- `npm run legacy:sync`: executa sincronizacao incremental com base em `storage/migration/legacy_sync_state.json`

O snapshot atual exportado a partir do legado contem:

- 709 processos
- 709 workflows
- 151 fornecedores
- 17 documentos
- 27 pessoas
- 17 secretarias

## Como evoluir

1. Instalar Node.js 22+ nesta maquina
2. Copiar `.env.example` para `.env`
3. Rodar `npm install` na raiz de `sirel-modern/`
4. Gerar migrations com `npm run db:generate`
5. Aplicar migrations com `npm run db:migrate`
6. Exportar o legado com `npm run legacy:export`
7. Importar no PostgreSQL com `npm run legacy:import`
8. Subir backend e frontend com `npm run dev`
9. Para convivencia paralela, rodar `npm run legacy:sync` periodicamente

## Ambiente

- `DATABASE_URL=postgresql://sirel_user:senha_segura@localhost:5432/sirel_db`
- `PORT=3030`
- `CLIENT_URL=http://localhost:5173`
- `VITE_API_URL=http://localhost:3030/api/trpc`

## Validacao executada

- `npm install`
- `npm run check`
- `npm run build`
- `npm run db:migrate`
- `npm run legacy:export`
- `npm run legacy:import`
- `npm run legacy:sync:full`
- `npm run legacy:sync`

# SIREL Beta 2.0

Base nova do SIREL em monorepo full-stack, preparada para homologacao funcional com dados basicos e processos recriados no proprio sistema.

## Objetivo

Substituir gradualmente a dependencia operacional da base antiga e validar o novo fluxo sobre:

- React no frontend;
- Express + tRPC no backend;
- PostgreSQL com Drizzle ORM;
- contratos tipados compartilhados em `shared/`.

Neste momento, a estrategia de homologacao e:

- importar apenas cadastros basicos;
- recriar processos e movimentacoes no sistema novo;
- validar consistencia, UX e regras de negocio diretamente na Beta 2.0.

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
- `shared/`: tipos, schemas e constantes compartilhadas
- `drizzle/`: schema PostgreSQL e migrations
- `docs/`: plano de migracao e backlog
- `storage/`: artefatos locais de migracao

## Estado funcional atual

Ja implementado:

- login local de homologacao;
- dashboard inicial;
- cadastro de processos com numero SIREL automatico;
- workflow operacional entre modulos;
- modulo de Licitacao separado da tela de Processos;
- publicacao como ato proprio do modulo de Licitacao;
- numero de edital automatico por modalidade:
  - `CE`, `CP`, `CD`, `DLS`, `DLE`, `IL`, `LE`, `PE`, `PP`
- gestao de usuarios e troca de senha;
- Planejamento com DFD em tela dedicada;
- solicitante automatico na DFD;
- demanda sistemica com secretaria responsavel automatica;
- seletores em modal para secretarias participantes e responsaveis;
- catalogo de itens;
- selecao de itens da DFD em formato de carrinho;
- edicao e exclusao de itens ja incorporados a DFD;
- exclusao completa da DFD com reinicio da etapa.

## Fluxo de teste recomendado

1. fazer login;
2. criar um processo em `Processos`;
3. abrir a DFD em `Planejamento`;
4. salvar a DFD;
5. selecionar itens pelo catalogo;
6. movimentar o processo no `Workflow`;
7. executar a publicacao no modulo `Licitacao` quando chegar a etapa correta.

## Banco e carga inicial

Uso atual do legado:

- apenas para seed basico de cadastros;
- sem dependencia de sincronizacao continua para homologacao.

Comando recomendado para preparar a base:

```powershell
npm run legacy:seed:basics
```

Esse comando:

- exporta o snapshot do legado;
- reseta a base da Beta 2.0;
- importa apenas cadastros essenciais para teste.

## Como rodar

### Opcao 1 - comando manual

```powershell
npm install
npm run db:migrate
npm run legacy:seed:basics
npm run dev
```

### Opcao 2 - Windows

Execute:

```text
Iniciar_SIREL_Beta_2.bat
```

## Ambiente

Exemplo de `.env`:

```env
DATABASE_URL=postgresql://sirel_user:senha_segura@localhost:5432/sirel_db
PORT=3030
CLIENT_URL=http://localhost:5173
VITE_API_URL=http://localhost:3030/api/trpc
JWT_SECRET=troque_esta_chave
BETA_DEFAULT_PASSWORD=SirelBeta@2026
BETA_ADMIN_USERNAME=jonatas.sousa
BETA_ADMIN_NAME=Jonatas Sousa
BETA_ADMIN_EMAIL=jonatassousa@outlook.com
```

## Credencial inicial

- usuario: `jonatas.sousa`
- senha: `SirelBeta@2026`

## Scripts principais

- `npm run dev`
- `npm run build`
- `npm run check`
- `npm run db:generate`
- `npm run db:migrate`
- `npm run legacy:export`
- `npm run legacy:import`
- `npm run legacy:import:basics`
- `npm run legacy:seed:basics`

## Validacao executada

Validacoes tecnicas mais recentes:

- `npm run check`
- `npm run build`
- `npm run db:migrate`

## Proximas entregas

- ETP como continuidade da DFD;
- subetapas internas da Licitacao;
- modulo de Documentos com upload e versionamento;
- exportador e-TCM no novo stack;
- refinamento de UX, tema claro e acessibilidade.

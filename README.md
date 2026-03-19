# SIREL Beta 2.0

Base nova do SIREL em monorepo full-stack, preparada para homologação funcional em ambiente local, com foco em gestão de processos, planejamento, licitação, documentos, contratos, workflow e auditoria.

## Objetivo

A Beta 2.0 substitui a dependência operacional da base antiga por uma arquitetura moderna, organizada para operação on-premise e evolução por módulos.

Diretrizes atuais:

- operação local e confiável;
- interface em português do Brasil e UTF-8;
- responsividade nativa para desktop, tablet e smartphone;
- rastreabilidade de ações críticas;
- crescimento modular sem reescrever o sistema inteiro a cada rodada.

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
- Vitest

## Estrutura

- `client/`: frontend React
- `server/`: backend Express + tRPC
- `shared/`: tipos, schemas e constantes compartilhadas
- `drizzle/`: schema PostgreSQL e migrations
- `docs/`: migração, backlog e roadmap
- `scripts/`: automações operacionais
- `storage/`: uploads, backups e artefatos locais

## Estado funcional atual

Já implementado:

- autenticação local por usuário e senha;
- perfis `admin`, `gestor`, `operador`, `auditor` e `user`;
- troca de senha pelo próprio usuário;
- redefinição de senha por administrador;
- log local de autenticação com eventos de login, bloqueio e senha;
- bloqueio temporário após tentativas inválidas repetidas;
- dashboard inicial;
- cadastro de processos com número SIREL automático;
- processo regular e processo fora do fluxo;
- workflow operacional entre módulos;
- Planejamento com DFD, ETP, cotações preliminares e TR externo;
- catálogo de itens e seleção em formato de carrinho;
- geração e persistência de HTML/PDF da DFD, mapa comparativo e TR base;
- módulo de Licitação com subetapas, licitantes, propostas, lances, recursos e documentos da fase;
- módulo de Itens com rastreabilidade por processo e contrato;
- módulo de Importações para sincronização pública da BLL via JSON consolidado ou CSV manual;
- módulo de Usuários com consulta de acessos recentes;
- operação em rede local, com frontend e backend escutando em `0.0.0.0`.

## Fluxo de teste recomendado

1. fazer login;
2. criar um processo em `Processos`;
3. estruturar a DFD em `Planejamento`;
4. anexar o ETP externo;
5. registrar cotações preliminares;
6. anexar o TR externo e gerar o documento-base em HTML/PDF;
7. movimentar o processo no `Workflow`;
8. conduzir publicação e subetapas no módulo `Licitação`.

## Operação local

### Inicialização guiada

```powershell
npm run start:local
```

Esse comando:

- valida Node.js;
- instala dependências se necessário;
- aplica migrations;
- verifica seed básico;
- executa seed quando a base estiver vazia;
- sobe frontend e backend em desenvolvimento.

Script equivalente:

- `Iniciar_SIREL_Local.ps1`

Script legado de conveniência:

- `Iniciar_SIREL_Beta_2.bat`

### Backup local

```powershell
npm run backup:local
```

Esse comando:

- gera dump PostgreSQL;
- compacta `storage/uploads`;
- monta um pacote `.zip` em `storage/backups/`;
- mantém os 7 backups mais recentes.

Script utilizado:

- `scripts/backup-local.ps1`

## Banco e seed básico

Uso atual do legado:

- apenas para seed básico de cadastros;
- sem dependência de sincronização contínua para homologação;
- processos e movimentações devem ser recriados na Beta 2.0.

Comandos úteis:

```powershell
npm run db:migrate
npm run db:check-seeded
npm run legacy:seed:basics
```

## Importações BLL

O módulo `Importações` trabalha com a mesma base pública consumida pelo portal:

- `https://sergiocarneiro-adm.github.io/licitacao/dados.json`
- `https://sergiocarneiro-adm.github.io/licitacao/dados_compra_direta.json`

Modos disponíveis:

- sincronização remota por JSON público;
- importação manual por dois CSVs: `registros` + `itens`.

Rotina automática:

- executa pela manhã no servidor local;
- padrão: `07:00`, fuso `America/Sao_Paulo`;
- grava execuções e acervo importado no banco local.

Variáveis de ambiente:

```env
IMPORT_BLL_AUTOMATICA=true
IMPORT_BLL_DAILY_HOUR=7
IMPORT_BLL_TIMEZONE=America/Sao_Paulo
```

## Ambiente

Exemplo de `.env`:

```env
DATABASE_URL=postgresql://sirel_user:senha_segura@localhost:5432/sirel_db
HOST=0.0.0.0
PORT=3030
CLIENT_URL=http://localhost:5173
VITE_API_URL=http://localhost:3030/api/trpc
JWT_SECRET=troque_esta_chave
BETA_DEFAULT_PASSWORD=SirelBeta@2026
BETA_ADMIN_USERNAME=jonatas.sousa
BETA_ADMIN_NAME=Jonatas Sousa
BETA_ADMIN_EMAIL=jonatassousa@outlook.com
IMPORT_BLL_AUTOMATICA=true
IMPORT_BLL_DAILY_HOUR=7
IMPORT_BLL_TIMEZONE=America/Sao_Paulo
```

## Credencial beta inicial

- usuário: `jonatas.sousa`
- senha: `SirelBeta@2026`

## Scripts principais

- `npm run dev`
- `npm run build`
- `npm run check`
- `npm run test`
- `npm run db:generate`
- `npm run db:migrate`
- `npm run db:check-seeded`
- `npm run db:sync-journal`
- `npm run legacy:export`
- `npm run legacy:import`
- `npm run legacy:import:basics`
- `npm run legacy:seed:basics`
- `npm run start:local`
- `npm run backup:local`

## Roadmap resumido

Frentes prioritárias em andamento:

- design system institucional e acessibilidade;
- central de consultas com busca textual e filtros avançados;
- painel de prazos e alertas locais;
- central de documentos com metadados e busca;
- relatórios gerenciais e exportações;
- auditoria expandida por evento e por alteração;
- preparação técnica para busca semântica e assistente de IA.

Detalhamento:

- `docs/backlog-beta-2.md`
- `docs/roadmap-beta-2.md`

## Validação executada

Validações técnicas mais recentes:

- `npm run check`
- `npm run build`
- `npm run test`

## Próximas entregas

- central de consultas;
- painel de prazos e alertas;
- relatórios operacionais locais;
- reforço de segurança com recuperação de senha e políticas adicionais;
- evolução do design system com tema institucional azul royal.

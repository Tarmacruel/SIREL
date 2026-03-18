# Plano da Beta 2.0

## Diretriz atual

A Beta 2.0 deixou de seguir a estrategia de convivencia operacional prolongada com o legado.

Para homologacao atual, a regra e:

- importar apenas cadastros basicos;
- zerar processos operacionais sempre que necessario;
- recriar os fluxos no sistema novo;
- usar o legado apenas como referencia de negocio e apoio de migracao.

## Fases

### Fase 1 - Fundacao

Concluida nesta base:

- monorepo `sirel-modern/`
- PostgreSQL + Drizzle
- Express + tRPC
- autenticacao local beta
- dashboard inicial
- processos
- workflow
- licitacao inicial
- usuarios

### Fase 2 - Planejamento operacional

Parcialmente concluida:

- DFD em tela propria
- solicitante automatico
- demanda sistemica
- secretarias participantes por modal
- responsaveis por modal
- catalogo de itens
- carrinho de itens da DFD

Pendencias imediatas:

- ETP
- TR
- navegacao entre etapas do Planejamento

### Fase 3 - Licitacao operacional

Em andamento:

- fila propria do modulo de Licitacao
- publicacao separada do Workflow
- numero de edital automatico por modalidade

Pendencias imediatas:

- aviso
- edital
- impugnacoes
- sessao
- julgamento

### Fase 4 - Documentos e exportacoes

Pendente no novo stack:

- upload versionado
- geracao documental
- consolidacao processual
- exportacao e-TCM

### Fase 5 - Virada operacional

Somente depois da homologacao funcional:

- saneamento final de dados
- carga controlada
- treinamento
- entrada em uso real

## Uso atual do legado

O legado ainda pode ser consumido por scripts de exportacao/importacao, mas isso nao e mais o centro da estrategia.

Comandos ainda existentes:

- `npm run legacy:export`
- `npm run legacy:import`
- `npm run legacy:import:basics`
- `npm run legacy:seed:basics`
- `npm run legacy:sync`
- `npm run legacy:sync:full`

Para a homologacao atual, o comando recomendado e:

```powershell
npm run legacy:seed:basics
```

## Regra pratica de teste

1. preparar a base com cadastros basicos;
2. entrar pela tela de login;
3. criar processo novo;
4. executar DFD no Planejamento;
5. movimentar no Workflow;
6. testar Licitacao a partir da etapa correta;
7. registrar feedback funcional e UX.

## Resultado esperado desta fase

Ao final da etapa atual, a Beta 2.0 deve permitir:

- navegar com login proprio;
- criar e movimentar processos;
- executar o inicio do Planejamento pela DFD;
- publicar processo na Licitacao com regras proprias;
- administrar usuarios de homologacao.

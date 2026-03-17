# SIREL

Repositorio principal do SIREL, com duas frentes de trabalho:

- `workflow/`, `core/`, `publico/` e demais apps Django da base atual;
- `sirel-modern/`, que concentra a Beta 2.0 em React + tRPC + PostgreSQL.

## Estado atual

O versionamento oficial esta neste repositorio:

- GitHub: `https://github.com/Tarmacruel/SIREL`
- branch principal: `main`

O projeto ja possui historico ativo no Git e as entregas recentes da Beta 2.0 ja foram registradas no remoto.

## Estrutura principal

```text
.
|-- api/
|-- core/
|-- docs/
|-- licitaweb/
|-- publico/
|-- workflow/
`-- sirel-modern/
```

## Base Django atual

A base Django continua no repositorio para referencia, manutencao e comparacao funcional.

Principais capacidades ja existentes:

- workflow modular;
- geracao documental HTML, PDF e DOCX;
- consolidacao de processo e pacote e-TCM;
- integracoes PNCP e BLL;
- portal publico.

## Beta 2.0

A Beta 2.0 fica em `sirel-modern/` e ja esta apta para homologacao inicial.

Capacidades atuais:

- login local para homologacao;
- dashboard inicial;
- cadastro de processos;
- workflow entre modulos;
- modulo de Licitacao separado da tela de Processos;
- Planejamento com DFD em tela propria;
- seletores em modal para secretarias participantes e responsaveis;
- catalogo de itens com selecao em estilo carrinho;
- cadastro, edicao e exclusao de itens da DFD;
- gestao basica de usuarios e troca de senha.

## Como iniciar a Beta 2.0

No diretorio `sirel-modern/`:

```powershell
npm install
npm run db:migrate
npm run legacy:seed:basics
npm run dev
```

Ou, no Windows, execute:

```text
sirel-modern\\Iniciar_SIREL_Beta_2.bat
```

## Credencial beta padrao

- usuario: `jonatas.sousa`
- senha: `SirelBeta@2026`

## Documentacao complementar

- [README da Beta 2.0](C:\SIREL_Modular_Base_Rodavel\sirel_modular\sirel-modern\README.md)
- [Plano de migracao da Beta 2.0](C:\SIREL_Modular_Base_Rodavel\sirel_modular\sirel-modern\docs\migracao-beta-2.md)
- [Backlog da Beta 2.0](C:\SIREL_Modular_Base_Rodavel\sirel_modular\sirel-modern\docs\backlog-beta-2.md)

## Proximos focos

- ETP como sequencia da DFD no Planejamento;
- subetapas do modulo de Licitacao;
- documentos e versionamento na Beta 2.0;
- exportacao e-TCM no novo stack;
- refinamento de UX e responsividade.

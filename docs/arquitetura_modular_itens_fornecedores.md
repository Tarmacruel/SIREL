# Arquitetura Modular de Itens e Fornecedores (SIREL)

## Objetivo
Padronizar o ciclo de vida de itens e fornecedores em todos os modulos do fluxo (Planejamento, Compras, Licitacao, Contratos e Integracoes), separando:

- cadastro mestre (catalogo e fornecedor),
- dado de processo (item do processo),
- vinculacao de lote,
- resultado/homologacao,
- e snapshots de integracao externa.

## Problema atual (resumo)
- O mesmo registro (`core.FornecimentoItem`) representa ao mesmo tempo:
  - item da DFD,
  - item por lote,
  - status do item no processo,
  - fornecedor e valores homologados,
  - e dados de integracao PNCP.
- Isso gera sobreposicao de responsabilidades e risco de inconsistencias.

## Desenho alvo por camadas

1. **Cadastro mestre**
- `core.ItemCatalogo`
- `core.Fornecedor`
- `core.FornecedorDocumentoExterno`

2. **Processo (canonico)**
- `core.ProcessoItem` (1 item canonico por `processo + numero_item`)
- `core.ProcessoLoteItem` (relacao item x lote)

3. **Operacional por modulo**
- Planejamento e Compras continuam com seus modelos atuais no curto prazo (dual-write).
- Camada canonica passa a ser a fonte para dashboards e rastreabilidade transversal.

4. **Integracoes**
- PNCP/BLL continuam importando, mas a reconciliacao final atualiza tambem os modelos canonicos.

## Fase 1 (implantacao inicial)
- Criacao dos modelos:
  - `FornecedorDocumentoExterno`
  - `ItemCatalogo`
  - `ProcessoItem`
  - `ProcessoLoteItem`
- Servico de sincronizacao:
  - `workflow.services.item_registry.sync_canonical_items_for_processo`
- Gatilhos de sincronizacao adicionados no fluxo atual:
  - sincronizacao de itens DFD -> core,
  - sincronizacao de lotes,
  - recalculo de estimativa,
  - sincronizacao PNCP.
- Comando de backfill:
  - `python manage.py sync_itens_canonicos`

## Fases seguintes
1. Migrar dashboards e buscas de itens para leitura preferencial de `ProcessoItem`.
2. Extrair historico de resultados/homologacao por item para tabela especifica.
3. Normalizar importacao BLL para gravar vinculo em `FornecedorDocumentoExterno`.
4. Encerrar gradualmente escrita direta em campos de item legado que nao forem mais necessarios.

## Status de implementacao
- Fase 1: concluida.
- Fase 2: em andamento com os seguintes itens ja implantados:
  - rastreamento de itens (`/sirel/itens/`) lendo `ProcessoItem` como fonte principal;
  - dashboards gerais e resumo de modulos com metricas de itens baseadas em `ProcessoItem`;
  - exibicao de indicador de conflito de lote no rastreamento;
  - importacao BLL registrando vinculos em `FornecedorDocumentoExterno` (origem `BLL`).

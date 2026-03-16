# Mapeamento de Integracao PNCP x BLL x SIREL

Gerado em: 2026-03-11

## 1) Estado atual diagnosticado

- Caso analisado: processo `780/2025` (`numeroControlePNCP = 13650403000128-1-000446/2025`).
- Problema raiz original:
  - O sistema buscava itens/resultados apenas em `api/consulta`, mas o contrato atual dessa API nao expoe endpoints detalhados de item/resultado.
  - Resultado: processo era criado/atualizado sem carga detalhada (itens, fornecedores e resultados).
  - Alem disso, a sincronizacao canonica podia remover itens PNCP quando nao havia base DFD/legacy.

## 2) Endpoints oficiais mapeados

### PNCP Consulta (leitura publica macro)
- Base: `https://pncp.gov.br/api/consulta`
- Usado para:
  - `GET /v1/contratacoes/publicacao`
  - `GET /v1/orgaos/{cnpj}/compras/{ano}/{sequencial}`

### PNCP API (leitura detalhada e escrita)
- Base: `https://pncp.gov.br/api/pncp`
- Endpoints detalhados de compra usados na importacao:
  - `GET /v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens`
  - `GET /v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens/{numeroItem}/resultados`
- Endpoint de compra no `api/pncp` responde redirecionando para `api/consulta` (movido).

## 3) Mapeamento de importacao (PNCP -> SIREL)

### Nivel processo/contratacao
- PNCP -> `workflow.PNCPContratacaoSnapshot`:
  - `numeroControlePNCP`, `numeroCompra`, `anoCompra`, `processo`, `modalidade*`, `modoDisputa*`, `criterioJulgamento*`,
    `situacaoCompra*`, `objetoCompra`, `valorTotalEstimado`, `valorTotalHomologado`,
    `dataAberturaProposta`, `dataEncerramentoProposta`, `dataPublicacaoPncp`, `dataInclusao`, `dataAtualizacao`,
    `orgao*`, `unidade*`, `amparoLegal*`, `linkSistemaOrigem`, `justificativaPresencial`, `payload_completo`.
- Snapshot -> `core.Processo` e `workflow.ProcessoWorkflow`:
  - numero/ano/objeto/modalidade/status/situacao/modulo atual/publicado/homologado/finalizado.

### Nivel item
- PNCP item -> `core.ProcessoItem`:
  - `numeroItem`, `descricao`, `unidadeMedida`, `quantidade`,
    `valorUnitarioEstimado`, `valorTotal`/`valorTotalEstimado`,
    status consolidado (mapeado por situacao do item/resultado/compra), `pncp_ultima_atualizacao`.
- Campos de enriquecimento PNCP tambem registrados em `ProcessoItemResultado.payload_resumo` (registro `pncp-item:*`):
  - `numero_controle_pncp`, `codigo_item_externo`, `criterio_julgamento_item_pncp`, `tipo_item_pncp`, `categoria_item_pncp`,
    `payload_item_pncp` (payload bruto do item).

### Nivel resultado/fornecedor
- PNCP resultado -> `core.ProcessoItemResultado`:
  - fornecedor (`niFornecedor`, `nomeRazaoSocialFornecedor`),
    classificacao (`ordemClassificacaoSrp` e correlatos),
    `valorUnitarioHomologado`, `valorTotalHomologado`,
    `dataResultado`, `situacaoCompraItemResultadoNome`.
- Campos completos do resultado preservados em `payload_resultado_pncp`.
- Fornecedor homologado e valores homologados consolidados em `core.ProcessoItem`.

## 4) Mapeamento de exportacao

### Exportacao para BLL (atual)
- Modulo admin e comandos usam:
  - `core.utils.bll_export.export_bll_csv`
  - `core.utils.bll_export.export_bll_xlsx`
- Fonte de dados principal:
  - `processo.lotes` e `processo.itens` (legado `FornecimentoItem`) com secoes compatveis BLL.

### Importacao de BLL (atual)
- `workflow.views.importar_bll` agora aplica de fato o arquivo no processo via:
  - `core.utils.bll_import.import_bll_file`
  - depois sincroniza camada canonica (`sync_canonical_items_for_processo`).

### Exportacao para PNCP (estado atual)
- Nao ha cliente autenticado de publicacao/retificacao no PNCP implementado no SIREL.
- Existe apenas leitura/consulta e endpoint local JSON (`/api/pncp/processos/{id}.json`) para integracao interna.

## 5) Remodulacao aplicada nesta entrega

1. Cliente PNCP ajustado para detalhes reais:
   - `workflow/services/pncp.py`
   - Itens passam a vir de `api/pncp/v1/.../itens`.
   - Resultados passam a vir de `api/pncp/v1/.../itens/{numeroItem}/resultados`.
2. Mapeamento de campos PNCP ampliado:
   - `situacaoCompraItemNome`, `materialOuServicoNome`, `itemCategoriaNome`,
     `situacaoCompraItemResultadoNome`, `ordemClassificacaoSrp` e payload bruto.
3. Correcao de persistencia canonica:
   - `workflow/services/item_registry.py` deixa de remover itens PNCP quando nao existe base DFD/legacy.
4. Fluxo BLL fortalecido:
   - `workflow/views.py::importar_bll` agora importa/aplica arquivo (nao apenas parse/log).
   - Criado wrapper `core/utils/bll_export.py` para estabilizar importacoes de exportacao BLL.
5. Correcao previa mantida:
   - `sincronizado_em` serializado como string ISO em JSON.
   - datetimes PNCP convertidos para timezone-aware.

## 6) Resultado validado no caso 780/2025

- Processo passou a carregar dados detalhados:
  - `22` itens canonicos
  - `16` resultados detalhados PNCP
  - valores consolidados: estimado `652157.36`, homologado `490116.48`
  - status consolidado/homologacao refletidos no workflow.

## 7) Backlog objetivo para 100% PNCP + BLL

1. Implementar cliente autenticado de escrita PNCP (`POST/PUT/PATCH/DELETE`) com credenciais e trilha de auditoria.
2. Criar fila de sincronizacao assicrona com retry/backoff e observabilidade (429/timeouts).
3. Adicionar testes automatizados de contrato para endpoints `api/consulta` e `api/pncp`.
4. Padronizar camada de "espelho legado" (`FornecimentoItem`) para manter consistencia total entre telas antigas e canonicas.
5. Expandir validadores de layout BLL por versao (schema + relatorio de divergencias por arquivo).
6. Criar rotina de reconciliacao diaria PNCP x SIREL x BLL (itens, resultados, valores, documentos).

## 8) Ajustes adicionais aplicados nesta etapa

1. Importacao BLL unificada e corrigida para layout real:
   - `core/utils/bll_import.py`
   - Corrigida leitura de `CLASSIFICACAO` para o formato `lote|classificacao|razao|cnpj|valor_total|flag_me|flag_classificado|flag_habilitado`.
   - Corrigida deteccao de status (`VENCEDOR`, `INABILITADO`, `DESCLASSIFICADO`, `CLASSIFICADO`) e calculo de valores unitarios.
   - Melhorada decodificacao de arquivos (`utf-8-sig`, `utf-8`, `cp1252`, `latin-1`).
   - Tratamento para lotes com reinicio do `numero_item` na BLL (ex.: varios lotes com item `1`), evitando perda na camada canonica.
2. Exportacao BLL remodelada para o mesmo padrao do arquivo de referencia:
   - `core/utils/bll_file_export.py`
   - Exportacao oficial para BLL passa a ser somente XLSX (CSV desabilitado).
   - XLSX padronizado no layout de abas `LOTES`, `ITENS`, `TIPOLANCE`, com colunas identicas ao modelo de importacao BLL.
   - Regra de escopo aplicada na exportacao:
     - `GLOBAL`: todos os itens em um unico lote.
     - `LOTE`: itens agrupados por lote.
     - `ITEM`: um lote para cada item (item unico por lote).
3. Fluxo operacional no SIREL:
   - `workflow/views.py`, `workflow/urls.py`, `workflow/templates/workflow/processo_resumo.html`
   - Adicionados endpoints no resumo do processo para exportar BLL (CSV/XLSX).
4. Envio opcional para PNCP (nao obrigatorio):
   - Novo servico `workflow/services/pncp_publish.py`.
   - Suporte a modo desabilitado, simulacao (`dry-run`) e envio real condicionado por token.
   - Novas configuracoes em `licitaweb/settings.py`:
     - `PNCP_ENVIO_HABILITADO` (default `False`)
     - `PNCP_ENVIO_DRY_RUN` (default `True`)
     - `PNCP_ENVIO_BASE_URL`
     - `PNCP_ENVIO_TIMEOUT`
     - `PNCP_ENVIO_AUTH_TOKEN`
5. Comandos de importacao BLL atualizados para o parser unificado:
   - `core/management/commands/import_bll_csv.py`
   - `core/management/commands/import_bll_xlsx.py`

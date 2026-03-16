# Mapeamento do `dados.json` para o SIREL

Fonte considerada:
- `https://raw.githubusercontent.com/sergiocarneiro-adm/licitacao/main/dados.json`

## Campos de processo

| Campo JSON | Campo SIREL |
|---|---|
| `id` | `Processo.numero_edital` + `Processo.identificador_bll` |
| `numero_adm` | `Processo.numero_processo_adm` |
| `promotor` | `Processo.promotor_bll` |
| `modalidade` | `Processo.modalidade` (`Modalidade`) |
| `situacao` | `Processo.status` (`StatusProcesso`) |
| `condutor` | `Processo.condutor_processo` (`Pessoa`) |
| `autoridade` | `Processo.autoridade_competente` (`Pessoa`) |
| `tipo_contrato` | `Processo.tipo_contratacao` |
| `publicacao` | `Processo.data_publicacao` |
| `inicio_recepcao` | `Processo.inicio_recolhimento_propostas` |
| `fim_recepcao` | `Processo.fim_recolhimento_propostas` |
| `inicio_disputa` | `Processo.data_hora_abertura` |
| `objeto` | `Processo.objeto` |
| `link` | `Processo.link_bll` |
| `total_lotes` / `total_itens` | Derivado de `lotes` / `itens` importados |

## Campos de lote

| Campo JSON | Campo SIREL |
|---|---|
| `numero` | `Lote.numero` |
| `titulo` | `Lote.titulo` |
| `fase` | `Lote.status` |
| `tipo` | `Lote.escopo` + `Lote.tipo_lance` |
| `quantidade` | `Lote.quantidade` |
| `intervalo_minimo` | `Lote.intervalo_minimo` |
| `exclusivo_me` | `Lote.exclusivo_me` |
| `local_entrega` | `Lote.local_entrega` |
| `garantia` | `Lote.garantia` |
| `valor_referencia` | `Lote.valor_referencia` |
| `vencedor` | `Lote.vencedor` |
| `melhor_oferta` | `Lote.melhor_oferta` |
| `total_itens` | `Lote.qtd_itens` |

## Campos de item

| Campo JSON | Campo SIREL |
|---|---|
| `numero` | `FornecimentoItem.numero_item` (+ `codigo_item_externo`) |
| `especificacao` | `FornecimentoItem.descricao` |
| `unidade` | `FornecimentoItem.unidade` |
| `quantidade` | `FornecimentoItem.quantidade` |
| `valor_referencia` | `FornecimentoItem.valor_unitario`, `valor_unitario_estimado`, `valor_total`, `valor_total_estimado` |

## Rotina diária (03:00)

Comando de importação:

```powershell
python manage.py import_dados_licitacao_json
```

Agendamento automático no Windows (Task Scheduler):

```powershell
.\scripts\agendar_importacao_dados_licitacao_0300.ps1 -Force
```

Opcionalmente, para usar uma URL diferente:

```powershell
.\scripts\agendar_importacao_dados_licitacao_0300.ps1 -Force -Url "https://sua-fonte/dados.json"
```

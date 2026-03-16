from django.http import Http404, JsonResponse

from core.models import Processo, ProcessoItem, ProcessoItemResultado


def pncp_processo(request, pk):
    try:
        processo = Processo.objects.select_related('modalidade', 'secretaria', 'status').get(pk=pk)
    except Processo.DoesNotExist:
        raise Http404("Processo nao encontrado")

    data = {
        "identificacaoProcesso": {
            "processoId": processo.id,
            "numeroProcesso": processo.numero_processo_adm,
            "numeroProcessoSirel": processo.numero_processo_sirel,
            "numeroProcessoPrincipal": processo.numero_processo_principal,
            "numeroProcessoExterno": processo.numero_processo_adm,
            "numeroEdital": processo.numero_edital,
            "ano": processo.ano_referencia,
            "modalidade": getattr(processo.modalidade, "nome", ""),
            "unidadeGestora": getattr(processo.secretaria, "sigla", ""),
            "status": getattr(processo.status, "nome", ""),
            "objeto": processo.objeto,
            "valorEstimado": str(processo.valor_estimado or 0),
            "valorHomologado": str(processo.valor_homologado or 0),
        },
        "itens": [],
    }

    itens = ProcessoItem.objects.filter(processo=processo).select_related("fornecedor_homologado").order_by("numero_item")
    resultados = (
        ProcessoItemResultado.objects.filter(processo=processo, ativo=True)
        .select_related("fornecedor", "processo_item")
        .order_by("processo_item__numero_item", "classificacao", "id")
    )
    resultados_por_item = {}
    for row in resultados:
        resultados_por_item.setdefault(row.processo_item_id, []).append(row)

    for item in itens:
        data["itens"].append(
            {
                "numeroItem": item.numero_item,
                "descricao": item.descricao_snapshot,
                "unidade": item.unidade_snapshot,
                "quantidade": str(item.quantidade or 0),
                "statusConsolidado": item.status_consolidado,
                "valorReferenciaUnitario": str(item.valor_referencia_unitario or 0),
                "valorReferenciaTotal": str(item.valor_referencia_total or 0),
                "valorHomologadoUnitario": str(item.valor_homologado_unitario or 0),
                "valorHomologadoTotal": str(item.valor_homologado_total or 0),
                "fornecedorHomologado": getattr(item.fornecedor_homologado, "razao_social", ""),
                "resultados": [
                    {
                        "origem": r.origem,
                        "status": r.status_resultado,
                        "classificacao": r.classificacao,
                        "fornecedor": getattr(r.fornecedor, "razao_social", ""),
                        "documento": getattr(r.fornecedor, "cnpj", "") if r.fornecedor_id else "",
                        "valorUnitario": str(r.valor_unitario or 0),
                        "valorTotal": str(r.valor_total or 0),
                    }
                    for r in resultados_por_item.get(item.id, [])
                ],
            }
        )

    return JsonResponse(data, json_dumps_params={"ensure_ascii": False})

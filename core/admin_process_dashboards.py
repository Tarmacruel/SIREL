# -*- coding: utf-8 -*-
from django.apps import apps
from django.shortcuts import get_object_or_404, render

# Carrega modelos de forma segura (evita import em ciclos)
Processo = apps.get_model("core", "Processo")
ProcessoItem = apps.get_model("core", "ProcessoItem")
ProcessoItemResultado = apps.get_model("core", "ProcessoItemResultado")
ProcessoLoteItem = apps.get_model("core", "ProcessoLoteItem")
Lote = apps.get_model("core", "Lote")
Contrato = apps.get_model("core", "Contrato")


def _status_text_lote(lote):
    for attr in ("status", "status_lote", "situacao"):
        if hasattr(lote, attr):
            val = getattr(lote, attr)
            if val is None:
                continue
            return str(val)
    return ""


def _is_lote_malsucedido(lote):
    s = (_status_text_lote(lote) or "").upper()
    return any(k in s for k in ("FRACASS", "DESERT", "CANCEL"))


def _resultado_sort_key(resultado):
    status_prioridade = {
        ProcessoItemResultado.StatusResultado.HOMOLOGADO: 0,
        ProcessoItemResultado.StatusResultado.VENCEDOR: 1,
        ProcessoItemResultado.StatusResultado.CLASSIFICADO: 2,
        ProcessoItemResultado.StatusResultado.DESCLASSIFICADO: 3,
        ProcessoItemResultado.StatusResultado.INABILITADO: 4,
        ProcessoItemResultado.StatusResultado.FRACASSADO: 5,
        ProcessoItemResultado.StatusResultado.CANCELADO: 6,
    }
    return (
        status_prioridade.get(resultado.status_resultado, 99),
        resultado.classificacao if resultado.classificacao is not None else 999999,
        -resultado.id,
    )


def _best_result_for_item(item, resultados):
    candidatos = [r for r in resultados if r.ativo]
    if not candidatos:
        return None
    return sorted(candidatos, key=_resultado_sort_key)[0]


def _build_item_rows(processo):
    itens = list(
        ProcessoItem.objects.filter(processo=processo)
        .select_related("fornecedor_homologado")
        .order_by("numero_item")
    )
    resultados = list(
        ProcessoItemResultado.objects.filter(processo=processo, ativo=True)
        .select_related("fornecedor")
        .order_by("processo_item__numero_item", "classificacao", "id")
    )
    resultados_por_item = {}
    for res in resultados:
        resultados_por_item.setdefault(res.processo_item_id, []).append(res)

    lote_por_item = {
        row["item_id"]: row["lote__numero"]
        for row in ProcessoLoteItem.objects.filter(processo=processo, ativo=True).values("item_id", "lote__numero")
    }

    rows = []
    for it in itens:
        best = _best_result_for_item(it, resultados_por_item.get(it.id, []))
        qtd = getattr(it, "quantidade", 0) or 0

        fornecedor = best.fornecedor if best and best.fornecedor_id else it.fornecedor_homologado
        valor_unitario = None
        valor_total = None
        classificacao = ""
        status = it.status_consolidado or ""

        if best:
            valor_unitario = best.valor_unitario
            valor_total = best.valor_total
            classificacao = best.classificacao if best.classificacao is not None else ""
            status = best.status_resultado or status

        if (not valor_unitario) and it.valor_homologado_unitario:
            valor_unitario = it.valor_homologado_unitario
        if (not valor_unitario) and it.valor_referencia_unitario:
            valor_unitario = it.valor_referencia_unitario

        if (not valor_total) and it.valor_homologado_total:
            valor_total = it.valor_homologado_total
        if (not valor_total) and it.valor_referencia_total:
            valor_total = it.valor_referencia_total
        if (not valor_total) and valor_unitario and qtd:
            valor_total = valor_unitario * qtd

        rows.append(
            {
                "lote": lote_por_item.get(it.id, "-"),
                "numero_item": getattr(it, "numero_item", "-"),
                "descricao": (getattr(it, "descricao_snapshot", "") or "")[:200],
                "unidade": getattr(it, "unidade_snapshot", "") or "",
                "quantidade": qtd,
                "fornecedor": getattr(fornecedor, "razao_social", "-") if fornecedor else "-",
                "cnpj": getattr(fornecedor, "cnpj", "") if fornecedor else "",
                "classificacao": classificacao,
                "status": status,
                "valor_unitario": valor_unitario,
                "valor_total": valor_total,
            }
        )
    return rows


def _build_lote_rows(processo):
    lotes = Lote.objects.filter(processo=processo).order_by("numero")
    itens = list(
        ProcessoItem.objects.filter(processo=processo).only(
            "id",
            "numero_item",
            "status_consolidado",
            "fornecedor_homologado_id",
        )
    )
    links = list(
        ProcessoLoteItem.objects.filter(processo=processo, ativo=True).values("item_id", "lote__numero")
    )
    lote_por_item = {r["item_id"]: r["lote__numero"] for r in links}
    itens_por_lote = {}
    for it in itens:
        lote_num = lote_por_item.get(it.id)
        if lote_num is None:
            continue
        itens_por_lote.setdefault(lote_num, []).append(it)

    resultados = list(
        ProcessoItemResultado.objects.filter(processo=processo, ativo=True).only(
            "processo_item_id",
            "status_resultado",
            "fornecedor_id",
            "ativo",
        )
    )
    resultados_por_item = {}
    for res in resultados:
        resultados_por_item.setdefault(res.processo_item_id, []).append(res)

    rows = []
    for lote in lotes:
        num = getattr(lote, "numero", None)
        itens_lote = itens_por_lote.get(num, [])
        winners = 0
        for it in itens_lote:
            has_winner = (
                it.status_consolidado == ProcessoItem.StatusConsolidado.HOMOLOGADO
                and bool(it.fornecedor_homologado_id)
            )
            if not has_winner:
                for res in resultados_por_item.get(it.id, []):
                    if (
                        res.status_resultado
                        in (
                            ProcessoItemResultado.StatusResultado.HOMOLOGADO,
                            ProcessoItemResultado.StatusResultado.VENCEDOR,
                        )
                        and res.fornecedor_id
                    ):
                        has_winner = True
                        break
            if has_winner:
                winners += 1

        rows.append(
            {
                "lote": num,
                "titulo": getattr(lote, "titulo", "") or getattr(lote, "descricao", ""),
                "status_lote": _status_text_lote(lote),
                "qtd_itens": len(itens_lote),
                "qtd_itens_com_vencedor": winners,
                "malsucedido": _is_lote_malsucedido(lote),
            }
        )
    return rows


def _build_contrato_rows(processo):
    contratos = (
        Contrato.objects.filter(processo=processo)
        .select_related("fornecedor", "processo")
        .order_by("id")
    )
    rows = []
    for c in contratos:
        rows.append(
            {
                "numero": getattr(c, "numero", getattr(c, "numero_contrato", "")),
                "fornecedor": getattr(getattr(c, "fornecedor", None), "razao_social", "-"),
                "vigencia_inicio": getattr(c, "vigencia_inicio", None) or getattr(c, "inicio_vigencia", None),
                "vigencia_fim": getattr(c, "vigencia_fim", None) or getattr(c, "fim_vigencia", None),
                "valor_global": getattr(c, "valor_global", None)
                or getattr(c, "valor", None)
                or getattr(c, "valor_homologado", None),
                "observacao": getattr(c, "observacao", "") or getattr(c, "descricao", ""),
            }
        )
    return rows


def processo_dashboard_itens(request, object_id):
    proc = get_object_or_404(Processo, pk=object_id)
    rows = _build_item_rows(proc)
    ctx = dict(
        title=f"Dashboard de Itens — Processo {getattr(proc, 'numero_edital', '')}-{getattr(proc, 'ano_referencia', '')} (ID {proc.pk})",
        processo=proc,
        rows=rows,
    )
    return render(request, "admin/core/processo/dashboard_itens.html", ctx)


def processo_dashboard_contratos(request, object_id):
    proc = get_object_or_404(Processo, pk=object_id)
    rows = _build_contrato_rows(proc)
    ctx = dict(
        title=f"Dashboard de Contratos — Processo {getattr(proc, 'numero_edital', '')}-{getattr(proc, 'ano_referencia', '')} (ID {proc.pk})",
        processo=proc,
        rows=rows,
    )
    return render(request, "admin/core/processo/dashboard_contratos.html", ctx)


def processo_dashboard_malsucedidos(request, object_id):
    proc = get_object_or_404(Processo, pk=object_id)
    lotes = _build_lote_rows(proc)
    mals = [r for r in lotes if r["malsucedido"]]
    ctx = dict(
        title=f"Lotes mal sucedidos — Processo {getattr(proc, 'numero_edital', '')}-{getattr(proc, 'ano_referencia', '')} (ID {proc.pk})",
        processo=proc,
        rows=mals,
    )
    return render(request, "admin/core/processo/dashboard_malsucedidos.html", ctx)


def processo_dashboard_geral(request, object_id):
    proc = get_object_or_404(Processo, pk=object_id)
    lotes = _build_lote_rows(proc)
    mals = [r for r in lotes if r["malsucedido"]]
    bons = [r for r in lotes if not r["malsucedido"] and r["qtd_itens_com_vencedor"] > 0]
    ctx = dict(
        title=f"Dashboard Geral — Processo {getattr(proc, 'numero_edital', '')}-{getattr(proc, 'ano_referencia', '')} (ID {proc.pk})",
        processo=proc,
        resumo=dict(
            total_lotes=len(lotes),
            com_vencedor=len(bons),
            malsucedidos=len(mals),
        ),
        lotes_com_vencedor=bons,
        lotes_malsucedidos=mals,
    )
    return render(request, "admin/core/processo/dashboard_geral.html", ctx)

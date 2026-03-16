# -*- coding: utf-8 -*-
from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from django.db import transaction

from core.models import (
    Contrato,
    ContratoItem,
    Fornecedor,
    FornecimentoItem,
    Lote,
    Processo,
    ProcessoItem,
    ProcessoItemResultado,
    ProcessoLoteItem,
)


def _legacy_item_for_contrato(item: ProcessoItem, lote_id: int | None = None):
    """
    ContratoItem ainda possui FK para FornecimentoItem.
    Mantemos um espelho minimo para compatibilidade apenas na geracao do contrato.
    """
    legacy = (
        FornecimentoItem.objects.filter(processo=item.processo, numero_item=item.numero_item)
        .order_by("-id")
        .first()
    )
    if not legacy:
        legacy = FornecimentoItem(
            processo=item.processo,
            numero_item=item.numero_item,
        )
    legacy.lote_id = lote_id
    legacy.descricao = item.descricao_snapshot
    legacy.unidade = item.unidade_snapshot or ""
    legacy.quantidade = item.quantidade or 0
    legacy.fornecedor = item.fornecedor_homologado
    legacy.valor_unitario = item.valor_homologado_unitario or item.valor_referencia_unitario or 0
    legacy.valor_total = item.valor_homologado_total or item.valor_referencia_total or 0
    legacy.status_item = (
        FornecimentoItem.StatusItem.HOMOLOGADO
        if item.status_consolidado == ProcessoItem.StatusConsolidado.HOMOLOGADO
        else FornecimentoItem.StatusItem.PLANEJADO
    )
    legacy.save()
    return legacy


def _best_resultado_homologado_por_item(processo: Processo) -> dict[int, ProcessoItemResultado]:
    resultados = list(
        ProcessoItemResultado.objects.filter(
            processo=processo,
            ativo=True,
            fornecedor__isnull=False,
            status_resultado__in=[
                ProcessoItemResultado.StatusResultado.HOMOLOGADO,
                ProcessoItemResultado.StatusResultado.VENCEDOR,
            ],
        )
        .select_related("fornecedor", "processo_item")
        .order_by("processo_item__numero_item", "classificacao", "-id")
    )
    by_item: dict[int, ProcessoItemResultado] = {}
    for res in resultados:
        current = by_item.get(res.processo_item_id)
        if current is None:
            by_item[res.processo_item_id] = res
            continue
        if (
            res.status_resultado == ProcessoItemResultado.StatusResultado.HOMOLOGADO
            and current.status_resultado != ProcessoItemResultado.StatusResultado.HOMOLOGADO
        ):
            by_item[res.processo_item_id] = res
    return by_item


def _canonical_items_homologados(processo: Processo):
    itens = list(
        ProcessoItem.objects.filter(processo=processo)
        .select_related("fornecedor_homologado")
        .order_by("numero_item")
    )
    if not itens:
        return []

    lote_map = {
        row["item_id"]: row["lote_id"]
        for row in ProcessoLoteItem.objects.filter(processo=processo, ativo=True).values("item_id", "lote_id")
    }
    resultado_map = _best_resultado_homologado_por_item(processo)

    out = []
    for item in itens:
        resultado = resultado_map.get(item.id)
        fornecedor = resultado.fornecedor if resultado and resultado.fornecedor_id else item.fornecedor_homologado
        if not fornecedor:
            continue

        quantidade = item.quantidade or Decimal("0")
        valor_unitario = Decimal(str(resultado.valor_unitario or 0)) if resultado else Decimal("0")
        if valor_unitario <= 0:
            valor_unitario = item.valor_homologado_unitario or item.valor_referencia_unitario or Decimal("0")
        if valor_unitario <= 0 and resultado and resultado.valor_total and quantidade:
            valor_unitario = Decimal(str(resultado.valor_total)) / Decimal(str(quantidade))
        valor_unitario = Decimal(str(valor_unitario or 0))

        lote_id = lote_map.get(item.id)
        out.append(
            {
                "fornecedor_id": fornecedor.id,
                "lote_id": lote_id,
                "processo_item": item,
                "legacy_item": _legacy_item_for_contrato(item, lote_id),
                "quantidade": quantidade,
                "valor_unitario": valor_unitario,
            }
        )
    return out


@transaction.atomic
def generate_contracts_from_process(processo: Processo, per_lote: bool = False) -> dict:
    """
    Gera contratos a partir dos itens homologados canônicos de um processo.
    - per_lote=False: 1 contrato por fornecedor (podendo conter varios lotes)
    - per_lote=True: 1 contrato por (fornecedor, lote)
    """
    itens = _canonical_items_homologados(processo)
    if not itens:
        return {"contratos_criados": 0, "itens_vinculados": 0}

    groups = defaultdict(list)
    for it in itens:
        fornecedor_id = it["fornecedor_id"]
        lote_id = it["lote_id"]
        key = (fornecedor_id, lote_id) if per_lote else (fornecedor_id, None)
        groups[key].append(it)

    created = 0
    item_count = 0

    for (fornecedor_id, lote_id), items in groups.items():
        fornecedor = Fornecedor.objects.get(pk=fornecedor_id)
        lote = Lote.objects.get(pk=lote_id) if lote_id else None

        seq = Contrato.objects.filter(processo=processo).count() + 1
        numero_sugerido = f"{seq:03d}/{processo.ano_referencia}"

        contrato, created_flag = Contrato.objects.get_or_create(
            processo=processo,
            fornecedor=fornecedor,
            lote=lote if per_lote else None,
            defaults=dict(
                numero=numero_sugerido,
                objeto=processo.objeto[:4000] if processo.objeto else "",
                secretaria=processo.secretaria,
                valor_inicial=Decimal("0.00"),
                valor_atual=Decimal("0.00"),
            ),
        )
        if created_flag:
            created += 1

        ContratoItem.objects.filter(contrato=contrato).delete()

        total = Decimal("0.00")
        for it in items:
            legacy_item = it["legacy_item"]
            lote_item = Lote.objects.filter(pk=it["lote_id"]).first() if it["lote_id"] else None
            descricao = it["processo_item"].descricao_snapshot or ""
            unidade = it["processo_item"].unidade_snapshot or ""
            quantidade = it["quantidade"] or 0
            vunit = it["valor_unitario"] or Decimal("0")
            vtotal = quantidade * vunit

            ContratoItem.objects.create(
                contrato=contrato,
                lote=lote_item,
                item=legacy_item,
                descricao_snapshot=descricao[:4000] if descricao else "",
                unidade_snapshot=unidade[:50] if unidade else "",
                quantidade=quantidade,
                valor_unitario=vunit,
                valor_total=vtotal,
            )
            total += vtotal
            item_count += 1

        contrato.valor_inicial = total
        contrato.valor_atual = total
        contrato.save(update_fields=["valor_inicial", "valor_atual"])

    return {"contratos_criados": created, "itens_vinculados": item_count}

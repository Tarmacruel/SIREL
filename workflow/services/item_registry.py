from __future__ import annotations

from decimal import Decimal

from django.utils import timezone

from core.models import (
    Fornecedor,
    FornecedorDocumentoExterno,
    FornecimentoItem,
    ItemCatalogo,
    ItemResultado,
    Processo,
    ProcessoItem,
    ProcessoItemResultado,
    ProcessoLoteItem,
)
from workflow.models import DFDItem, DFDItemCatalogo, PlanejamentoDFD

try:
    from ofertas.models import ItemOferta
except Exception:  # pragma: no cover
    ItemOferta = None


def _decimal_2(valor) -> Decimal:
    return Decimal(str(valor or 0)).quantize(Decimal("0.01"))


def _decimal_3(valor) -> Decimal:
    return Decimal(str(valor or 0)).quantize(Decimal("0.001"))


def _only_digits(valor: str) -> str:
    return "".join(ch for ch in str(valor or "") if ch.isdigit())


def ensure_fornecedor_documento_externo(
    fornecedor: Fornecedor | None,
    *,
    origem: str,
    documento: str = "",
    identificador: str = "",
    payload: dict | None = None,
):
    if not fornecedor:
        return None
    documento_digits = _only_digits(documento)
    identificador = (identificador or "").strip()
    if not documento_digits and not identificador:
        return None

    defaults = {"fornecedor": fornecedor, "payload_resumo": payload or {}}
    if documento_digits:
        obj, _ = FornecedorDocumentoExterno.objects.update_or_create(
            origem=origem,
            documento_digits=documento_digits,
            defaults=defaults,
        )
    else:
        obj, _ = FornecedorDocumentoExterno.objects.update_or_create(
            origem=origem,
            identificador_externo=identificador,
            defaults=defaults,
        )
    if identificador and obj.identificador_externo != identificador:
        obj.identificador_externo = identificador
        obj.save(update_fields=["identificador_externo", "atualizado_em"])
    return obj


def _catalogo_from_workflow(
    catalogo: DFDItemCatalogo | None,
    fallback_codigo: int,
    fallback_descricao: str,
    fallback_unidade: str,
):
    codigo = int(getattr(catalogo, "codigo", 0) or fallback_codigo or 0)
    if codigo <= 0:
        return None
    defaults = {
        "descricao_padrao": (getattr(catalogo, "descricao", "") or fallback_descricao or "").strip(),
        "unidade_padrao": (getattr(catalogo, "unidade", "") or fallback_unidade or "").strip()[:30],
    }
    if not defaults["descricao_padrao"]:
        defaults["descricao_padrao"] = f"Item {codigo}"
    item_catalogo, _ = ItemCatalogo.objects.update_or_create(
        codigo=codigo,
        defaults=defaults,
    )
    return item_catalogo


def _status_consolidado_from_rows(rows: list[FornecimentoItem]) -> str:
    if not rows:
        return ProcessoItem.StatusConsolidado.PLANEJADO
    status_set = {str(r.status_item or "").strip().upper() for r in rows if str(r.status_item or "").strip()}
    if FornecimentoItem.StatusItem.HOMOLOGADO in status_set:
        return ProcessoItem.StatusConsolidado.HOMOLOGADO
    if FornecimentoItem.StatusItem.FRACASSADO in status_set and FornecimentoItem.StatusItem.PLANEJADO not in status_set:
        return ProcessoItem.StatusConsolidado.FRACASSADO
    if status_set == {FornecimentoItem.StatusItem.CANCELADO}:
        return ProcessoItem.StatusConsolidado.CANCELADO
    if any(Decimal(str(r.valor_unitario or 0)) > 0 for r in rows):
        return ProcessoItem.StatusConsolidado.EM_COTACAO
    return ProcessoItem.StatusConsolidado.PLANEJADO


def _status_consolidado_from_results(resultados: list[ProcessoItemResultado]) -> str:
    ativos = [r for r in resultados if r.ativo]
    if not ativos:
        return ProcessoItem.StatusConsolidado.PLANEJADO
    statuses = {r.status_resultado for r in ativos}
    if ProcessoItemResultado.StatusResultado.HOMOLOGADO in statuses or ProcessoItemResultado.StatusResultado.VENCEDOR in statuses:
        return ProcessoItem.StatusConsolidado.HOMOLOGADO
    if statuses and statuses.issubset({ProcessoItemResultado.StatusResultado.CANCELADO}):
        return ProcessoItem.StatusConsolidado.CANCELADO
    if ProcessoItemResultado.StatusResultado.FRACASSADO in statuses and statuses.issubset(
        {ProcessoItemResultado.StatusResultado.FRACASSADO, ProcessoItemResultado.StatusResultado.CANCELADO}
    ):
        return ProcessoItem.StatusConsolidado.FRACASSADO
    if any(Decimal(str(r.valor_unitario or 0)) > 0 for r in ativos):
        return ProcessoItem.StatusConsolidado.EM_COTACAO
    return ProcessoItem.StatusConsolidado.PLANEJADO


def _best_fornecedor_homologado(rows: list[FornecimentoItem]):
    for row in rows:
        if row.status_item == FornecimentoItem.StatusItem.HOMOLOGADO and row.fornecedor_id:
            return row.fornecedor
    for row in rows:
        if row.fornecedor_id:
            return row.fornecedor
    return None


_ORIGEM_PRIORIDADE = {
    ProcessoItemResultado.Origem.PNCP: 0,
    ProcessoItemResultado.Origem.OFERTA: 1,
    ProcessoItemResultado.Origem.ITEM_LEGADO: 2,
    ProcessoItemResultado.Origem.RESULTADO_LOTE: 3,
    ProcessoItemResultado.Origem.MANUAL: 4,
}

_STATUS_PRIORIDADE = {
    ProcessoItemResultado.StatusResultado.HOMOLOGADO: 0,
    ProcessoItemResultado.StatusResultado.VENCEDOR: 1,
    ProcessoItemResultado.StatusResultado.CLASSIFICADO: 2,
    ProcessoItemResultado.StatusResultado.DESCLASSIFICADO: 3,
    ProcessoItemResultado.StatusResultado.INABILITADO: 4,
    ProcessoItemResultado.StatusResultado.FRACASSADO: 5,
    ProcessoItemResultado.StatusResultado.CANCELADO: 6,
}


def _resultado_sort_key(resultado: ProcessoItemResultado):
    classificacao = resultado.classificacao if resultado.classificacao is not None else 999999
    return (
        _ORIGEM_PRIORIDADE.get(resultado.origem, 9),
        _STATUS_PRIORIDADE.get(resultado.status_resultado, 9),
        classificacao,
        resultado.id,
    )


def _best_fornecedor_from_results(resultados: list[ProcessoItemResultado]):
    ativos = [r for r in resultados if r.ativo]
    if not ativos:
        return None
    preferidos = [
        r
        for r in ativos
        if r.fornecedor_id and r.status_resultado in {
            ProcessoItemResultado.StatusResultado.HOMOLOGADO,
            ProcessoItemResultado.StatusResultado.VENCEDOR,
        }
    ]
    if preferidos:
        return sorted(preferidos, key=_resultado_sort_key)[0].fornecedor
    com_fornecedor = [r for r in ativos if r.fornecedor_id]
    if com_fornecedor:
        return sorted(com_fornecedor, key=_resultado_sort_key)[0].fornecedor
    return None


def _best_unit_values(rows: list[FornecimentoItem]):
    valor_ref_unit = Decimal("0")
    valor_homolog_unit = Decimal("0")
    pncp_dt = None

    for row in rows:
        if row.pncp_ultima_atualizacao and (pncp_dt is None or row.pncp_ultima_atualizacao > pncp_dt):
            pncp_dt = row.pncp_ultima_atualizacao

        v_ref = Decimal(str(row.valor_unitario_estimado or 0))
        if v_ref <= 0:
            v_ref = Decimal(str(row.valor_unitario or 0))
        if v_ref > valor_ref_unit:
            valor_ref_unit = v_ref

        v_hom = Decimal(str(row.valor_unitario_homologado or 0))
        if v_hom <= 0 and row.status_item == FornecimentoItem.StatusItem.HOMOLOGADO:
            v_hom = Decimal(str(row.valor_unitario or 0))
        if v_hom > valor_homolog_unit:
            valor_homolog_unit = v_hom

    return _decimal_2(valor_ref_unit), _decimal_2(valor_homolog_unit), pncp_dt


def _best_unit_values_from_results(resultados: list[ProcessoItemResultado]):
    ativos = [r for r in resultados if r.ativo]
    if not ativos:
        return Decimal("0"), Decimal("0"), None

    ref_unit = Decimal("0")
    hom_unit = Decimal("0")
    pncp_dt = None
    for r in sorted(ativos, key=_resultado_sort_key):
        vu = Decimal(str(r.valor_unitario or 0))
        if vu > 0 and ref_unit <= 0 and r.status_resultado not in {
            ProcessoItemResultado.StatusResultado.CANCELADO,
            ProcessoItemResultado.StatusResultado.FRACASSADO,
        }:
            ref_unit = vu
        if vu > 0 and hom_unit <= 0 and r.status_resultado in {
            ProcessoItemResultado.StatusResultado.HOMOLOGADO,
            ProcessoItemResultado.StatusResultado.VENCEDOR,
        }:
            hom_unit = vu
        if r.origem == ProcessoItemResultado.Origem.PNCP and r.atualizado_em:
            if pncp_dt is None or r.atualizado_em > pncp_dt:
                pncp_dt = r.atualizado_em
    return _decimal_2(ref_unit), _decimal_2(hom_unit), pncp_dt


def _pick_lote_id(rows: list[FornecimentoItem]) -> tuple[int | None, bool]:
    lotes = [r.lote_id for r in rows if r.lote_id]
    if not lotes:
        return None, False
    distintos = sorted(set(lotes))
    if len(distintos) == 1:
        return distintos[0], False
    for row in rows:
        if row.lote_id and row.status_item == FornecimentoItem.StatusItem.HOMOLOGADO:
            return row.lote_id, True
    return lotes[-1], True


def _map_status_legacy_to_result(status_item: str) -> str:
    status = str(status_item or "").strip().upper()
    if status == FornecimentoItem.StatusItem.HOMOLOGADO:
        return ProcessoItemResultado.StatusResultado.HOMOLOGADO
    if status == FornecimentoItem.StatusItem.FRACASSADO:
        return ProcessoItemResultado.StatusResultado.FRACASSADO
    if status == FornecimentoItem.StatusItem.CANCELADO:
        return ProcessoItemResultado.StatusResultado.CANCELADO
    return ProcessoItemResultado.StatusResultado.CLASSIFICADO


def _map_status_oferta_to_result(status_oferta: str) -> str:
    status = str(status_oferta or "").strip().upper()
    if status == "VENCEDOR":
        return ProcessoItemResultado.StatusResultado.VENCEDOR
    if status == "DESCLASSIFICADO":
        return ProcessoItemResultado.StatusResultado.DESCLASSIFICADO
    if status == "INABILITADO":
        return ProcessoItemResultado.StatusResultado.INABILITADO
    return ProcessoItemResultado.StatusResultado.CLASSIFICADO


def _map_status_lote_to_result(resultado_lote: ItemResultado) -> str:
    if resultado_lote.posicao == 1 and resultado_lote.classificado and resultado_lote.habilitado:
        return ProcessoItemResultado.StatusResultado.VENCEDOR
    if not resultado_lote.habilitado:
        return ProcessoItemResultado.StatusResultado.INABILITADO
    if not resultado_lote.classificado:
        return ProcessoItemResultado.StatusResultado.DESCLASSIFICADO
    return ProcessoItemResultado.StatusResultado.CLASSIFICADO


def _sync_resultados_canonicos(
    processo: Processo,
    *,
    itens_core: list[FornecimentoItem],
    canonicos_por_numero: dict[int, ProcessoItem],
):
    seen_ids: set[int] = set()
    created = 0
    updated = 0
    recomputed_origins: set[str] = set()

    def upsert(
        *,
        processo_item: ProcessoItem,
        origem: str,
        chave_origem: str,
        status_resultado: str,
        fornecedor=None,
        classificacao=None,
        valor_unitario=Decimal("0"),
        valor_total=Decimal("0"),
        data_resultado=None,
        situacao_texto="",
        payload_resumo=None,
    ):
        nonlocal created, updated
        defaults = {
            "processo": processo,
            "fornecedor": fornecedor,
            "status_resultado": status_resultado,
            "classificacao": classificacao,
            "valor_unitario": _decimal_2(valor_unitario),
            "valor_total": _decimal_2(valor_total),
            "data_resultado": data_resultado,
            "situacao_texto": (situacao_texto or "")[:140],
            "payload_resumo": payload_resumo or {},
            "ativo": True,
        }
        obj, was_created = ProcessoItemResultado.objects.update_or_create(
            processo_item=processo_item,
            origem=origem,
            chave_origem=chave_origem,
            defaults=defaults,
        )
        recomputed_origins.add(origem)
        seen_ids.add(obj.id)
        if was_created:
            created += 1
        else:
            updated += 1

    for row in itens_core:
        processo_item = canonicos_por_numero.get(row.numero_item)
        if not processo_item:
            continue
        origem = ProcessoItemResultado.Origem.ITEM_LEGADO
        if any([row.numero_controle_pncp, row.codigo_item_externo, row.situacao_item_pncp, row.situacao_resultado_pncp]):
            origem = ProcessoItemResultado.Origem.PNCP

        status_resultado = _map_status_legacy_to_result(row.status_item)
        valor_unitario = Decimal(str(row.valor_unitario_homologado or 0))
        if valor_unitario <= 0:
            valor_unitario = Decimal(str(row.valor_unitario_estimado or 0))
        if valor_unitario <= 0:
            valor_unitario = Decimal(str(row.valor_unitario or 0))
        if valor_unitario <= 0:
            valor_unitario = Decimal(str(row.proposta_final or 0))

        valor_total = Decimal(str(row.valor_total_homologado or 0))
        if valor_total <= 0:
            valor_total = Decimal(str(row.valor_total_estimado or 0))
        if valor_total <= 0:
            valor_total = Decimal(str(row.valor_total or 0))
        if valor_total <= 0 and valor_unitario > 0:
            valor_total = valor_unitario * Decimal(str(row.quantidade or processo_item.quantidade or 0))

        upsert(
            processo_item=processo_item,
            origem=origem,
            chave_origem=f"fi:{row.id}",
            status_resultado=status_resultado,
            fornecedor=row.fornecedor,
            classificacao=row.ordem_classificacao,
            valor_unitario=valor_unitario,
            valor_total=valor_total,
            data_resultado=row.data_resultado_homologacao,
            situacao_texto=row.situacao_resultado_pncp or row.situacao_item_pncp or row.status_item or "",
            payload_resumo={
                "fornecimento_item_id": row.id,
                "numero_controle_pncp": row.numero_controle_pncp,
                "codigo_item_externo": row.codigo_item_externo,
                "situacao_item_pncp": row.situacao_item_pncp,
                "situacao_resultado_pncp": row.situacao_resultado_pncp,
            },
        )

    if ItemOferta is not None:
        ofertas = (
            ItemOferta.objects
            .filter(item__processo=processo)
            .select_related("item", "fornecedor")
            .order_by("item__numero_item", "classificacao", "id")
        )
        for oferta in ofertas:
            processo_item = canonicos_por_numero.get(oferta.item.numero_item)
            if not processo_item:
                continue
            valor_unitario = Decimal(str(oferta.proposta_final or 0))
            if valor_unitario <= 0:
                valor_unitario = Decimal(str(oferta.valor_unitario or 0))
            valor_total = Decimal(str(oferta.valor_total or 0))
            if valor_total <= 0 and valor_unitario > 0:
                valor_total = valor_unitario * Decimal(str(processo_item.quantidade or 0))

            upsert(
                processo_item=processo_item,
                origem=ProcessoItemResultado.Origem.OFERTA,
                chave_origem=f"of:{oferta.id}",
                status_resultado=_map_status_oferta_to_result(oferta.status),
                fornecedor=oferta.fornecedor,
                classificacao=oferta.classificacao,
                valor_unitario=valor_unitario,
                valor_total=valor_total,
                situacao_texto=oferta.status or "",
                payload_resumo={
                    "item_oferta_id": oferta.id,
                    "fornecimento_item_id": oferta.item_id,
                },
            )

    links_lote = ProcessoLoteItem.objects.filter(processo=processo, ativo=True).select_related("item", "lote")
    itens_por_lote: dict[int, list[ProcessoItem]] = {}
    for link in links_lote:
        itens_por_lote.setdefault(link.lote_id, []).append(link.item)

    resultados_lote = (
        ItemResultado.objects
        .filter(lote__processo=processo)
        .select_related("lote", "fornecedor")
        .order_by("lote__numero", "posicao", "id")
    )
    for resultado in resultados_lote:
        itens_lote = itens_por_lote.get(resultado.lote_id, [])
        if not itens_lote:
            continue
        for item in itens_lote:
            upsert(
                processo_item=item,
                origem=ProcessoItemResultado.Origem.RESULTADO_LOTE,
                chave_origem=f"lr:{resultado.id}:pi:{item.id}",
                status_resultado=_map_status_lote_to_result(resultado),
                fornecedor=resultado.fornecedor,
                classificacao=resultado.posicao,
                valor_unitario=Decimal("0"),
                valor_total=Decimal(str(resultado.valor_total or 0)),
                situacao_texto="Resultado por lote",
                payload_resumo={
                    "item_resultado_id": resultado.id,
                    "lote_id": resultado.lote_id,
                    "posicao": resultado.posicao,
                },
            )

    desativados = 0
    if recomputed_origins:
        stale_qs = ProcessoItemResultado.objects.filter(
            processo=processo,
            origem__in=list(recomputed_origins),
        ).exclude(origem=ProcessoItemResultado.Origem.MANUAL)
        if seen_ids:
            stale_qs = stale_qs.exclude(id__in=seen_ids)
        desativados = stale_qs.update(ativo=False)

    resultados_ativos = (
        ProcessoItemResultado.objects
        .filter(processo=processo, ativo=True)
        .select_related("fornecedor", "processo_item")
        .order_by("processo_item__numero_item", "classificacao", "id")
    )
    por_item: dict[int, list[ProcessoItemResultado]] = {}
    for res in resultados_ativos:
        por_item.setdefault(res.processo_item_id, []).append(res)

    return {
        "criados": created,
        "atualizados": updated,
        "desativados": desativados,
        "por_item": por_item,
    }


def sync_canonical_items_for_processo(processo: Processo):
    dfd = PlanejamentoDFD.objects.filter(processo=processo).first()
    dfd_map = {}
    if dfd:
        dfd_map = {i.codigo: i for i in dfd.itens.select_related("catalogo").all()}

    itens_core = list(
        FornecimentoItem.objects
        .filter(processo=processo)
        .select_related("fornecedor", "lote")
        .order_by("numero_item", "id")
    )
    core_by_num = {}
    for row in itens_core:
        core_by_num.setdefault(row.numero_item, []).append(row)

    existentes = {i.numero_item: i for i in ProcessoItem.objects.filter(processo=processo).select_related("item_catalogo")}
    numeros_base = set(dfd_map.keys()) | set(core_by_num.keys())
    # Quando nao ha base DFD/legacy, preserva itens canonicos existentes
    # (ex.: importacao direta PNCP) para nao apagar sincronizacao recem-feita.
    if not numeros_base and existentes:
        numeros = sorted(existentes.keys())
    else:
        numeros = sorted(numeros_base)
    numeros_vistos = set()
    criados = 0
    atualizados = 0

    for numero_item in numeros:
        numeros_vistos.add(numero_item)
        dfd_item: DFDItem | None = dfd_map.get(numero_item)
        rows = core_by_num.get(numero_item, [])
        if not dfd_item and not rows:
            continue

        descricao = (getattr(dfd_item, "descricao", "") or (rows[0].descricao if rows else "") or "").strip()
        unidade = (getattr(dfd_item, "unidade", "") or (rows[0].unidade if rows else "") or "").strip()[:30]
        quantidade = _decimal_3(getattr(dfd_item, "quantidade", None) if dfd_item else (rows[0].quantidade if rows else 0))
        status = _status_consolidado_from_rows(rows)
        fornecedor_homologado = _best_fornecedor_homologado(rows)
        valor_ref_unit, valor_homolog_unit, pncp_dt = _best_unit_values(rows)
        valor_ref_total = _decimal_2(valor_ref_unit * quantidade)
        valor_homolog_total = _decimal_2(valor_homolog_unit * quantidade)
        _lote_escolhido, conflito_lote = _pick_lote_id(rows)

        catalogo_ref = _catalogo_from_workflow(
            getattr(dfd_item, "catalogo", None),
            fallback_codigo=numero_item,
            fallback_descricao=descricao,
            fallback_unidade=unidade,
        )

        defaults = {
            "item_catalogo": catalogo_ref,
            "descricao_snapshot": descricao or f"Item {numero_item}",
            "unidade_snapshot": unidade,
            "quantidade": quantidade,
            "status_consolidado": status,
            "fornecedor_homologado": fornecedor_homologado,
            "valor_referencia_unitario": valor_ref_unit,
            "valor_referencia_total": valor_ref_total,
            "valor_homologado_unitario": valor_homolog_unit,
            "valor_homologado_total": valor_homolog_total,
            "conflito_lote": conflito_lote,
            "pncp_ultima_atualizacao": pncp_dt,
        }

        obj = existentes.get(numero_item)
        if not obj:
            ProcessoItem.objects.create(processo=processo, numero_item=numero_item, **defaults)
            criados += 1
        else:
            changed = []
            for field, value in defaults.items():
                if getattr(obj, field) != value:
                    setattr(obj, field, value)
                    changed.append(field)
            if changed:
                obj.save(update_fields=changed + ["atualizado_em"])
                atualizados += 1

    removidos = 0
    for numero_item, obj in existentes.items():
        if numero_item not in numeros_vistos:
            obj.delete()
            removidos += 1

    # Reconstroi vinculos de lote apenas quando ha base legacy.
    # Se nao houver, preserva os vinculos existentes (ex.: origem PNCP).
    if core_by_num:
        ProcessoLoteItem.objects.filter(processo=processo).delete()
    links = 0
    canonicos = {i.numero_item: i for i in ProcessoItem.objects.filter(processo=processo)}
    if core_by_num:
        for numero_item, rows in core_by_num.items():
            item_canonico = canonicos.get(numero_item)
            if not item_canonico:
                continue
            lote_id, _ = _pick_lote_id(rows)
            if not lote_id:
                continue
            ProcessoLoteItem.objects.create(
                processo=processo,
                lote_id=lote_id,
                item=item_canonico,
                ativo=True,
            )
            links += 1

    resultados_sync = _sync_resultados_canonicos(
        processo,
        itens_core=itens_core,
        canonicos_por_numero=canonicos,
    )

    consolidado_atualizados = 0
    for numero_item, item_canonico in canonicos.items():
        rows = core_by_num.get(numero_item, [])
        resultados = resultados_sync["por_item"].get(item_canonico.id, [])

        status = _status_consolidado_from_results(resultados)
        if status == ProcessoItem.StatusConsolidado.PLANEJADO:
            status = _status_consolidado_from_rows(rows)

        fornecedor_homologado = _best_fornecedor_from_results(resultados) or _best_fornecedor_homologado(rows)
        valor_ref_unit, valor_homolog_unit, pncp_dt_rows = _best_unit_values(rows)
        ref_res, hom_res, pncp_dt_res = _best_unit_values_from_results(resultados)
        if ref_res > 0:
            valor_ref_unit = ref_res
        if hom_res > 0:
            valor_homolog_unit = hom_res
        quantidade = Decimal(str(item_canonico.quantidade or 0))
        valor_ref_total = _decimal_2(valor_ref_unit * quantidade)
        valor_homolog_total = _decimal_2(valor_homolog_unit * quantidade)
        pncp_dt = pncp_dt_res or pncp_dt_rows

        defaults = {
            "status_consolidado": status,
            "fornecedor_homologado": fornecedor_homologado,
            "valor_referencia_unitario": valor_ref_unit,
            "valor_referencia_total": valor_ref_total,
            "valor_homologado_unitario": valor_homolog_unit,
            "valor_homologado_total": valor_homolog_total,
            "pncp_ultima_atualizacao": pncp_dt,
        }
        changed = []
        for field, value in defaults.items():
            if getattr(item_canonico, field) != value:
                setattr(item_canonico, field, value)
                changed.append(field)
        if changed:
            item_canonico.save(update_fields=changed + ["atualizado_em"])
            consolidado_atualizados += 1

    return {
        "criados": criados,
        "atualizados": atualizados,
        "removidos": removidos,
        "links_lote_item": links,
        "resultados_criados": resultados_sync["criados"],
        "resultados_atualizados": resultados_sync["atualizados"],
        "resultados_desativados": resultados_sync["desativados"],
        "itens_reconsolidados": consolidado_atualizados,
        # JSONField em logs de integracao nao serializa datetime nativo.
        "sincronizado_em": timezone.now().isoformat(),
    }


def sync_canonical_item_by_numero(processo: Processo, numero_item: int):
    # Sincronizacao completa para manter consistencia de lote, conflito e resultados.
    return sync_canonical_items_for_processo(processo)

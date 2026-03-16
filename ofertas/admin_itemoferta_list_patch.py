# -*- coding: utf-8 -*-
"""
Admin Patch — Pesquisa e Filtros para Ofertas (ofertas.ItemOferta)

O que faz:
- Inclui search_fields amplos e list_filter úteis.
- Adiciona pesquisa avançada com "tokens" no campo de busca do Admin:
    proc:PE-054-2025     (ou processo:, edital:, ano:)
    lote:21              (número do lote)
    item:3               (número do item)
    cnpj:12345678000199  (CNPJ do fornecedor)
    fornecedor:"NOME"    (nome do fornecedor)
    status:VENCEDOR      (CLASSIFICADO/DESCLASSIFICADO/INABILITADO/VENCEDOR)
    class:1              (classificação numérica)
- Mantém a busca livre normal (por nome do fornecedor, descrição do item, etc.).
- Usa select_related para performance.
- Habilita autocomplete ao editar (fornecedor/item).

Como ativar:
1) Salve este arquivo como `ofertas/admin_itemoferta_list_patch.py`.
2) No FINAL do arquivo `ofertas/admin.py`, adicione:
       from . import admin_itemoferta_list_patch  # ativa filtros/pesquisa em ItemOferta
3) Reinicie o servidor.
"""

import re
from django.contrib import admin
from django.apps import apps
from django.db.models import Q

ItemOferta = apps.get_model('ofertas', 'ItemOferta')
Fornecedor = apps.get_model('core', 'Fornecedor')
FornecimentoItem = apps.get_model('core', 'FornecimentoItem')

def _ensure_itemoferta_admin():
    reg = admin.site._registry
    ma = reg.get(ItemOferta)

    # Se não existir admin para ItemOferta, registra um básico
    if ma is None:
        @admin.register(ItemOferta)
        class _ItemOfertaAdmin(admin.ModelAdmin):
            pass
        ma = admin.site._registry.get(ItemOferta)

    # ----- list_display amigável -----
    def col_fornecedor(obj):
        f = obj.fornecedor
        if not f: return '-'
        cnpj = getattr(f, 'cnpj', '') or ''
        return f"{f.razao_social} ({cnpj})" if cnpj else f.razao_social
    col_fornecedor.short_description = "Fornecedor"

    def col_processo(obj):
        it = obj.item
        if not it: return '-'
        proc = getattr(it, 'processo', None)
        if not proc: return '-'
        ne = getattr(proc, 'numero_edital', None) or ''
        ano = getattr(proc, 'ano_referencia', None)
        if ne or ano:
            return f"{ne}-{ano}" if (ne and ano) else (ne or str(ano))
        return f"ID {getattr(proc, 'id', '')}"
    col_processo.admin_order_field = 'item__processo__id'
    col_processo.short_description = "Processo"

    def col_lote(obj):
        it = obj.item
        if not it or not getattr(it, 'lote', None): return '-'
        return getattr(it.lote, 'numero', '-') or '-'
    col_lote.admin_order_field = 'item__lote__numero'
    col_lote.short_description = "Lote"

    def col_item(obj):
        it = obj.item
        return getattr(it, 'numero_item', '-') if it else '-'
    col_item.admin_order_field = 'item__numero_item'
    col_item.short_description = "Item"

    def col_desc(obj):
        it = obj.item
        desc = getattr(it, 'descricao', '') if it else ''
        return (desc[:80] + '…') if len(desc) > 80 else desc
    col_desc.short_description = "Descrição do item"

    def col_valor(obj):
        return getattr(obj, 'proposta_final', None) or getattr(obj, 'valor_unitario', None)
    col_valor.short_description = "Unit. Final"

    base_list_display = (
        col_fornecedor, col_processo, col_lote, col_item, 'classificacao', 'status', col_valor
    )

    # aplica no admin existente sem perder outras colunas customizadas
    cur_ld = tuple(getattr(ma, 'list_display', ()) or ())
    ma.list_display = base_list_display if not cur_ld else cur_ld + tuple(f for f in base_list_display if f not in cur_ld)

    # ----- filtros laterais -----
    base_filters = (
        'status',
        'classificacao',
        'item__processo__ano_referencia',
    )
    cur_lf = tuple(getattr(ma, 'list_filter', ()) or ())
    for f in base_filters:
        if f not in cur_lf:
            cur_lf = cur_lf + (f,)
    ma.list_filter = cur_lf

    # ----- busca -----
    base_search = (
        'fornecedor__razao_social',
        'fornecedor__cnpj',
        'item__descricao',
        'item__numero_item',
        'item__lote__numero',
        'item__processo__numero_processo_adm',
        'item__processo__numero_edital',
    )
    cur_sf = tuple(getattr(ma, 'search_fields', ()) or ())
    for f in base_search:
        if f not in cur_sf:
            cur_sf = cur_sf + (f,)
    ma.search_fields = cur_sf

    # ----- performance -----
    base_related = ('fornecedor', 'item', 'item__lote', 'item__processo')
    cur_sr = tuple(getattr(ma, 'list_select_related', ()) or ())
    for f in base_related:
        if f not in cur_sr:
            cur_sr = cur_sr + (f,)
    ma.list_select_related = cur_sr

    # ----- autocomplete ao editar -----
    cur_auto = tuple(getattr(ma, 'autocomplete_fields', ()) or ())
    for f in ('fornecedor', 'item'):
        if f not in cur_auto:
            cur_auto = cur_auto + (f,)
    ma.autocomplete_fields = cur_auto

    # ----- pesquisa com "tokens" -----
    _orig_get_search_results = getattr(ma, 'get_search_results', admin.ModelAdmin.get_search_results)

    def patched_get_search_results(self, request, queryset, search_term):
        qs, use_distinct = _orig_get_search_results(self, request, queryset, search_term)
        term = (search_term or '').strip()

        # extrai tokens tipo chave:"valor com espaço" ou chave:valor
        token_re = re.compile(r'(?P<k>\w+):(?P<v>"[^"]+"|\S+)')
        tokens = token_re.findall(term)
        if tokens:
            # remove tokens do termo "livre"
            for k, v in tokens:
                frag = f'{k}:{v}'
                term = term.replace(frag, '').strip()

            filt = Q()
            for k, v in tokens:
                v = v.strip('"').strip()
                k = k.lower()
                if not v:
                    continue
                if k in ('proc','processo'):
                    filt &= Q(item__processo__numero_processo_adm__icontains=v) | Q(item__processo__numero_edital__icontains=v) | Q(item__processo__id__iexact=v)
                elif k in ('edital',):
                    filt &= Q(item__processo__numero_edital__icontains=v)
                elif k in ('ano',):
                    try:
                        filt &= Q(item__processo__ano_referencia=int(v))
                    except Exception:
                        filt &= Q(item__processo__ano_referencia__icontains=v)
                elif k in ('lote',):
                    filt &= Q(item__lote__numero__iexact=v)
                elif k in ('item', 'it'):
                    filt &= Q(item__numero_item__iexact=v)
                elif k in ('cnpj',):
                    filt &= Q(fornecedor__cnpj__icontains=v)
                elif k in ('fornecedor','forn'):
                    filt &= Q(fornecedor__razao_social__icontains=v)
                elif k in ('status','st'):
                    filt &= Q(status__iexact=v.upper())
                elif k in ('class','classificacao','rank'):
                    try:
                        filt &= Q(classificacao=int(v))
                    except Exception:
                        pass
            if filt:
                qs = qs.filter(filt)

        return qs, use_distinct

    # injeta o método
    ma.get_search_results = patched_get_search_results.__get__(ma, ma.__class__)

_ensure_itemoferta_admin()

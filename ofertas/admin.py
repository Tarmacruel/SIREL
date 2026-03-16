# -*- coding: utf-8 -*-
from django.contrib import admin
from django.db.models import Q
from . import models as ofertas_models

ItemOferta = getattr(ofertas_models, 'ItemOferta', None)

# Se o modelo não existir por algum motivo, não quebra o Admin
if ItemOferta is None:
    # Nada a registrar
    pass
else:
    # Se já houver um admin registrado em outro lugar, substitui pelo nosso
    try:
        admin.site.unregister(ItemOferta)
    except Exception:
        pass

    @admin.register(ItemOferta)
    class ItemOfertaAdmin(admin.ModelAdmin):
        # colunas calculadas
        def col_fornecedor(self, obj):
            f = getattr(obj, 'fornecedor', None)
            if not f: return '-'
            cnpj = getattr(f, 'cnpj', '') or ''
            return f"{getattr(f, 'razao_social', '-')}{(' ('+cnpj+')') if cnpj else ''}"
        col_fornecedor.short_description = "Fornecedor"

        def col_processo(self, obj):
            it = getattr(obj, 'item', None)
            proc = getattr(it, 'processo', None) if it else None
            if not proc: return '-'
            ne = getattr(proc, 'numero_edital', None) or ''
            ano = getattr(proc, 'ano_referencia', None)
            if ne and ano: return f"{ne}-{ano}"
            return ne or str(ano) or f"ID {getattr(proc, 'id', '')}"
        col_processo.admin_order_field = 'item__processo__id'
        col_processo.short_description = "Processo"

        def col_lote(self, obj):
            it = getattr(obj, 'item', None)
            lt = getattr(it, 'lote', None) if it else None
            return getattr(lt, 'numero', '-') if lt else '-'
        col_lote.admin_order_field = 'item__lote__numero'
        col_lote.short_description = "Lote"

        def col_item(self, obj):
            it = getattr(obj, 'item', None)
            return getattr(it, 'numero_item', '-') if it else '-'
        col_item.admin_order_field = 'item__numero_item'
        col_item.short_description = "Item"

        def col_desc(self, obj):
            it = getattr(obj, 'item', None)
            desc = getattr(it, 'descricao', '') if it else ''
            return (desc[:80] + '…') if len(desc) > 80 else desc
        col_desc.short_description = "Descrição do item"

        def col_valor(self, obj):
            return getattr(obj, 'proposta_final', None) or getattr(obj, 'valor_unitario', None)
        col_valor.short_description = "Unit. Final"

        list_display = ('col_fornecedor', 'col_processo', 'col_lote', 'col_item', 'classificacao', 'status', 'col_valor')
        list_filter = ('status', 'classificacao', 'item__processo__ano_referencia')
        search_fields = (
            'fornecedor__razao_social', 'fornecedor__cnpj',
            'item__descricao', 'item__numero_item', 'item__lote__numero',
            'item__processo__numero_processo_adm', 'item__processo__numero_edital',
        )
        list_select_related = ('fornecedor', 'item', 'item__lote', 'item__processo')
        autocomplete_fields = ('fornecedor', 'item')

        # Busca avançada com tokens no campo de pesquisa (proc:, edital:, ano:, lote:, item:, cnpj:, fornecedor:, status:, class:)
        def get_search_results(self, request, queryset, search_term):
            qs, use_distinct = super().get_search_results(request, queryset, search_term)
            term = (search_term or '').strip()
            import re
            token_re = re.compile(r'(?P<k>\w+):(?P<v>"[^"]+"|\S+)')
            tokens = token_re.findall(term)
            if tokens:
                # remove tokens do termo livre
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
                    elif k in ('item','it'):
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

# -*- coding: utf-8 -*-
"""
Ativa barra de **pesquisa e filtro** no inline "Item Ofertas" (ofertas.ItemOferta)
dentro do formulário de FornecimentoItem no Django Admin.

Como funciona?
- Este módulo procura o ModelAdmin registrado para FornecimentoItem
  e localiza o Inline de ItemOferta.
- Injeta arquivos estáticos (JS/CSS) que criam uma barra de busca + filtro de status,
  funcionando totalmente no front-end (sem alterar o banco).

Como ativar?
- Coloque este arquivo em `core/admin_ofertas_filter_patch.py`.
- No FINAL do seu `core/admin.py`, adicione:
      from . import admin_ofertas_filter_patch  # ativa filtro/pesquisa no inline de ofertas

Requisitos:
- Django Admin padrão (Select2 nativo).
- O inline de ItemOferta deve estar cadastrado como TabularInline/StackedInline no Admin.
"""
from django.contrib import admin
from django.apps import apps

FornecimentoItem = apps.get_model('core', 'FornecimentoItem')

def _patch_inline_media(inline_cls):
    # Mescla arquivos JS/CSS no Media do Inline
    add_js = ('admin/inline_itemoferta_filter.js',)
    add_css = {'all': ('admin/inline_itemoferta_filter.css',)}

    # Se já existir Media, mescla; senão cria uma nova
    MediaOld = getattr(inline_cls, 'Media', None)

    class Media(object):
        js = tuple(getattr(MediaOld, 'js', ())) + add_js
        css = {
            'all': tuple(getattr(getattr(MediaOld, 'css', {}), 'get', lambda *a, **k: [])('all', ())) + add_css['all']
        }

    inline_cls.Media = Media

# Executa o patch ao importar o módulo
reg = admin.site._registry
ma = reg.get(FornecimentoItem)
if ma:
    new_inlines = []
    found = False
    for inline in getattr(ma, 'inlines', []):
        try:
            model_name = inline.model._meta.label_lower
        except Exception:
            model_name = ''
        if model_name.endswith('itemoferta'):
            _patch_inline_media(inline)
            found = True
        new_inlines.append(inline)
    if found:
        # força reatribuição (algumas versões só leem 'inlines' uma vez)
        ma.inlines = tuple(new_inlines)

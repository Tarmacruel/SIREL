# -*- coding: utf-8 -*-
"""
Patch de autocomplete para o Django Admin do LicitaWeb.

O que este arquivo faz?
- NÃO substitui seus Admins existentes.
- Apenas "ajusta" (monkey patch) os ModelAdmins já registrados no admin site,
  adicionando `search_fields` (quando faltarem) e `autocomplete_fields`
  em modelos com muitos registros.

Como ativar?
- Coloque este arquivo em `core/admin_autocomplete_patch.py`.
- No FINAL do seu `core/admin.py`, adicione:
      from . import admin_autocomplete_patch  # ativa autocomplete global
"""

from django.contrib import admin
from django.apps import apps

# Importa modelos
Pessoa = apps.get_model('core', 'Pessoa')
Fornecedor = apps.get_model('core', 'Fornecedor')
Processo = apps.get_model('core', 'Processo')
Lote = apps.get_model('core', 'Lote')
FornecimentoItem = apps.get_model('core', 'FornecimentoItem')
Contrato = apps.get_model('core', 'Contrato')

# `ofertas.ItemOferta` pode estar em outro app
try:
    ItemOferta = apps.get_model('ofertas', 'ItemOferta')
except Exception:
    ItemOferta = None

def _ensure_admin(model, search_fields=None, autocomplete_fields=None):
    """
    Garante que o modelo tenha um ModelAdmin registrado e
    injeta search_fields / autocomplete_fields sem sobrescrever
    outras customizações existentes.
    """
    if model is None:
        return
    reg = admin.site._registry
    ma = reg.get(model)

    # Se não estiver registrado, registra com um Admin básico
    if ma is None:
        class _AutoAdmin(admin.ModelAdmin):
            pass
        admin.site.register(model, _AutoAdmin)
        ma = reg.get(model)

    # Mescla search_fields
    if search_fields:
        cur = tuple(getattr(ma, 'search_fields', ()) or ())
        merged = list(cur)
        for fld in search_fields:
            if fld and fld not in merged:
                merged.append(fld)
        ma.search_fields = tuple(merged)

    # Mescla autocomplete_fields
    if autocomplete_fields:
        cur = tuple(getattr(ma, 'autocomplete_fields', ()) or ())
        merged = list(cur)
        for fld in autocomplete_fields:
            if fld and fld not in merged:
                merged.append(fld)
        ma.autocomplete_fields = tuple(merged)

# ---- Configurações por modelo ----
# Pessoas (para autoridade competente, condutor, etc.)
_ensure_admin(Pessoa, search_fields=('nome', 'cpf', 'email', 'matricula'))

# Fornecedores (CNPJ/razão; também cidade/estado ajudam no filtro)
_ensure_admin(Fornecedor, search_fields=('razao_social', 'cnpj', 'cidade', 'estado'))

# Processo (seleção de autoridade/condutor/secretaria com autocomplete)
# Ajuste os nomes dos campos abaixo caso no seu modelo use outra nomenclatura
proc_autocomplete = []
for candidate in ('autoridade_competente', 'condutor_processo', 'secretaria'):
    try:
        Processo._meta.get_field(candidate)
        proc_autocomplete.append(candidate)
    except Exception:
        pass
if proc_autocomplete:
    _ensure_admin(Processo, autocomplete_fields=tuple(proc_autocomplete))

# Lote (seleção do processo via autocomplete)
_ensure_admin(Lote, autocomplete_fields=('processo',))

# FornecimentoItem (seleciona processo e lote via autocomplete)
_ensure_admin(FornecimentoItem, autocomplete_fields=('processo', 'lote'))

# Contrato (geralmente vincula a processo e fornecedor)
_ensure_admin(Contrato, autocomplete_fields=('processo', 'fornecedor'))

# ItemOferta (seleciona item e fornecedor)
if ItemOferta is not None:
    _ensure_admin(ItemOferta, autocomplete_fields=('item', 'fornecedor'))

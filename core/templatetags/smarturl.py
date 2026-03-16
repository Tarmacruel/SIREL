
# -*- coding: utf-8 -*-
from django import template
from django.urls import reverse, NoReverseMatch

register = template.Library()

def _try_reverse(name, object_id):
    try:
        return reverse(name, args=[object_id])
    except NoReverseMatch:
        pass
    for key in ('pk', 'id', 'processo_id'):
        try:
            return reverse(name, kwargs={key: object_id})
        except NoReverseMatch:
            continue
    raise NoReverseMatch

@register.simple_tag
def smarturl(name, *args, **kwargs):
    candidates = []
    if ':' in name:
        candidates = [name, name.split(':',1)[1]]
    else:
        candidates = [f'docs:{name}', name]
    for cand in candidates:
        try:
            return reverse(cand, args=args, kwargs=kwargs)
        except NoReverseMatch:
            continue
    return '#'

@register.simple_tag
def smart_public_url(object_id):
    """
    Resolve a URL pública do processo tentando diversos names.
    Ajustado para o padrão /licitacao/<pk>/ (name='detalhe').
    """
    candidates = [
        'public:processo_detail',
        'portal:processo_detail',
        'site:processo_detail',
        'public:detalhe',
        'licitacao:detalhe',
        'detalhe',
        'public_processo_detail',
        'processo_publico_detail',
        'public_processo',
        'portal_processo_detail',
        'processo_public',
    ]
    for name in candidates:
        try:
            return _try_reverse(name, object_id)
        except NoReverseMatch:
            continue
    return f'/licitacao/{object_id}/'

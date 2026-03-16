# -*- coding: utf-8 -*-
from django.urls import path
from . import views

# Mantemos app_name, mas você pode incluir SEM namespace no urls.py principal
app_name = 'docs'

urlpatterns = [
    # Termo de Autuação
    path('termo-autuacao/<int:pk>.docx', views.termo_autuacao_docx, name='termo_autuacao_docx'),
    path('termo-autuacao/<int:pk>.doc',  views.termo_autuacao_docx, name='termo_autuacao_doc'),  # alias

    # Ato/Termo de Autorização — cobertura para ambos os nomes
    path('ato-autorizacao/<int:pk>.docx',  views.ato_autorizacao_docx,  name='ato_autorizacao_docx'),
    path('termo-autorizacao/<int:pk>.docx', views.ato_autorizacao_docx,  name='termo_autorizacao_docx'),  # alias esperado pelo Admin
    path('termo-autorizacao/<int:pk>.doc',  views.ato_autorizacao_docx,  name='termo_autorizacao_doc'),   # alias doc

    # Aviso de Licitação
    path('aviso-licitacao/<int:pk>.docx', views.aviso_licitacao_docx, name='aviso_licitacao_docx'),
    path('aviso-licitacao/<int:pk>.doc',  views.aviso_licitacao_docx, name='aviso_licitacao_doc'),  # alias

    # Comunicações Internas (todas em DOCX)
    path('ci-procuradoria/<int:pk>.docx',   views.ci_procuradoria_docx,   name='ci_procuradoria_docx'),
    path('ci-procuradoria/<int:pk>.doc',    views.ci_procuradoria_docx,   name='ci_procuradoria_doc'),    # alias
    path('ci-contabilidade/<int:pk>.docx',  views.ci_contabilidade_docx,  name='ci_contabilidade_docx'),
    path('ci-contabilidade/<int:pk>.doc',   views.ci_contabilidade_docx,  name='ci_contabilidade_doc'),   # alias
    path('ci-controladoria/<int:pk>.docx',  views.ci_controladoria_docx,  name='ci_controladoria_docx'),
    path('ci-controladoria/<int:pk>.doc',   views.ci_controladoria_docx,  name='ci_controladoria_doc'),   # alias

    # Declaração de não fracionamento
    path('declaracao-nao-fracionamento/<int:pk>.docx', views.declaracao_nao_fracionamento_docx, name='declaracao_nao_fracionamento_docx'),
    path('declaracao-nao-fracionamento/<int:pk>.doc',  views.declaracao_nao_fracionamento_docx, name='declaracao_nao_fracionamento_doc'),  # alias
]

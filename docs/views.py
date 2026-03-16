# -*- coding: utf-8 -*-
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.conf import settings
from pathlib import Path
from . import doc_templates
from core.models import Processo

BASE = Path(getattr(settings, 'BASE_DIR', '.'))
TPL_DIR = BASE / 'docs' / 'templates' / 'word'

def _serve_docx(bio, filename):
    resp = HttpResponse(bio.getvalue(), content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    resp['Content-Disposition'] = f'attachment; filename="{filename}"'
    return resp

def termo_autuacao_docx(request, pk):
    proc = get_object_or_404(Processo, pk=pk)
    bio = doc_templates.gerar_termo_autuacao(proc, str(TPL_DIR/'termo_autuacao.docx'))
    return _serve_docx(bio, f"Termo_de_Autuação_{proc.id}.docx")

def ato_autorizacao_docx(request, pk):
    proc = get_object_or_404(Processo, pk=pk)
    bio = doc_templates.gerar_ato_autorizacao(proc, str(TPL_DIR/'ato_autorizacao.docx'))
    return _serve_docx(bio, f"Ato_de_Autorizacao_{proc.id}.docx")

def aviso_licitacao_docx(request, pk):
    proc = get_object_or_404(Processo, pk=pk)
    bio = doc_templates.gerar_aviso_licitacao(proc, str(TPL_DIR/'aviso_licitacao.docx'))
    return _serve_docx(bio, f"Aviso_de_Licitacao_{proc.id}.docx")

def ci_procuradoria_docx(request, pk):
    proc = get_object_or_404(Processo, pk=pk)
    bio = doc_templates.gerar_ci_procuradoria(proc, str(TPL_DIR/'ci_procuradoria.docx'))
    return _serve_docx(bio, f"CI_Procuradoria_{proc.id}.docx")

def ci_contabilidade_docx(request, pk):
    proc = get_object_or_404(Processo, pk=pk)
    bio = doc_templates.gerar_ci_contabilidade(proc, str(TPL_DIR/'ci_contabilidade.docx'))
    return _serve_docx(bio, f"CI_Contabilidade_{proc.id}.docx")

def ci_controladoria_docx(request, pk):
    proc = get_object_or_404(Processo, pk=pk)
    bio = doc_templates.gerar_ci_controladoria(proc, str(TPL_DIR/'ci_controladoria.docx'))
    return _serve_docx(bio, f"CI_Controladoria_{proc.id}.docx")

def declaracao_nao_fracionamento_docx(request, pk):
    proc = get_object_or_404(Processo, pk=pk)
    bio = doc_templates.gerar_declaracao_nao_fracionamento(proc, str(TPL_DIR/'declaracao_nao_fracionamento.docx'))
    return _serve_docx(bio, f"Declaracao_Nao_Fracionamento_{proc.id}.docx")

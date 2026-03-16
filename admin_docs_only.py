from django.urls import path
from django.contrib import admin
from django.shortcuts import get_object_or_404
from core.utils.docgen import (
    render_pdf_from_template, render_docx_from_context,
    contexto_contrato, contexto_aditivo
)
from core.models import Contrato, Aditivo

@admin.register(Contrato)
class ContratoAdmin(admin.ModelAdmin):
    change_form_template = "admin/core/contrato/change_form.html"
    list_display = ("id", "processo", "fornecedor", "valor_total_display")
    def valor_total_display(self, obj): 
        try:
            from core.utils.formatters import fmt_brl
            v = getattr(obj, "valor_total", None) or getattr(obj, "valor", 0)
            return fmt_brl(v)
        except Exception:
            return getattr(obj, "valor_total", None) or getattr(obj, "valor", 0)
    valor_total_display.short_description = "Valor"

    def get_urls(self):
        urls = super().get_urls()
        custom = [
            path("<int:object_id>/doc/<str:doc>/<str:fmt>/", self.admin_site.admin_view(self._docview), name="core_contrato_doc"),
        ]
        return custom + urls

    def _docview(self, request, object_id: int, doc: str, fmt: str):
        contrato = get_object_or_404(Contrato, pk=object_id)
        ctx = contexto_contrato(contrato)
        if doc not in ("minuta", "extrato"):
            from django.http import HttpResponse
            return HttpResponse("Documento inválido.", status=400)
        if fmt == "pdf":
            template = f"documents/contrato_{doc}.html"
            filename = f"contrato_{doc}_{object_id}.pdf"
            return render_pdf_from_template(template, ctx, filename)
        elif fmt == "docx":
            titulo = f"Contrato - {doc.title()}"
            linhas = [
                f"Município: {ctx['municipio']}",
                f"Processo: {ctx.get('processo')}",
                f"Fornecedor: {ctx.get('fornecedor')}",
                f"Valor: {ctx.get('valor_total_brl')} ({ctx.get('valor_total_extenso')})"
            ]
            return render_docx_from_context(titulo, linhas, f"contrato_{doc}_{object_id}.docx")
        from django.http import HttpResponse
        return HttpResponse("Formato inválido.", status=400)

@admin.register(Aditivo)
class AditivoAdmin(admin.ModelAdmin):
    change_form_template = "admin/core/aditivo/change_form.html"
    list_display = ("id", "contrato", "valor_display")
    def valor_display(self, obj):
        try:
            from core.utils.formatters import fmt_brl
            return fmt_brl(getattr(obj, "valor", 0))
        except Exception:
            return getattr(obj, "valor", 0)
    valor_display.short_description = "Valor"

    def get_urls(self):
        urls = super().get_urls()
        custom = [
            path("<int:object_id>/doc/<str:doc>/<str:fmt>/", self.admin_site.admin_view(self._docview), name="core_aditivo_doc"),
        ]
        return custom + urls

    def _docview(self, request, object_id: int, doc: str, fmt: str):
        aditivo = get_object_or_404(Aditivo, pk=object_id)
        ctx = contexto_aditivo(aditivo)
        if doc not in ("minuta", "extrato"):
            from django.http import HttpResponse
            return HttpResponse("Documento inválido.", status=400)
        if fmt == "pdf":
            template = f"documents/aditivo_{doc}.html"
            filename = f"aditivo_{doc}_{object_id}.pdf"
            return render_pdf_from_template(template, ctx, filename)
        elif fmt == "docx":
            titulo = f"Aditivo - {doc.title()}"
            linhas = [
                f"Município: {ctx['municipio']}",
                f"Contrato: {ctx.get('contrato')}",
                f"Valor do Aditivo: {ctx.get('valor_brl')} ({ctx.get('valor_extenso')})"
            ]
            return render_docx_from_context(titulo, linhas, f"aditivo_{doc}_{object_id}.docx")
        from django.http import HttpResponse
        return HttpResponse("Formato inválido.", status=400)

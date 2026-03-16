from django.db import models
from django.utils.translation import gettext_lazy as _
from core.models import Processo

class ProcessoAnexo(models.Model):
    class Tipo(models.TextChoices):
        EDITAL = "EDITAL", _("Edital")
        AVISO = "AVISO", _("Aviso de Licitação")
        TERMO_AUTUACAO = "TERMO_AUTUACAO", _("Termo de Autuação")
        TERMO_AUTORIZACAO = "TERMO_AUTORIZACAO", _("Termo de Autorização")
        PARECER = "PARECER", _("Parecer Jurídico")
        OUTROS = "OUTROS", _("Outros")
    processo = models.ForeignKey(Processo, on_delete=models.CASCADE, related_name="anexos")
    tipo = models.CharField(max_length=32, choices=Tipo.choices, default=Tipo.OUTROS)
    descricao = models.CharField(max_length=255, blank=True, default="")
    arquivo = models.FileField(upload_to="anexos/")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.processo} • {self.get_tipo_display()}"

from decimal import Decimal
from django.db import models
from simple_history.models import HistoricalRecords

class ItemOferta(models.Model):
    item = models.ForeignKey('core.FornecimentoItem', on_delete=models.CASCADE, related_name='ofertas')
    fornecedor = models.ForeignKey('core.Fornecedor', on_delete=models.CASCADE, related_name='ofertas_itens')
    classificacao = models.PositiveIntegerField(default=0)
    valor_unitario = models.DecimalField(max_digits=18, decimal_places=4, default=0)
    valor_total = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    proposta_inicial = models.DecimalField(max_digits=18, decimal_places=4, default=0)
    proposta_final = models.DecimalField(max_digits=18, decimal_places=4, default=0)

    class Status(models.TextChoices):
        CLASSIFICADO = "CLASSIFICADO", "Classificado"
        DESCLASSIFICADO = "DESCLASSIFICADO", "Desclassificado"
        INABILITADO = "INABILITADO", "Inabilitado"
        VENCEDOR = "VENCEDOR", "Vencedor"

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.CLASSIFICADO)
    history = HistoricalRecords(related_name='historico_oferta')

    class Meta:
        ordering = ["item__numero_item", "classificacao"]
        unique_together = (("item","fornecedor"),)

    def __str__(self):
        return f"Oferta {self.fornecedor} do {self.item}"

    def save(self, *args, **kwargs):
        try:
            qtd = (self.item.quantidade or Decimal('0'))
            vu = (self.valor_unitario or Decimal('0'))
            self.valor_total = (vu * qtd).quantize(Decimal('0.01'))
        except Exception:
            pass
        super().save(*args, **kwargs)

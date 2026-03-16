from django.core.management.base import BaseCommand
from core.models import StatusProcesso, Modalidade

STATUS_LISTA = [
    "ADJUDICADO",
    "AGUARDANDO AUTORIZAÇÃO",
    "AGUARDANDO CORREÇÕES",
    "AGUARDANDO ANÁLISE TÉCNICA",
    "ANÁLISE DE HABILITAÇÃO",
    "ANULADO",
    "ARQUIVADO",
    "DECLARADO VENCEDOR",
    "DESERTO",
    "DEVOLVIDO À ORIGEM",
    "ELABORAÇÃO DE EDITAL",
    "EM ANDAMENTO",
    "ENVIADO PARA PGM",
    "FRACASSADO",
    "FASE DE RECURSO",
    "HOMOLOGADO",
    "JULGAMENTO DE PROPOSTA",
    "JULGAMENTO DE RECURSO",
    "NEGOCIANDO VALORES",
    "NÃO AUTORIZADO",
    "RECEPÇÃO DE PROPOSTAS",
    "REVOGADO",
    "SUSPENSO",
    "AGUARDANDO RESERVA",
]

MODALIDADES = [
    "PREGÃO ELETRÔNICO",
    "PREGÃO PRESENCIAL",
    "CONCORRÊNCIA ELETRÔNICA",
    "CONCORRÊNCIA PRESENCIAL",
    "DISPENSA ELETRÔNICA",
    "DISPENSA SIMPLIFICADA",
    "LEILÃO",
    "CREDENCIAMENTO",
    "INEXIGIBILIDADE",
    "CHAMAMENTO PÚBLICO",
]

class Command(BaseCommand):
    help = "Cria Status e Modalidades padrão"

    def handle(self, *args, **options):
        for nome in STATUS_LISTA:
            StatusProcesso.objects.get_or_create(nome=nome)
        for nome in MODALIDADES:
            Modalidade.objects.get_or_create(nome=nome)
        self.stdout.write(self.style.SUCCESS("Status e Modalidades carregados."))
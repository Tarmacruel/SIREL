from core.models import OrgaoEntidade
from django.db import OperationalError, ProgrammingError


def orgao_ativo(request):
    try:
        orgao = OrgaoEntidade.objects.order_by('-atualizado_em', '-id').first()
    except (OperationalError, ProgrammingError):
        orgao = None
    return {'sirel_orgao_ativo': orgao}

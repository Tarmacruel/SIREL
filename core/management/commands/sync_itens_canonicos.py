from django.core.management.base import BaseCommand

from core.models import Processo
from workflow.services.item_registry import sync_canonical_items_for_processo


class Command(BaseCommand):
    help = "Sincroniza a camada canonica de itens por processo."

    def add_arguments(self, parser):
        parser.add_argument("--processo-id", type=int, dest="processo_id", help="Sincroniza somente um processo.")

    def handle(self, *args, **options):
        processo_id = options.get("processo_id")
        qs = Processo.objects.all().order_by("id")
        if processo_id:
            qs = qs.filter(pk=processo_id)
        total = qs.count()
        if total == 0:
            self.stdout.write(self.style.WARNING("Nenhum processo encontrado para sincronizacao."))
            return

        self.stdout.write(f"Sincronizando itens canonicos de {total} processo(s)...")
        ok = 0
        for processo in qs.iterator():
            sync_canonical_items_for_processo(processo)
            ok += 1
            self.stdout.write(f" - Processo {processo.id}: sincronizado")
        self.stdout.write(self.style.SUCCESS(f"Concluido. {ok} processo(s) sincronizados."))

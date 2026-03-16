# -*- coding: utf-8 -*-
from django.core.management.base import BaseCommand, CommandError
from core.models import Processo, Lote, FornecimentoItem

class Command(BaseCommand):
    help = "Sincroniza Lotes a partir dos Itens de cada Processo (regra: ITEM=1 lote por item; GLOBAL=1 lote com todos)."

    def add_arguments(self, parser):
        parser.add_argument('--processo-id', type=int, help='ID específico do processo (opcional).')

    def handle(self, *args, **options):
        pid = options.get('processo_id')
        qs = Processo.objects.all()
        if pid:
            qs = qs.filter(id=pid)

        total_lotes = 0
        total_itens = 0
        for proc in qs:
            self.stdout.write(self.style.NOTICE(f"Processo {proc} ..."))
            itens = list(FornecimentoItem.objects.filter(processo=proc).order_by('numero_item'))
            if not itens:
                self.stdout.write("  - Sem itens; pulando.")
                continue

            # apaga lotes antigos (opcional: manter)
            # Lote.objects.filter(processo=proc).delete()

            if proc.escopo_disputa == Processo.EscopoDisputa.GLOBAL:
                lote, _ = Lote.objects.get_or_create(processo=proc, numero=1, defaults={'escopo': 'GLOBAL'})
                for it in itens:
                    it.lote = lote
                    it.save(update_fields=['lote'])
                lote.qtd_itens = len(itens)
                lote.save(update_fields=['qtd_itens'])
                total_lotes += 1
                total_itens += len(itens)

            else:
                # ITEM ou LOTE (sem info detalhada) -> um lote por item_numero
                for it in itens:
                    lote, _ = Lote.objects.get_or_create(processo=proc, numero=it.numero_item, defaults={'escopo': 'ITEM'})
                    if it.lote_id != lote.id:
                        it.lote = lote
                        it.save(update_fields=['lote'])
                    lote.qtd_itens = (lote.qtd_itens or 0) + 1
                    lote.save(update_fields=['qtd_itens'])
                    total_lotes += 1
                    total_itens += 1

        self.stdout.write(self.style.SUCCESS(f"Concluído. Lotes afetados: {total_lotes} | Itens vinculados: {total_itens}"))

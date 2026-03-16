# -*- coding: utf-8 -*-
from django.core.management.base import BaseCommand, CommandParser
from core.models import Processo, Lote, FornecimentoItem

class Command(BaseCommand):
    help = "Ajusta lotes de processos antigos conforme escopo: GLOBAL=um lote; ITEM=um lote por item; LOTE=mantém e recalcula qtd_itens."

    def add_arguments(self, parser: CommandParser):
        parser.add_argument("--processo-id", type=int, default=None)

    def handle(self, *args, **opts):
        pid = opts.get("processo_id")
        procs = Processo.objects.filter(pk=pid) if pid else Processo.objects.all()
        created = 0
        adjusted = 0
        for p in procs:
            if p.escopo_disputa == "GLOBAL":
                lote, _ = Lote.objects.get_or_create(processo=p, numero=1, defaults={"titulo":"Global","escopo":"GLOBAL"})
                itens = FornecimentoItem.objects.filter(processo=p)
                itens.update(lote=lote)
                lote.qtd_itens = itens.count(); lote.save(update_fields=["qtd_itens"]); adjusted += 1
            elif p.escopo_disputa == "ITEM":
                for it in FornecimentoItem.objects.filter(processo=p):
                    lote, _ = Lote.objects.get_or_create(processo=p, numero=it.numero_item, defaults={"titulo":f"Item {it.numero_item}","escopo":"ITEM"})
                    it.lote = lote; it.save(update_fields=["lote"]); created += 1
                for l in Lote.objects.filter(processo=p):
                    l.qtd_itens = l.itens.count(); l.save(update_fields=["qtd_itens"]); adjusted += 1
            else:  # LOTE
                for l in Lote.objects.filter(processo=p):
                    l.qtd_itens = l.itens.count(); l.save(update_fields=["qtd_itens"]); adjusted += 1
        self.stdout.write(self.style.SUCCESS(f"fill_lotes concluído. lotes_criados/ajustados={created}/{adjusted}"))

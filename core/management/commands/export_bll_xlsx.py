# -*- coding: utf-8 -*-
from django.core.management.base import BaseCommand, CommandError
from core.models import Processo
from core.utils.bll_file_export import export_bll_xlsx

class Command(BaseCommand):
    help = "Exporta um Processo (Lotes + Itens) no layout XLSX Modelo_Global."

    def add_arguments(self, parser):
        parser.add_argument("--processo-id", type=int, required=True, help="ID do Processo no sistema")
        parser.add_argument("--out", type=str, required=True, help="Caminho do arquivo XLSX de saída")

    def handle(self, *args, **opts):
        pid = opts["processo_id"]
        out = opts["out"]
        try:
            proc = Processo.objects.get(id=pid)
        except Processo.DoesNotExist:
            raise CommandError(f"Processo id={pid} não encontrado.")

        with open(out, "wb") as f:
            export_bll_xlsx(proc, f)
        self.stdout.write(self.style.SUCCESS(f"OK — XLSX gerado: {out}"))

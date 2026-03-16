# -*- coding: utf-8 -*-
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Comando descontinuado: a exportação BLL é exclusivamente em XLSX."

    def add_arguments(self, parser):
        parser.add_argument("--processo-id", type=int, required=False, help="ID do Processo no sistema")
        parser.add_argument("--out", type=str, required=False, help="Caminho do arquivo de saída")

    def handle(self, *args, **opts):
        raise CommandError(
            "Exportação BLL em CSV está desabilitada. Utilize: python manage.py export_bll_xlsx --processo-id <id> --out <arquivo.xlsx>"
        )

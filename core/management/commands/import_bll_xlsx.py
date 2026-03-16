# -*- coding: utf-8 -*-
import os

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management.base import BaseCommand, CommandError

from core.models import Processo
from core.utils.bll_import import import_bll_file


class Command(BaseCommand):
    help = "Importa arquivo XLSX da BLL para um processo usando o parser unificado."

    def add_arguments(self, parser):
        parser.add_argument("--processo-id", type=int, required=True, help="ID do Processo no sistema")
        parser.add_argument("--file", type=str, required=True, help="Caminho do arquivo XLSX")

    def handle(self, *args, **opts):
        pid = opts["processo_id"]
        path = opts["file"]
        try:
            proc = Processo.objects.get(id=pid)
        except Processo.DoesNotExist:
            raise CommandError(f"Processo id={pid} nao encontrado.")

        with open(path, "rb") as fh:
            up = SimpleUploadedFile(
                name=os.path.basename(path),
                content=fh.read(),
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        res = import_bll_file(proc, up)
        self.stdout.write(
            self.style.SUCCESS(
                "OK - importacao concluida | "
                f"modo: {res.get('mode')} | criados: {res.get('created', 0)} | atualizados: {res.get('updated', 0)}"
            )
        )

# -*- coding: utf-8 -*-
from django.core.management.base import BaseCommand, CommandError
import pandas as pd
from core.models import Processo, Fornecedor, Contrato

class Command(BaseCommand):
    help = "Importa contratos e vigências a partir de planilha XLSX do Portal da Transparência (modelo simples)."

    def add_arguments(self, parser):
        parser.add_argument("--file", required=True, help="Caminho do XLSX")
        parser.add_argument("--sheet", default=0, help="Nome ou índice da planilha")

    def handle(self, *args, **opts):
        path = opts["file"]; sheet = opts["sheet"]
        try:
            df = pd.read_excel(path, sheet_name=sheet)
        except Exception as e:
            raise CommandError(f"Erro lendo XLSX: {e}")
        # Campos esperados
        cols = {c.lower(): c for c in df.columns}
        required = ["processo","numero_contrato","fornecedor","vigencia_inicio","vigencia_fim","valor"]
        for r in required:
            if r not in cols:
                raise CommandError(f"Coluna obrigatória ausente: {r}")
        ok = 0
        for _, row in df.iterrows():
            proc_str = str(row[cols["processo"]]).strip()
            try:
                proc = Processo.objects.get(processo_adm__iexact=proc_str)
            except Processo.DoesNotExist:
                self.stdout.write(self.style.WARNING(f"Processo não achado: {proc_str}"))
                continue
            forn_nome = str(row[cols["fornecedor"]]).strip()
            forn, _ = Fornecedor.objects.get_or_create(nome=forn_nome)
            num = str(row[cols["numero_contrato"]]).strip()
            valor = float(row[cols["valor"]]) if row[cols["valor"]] else 0.0
            vi = row[cols["vigencia_inicio"]]
            vf = row[cols["vigencia_fim"]]
            c, created = Contrato.objects.get_or_create(processo=proc, numero=num, defaults={"fornecedor":forn,"valor_total":valor,"vigencia_inicio":vi,"vigencia_fim":vf})
            if not created:
                c.fornecedor = forn; c.valor_total = valor; c.vigencia_inicio = vi; c.vigencia_fim = vf; c.save()
            ok += 1
        self.stdout.write(self.style.SUCCESS(f"Contratos importados/atualizados: {ok}"))

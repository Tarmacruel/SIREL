# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from core.utils.licitacao_json_import import (
    DEFAULT_DADOS_LICITACAO_URL,
    LicitacaoJsonImporter,
)


class Command(BaseCommand):
    help = (
        "Importa processos/lotes/itens a partir do JSON unificado (BLL + PNCP) "
        "e sincroniza a camada canonica."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--url",
            type=str,
            default="",
            help="URL do JSON (padrao: settings.DADOS_LICITACAO_URL).",
        )
        parser.add_argument(
            "--file",
            type=str,
            default="",
            help="Caminho local de arquivo JSON.",
        )
        parser.add_argument(
            "--timeout",
            type=int,
            default=120,
            help="Timeout de download em segundos (padrao: 120).",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help="Limita a quantidade de processos a importar (0 = sem limite).",
        )
        parser.add_argument(
            "--no-sync-canonical",
            action="store_true",
            help="Nao executa sincronizacao canonica de itens ao final de cada processo.",
        )

    def handle(self, *args, **options):
        file_path = (options.get("file") or "").strip()
        url = (options.get("url") or "").strip()
        timeout = max(1, int(options.get("timeout") or 120))
        limit = int(options.get("limit") or 0) or None
        sync_canonical = not bool(options.get("no_sync_canonical"))

        importer = LicitacaoJsonImporter(sync_canonical=sync_canonical)
        source_desc = ""

        try:
            if file_path:
                path = Path(file_path)
                if not path.exists():
                    raise CommandError(f"Arquivo JSON nao encontrado: {path}")
                payload = importer.load_payload_from_file(str(path))
                source_desc = f"arquivo={path}"
            else:
                base_url = (
                    url
                    or getattr(settings, "DADOS_LICITACAO_URL", "").strip()
                    or DEFAULT_DADOS_LICITACAO_URL
                )
                payload = importer.load_payload_from_url(base_url, timeout=timeout)
                source_desc = f"url={base_url}"
        except CommandError:
            raise
        except Exception as exc:
            raise CommandError(f"Falha ao carregar origem de dados ({source_desc or 'origem'}): {exc}") from exc

        self.stdout.write(f"Iniciando importacao JSON ({source_desc})...")
        resumo = importer.import_payload(payload, limit=limit)

        self.stdout.write(
            self.style.SUCCESS(
                "Importacao concluida | "
                f"processados={resumo.get('processos_processados', 0)} "
                f"criados={resumo.get('processos_criados', 0)} "
                f"atualizados={resumo.get('processos_atualizados', 0)} "
                f"lotes(criados/atualizados)={resumo.get('lotes_criados', 0)}/{resumo.get('lotes_atualizados', 0)} "
                f"itens(criados/atualizados)={resumo.get('itens_criados', 0)}/{resumo.get('itens_atualizados', 0)} "
                f"erros={resumo.get('erros', 0)}"
            )
        )

        erros = resumo.get("detalhes_erros") or []
        if erros:
            self.stdout.write(self.style.WARNING("Erros encontrados (primeiros 20):"))
            for detalhe in erros[:20]:
                self.stdout.write(f" - {detalhe}")


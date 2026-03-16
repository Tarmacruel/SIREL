import time

from django.core.management.base import BaseCommand

from workflow.services.pncp_queue import processar_fila_pncp


class Command(BaseCommand):
    help = "Processa a fila de detalhamento PNCP pendente."

    def add_arguments(self, parser):
        parser.add_argument(
            "--limit",
            type=int,
            default=10,
            help="Quantidade maxima de jobs por ciclo (padrao: 10).",
        )
        parser.add_argument(
            "--loop",
            action="store_true",
            help="Executa continuamente em loop.",
        )
        parser.add_argument(
            "--sleep",
            type=int,
            default=8,
            help="Intervalo em segundos entre ciclos no modo --loop (padrao: 8).",
        )

    def handle(self, *args, **options):
        limit = max(1, int(options.get("limit") or 10))
        loop = bool(options.get("loop"))
        sleep_seconds = max(1, int(options.get("sleep") or 8))

        if not loop:
            resumo = processar_fila_pncp(limit=limit)
            self.stdout.write(
                self.style.SUCCESS(
                    "Fila PNCP processada | "
                    f"capturados={resumo.get('capturados', 0)} "
                    f"concluidos={resumo.get('concluidos', 0)} "
                    f"parciais={resumo.get('parciais', 0)} "
                    f"erros={resumo.get('erros', 0)}"
                )
            )
            return

        self.stdout.write(self.style.WARNING("Iniciando worker continuo da fila PNCP..."))
        while True:
            resumo = processar_fila_pncp(limit=limit)
            self.stdout.write(
                f"[fila-pncp] capturados={resumo.get('capturados', 0)} "
                f"concluidos={resumo.get('concluidos', 0)} "
                f"parciais={resumo.get('parciais', 0)} "
                f"erros={resumo.get('erros', 0)}"
            )
            time.sleep(sleep_seconds)

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from workflow.models import IntegracaoProcesso, PNCPDetalhamentoFila


def enqueue_pncp_detalhamento(
    processo,
    *,
    numero_controle: str = '',
    origem: str = 'IMPORTACAO_LOTE',
    prioridade: int = 100,
):
    fila = PNCPDetalhamentoFila.objects.filter(processo=processo).first()
    if not fila:
        fila = PNCPDetalhamentoFila.objects.create(
            processo=processo,
            numero_controle_pncp=(numero_controle or '').strip(),
            status=PNCPDetalhamentoFila.Status.PENDENTE,
            prioridade=max(1, int(prioridade or 100)),
            origem=(origem or 'IMPORTACAO_LOTE')[:30],
            payload_resumo={},
        )
        return fila, True

    updates = []
    numero_controle = (numero_controle or '').strip()
    if numero_controle and fila.numero_controle_pncp != numero_controle:
        fila.numero_controle_pncp = numero_controle
        updates.append('numero_controle_pncp')
    prioridade = max(1, int(prioridade or fila.prioridade or 100))
    if fila.prioridade != prioridade:
        fila.prioridade = prioridade
        updates.append('prioridade')
    origem_norm = (origem or fila.origem or 'IMPORTACAO_LOTE')[:30]
    if fila.origem != origem_norm:
        fila.origem = origem_norm
        updates.append('origem')

    if fila.status != PNCPDetalhamentoFila.Status.PROCESSANDO:
        fila.status = PNCPDetalhamentoFila.Status.PENDENTE
        fila.finalizado_em = None
        updates.extend(['status', 'finalizado_em'])
    if updates:
        fila.save(update_fields=list(dict.fromkeys(updates + ['atualizado_em'])))
    return fila, False


def _claim_job(job_id: int):
    with transaction.atomic():
        fila = PNCPDetalhamentoFila.objects.select_for_update().filter(id=job_id).first()
        if not fila:
            return None
        if fila.status not in {
            PNCPDetalhamentoFila.Status.PENDENTE,
            PNCPDetalhamentoFila.Status.ERRO,
            PNCPDetalhamentoFila.Status.PARCIAL,
        }:
            return None
        fila.status = PNCPDetalhamentoFila.Status.PROCESSANDO
        fila.tentativas = int(fila.tentativas or 0) + 1
        fila.iniciado_em = timezone.now()
        fila.ultimo_erro = ''
        fila.save(update_fields=['status', 'tentativas', 'iniciado_em', 'ultimo_erro', 'atualizado_em'])
        return fila


def processar_fila_pncp(*, limit: int = 10):
    limit = max(1, int(limit or 10))
    jobs_ids = list(
        PNCPDetalhamentoFila.objects.filter(
            status__in=[
                PNCPDetalhamentoFila.Status.PENDENTE,
                PNCPDetalhamentoFila.Status.ERRO,
                PNCPDetalhamentoFila.Status.PARCIAL,
            ]
        )
        .order_by('prioridade', 'agendado_em', 'id')
        .values_list('id', flat=True)[:limit]
    )
    if not jobs_ids:
        return {'capturados': 0, 'concluidos': 0, 'parciais': 0, 'erros': 0}

    from workflow.views import _reprocessar_pncp_processo, _ensure_workflow

    concluidos = 0
    parciais = 0
    erros = 0
    for job_id in jobs_ids:
        fila = _claim_job(job_id)
        if not fila:
            continue
        processo = fila.processo
        wf = _ensure_workflow(processo)
        log = IntegracaoProcesso.objects.create(
            processo=processo,
            tipo=IntegracaoProcesso.Tipo.PNCP,
            identificador_externo=f'FILA_DETALHAMENTO:{fila.numero_controle_pncp or "-"}',
            status='PENDENTE',
        )
        try:
            resultado = _reprocessar_pncp_processo(processo)
            erros_resultado = resultado.get('erros') or []
            sync = resultado.get('sync') or {}
            now = timezone.now()
            fila.status = (
                PNCPDetalhamentoFila.Status.PARCIAL
                if erros_resultado else
                PNCPDetalhamentoFila.Status.CONCLUIDO
            )
            fila.finalizado_em = now
            fila.payload_resumo = {
                'numero_controle': resultado.get('numero_controle', ''),
                'itens_detalhados': resultado.get('itens_detalhados', 0),
                'resultados_detalhados': resultado.get('resultados_detalhados', 0),
                'sincronizacao': sync,
                'erros': erros_resultado[:20],
            }
            fila.ultimo_erro = '\n'.join(erros_resultado[:10]) if erros_resultado else ''
            fila.save(update_fields=['status', 'finalizado_em', 'payload_resumo', 'ultimo_erro', 'atualizado_em'])

            wf.etapa_atual = (
                'PNCP - DETALHAMENTO PARCIAL'
                if erros_resultado else
                'PNCP - DETALHAMENTO CONCLUIDO'
            )
            wf.save(update_fields=['etapa_atual', 'atualizado_em'])

            log.status = 'PARCIAL' if erros_resultado else 'SUCESSO'
            log.payload_resumo = fila.payload_resumo
            log.mensagem = (
                'Detalhamento PNCP concluido com falhas parciais (fila).'
                if erros_resultado else
                'Detalhamento PNCP concluido com sucesso (fila).'
            )
            log.save(update_fields=['status', 'payload_resumo', 'mensagem'])

            if erros_resultado:
                parciais += 1
            else:
                concluidos += 1
        except Exception as exc:
            erros += 1
            fila.status = PNCPDetalhamentoFila.Status.ERRO
            fila.finalizado_em = timezone.now()
            fila.ultimo_erro = str(exc)
            fila.payload_resumo = {'erro': str(exc)}
            fila.save(update_fields=['status', 'finalizado_em', 'ultimo_erro', 'payload_resumo', 'atualizado_em'])

            wf.etapa_atual = 'PNCP - ERRO NO DETALHAMENTO'
            wf.save(update_fields=['etapa_atual', 'atualizado_em'])

            log.status = 'ERRO'
            log.mensagem = str(exc)
            log.payload_resumo = {'erro': str(exc)}
            log.save(update_fields=['status', 'mensagem', 'payload_resumo'])

    return {
        'capturados': len(jobs_ids),
        'concluidos': concluidos,
        'parciais': parciais,
        'erros': erros,
    }

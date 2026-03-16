from __future__ import annotations

import json
from decimal import Decimal

import requests
from django.conf import settings
from django.utils import timezone

from core.models import Processo, ProcessoItem, ProcessoItemResultado
from workflow.models import PNCPContratacaoSnapshot

from .pncp import PNCPClient


def _as_decimal_str(value, places=2):
    if value in (None, ''):
        value = Decimal('0')
    if not isinstance(value, Decimal):
        value = Decimal(str(value))
    quant = Decimal('1') if places <= 0 else Decimal('1.' + ('0' * places))
    return format(value.quantize(quant), f'.{places}f')


def _digits(value):
    return ''.join(ch for ch in str(value or '') if ch.isdigit())


def _safe_text(value):
    if value is None:
        return ''
    return str(value).strip()


def _item_status_para_pncp(status_local: str):
    status = (status_local or '').strip().upper()
    if status in (
        ProcessoItem.StatusConsolidado.HOMOLOGADO,
        ProcessoItemResultado.StatusResultado.HOMOLOGADO,
        ProcessoItemResultado.StatusResultado.VENCEDOR,
    ):
        return 'HOMOLOGADO'
    if status in (
        ProcessoItem.StatusConsolidado.FRACASSADO,
        ProcessoItemResultado.StatusResultado.FRACASSADO,
    ):
        return 'FRACASSADO'
    if status in (
        ProcessoItem.StatusConsolidado.CANCELADO,
        ProcessoItemResultado.StatusResultado.CANCELADO,
    ):
        return 'CANCELADO'
    return 'CLASSIFICADO'


class PNCPPublishClient:
    def __init__(self):
        self.enabled = bool(getattr(settings, 'PNCP_ENVIO_HABILITADO', False))
        self.dry_run = bool(getattr(settings, 'PNCP_ENVIO_DRY_RUN', True))
        self.base_url = str(getattr(settings, 'PNCP_ENVIO_BASE_URL', 'https://pncp.gov.br/api/pncp')).rstrip('/')
        self.timeout = int(getattr(settings, 'PNCP_ENVIO_TIMEOUT', 45))
        self.auth_token = _safe_text(getattr(settings, 'PNCP_ENVIO_AUTH_TOKEN', ''))

        self.session = requests.Session()
        self.session.headers.update(
            {
                'Accept': 'application/json',
                'User-Agent': 'SIREL-Modular/1.0 (+pncp-publish)',
            }
        )
        if self.auth_token:
            self.session.headers['Authorization'] = f'Bearer {self.auth_token}'

    def _get_contexto_controle(self, processo: Processo, snapshot: PNCPContratacaoSnapshot | None):
        numero_controle = ''
        if snapshot and snapshot.numero_controle_pncp:
            numero_controle = snapshot.numero_controle_pncp
        elif getattr(processo, 'workflow', None) and processo.workflow.pncp_numero_controle:
            numero_controle = processo.workflow.pncp_numero_controle
        parsed = PNCPClient._parse_numero_controle(numero_controle) if numero_controle else None

        cnpj = ''
        ano = int(processo.ano_referencia or 0)
        sequencial = 0

        if parsed:
            cnpj = parsed['cnpj']
            ano = int(parsed['ano'])
            sequencial = int(parsed['sequencial'])
        else:
            if snapshot:
                cnpj = _digits(snapshot.orgao_cnpj)
                if snapshot.ano_compra:
                    ano = int(snapshot.ano_compra)
                if snapshot.sequencial_compra:
                    sequencial = int(snapshot.sequencial_compra)
            if not sequencial:
                try:
                    sequencial = int(_digits(getattr(snapshot, 'numero_compra', '') or processo.numero_processo_adm or '0') or 0)
                except Exception:
                    sequencial = 0

        return {
            'numero_controle': numero_controle,
            'cnpj': cnpj,
            'ano': ano,
            'sequencial': sequencial,
        }

    def _build_payload_compra(self, processo: Processo, snapshot: PNCPContratacaoSnapshot | None):
        wf = getattr(processo, 'workflow', None)
        return {
            'numeroControlePNCP': _safe_text(snapshot.numero_controle_pncp if snapshot else ''),
            'numeroCompra': _safe_text(snapshot.numero_compra if snapshot else processo.numero_edital or processo.numero_processo_adm),
            'anoCompra': int((snapshot.ano_compra if snapshot else None) or processo.ano_referencia or timezone.localdate().year),
            'processo': _safe_text(snapshot.processo_origem if snapshot else processo.numero_processo_adm),
            'objetoCompra': _safe_text(snapshot.objeto_compra if snapshot else processo.objeto),
            'modalidadeNome': _safe_text(snapshot.modalidade_nome if snapshot else getattr(processo.modalidade, 'nome', '')),
            'modoDisputaNome': _safe_text(snapshot.modo_disputa_nome if snapshot else processo.modo_disputa),
            'criterioJulgamentoNome': _safe_text(snapshot.criterio_julgamento_nome if snapshot else processo.criterio_julgamento),
            'situacaoCompraNome': _safe_text(snapshot.situacao_compra_nome if snapshot else getattr(processo.status, 'nome', '')),
            'valorTotalEstimado': _as_decimal_str(processo.valor_estimado or 0, places=2),
            'valorTotalHomologado': _as_decimal_str(processo.valor_homologado or 0, places=2),
            'srp': bool(snapshot.srp if snapshot else processo.tipo_contratacao == Processo.TipoContratacao.REGISTRO_PRECO),
            'dataPublicacaoPncp': processo.data_publicacao.isoformat() if processo.data_publicacao else '',
            'workflowEtapa': _safe_text(wf.etapa_atual if wf else ''),
            'origemSistema': 'SIREL',
        }

    def _build_payload_itens(self, processo: Processo):
        payload = []
        for item in ProcessoItem.objects.filter(processo=processo).order_by('numero_item'):
            payload.append(
                {
                    'numeroItem': int(item.numero_item),
                    'descricaoItem': _safe_text(item.descricao_snapshot),
                    'unidadeMedida': _safe_text(item.unidade_snapshot),
                    'quantidade': _as_decimal_str(item.quantidade or 0, places=3),
                    'valorUnitarioEstimado': _as_decimal_str(item.valor_referencia_unitario or 0, places=4),
                    'valorTotalEstimado': _as_decimal_str(item.valor_referencia_total or 0, places=2),
                    'situacaoCompraItemNome': _item_status_para_pncp(item.status_consolidado),
                }
            )
        return payload

    def _build_payload_resultados(self, processo: Processo):
        by_item = {}
        rows = (
            ProcessoItemResultado.objects.filter(
                processo=processo,
                ativo=True,
                fornecedor__isnull=False,
            )
            .select_related('processo_item', 'fornecedor')
            .order_by('processo_item__numero_item', 'classificacao', 'id')
        )
        for row in rows:
            numero_item = int(row.processo_item.numero_item)
            by_item.setdefault(numero_item, []).append(
                {
                    'numeroItem': numero_item,
                    'ordemClassificacaoSrp': int(row.classificacao or 0),
                    'nomeRazaoSocialFornecedor': _safe_text(row.fornecedor.razao_social),
                    'niFornecedor': _digits(row.fornecedor.cnpj),
                    'situacaoCompraItemResultadoNome': _item_status_para_pncp(row.status_resultado),
                    'valorUnitarioHomologado': _as_decimal_str(row.valor_unitario or 0, places=4),
                    'valorTotalHomologado': _as_decimal_str(row.valor_total or 0, places=2),
                    'dataResultado': row.data_resultado.isoformat() if row.data_resultado else '',
                }
            )
        return by_item

    def _post_json(self, path: str, payload):
        url = f'{self.base_url}{path}'
        resp = self.session.post(url, json=payload, timeout=self.timeout)
        try:
            text = (resp.text or '').strip()
        except Exception:
            text = ''
        if resp.status_code >= 400:
            raise RuntimeError(f'PNCP POST {path} retornou {resp.status_code}: {text[:300]}')
        if not text:
            return {'status_code': resp.status_code}
        try:
            return resp.json()
        except Exception:
            return {'status_code': resp.status_code, 'raw': text[:600]}

    def _post_compra_multipart(self, cnpj: str, payload_compra: dict):
        path = f'/v1/orgaos/{cnpj}/compras'
        url = f'{self.base_url}{path}'
        compra_bytes = json.dumps(payload_compra, ensure_ascii=False).encode('utf-8')
        documento_bytes = (
            b'SIREL - Envio opcional PNCP\n'
            b'Este documento foi gerado automaticamente para acompanhar o payload da compra.\n'
        )
        headers = {
            'Titulo-Documento': 'Documento tecnico SIREL',
            'Tipo-Documento-Id': '1',
        }
        files = {
            'compra': ('compra.json', compra_bytes, 'application/json'),
            'documento': ('documento.txt', documento_bytes, 'text/plain'),
        }
        resp = self.session.post(url, files=files, headers=headers, timeout=self.timeout)
        body = (resp.text or '').strip()
        if resp.status_code >= 400:
            raise RuntimeError(f'PNCP POST {path} retornou {resp.status_code}: {body[:300]}')
        if not body:
            return {'status_code': resp.status_code}
        try:
            return resp.json()
        except Exception:
            return {'status_code': resp.status_code, 'raw': body[:600]}

    def preparar_envio(self, processo: Processo):
        snapshot = PNCPContratacaoSnapshot.objects.filter(processo=processo).first()
        ctx = self._get_contexto_controle(processo, snapshot)
        payload_compra = self._build_payload_compra(processo, snapshot)
        payload_itens = self._build_payload_itens(processo)
        payload_resultados = self._build_payload_resultados(processo)
        return {
            'config': {
                'envio_habilitado': self.enabled,
                'dry_run': self.dry_run,
                'base_url': self.base_url,
                'timeout': self.timeout,
                'token_configurado': bool(self.auth_token),
            },
            'contexto': ctx,
            'compra': payload_compra,
            'itens': payload_itens,
            'resultados_por_item': payload_resultados,
            'totais': {
                'itens': len(payload_itens),
                'itens_com_resultado': len(payload_resultados),
                'resultados_total': sum(len(v) for v in payload_resultados.values()),
            },
        }

    def enviar(self, processo: Processo):
        pacote = self.preparar_envio(processo)
        ctx = pacote['contexto']
        cnpj = ctx['cnpj']
        ano = ctx['ano']
        sequencial = ctx['sequencial']

        if not self.enabled:
            pacote['status'] = 'SKIPPED_DISABLED'
            pacote['mensagem'] = (
                'Envio PNCP desabilitado por configuração. '
                'Ative PNCP_ENVIO_HABILITADO para permitir envio real.'
            )
            return pacote

        if self.dry_run:
            pacote['status'] = 'DRY_RUN'
            pacote['mensagem'] = 'Simulação concluída. Nenhum POST foi enviado ao PNCP.'
            return pacote

        if not self.auth_token:
            raise RuntimeError('PNCP_ENVIO_AUTH_TOKEN não configurado para envio real.')
        if not cnpj or not ano or not sequencial:
            raise RuntimeError('Não foi possível determinar CNPJ/ano/sequencial da compra para envio PNCP.')

        respostas = {
            'compra': self._post_compra_multipart(cnpj, pacote['compra']),
            'itens': self._post_json(f'/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens', pacote['itens']),
            'resultados': {},
        }
        for numero_item, rows in pacote['resultados_por_item'].items():
            if not rows:
                continue
            respostas['resultados'][str(numero_item)] = self._post_json(
                f'/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens/{int(numero_item)}/resultados',
                rows,
            )

        pacote['status'] = 'ENVIADO'
        pacote['mensagem'] = 'Envio PNCP concluído.'
        pacote['respostas'] = respostas
        return pacote

from __future__ import annotations

import json
import time

import requests
from requests import HTTPError
from requests.exceptions import ConnectionError as RequestsConnectionError
from requests.exceptions import ReadTimeout, Timeout as RequestsTimeout


class PNCPClient:
    BASE_CONSULTA = 'https://pncp.gov.br/api/consulta'
    BASE_PNCP = 'https://pncp.gov.br/api/pncp'

    def __init__(
        self,
        timeout: int = 30,
        max_retries: int = 2,
        rate_limit_retries: int = 3,
        result_item_sleep_seconds: float = 0.02,
    ):
        self.timeout = timeout
        self.max_retries = max(0, int(max_retries))
        self.rate_limit_retries = max(0, int(rate_limit_retries))
        self.result_item_sleep_seconds = max(0.0, float(result_item_sleep_seconds or 0.0))
        self.session = requests.Session()
        self.session.headers.update(
            {
                'Accept': 'application/json',
                'User-Agent': 'SIREL-Modular/1.0 (+integracao-pncp)',
            }
        )

    @staticmethod
    def _parse_numero_controle(numero_controle: str):
        raw = (numero_controle or '').strip()
        if not raw:
            return None
        # Expected common pattern: CNPJ-1-SEQUENCIAL/ANO
        # Example: 12345678000190-1-12345/2026
        try:
            part_a, part_b = raw.split('/', 1)
            parts = part_a.split('-')
            if len(parts) < 3:
                return None
            cnpj = ''.join(ch for ch in parts[0] if ch.isdigit())
            sequencial = int(''.join(ch for ch in parts[-1] if ch.isdigit()))
            ano = int(''.join(ch for ch in part_b if ch.isdigit()))
            if not cnpj or not sequencial or not ano:
                return None
            return {'cnpj': cnpj, 'sequencial': sequencial, 'ano': ano}
        except Exception:
            return None

    @staticmethod
    def _normalizar_data_parametro(valor: str) -> str:
        raw = (valor or '').strip()
        if not raw:
            return raw
        apenas_digitos = ''.join(ch for ch in raw if ch.isdigit())
        if len(apenas_digitos) == 8:
            return apenas_digitos
        # Aceita yyyy-mm-dd vindo de input type="date"
        if len(raw) >= 10 and raw[4] == '-' and raw[7] == '-':
            return raw[:10].replace('-', '')
        return raw

    @staticmethod
    def _extract_data_list(payload) -> list[dict]:
        if isinstance(payload, list):
            return [x for x in payload if isinstance(x, dict)]
        if not isinstance(payload, dict):
            return []
        for key in ('data', 'resultado', 'resultados', 'itens', 'items', 'content'):
            value = payload.get(key)
            if isinstance(value, list):
                return [x for x in value if isinstance(x, dict)]
        return []

    @staticmethod
    def _retry_after_seconds(response, tentativa_rate_limit: int) -> float:
        header = (response.headers.get('Retry-After') or '').strip()
        if header.isdigit():
            return max(1.0, float(int(header)))
        # backoff progressivo quando a API nao informa Retry-After
        return min(12.0, 2.0 + (tentativa_rate_limit * 2.0))

    def _get(self, path: str, params: dict | None = None, base_url: str | None = None):
        url = f'{base_url or self.BASE_CONSULTA}{path}'

        last_network_error = None
        response = None
        tentativa_network = 0
        tentativa_rate_limit = 0
        while True:
            try:
                response = self.session.get(url, params=params or {}, timeout=self.timeout)
            except (ReadTimeout, RequestsTimeout, RequestsConnectionError) as exc:
                last_network_error = exc
                if tentativa_network >= self.max_retries:
                    msg = f'Falha de conexao/timeout no PNCP em {path} apos {tentativa_network + 1} tentativa(s)'
                    if params:
                        msg += f' | params={params}'
                    msg += ' | Dica: reduza o periodo da consulta e/ou o tamanho da pagina.'
                    raise RuntimeError(msg) from exc
                time.sleep(1.0 + (tentativa_network * 1.2))
                tentativa_network += 1
                continue

            if response.status_code == 429:
                if tentativa_rate_limit >= self.rate_limit_retries:
                    body = (response.text or '').strip().replace('\n', ' ')[:380]
                    msg = f'PNCP HTTP 429 em {path} apos {tentativa_rate_limit + 1} retentativa(s)'
                    if params:
                        msg += f' | params={params}'
                    if body:
                        msg += f' | resposta={body}'
                    raise RuntimeError(msg)
                espera = self._retry_after_seconds(response, tentativa_rate_limit)
                time.sleep(espera)
                tentativa_rate_limit += 1
                continue

            break

        if response is None:
            raise RuntimeError(f'Falha inesperada de rede no PNCP em {path}: {last_network_error}')

        try:
            response.raise_for_status()
        except HTTPError as exc:
            body = ''
            try:
                body = (response.text or '').strip().replace('\n', ' ')[:380]
            except Exception:
                body = ''
            msg = f'PNCP HTTP {response.status_code} em {path}'
            if params:
                msg += f' | params={params}'
            if body:
                msg += f' | resposta={body}'
            raise RuntimeError(msg) from exc

        raw_text = response.text or ''
        if not raw_text.strip():
            # Alguns endpoints retornam 200 sem corpo quando não há resultados.
            return {'data': []}

        try:
            return response.json()
        except Exception:
            try:
                return json.loads(raw_text)
            except Exception as exc:
                body = raw_text.strip().replace('\n', ' ')[:380]
                content_type = response.headers.get('Content-Type', '')
                raise RuntimeError(
                    f'Retorno PNCP nao-json em {path}. Content-Type: {content_type}. Corpo: {body}'
                ) from exc

    def _consultar_lista_por_controle(self, numero_controle: str, suffixes: list[str], strict: bool = False) -> list[dict]:
        numero = (numero_controle or '').strip()
        if not numero:
            if strict:
                raise ValueError('Numero de controle PNCP nao informado.')
            return []

        parsed = self._parse_numero_controle(numero)
        caminhos = []
        for suffix in suffixes:
            if suffix.startswith('/'):
                suffix = suffix[1:]
            caminhos.append(f'/v1/contratacoes/publicacao/{numero}/{suffix}')
            if parsed:
                caminhos.append(
                    f"/v1/orgaos/{parsed['cnpj']}/compras/{parsed['ano']}/{parsed['sequencial']}/{suffix}"
                )

        erros = []
        for caminho in caminhos:
            try:
                payload = self._get(caminho)
                lista = self._extract_data_list(payload)
                if lista:
                    return lista
                if isinstance(payload, dict):
                    # Endpoint respondeu sem erros porém sem dados.
                    return []
            except Exception as exc:
                erros.append(f'{caminho}: {exc}')
                continue

        if strict and erros:
            raise RuntimeError(' | '.join(erros[:3]))
        return []

    def _consultar_itens_pncp_api(self, parsed: dict, strict: bool = False) -> list[dict]:
        if not parsed:
            if strict:
                raise ValueError('Numero de controle PNCP invalido para consultar itens.')
            return []
        caminho = f"/v1/orgaos/{parsed['cnpj']}/compras/{parsed['ano']}/{parsed['sequencial']}/itens"
        try:
            payload = self._get(
                caminho,
                params={'pagina': 1, 'tamanhoPagina': 500},
                base_url=self.BASE_PNCP,
            )
            return self._extract_data_list(payload)
        except Exception:
            if strict:
                raise
            return []

    def _consultar_resultados_por_item_pncp_api(
        self,
        parsed: dict,
        numero_item: int,
        strict: bool = False,
    ) -> list[dict]:
        caminho = (
            f"/v1/orgaos/{parsed['cnpj']}/compras/{parsed['ano']}/{parsed['sequencial']}"
            f"/itens/{int(numero_item)}/resultados"
        )
        try:
            payload = self._get(caminho, base_url=self.BASE_PNCP)
            lista = self._extract_data_list(payload)
            out = []
            for row in lista:
                if not isinstance(row, dict):
                    continue
                if 'numeroItem' not in row:
                    row = dict(row)
                    row['numeroItem'] = int(numero_item)
                out.append(row)
            return out
        except Exception:
            if strict:
                raise
            return []

    def consultar(self, numero_controle: str) -> dict:
        numero_controle = (numero_controle or '').strip()
        if not numero_controle:
            raise ValueError('Informe o numero de controle do PNCP.')

        erros: list[str] = []
        # Endpoint currently used in the system.
        try:
            return self._get(f'/v1/contratacoes/publicacao/{numero_controle}')
        except Exception as exc:
            erros.append(f'publicacao/{numero_controle}: {exc}')

        parsed = self._parse_numero_controle(numero_controle)
        if parsed:
            try:
                return self._get(
                    f"/v1/orgaos/{parsed['cnpj']}/compras/{parsed['ano']}/{parsed['sequencial']}"
                )
            except Exception as exc:
                erros.append(
                    f"orgaos/{parsed['cnpj']}/compras/{parsed['ano']}/{parsed['sequencial']}: {exc}"
                )

        raise RuntimeError(
            'Nao foi possivel consultar o PNCP para este numero de controle. '
            + ' | '.join(erros)
        )

    def listar_publicacoes(
        self,
        *,
        data_inicial: str,
        data_final: str,
        codigo_modalidade_contratacao: int,
        uf: str | None = None,
        codigo_municipio_ibge: str | None = None,
        cnpj: str | None = None,
        pagina: int = 1,
        tamanho_pagina: int = 50,
    ) -> dict:
        params = {
            'dataInicial': self._normalizar_data_parametro(data_inicial),
            'dataFinal': self._normalizar_data_parametro(data_final),
            'codigoModalidadeContratacao': int(codigo_modalidade_contratacao),
            'pagina': int(pagina),
            'tamanhoPagina': int(tamanho_pagina),
        }
        if uf:
            params['uf'] = uf
        if codigo_municipio_ibge:
            params['codigoMunicipioIbge'] = codigo_municipio_ibge
        if cnpj:
            params['cnpj'] = cnpj
        return self._get('/v1/contratacoes/publicacao', params=params)

    def consultar_itens(self, numero_controle: str, strict: bool = False) -> list[dict]:
        numero = (numero_controle or '').strip()
        if not numero:
            if strict:
                raise ValueError('Numero de controle PNCP nao informado.')
            return []

        erros = []
        parsed = self._parse_numero_controle(numero)
        if parsed:
            try:
                itens = self._consultar_itens_pncp_api(parsed, strict=True)
                # Mesmo vazio pode ser retorno valido do endpoint.
                return itens
            except Exception as exc:
                erros.append(f"pncp/v1 orgaos/{parsed['cnpj']}/compras/{parsed['ano']}/{parsed['sequencial']}/itens: {exc}")

        try:
            itens_legado = self._consultar_lista_por_controle(
                numero,
                suffixes=['itens', 'items'],
                strict=False,
            )
            if itens_legado:
                return itens_legado
        except Exception as exc:
            erros.append(str(exc))

        if strict and erros:
            raise RuntimeError(' | '.join(erros[:3]))
        return []

    def consultar_resultados(self, numero_controle: str, strict: bool = False) -> list[dict]:
        numero = (numero_controle or '').strip()
        if not numero:
            if strict:
                raise ValueError('Numero de controle PNCP nao informado.')
            return []

        erros = []
        parsed = self._parse_numero_controle(numero)
        if parsed:
            try:
                itens = self._consultar_itens_pncp_api(parsed, strict=True)
                resultados = []
                for item in itens:
                    if not isinstance(item, dict):
                        continue
                    numero_item = item.get('numeroItem') or item.get('numeroItemCompra')
                    try:
                        numero_item = int(numero_item)
                    except Exception:
                        continue
                    # Reduz chamadas desnecessarias quando o proprio item informa ausencia de resultado.
                    if item.get('temResultado') is False:
                        continue
                    try:
                        rows = self._consultar_resultados_por_item_pncp_api(parsed, numero_item, strict=True)
                    except Exception as exc_item:
                        erros.append(f'item {numero_item}: {exc_item}')
                        continue
                    if rows:
                        resultados.extend(rows)
                    # intervalo curto para reduzir chance de 429 em compras com muitos itens
                    if self.result_item_sleep_seconds > 0:
                        time.sleep(self.result_item_sleep_seconds)
                if resultados:
                    return resultados
                # sem resultados tambem pode ser valido
                return []
            except Exception as exc:
                erros.append(f"pncp/v1 resultados por item: {exc}")

        try:
            resultados_legado = self._consultar_lista_por_controle(
                numero,
                suffixes=['resultados', 'resultado', 'resultado-itens'],
                strict=False,
            )
            if resultados_legado:
                return resultados_legado
        except Exception as exc:
            erros.append(str(exc))

        if strict and erros:
            raise RuntimeError(' | '.join(erros[:3]))
        return []

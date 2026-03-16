# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib.request import Request, urlopen

from django.db import transaction
from django.utils import timezone

from core.models import (
    FornecimentoItem,
    Lote,
    Modalidade,
    Pessoa,
    Processo,
    StatusProcesso,
)
from workflow.models import ProcessoWorkflow
from workflow.services.item_registry import sync_canonical_items_for_processo

DEFAULT_DADOS_LICITACAO_URL = "https://raw.githubusercontent.com/sergiocarneiro-adm/licitacao/main/dados.json"


def _fix_mojibake(text: str) -> str:
    value = str(text or "").strip()
    if not value:
        return ""
    try:
        fixed = value.encode("latin-1", errors="ignore").decode("utf-8", errors="ignore")
    except Exception:
        return value
    if not fixed or fixed == value:
        return value
    before = value.count("Ã")
    after = fixed.count("Ã")
    return fixed if after < before else value


def _safe_text(value, max_len: int | None = None) -> str:
    text = _fix_mojibake(value)
    if max_len and max_len > 0:
        return text[:max_len]
    return text


def _normalize_token(value) -> str:
    text = _safe_text(value)
    text = "".join(
        ch
        for ch in unicodedata.normalize("NFKD", text)
        if not unicodedata.combining(ch)
    )
    return text.upper().strip()


def _normalize_id(value: str) -> str:
    return "".join(ch for ch in _safe_text(value).upper() if ch.isalnum())


def _to_decimal(value, decimal_places: int | None = None) -> Decimal:
    text = _safe_text(value)
    if not text:
        dec = Decimal("0")
    else:
        text = (
            text.replace("R$", "")
            .replace("r$", "")
            .replace(" ", "")
        )
        text = "".join(ch for ch in text if ch.isdigit() or ch in {".", ",", "-"})
        if not text:
            dec = Decimal("0")
        else:
            if "," in text and "." in text:
                text = text.replace(".", "").replace(",", ".")
            elif "," in text:
                text = text.replace(",", ".")
            elif "." in text:
                parts = text.split(".")
                if len(parts) > 1 and all(part.isdigit() for part in parts):
                    if all(len(part) == 3 for part in parts[1:]):
                        text = "".join(parts)
            try:
                dec = Decimal(text)
            except (InvalidOperation, ValueError):
                dec = Decimal("0")
    if decimal_places is None:
        return dec
    quant = Decimal("1").scaleb(-int(decimal_places))
    return dec.quantize(quant)


def _to_int(value, default: int | None = None) -> int | None:
    text = _safe_text(value)
    if not text:
        return default
    digits = "".join(ch for ch in text if ch.isdigit() or ch == "-")
    if not digits:
        return default
    try:
        return int(digits)
    except ValueError:
        return default


def _to_bool(value, default: bool = False) -> bool:
    token = _normalize_token(value)
    if not token:
        return default
    if token in {"S", "SIM", "Y", "YES", "TRUE", "1"}:
        return True
    if token in {"N", "NAO", "NO", "FALSE", "0"}:
        return False
    return default


def _to_datetime(value):
    text = _safe_text(value)
    if not text:
        return None
    for fmt in ("%d/%m/%Y %H:%M", "%d/%m/%Y", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            parsed = datetime.strptime(text, fmt)
            if parsed.tzinfo:
                return parsed
            return timezone.make_aware(parsed, timezone.get_current_timezone())
        except ValueError:
            continue
    return None


def _extract_year(numero_adm: str, identificador: str, data_publicacao):
    for source in (numero_adm, identificador):
        text = _safe_text(source)
        match = re.search(r"(20\d{2})", text)
        if match:
            return int(match.group(1))
    dt = _to_datetime(data_publicacao)
    if dt:
        return int(dt.year)
    return int(timezone.localdate().year)


def _map_tipo_contratacao(raw_value: str) -> str:
    token = _normalize_token(raw_value)
    if not token:
        return Processo.TipoContratacao.AQUISICAO
    if "REGISTRO" in token or token == "SRP":
        return Processo.TipoContratacao.REGISTRO_PRECO
    if "PARCEL" in token:
        return Processo.TipoContratacao.AQUISICAO_PARCELADA
    return Processo.TipoContratacao.AQUISICAO


def _map_tipo_lance(raw_value: str) -> str:
    token = _normalize_token(raw_value)
    if "UNIT" in token:
        return "UNITARIO"
    if "KIT" in token:
        return "KIT"
    return "GLOBAL"


def _map_escopo(raw_value: str) -> str:
    token = _normalize_token(raw_value)
    if "ITEM" in token:
        return "ITEM"
    if "LOTE" in token:
        return "LOTE"
    if "GLOBAL" in token:
        return "GLOBAL"
    return "GLOBAL"


def _map_status_item(raw_value: str) -> str:
    token = _normalize_token(raw_value)
    if "HOMOLOG" in token or "ADJUDIC" in token:
        return FornecimentoItem.StatusItem.HOMOLOGADO
    if "FRACASS" in token or "DESERT" in token:
        return FornecimentoItem.StatusItem.FRACASSADO
    if "CANCEL" in token or "ANUL" in token or "REVOG" in token:
        return FornecimentoItem.StatusItem.CANCELADO
    return FornecimentoItem.StatusItem.PLANEJADO


def _get_or_create_modalidade(nome: str):
    label = _safe_text(nome, 60)
    return Modalidade.objects.get_or_create(nome=label or "Pregao")[0]


def _get_or_create_status(nome: str):
    label = _safe_text(nome, 60)
    return StatusProcesso.objects.get_or_create(nome=label or "EM PLANEJAMENTO")[0]


def _get_or_create_pessoa(nome: str, cargo: str):
    label = _safe_text(nome, 200)
    if not label:
        return None
    cargo_label = _safe_text(cargo, 120)
    pessoa, _ = Pessoa.objects.get_or_create(
        nome=label,
        defaults={"cargo": cargo_label},
    )
    if cargo_label and not (pessoa.cargo or "").strip():
        pessoa.cargo = cargo_label
        pessoa.save(update_fields=["cargo"])
    return pessoa


class LicitacaoJsonImporter:
    def __init__(self, *, sync_canonical: bool = True):
        self.sync_canonical = bool(sync_canonical)

    def load_payload_from_url(self, url: str = DEFAULT_DADOS_LICITACAO_URL, timeout: int = 120):
        req = Request(
            _safe_text(url),
            headers={"User-Agent": "SIREL-Modular/1.0 (+import-json-licitacao)"},
        )
        with urlopen(req, timeout=max(1, int(timeout))) as response:
            raw = response.read()
        return json.loads(raw.decode("utf-8-sig"))

    def load_payload_from_file(self, path: str):
        data = Path(path).read_bytes()
        return json.loads(data.decode("utf-8-sig"))

    def import_payload(self, payload, *, limit: int | None = None):
        processos = []
        metadata = {}

        if isinstance(payload, dict):
            metadata = payload.get("metadata") or {}
            processos = payload.get("processos") or payload.get("data") or []
        elif isinstance(payload, list):
            processos = payload
        else:
            raise ValueError("Payload JSON invalido para importacao.")

        if not isinstance(processos, list):
            raise ValueError("Estrutura JSON invalida: lista de processos nao encontrada.")

        resumo = {
            "processos_recebidos": len(processos),
            "processos_processados": 0,
            "processos_criados": 0,
            "processos_atualizados": 0,
            "lotes_criados": 0,
            "lotes_atualizados": 0,
            "itens_criados": 0,
            "itens_atualizados": 0,
            "erros": 0,
            "detalhes_erros": [],
            "metadata_origem": metadata,
        }

        alvo = processos
        if limit and int(limit) > 0:
            alvo = processos[: int(limit)]

        for indice, registro in enumerate(alvo, start=1):
            if not isinstance(registro, dict):
                resumo["erros"] += 1
                resumo["detalhes_erros"].append(
                    f"Registro {indice}: formato invalido (esperado objeto JSON)."
                )
                continue

            try:
                with transaction.atomic():
                    stats = self._importar_processo(registro)
            except Exception as exc:
                resumo["erros"] += 1
                ref = _safe_text(registro.get("id"), 60) or f"linha {indice}"
                resumo["detalhes_erros"].append(f"{ref}: {exc}")
                continue

            resumo["processos_processados"] += 1
            if stats["processo_criado"]:
                resumo["processos_criados"] += 1
            else:
                resumo["processos_atualizados"] += 1
            resumo["lotes_criados"] += stats["lotes_criados"]
            resumo["lotes_atualizados"] += stats["lotes_atualizados"]
            resumo["itens_criados"] += stats["itens_criados"]
            resumo["itens_atualizados"] += stats["itens_atualizados"]

        return resumo

    def _find_processo(
        self,
        *,
        identificador_bll: str,
        numero_adm: str,
        numero_edital: str,
        ano_referencia: int,
    ):
        if identificador_bll:
            by_bll = (
                Processo.objects
                .filter(identificador_bll__iexact=identificador_bll)
                .order_by("-id")
                .first()
            )
            if by_bll:
                return by_bll

        if numero_adm:
            by_numero_adm = (
                Processo.objects
                .filter(numero_processo_adm__iexact=numero_adm, ano_referencia=ano_referencia)
                .order_by("-id")
                .first()
            )
            if by_numero_adm:
                return by_numero_adm

        if numero_edital:
            by_numero_edital = (
                Processo.objects
                .filter(numero_edital__iexact=numero_edital, ano_referencia=ano_referencia)
                .order_by("-id")
                .first()
            )
            if by_numero_edital:
                return by_numero_edital

        numero_adm_norm = _normalize_id(numero_adm)
        numero_edital_norm = _normalize_id(numero_edital)
        if not numero_adm_norm and not numero_edital_norm:
            return None

        candidatos = (
            Processo.objects
            .filter(ano_referencia=ano_referencia)
            .only("id", "numero_processo_adm", "numero_edital", "identificador_bll")
            .order_by("-id")[:600]
        )
        for processo in candidatos:
            id_bll_norm = _normalize_id(processo.identificador_bll)
            adm_norm = _normalize_id(processo.numero_processo_adm)
            edital_norm = _normalize_id(processo.numero_edital)
            if numero_adm_norm and numero_adm_norm in {id_bll_norm, adm_norm, edital_norm}:
                return processo
            if numero_edital_norm and numero_edital_norm in {id_bll_norm, adm_norm, edital_norm}:
                return processo
        return None

    def _importar_processo(self, registro: dict):
        identificador_bll = _safe_text(registro.get("id"), 60)
        numero_adm = _safe_text(registro.get("numero_adm"), 40)
        numero_edital = _safe_text(registro.get("id"), 40)
        promotor = _safe_text(registro.get("promotor"), 255)
        link_bll = _safe_text(registro.get("link"), 500)
        situacao = _safe_text(registro.get("situacao"), 60)
        modalidade_nome = _safe_text(registro.get("modalidade"), 60)
        tipo_contrato = _safe_text(registro.get("tipo_contrato"), 60)
        objeto = _safe_text(registro.get("objeto"))

        ano_referencia = _extract_year(numero_adm, identificador_bll, registro.get("publicacao"))
        processo = self._find_processo(
            identificador_bll=identificador_bll,
            numero_adm=numero_adm,
            numero_edital=numero_edital,
            ano_referencia=ano_referencia,
        )
        processo_criado = processo is None
        if processo is None:
            processo = Processo(ano_referencia=ano_referencia)

        modalidade = _get_or_create_modalidade(modalidade_nome)
        status = _get_or_create_status(situacao or "EM PLANEJAMENTO")
        condutor = _get_or_create_pessoa(registro.get("condutor"), "Condutor do processo")
        autoridade = _get_or_create_pessoa(registro.get("autoridade"), "Autoridade competente")

        atualizacoes = {
            "ano_referencia": ano_referencia,
            "numero_processo_adm": numero_adm,
            "numero_edital": numero_edital,
            "identificador_bll": identificador_bll,
            "promotor_bll": promotor,
            "link_bll": link_bll,
            "objeto": objeto,
            "modalidade": modalidade,
            "status": status,
            "condutor_processo": condutor,
            "autoridade_competente": autoridade,
            "tipo_contratacao": _map_tipo_contratacao(tipo_contrato),
        }

        dt_publicacao = _to_datetime(registro.get("publicacao"))
        dt_inicio_recepcao = _to_datetime(registro.get("inicio_recepcao"))
        dt_fim_recepcao = _to_datetime(registro.get("fim_recepcao"))
        dt_inicio_disputa = _to_datetime(registro.get("inicio_disputa"))
        if dt_publicacao:
            atualizacoes["data_publicacao"] = dt_publicacao.date()
        if dt_inicio_recepcao:
            atualizacoes["inicio_recolhimento_propostas"] = dt_inicio_recepcao
        if dt_fim_recepcao:
            atualizacoes["fim_recolhimento_propostas"] = dt_fim_recepcao
        if dt_inicio_disputa:
            atualizacoes["data_hora_abertura"] = dt_inicio_disputa

        campos_alterados = []
        for campo, valor in atualizacoes.items():
            if valor in ("", None) and campo in {"numero_processo_adm", "numero_edital"}:
                continue
            if getattr(processo, campo) != valor:
                setattr(processo, campo, valor)
                campos_alterados.append(campo)

        if processo_criado:
            processo.save()
        elif campos_alterados:
            processo.save(update_fields=campos_alterados)

        lotes_payload = registro.get("lotes") if isinstance(registro.get("lotes"), list) else []
        lotes_db = {l.numero: l for l in processo.lotes.all()}
        itens_db = {
            (item.lote_id, item.numero_item): item
            for item in FornecimentoItem.objects.filter(processo=processo).select_related("lote")
        }

        lotes_criados = 0
        lotes_atualizados = 0
        itens_criados = 0
        itens_atualizados = 0
        total_estimado = Decimal("0.00")
        total_homologado = Decimal("0.00")

        ocorrencias_numero_item = {}
        for lote_payload in lotes_payload:
            if not isinstance(lote_payload, dict):
                continue
            itens_payload = lote_payload.get("itens") if isinstance(lote_payload.get("itens"), list) else []
            for item_payload in itens_payload:
                if not isinstance(item_payload, dict):
                    continue
                numero_item_externo = _to_int(item_payload.get("numero"))
                if numero_item_externo is None:
                    continue
                ocorrencias_numero_item[numero_item_externo] = (
                    ocorrencias_numero_item.get(numero_item_externo, 0) + 1
                )

        for lote_payload in lotes_payload:
            if not isinstance(lote_payload, dict):
                continue
            numero_lote = _to_int(lote_payload.get("numero"))
            if numero_lote is None:
                continue

            itens_payload = lote_payload.get("itens") if isinstance(lote_payload.get("itens"), list) else []
            status_lote = _safe_text(lote_payload.get("fase"), 50)
            titulo_lote = _safe_text(lote_payload.get("titulo"), 255) or f"Lote {numero_lote}"
            tipo_lote = _safe_text(lote_payload.get("tipo"), 30)
            qtd_itens = _to_int(lote_payload.get("total_itens"), default=len(itens_payload)) or len(itens_payload)
            quantidade = _to_decimal(lote_payload.get("quantidade"), decimal_places=3)
            intervalo_minimo = _to_decimal(lote_payload.get("intervalo_minimo"), decimal_places=2)
            valor_referencia = _to_decimal(lote_payload.get("valor_referencia"), decimal_places=2)
            melhor_oferta = _to_decimal(lote_payload.get("melhor_oferta"), decimal_places=2)
            vencedor = _safe_text(lote_payload.get("vencedor"), 255)
            exclusivo_me = _to_bool(lote_payload.get("exclusivo_me"))
            local_entrega = _safe_text(lote_payload.get("local_entrega"), 255)
            garantia = _safe_text(lote_payload.get("garantia"), 255)

            lote = lotes_db.get(numero_lote)
            lote_criado = lote is None
            if lote_criado:
                lote = Lote(processo=processo, numero=numero_lote)

            atualizacoes_lote = {
                "titulo": titulo_lote,
                "status": status_lote,
                "escopo": _map_escopo(tipo_lote),
                "qtd_itens": qtd_itens,
                "quantidade": quantidade,
                "intervalo_minimo": intervalo_minimo,
                "exclusivo_me": exclusivo_me,
                "local_entrega": local_entrega,
                "garantia": garantia,
                "valor_referencia": valor_referencia,
                "melhor_oferta": melhor_oferta,
                "vencedor": vencedor,
                "tipo_lance": _map_tipo_lance(tipo_lote),
            }

            campos_lote = []
            for campo, valor in atualizacoes_lote.items():
                if getattr(lote, campo) != valor:
                    setattr(lote, campo, valor)
                    campos_lote.append(campo)

            if lote_criado:
                lote.save()
                lotes_criados += 1
                lotes_db[numero_lote] = lote
            elif campos_lote:
                lote.save(update_fields=campos_lote)
                lotes_atualizados += 1

            soma_itens_lote = Decimal("0.00")
            status_item = _map_status_item(status_lote or situacao)
            for item_payload in itens_payload:
                if not isinstance(item_payload, dict):
                    continue
                numero_item_externo = _to_int(item_payload.get("numero"))
                if numero_item_externo is None:
                    continue
                numero_item = int(numero_item_externo)
                if ocorrencias_numero_item.get(numero_item_externo, 0) > 1:
                    numero_item = (int(numero_lote) * 1000) + int(numero_item_externo)

                quantidade_item = _to_decimal(item_payload.get("quantidade"), decimal_places=3)
                valor_referencia_item = _to_decimal(item_payload.get("valor_referencia"), decimal_places=4)
                valor_total_item = (quantidade_item * valor_referencia_item).quantize(Decimal("0.01"))
                soma_itens_lote += valor_total_item

                item = itens_db.get((lote.id, numero_item))
                item_criado = item is None
                if item_criado:
                    item = FornecimentoItem(processo=processo, lote=lote, numero_item=numero_item)

                atualizacoes_item = {
                    "descricao": _safe_text(item_payload.get("especificacao")),
                    "unidade": _safe_text(item_payload.get("unidade"), 50),
                    "quantidade": quantidade_item,
                    "valor_unitario": valor_referencia_item,
                    "valor_total": valor_total_item,
                    "valor_unitario_estimado": valor_referencia_item,
                    "valor_total_estimado": valor_total_item,
                    "codigo_item_externo": str(int(numero_item_externo)),
                    "status_item": status_item,
                }

                campos_item = []
                for campo, valor in atualizacoes_item.items():
                    if getattr(item, campo) != valor:
                        setattr(item, campo, valor)
                        campos_item.append(campo)

                if item_criado:
                    item.save()
                    itens_criados += 1
                    itens_db[(lote.id, numero_item)] = item
                elif campos_item:
                    item.save(update_fields=campos_item)
                    itens_atualizados += 1

            if valor_referencia > 0:
                total_estimado += valor_referencia
            else:
                total_estimado += soma_itens_lote
            if melhor_oferta > 0:
                total_homologado += melhor_oferta

        if lotes_payload:
            campos_total = []
            total_estimado = total_estimado.quantize(Decimal("0.01"))
            total_homologado = total_homologado.quantize(Decimal("0.01"))
            if processo.valor_estimado != total_estimado:
                processo.valor_estimado = total_estimado
                campos_total.append("valor_estimado")
            if processo.valor_homologado != total_homologado:
                processo.valor_homologado = total_homologado
                campos_total.append("valor_homologado")
            if campos_total:
                processo.save(update_fields=campos_total)

        if self.sync_canonical:
            sync_canonical_items_for_processo(processo)

        wf, _ = ProcessoWorkflow.objects.get_or_create(processo=processo)
        wf.bll_ultima_importacao = timezone.now()
        wf.save(update_fields=["bll_ultima_importacao", "atualizado_em"])

        return {
            "processo_id": processo.id,
            "processo_criado": processo_criado,
            "lotes_criados": lotes_criados,
            "lotes_atualizados": lotes_atualizados,
            "itens_criados": itens_criados,
            "itens_atualizados": itens_atualizados,
        }

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sys
from dataclasses import asdict, dataclass
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any


THIS_FILE = Path(__file__).resolve()
MODERN_ROOT = THIS_FILE.parents[1]
REPO_ROOT = THIS_FILE.parents[2]
DEFAULT_OUTPUT = MODERN_ROOT / "storage" / "migration" / "legacy_snapshot.json"

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "licitaweb.settings")

import django  # noqa: E402

django.setup()

from django.conf import settings  # noqa: E402
from django.contrib.auth import get_user_model  # noqa: E402
from django.db.models import Q  # noqa: E402
from django.utils import timezone  # noqa: E402

from core.models import (  # noqa: E402
    Contrato,
    Fornecedor,
    Modalidade,
    OrgaoEntidade,
    Pessoa,
    Processo,
    Secretaria,
    StatusProcesso,
)
from docs.models import ProcessoAnexo  # noqa: E402
from workflow.models import DocumentoProcessoWorkflow, ProcessoMovimentacao, ProcessoWorkflow  # noqa: E402


def _serialize_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return value


def _file_payload(file_field) -> dict[str, Any]:
    if not file_field:
        return {"name": "", "path": "", "absolute_path": "", "url": "", "size_bytes": 0, "mime_type": ""}
    try:
        absolute_path = str(Path(file_field.path).resolve())
    except Exception:
        absolute_path = ""
    size_bytes = 0
    mime_type = ""
    if absolute_path and Path(absolute_path).exists():
        try:
            size_bytes = Path(absolute_path).stat().st_size
        except OSError:
            size_bytes = 0
        mime_type = mimetypes.guess_type(absolute_path)[0] or ""
    return {
        "name": file_field.name or "",
        "path": file_field.name or "",
        "absolute_path": absolute_path,
        "url": getattr(file_field, "url", "") or "",
        "size_bytes": size_bytes,
        "mime_type": mime_type,
    }


def _processo_numero_sirel(processo: Processo) -> str:
    numero = (processo.numero_processo_sirel or "").strip()
    if numero:
        return numero
    return f"{processo.id:04d}/{processo.ano_referencia}"


def _user_role(user) -> str:
    if getattr(user, "is_superuser", False):
        return "admin"
    if getattr(user, "is_staff", False):
        return "gestor"
    return "operador"


def _parse_since(value: str | None) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def _window_q(since: datetime | None, until: datetime, *fields: str) -> Q:
    if since is None:
        return Q()
    query = Q()
    for field in fields:
        query |= Q(**{f"{field}__gt": since, f"{field}__lte": until})
    return query


@dataclass
class SnapshotMeta:
    generated_at: str
    source_database: str
    media_root: str
    base_dir: str


def export_snapshot(*, mode: str = "full", since: datetime | None = None) -> dict[str, Any]:
    user_model = get_user_model()
    orgao = OrgaoEntidade.objects.order_by("-atualizado_em", "-id").first()
    sync_until = timezone.now()
    incremental = mode == "incremental" and since is not None

    payload: dict[str, Any] = {
        "meta": asdict(
            SnapshotMeta(
                generated_at=timezone.localtime(sync_until).isoformat(),
                source_database=str(settings.DATABASES["default"]["NAME"]),
                media_root=str(settings.MEDIA_ROOT),
                base_dir=str(settings.BASE_DIR),
            )
        ),
        "orgao": None,
        "users": [],
        "secretarias": [],
        "modalidades": [],
        "status_processo": [],
        "pessoas": [],
        "processos": [],
        "workflow": [],
        "movimentacoes_workflow": [],
        "fornecedores": [],
        "documentos": [],
        "contratos": [],
        "summary": {},
    }
    payload["meta"]["sync"] = {
        "mode": "incremental" if incremental else "full",
        "since": since.isoformat() if since else None,
        "until": sync_until.isoformat(),
        "summary": {},
    }

    if orgao:
        payload["orgao"] = {
            "legacy_id": orgao.id,
            "nome_fantasia": orgao.nome_fantasia,
            "razao_social": orgao.razao_social,
            "cnpj": orgao.cnpj,
            "endereco_completo": orgao.endereco_completo,
            "email": orgao.email,
            "telefone": orgao.telefone,
            "site": orgao.site,
            "logo": _file_payload(orgao.logo),
        }

    payload["users"] = [
        {
            "legacy_id": user.id,
            "username": user.username,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "name": user.get_full_name() or user.username,
            "email": user.email,
            "is_superuser": user.is_superuser,
            "is_staff": user.is_staff,
            "is_active": user.is_active,
            "date_joined": _serialize_value(user.date_joined),
            "last_login": _serialize_value(user.last_login),
            "suggested_role": _user_role(user),
        }
        for user in user_model.objects.order_by("id")
    ]

    payload["secretarias"] = [
        {"legacy_id": row.id, "sigla": row.sigla, "nome": row.nome}
        for row in Secretaria.objects.order_by("sigla")
    ]
    payload["modalidades"] = [
        {"legacy_id": row.id, "nome": row.nome, "base_legal": row.base_legal}
        for row in Modalidade.objects.order_by("nome")
    ]
    payload["status_processo"] = [
        {"legacy_id": row.id, "nome": row.nome}
        for row in StatusProcesso.objects.order_by("nome")
    ]
    payload["pessoas"] = [
        {
            "legacy_id": row.id,
            "nome": row.nome,
            "cpf": row.cpf,
            "cargo": row.cargo,
            "secretaria_legacy_id": row.secretaria_id,
        }
        for row in Pessoa.objects.select_related("secretaria").order_by("nome")
    ]

    processos_qs = Processo.objects.select_related(
        "secretaria", "modalidade", "status", "autoridade_competente", "condutor_processo"
    ).order_by("id")
    if incremental:
        processos_qs = processos_qs.filter(_window_q(since, sync_until, "atualizado_em", "criado_em"))

    payload["processos"] = [
        {
            "legacy_id": row.id,
            "numero_sirel": _processo_numero_sirel(row),
            "numero_administrativo": row.numero_processo_adm,
            "numero_edital": row.numero_edital,
            "protocolo": row.protocolo,
            "identificador_bll": row.identificador_bll,
            "promotor_bll": row.promotor_bll,
            "link_bll": row.link_bll,
            "ano_referencia": row.ano_referencia,
            "secretaria_legacy_id": row.secretaria_id,
            "modalidade_legacy_id": row.modalidade_id,
            "status_legacy_id": row.status_id,
            "objeto": row.objeto,
            "escopo_disputa": row.escopo_disputa,
            "criterio_julgamento": row.criterio_julgamento,
            "modo_disputa": row.modo_disputa,
            "tipo_objeto": row.tipo_objeto,
            "tipo_contratacao": row.tipo_contratacao,
            "dispensa_com_disputa": row.dispensa_com_disputa,
            "autoridade_competente_legacy_id": row.autoridade_competente_id,
            "condutor_processo_legacy_id": row.condutor_processo_id,
            "data_publicacao": _serialize_value(row.data_publicacao),
            "data_hora_abertura": _serialize_value(row.data_hora_abertura),
            "inicio_recolhimento_propostas": _serialize_value(row.inicio_recolhimento_propostas),
            "fim_recolhimento_propostas": _serialize_value(row.fim_recolhimento_propostas),
            "fim_impugnacao_esclarecimentos": _serialize_value(row.fim_impugnacao_esclarecimentos),
            "valor_estimado": _serialize_value(row.valor_estimado),
            "valor_homologado": _serialize_value(row.valor_homologado),
            "criado_em": _serialize_value(row.criado_em),
            "atualizado_em": _serialize_value(row.atualizado_em),
        }
        for row in processos_qs
    ]

    workflow_qs = ProcessoWorkflow.objects.select_related("processo").order_by("processo_id")
    if incremental:
        workflow_qs = workflow_qs.filter(_window_q(since, sync_until, "atualizado_em", "criado_em"))

    payload["workflow"] = [
        {
            "legacy_id": row.id,
            "processo_legacy_id": row.processo_id,
            "processo_numero_sirel": _processo_numero_sirel(row.processo),
            "modulo_atual": row.modulo_atual,
            "situacao": row.situacao,
            "etapa_atual": row.etapa_atual,
            "irp_aplicavel": row.irp_aplicavel,
            "divisao_por_secretaria": row.divisao_por_secretaria,
            "publicado": row.publicado,
            "homologado": row.homologado,
            "finalizado_licitacao": row.finalizado_licitacao,
            "pncp_numero_controle": row.pncp_numero_controle,
            "pncp_ultima_importacao": _serialize_value(row.pncp_ultima_importacao),
            "bll_ultima_importacao": _serialize_value(row.bll_ultima_importacao),
            "criado_em": _serialize_value(row.criado_em),
            "atualizado_em": _serialize_value(row.atualizado_em),
        }
        for row in workflow_qs
    ]

    movimentacoes_qs = ProcessoMovimentacao.objects.select_related("processo").order_by("id")
    if incremental:
        movimentacoes_qs = movimentacoes_qs.filter(_window_q(since, sync_until, "criado_em"))

    payload["movimentacoes_workflow"] = [
        {
            "legacy_id": row.id,
            "processo_legacy_id": row.processo_id,
            "processo_numero_sirel": _processo_numero_sirel(row.processo),
            "modulo_origem": row.modulo_origem,
            "modulo_destino": row.modulo_destino,
            "descricao": row.descricao,
            "observacao": row.observacao,
            "criado_em": _serialize_value(row.criado_em),
        }
        for row in movimentacoes_qs
    ]

    payload["fornecedores"] = [
        {
            "legacy_id": row.id,
            "razao_social": row.razao_social,
            "cnpj": row.cnpj,
            "email": row.email,
            "telefone": row.telefone,
            "endereco": row.endereco,
            "bairro": row.bairro,
            "complemento": row.complemento,
            "cep": row.cep,
            "cidade": row.cidade,
            "estado": row.estado,
        }
        for row in Fornecedor.objects.order_by("id")
    ]

    workflow_docs_qs = DocumentoProcessoWorkflow.objects.select_related("processo").order_by("processo_id", "ordem_cronologica", "id")
    if incremental:
        workflow_docs_qs = workflow_docs_qs.filter(_window_q(since, sync_until, "criado_em"))
    workflow_docs = [
        {
            "source": "workflow_documento",
            "legacy_id": row.id,
            "processo_legacy_id": row.processo_id,
            "processo_numero_sirel": _processo_numero_sirel(row.processo),
            "tipo": row.tipo_documento,
            "categoria": row.modulo,
            "titulo": row.tipo_documento,
            "descricao": f"Documento do workflow do modulo {row.modulo}",
            "versao": 1,
            "ordem_cronologica": row.ordem_cronologica,
            "gerar_no_etcm": row.gerar_no_etcm,
            "arquivo": _file_payload(row.arquivo),
            "criado_em": _serialize_value(row.criado_em),
        }
        for row in workflow_docs_qs
    ]

    anexos_docs_qs = ProcessoAnexo.objects.select_related("processo").order_by("processo_id", "id")
    if incremental:
        anexos_docs_qs = anexos_docs_qs.filter(_window_q(since, sync_until, "uploaded_at"))
    anexos_docs = [
        {
            "source": "processo_anexo",
            "legacy_id": row.id,
            "processo_legacy_id": row.processo_id,
            "processo_numero_sirel": _processo_numero_sirel(row.processo),
            "tipo": row.tipo,
            "categoria": "ANEXO",
            "titulo": row.descricao or row.get_tipo_display(),
            "descricao": row.descricao,
            "versao": 1,
            "ordem_cronologica": row.id,
            "gerar_no_etcm": True,
            "arquivo": _file_payload(row.arquivo),
            "criado_em": _serialize_value(row.uploaded_at),
        }
        for row in anexos_docs_qs
    ]
    payload["documentos"] = workflow_docs + anexos_docs

    payload["contratos"] = [
        {
            "legacy_id": row.id,
            "processo_legacy_id": row.processo_id,
            "processo_numero_sirel": _processo_numero_sirel(row.processo),
            "fornecedor_legacy_id": row.fornecedor_id,
            "fornecedor_cnpj": row.fornecedor.cnpj,
            "secretaria_legacy_id": row.secretaria_id,
            "numero": row.numero,
            "objeto": row.objeto,
            "data_assinatura": _serialize_value(row.data_assinatura),
            "vigencia_inicio": _serialize_value(row.vigencia_inicio),
            "vigencia_fim": _serialize_value(row.vigencia_fim),
            "valor_inicial": _serialize_value(row.valor_inicial),
            "valor_atual": _serialize_value(row.valor_atual),
            "publicado_em": _serialize_value(row.publicado_em),
            "link_publicacao": row.link_publicacao,
        }
        for row in Contrato.objects.select_related("processo", "fornecedor", "secretaria").order_by("id")
    ]

    payload["summary"] = {
        "users": len(payload["users"]),
        "secretarias": len(payload["secretarias"]),
        "modalidades": len(payload["modalidades"]),
        "status_processo": len(payload["status_processo"]),
        "pessoas": len(payload["pessoas"]),
        "processos": len(payload["processos"]),
        "workflow": len(payload["workflow"]),
        "movimentacoes_workflow": len(payload["movimentacoes_workflow"]),
        "fornecedores": len(payload["fornecedores"]),
        "documentos": len(payload["documentos"]),
        "contratos": len(payload["contratos"]),
    }
    payload["meta"]["sync"]["summary"] = {
        "processos": len(payload["processos"]),
        "workflow": len(payload["workflow"]),
        "movimentacoes_workflow": len(payload["movimentacoes_workflow"]),
        "documentos": len(payload["documentos"]),
        "contratos": len(payload["contratos"]),
    }

    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description="Exporta snapshot do legado Django para a Beta 2.0")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="Arquivo JSON de saída")
    parser.add_argument("--mode", choices=["full", "incremental"], default="full", help="Modo de exportação")
    parser.add_argument("--since", default="", help="Timestamp ISO para exportação incremental")
    args = parser.parse_args()

    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    payload = export_snapshot(mode=args.mode, since=_parse_since(args.since))
    output.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"Snapshot exportado para: {output}")
    print(json.dumps(payload["meta"]["sync"], indent=2, ensure_ascii=False))
    print(json.dumps(payload["summary"], indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

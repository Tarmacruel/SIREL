from decimal import Decimal

from django.core.paginator import Paginator
from django.db.models import Q, Sum
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404, render

from core.models import Modalidade, Processo, ProcessoItem, Secretaria, StatusProcesso
from docs.models import ProcessoAnexo


PUBLIC_STATUS_MARKERS = (
    "PUBLIC",
    "HOMOLOG",
    "CONCLU",
    "ADJUD",
    "RESULT",
    "FRACASS",
    "DESERT",
    "SUSPENS",
    "REVOG",
    "ANUL",
)

# Exposicao publica restrita a documentos tipicos de publicidade.
PUBLIC_ANEXO_TIPOS = {
    ProcessoAnexo.Tipo.EDITAL,
    ProcessoAnexo.Tipo.AVISO,
}


def _build_public_status_q():
    status_q = Q()
    for marker in PUBLIC_STATUS_MARKERS:
        status_q |= Q(status__nome__icontains=marker)
    return status_q


def _queryset_processos_publicos():
    status_q = _build_public_status_q()
    return (
        Processo.objects.select_related(
            "modalidade",
            "secretaria",
            "status",
            "workflow",
            "pncp_snapshot",
        )
        .filter(
            Q(workflow__publicado=True)
            | Q(data_publicacao__isnull=False)
            | Q(pncp_snapshot__data_publicacao_pncp__isnull=False)
            | status_q
        )
        .distinct()
    )


def _doc_masked(documento: str) -> str:
    digits = "".join(ch for ch in str(documento or "") if ch.isdigit())
    if len(digits) == 14:
        return f"{digits[:2]}.***.***/****-{digits[-2:]}"
    if len(digits) == 11:
        return f"***.***.***-{digits[-2:]}"
    if not digits:
        return "-"
    if len(digits) <= 4:
        return "*" * len(digits)
    return f"{'*' * (len(digits) - 4)}{digits[-4:]}"


def _public_eventos(processo: Processo):
    eventos = []
    snapshot = getattr(processo, "pncp_snapshot", None)
    if processo.data_publicacao:
        eventos.append({"data": processo.data_publicacao, "descricao": "Publicacao oficial"})
    elif snapshot and snapshot.data_publicacao_pncp:
        eventos.append({"data": snapshot.data_publicacao_pncp, "descricao": "Publicacao no PNCP"})
    if processo.data_hora_abertura:
        eventos.append({"data": processo.data_hora_abertura.date(), "descricao": "Abertura da sessao"})
    if processo.status and processo.status.nome:
        eventos.append({"data": None, "descricao": f"Situacao atual: {processo.status.nome}"})
    return eventos


def lista_licitacoes(request):
    q = (request.GET.get("q") or "").strip()
    ano = (request.GET.get("ano") or "").strip()
    modalidade = (request.GET.get("modalidade") or "").strip()
    secretaria = (request.GET.get("secretaria") or "").strip()
    status = (request.GET.get("status") or "").strip()
    pagina = (request.GET.get("page") or "").strip()

    base_publicos = _queryset_processos_publicos()
    queryset = base_publicos

    if q:
        queryset = queryset.filter(
            Q(numero_edital__icontains=q)
            | Q(numero_processo_sirel__icontains=q)
            | Q(numero_processo_adm__icontains=q)
            | Q(objeto__icontains=q)
            | Q(pncp_snapshot__numero_controle_pncp__icontains=q)
        )
    if ano and ano.isdigit():
        queryset = queryset.filter(ano_referencia=int(ano))
    if modalidade and modalidade.isdigit():
        queryset = queryset.filter(modalidade_id=int(modalidade))
    if secretaria and secretaria.isdigit():
        queryset = queryset.filter(secretaria_id=int(secretaria))
    if status and status.isdigit():
        queryset = queryset.filter(status_id=int(status))

    queryset = queryset.annotate(
        data_publicacao_ref=Coalesce("data_publicacao", "pncp_snapshot__data_publicacao_pncp")
    ).order_by("-data_publicacao_ref", "-ano_referencia", "-id")

    paginator = Paginator(queryset, 20)
    page_obj = paginator.get_page(pagina if pagina.isdigit() else 1)

    agregados = queryset.aggregate(
        total_estimado=Sum("valor_estimado"),
        total_homologado=Sum("valor_homologado"),
    )
    total_estimado = (agregados.get("total_estimado") or Decimal("0")).quantize(Decimal("0.01"))
    total_homologado = (agregados.get("total_homologado") or Decimal("0")).quantize(Decimal("0.01"))

    ctx = {
        "lista": page_obj.object_list,
        "page_obj": page_obj,
        "total_processos": queryset.count(),
        "total_estimado": total_estimado,
        "total_homologado": total_homologado,
        "modalidades": Modalidade.objects.filter(id__in=base_publicos.values("modalidade_id")).order_by("nome"),
        "secretarias": Secretaria.objects.filter(id__in=base_publicos.values("secretaria_id")).order_by("sigla", "nome"),
        "statuses": StatusProcesso.objects.filter(id__in=base_publicos.values("status_id")).order_by("nome"),
        "anos_disponiveis": (
            base_publicos.exclude(ano_referencia__isnull=True)
            .values_list("ano_referencia", flat=True)
            .distinct()
            .order_by("-ano_referencia")
        ),
        "q": q,
        "ano": ano,
        "modalidade": modalidade,
        "secretaria": secretaria,
        "status": status,
    }
    return render(request, "publico/lista.html", ctx)


def detalhe_licitacao(request, pk):
    proc = get_object_or_404(_queryset_processos_publicos(), pk=pk)
    anexos = (
        ProcessoAnexo.objects.filter(processo=proc, tipo__in=PUBLIC_ANEXO_TIPOS)
        .order_by("-uploaded_at")
    )
    itens_qs = (
        ProcessoItem.objects.filter(processo=proc)
        .select_related("fornecedor_homologado")
        .order_by("numero_item")
    )
    itens_publicos = []
    for item in itens_qs[:300]:
        fornecedor_nome = (
            item.fornecedor_homologado.razao_social
            if item.fornecedor_homologado else "-"
        )
        fornecedor_doc = (
            _doc_masked(item.fornecedor_homologado.cnpj)
            if item.fornecedor_homologado else "-"
        )
        itens_publicos.append(
            {
                "numero_item": item.numero_item,
                "descricao": item.descricao_snapshot,
                "quantidade": item.quantidade,
                "unidade": item.unidade_snapshot or "-",
                "status": item.get_status_consolidado_display(),
                "valor_referencia_total": item.valor_referencia_total,
                "valor_homologado_total": item.valor_homologado_total,
                "fornecedor_nome": fornecedor_nome,
                "fornecedor_doc": fornecedor_doc,
            }
        )

    return render(
        request,
        "publico/detalhe.html",
        {
            "p": proc,
            "anexos": anexos,
            "itens": itens_publicos,
            "eventos": _public_eventos(proc),
        },
    )

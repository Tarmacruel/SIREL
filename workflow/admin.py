from django.contrib import admin
from .models import (
    ProcessoWorkflow,
    ProcessoMovimentacao,
    IntegracaoProcesso,
    PNCPDetalhamentoFila,
    DocumentoProcessoWorkflow,
    PNCPContratacaoSnapshot,
    FrequenciaRegistro,
)

@admin.register(ProcessoWorkflow)
class ProcessoWorkflowAdmin(admin.ModelAdmin):
    list_display = ('processo', 'modulo_atual', 'etapa_atual', 'situacao', 'publicado', 'homologado', 'finalizado_licitacao')
    list_filter = ('modulo_atual', 'situacao', 'publicado', 'homologado', 'finalizado_licitacao')
    search_fields = ('processo__numero_processo_adm', 'processo__numero_edital', 'processo__objeto', 'pncp_numero_controle')

@admin.register(ProcessoMovimentacao)
class ProcessoMovimentacaoAdmin(admin.ModelAdmin):
    list_display = ('processo', 'modulo_origem', 'modulo_destino', 'descricao', 'criado_em')
    list_filter = ('modulo_origem', 'modulo_destino')
    search_fields = ('processo__numero_processo_adm', 'processo__numero_edital', 'descricao')

@admin.register(IntegracaoProcesso)
class IntegracaoProcessoAdmin(admin.ModelAdmin):
    list_display = ('processo', 'tipo', 'identificador_externo', 'status', 'criado_em')
    list_filter = ('tipo', 'status')
    search_fields = ('processo__numero_processo_adm', 'processo__numero_edital', 'identificador_externo', 'mensagem')


@admin.register(PNCPDetalhamentoFila)
class PNCPDetalhamentoFilaAdmin(admin.ModelAdmin):
    list_display = ('processo', 'numero_controle_pncp', 'status', 'prioridade', 'tentativas', 'atualizado_em')
    list_filter = ('status', 'prioridade', 'origem')
    search_fields = ('processo__numero_processo_adm', 'processo__numero_edital', 'numero_controle_pncp', 'ultimo_erro')

@admin.register(DocumentoProcessoWorkflow)
class DocumentoProcessoWorkflowAdmin(admin.ModelAdmin):
    list_display = ('processo', 'modulo', 'tipo_documento', 'ordem_cronologica', 'gerar_no_etcm', 'criado_em')
    list_filter = ('modulo', 'gerar_no_etcm')
    search_fields = ('processo__numero_processo_adm', 'processo__numero_edital', 'tipo_documento')


@admin.register(PNCPContratacaoSnapshot)
class PNCPContratacaoSnapshotAdmin(admin.ModelAdmin):
    list_display = (
        'processo',
        'numero_controle_pncp',
        'numero_compra',
        'ano_compra',
        'modalidade_nome',
        'situacao_compra_nome',
        'valor_total_estimado',
        'atualizado_em',
    )
    search_fields = (
        'numero_controle_pncp',
        'numero_compra',
        'processo_origem',
        'objeto_compra',
        'processo__numero_processo_adm',
    )
    list_filter = ('modalidade_nome', 'situacao_compra_nome', 'srp')


@admin.register(FrequenciaRegistro)
class FrequenciaRegistroAdmin(admin.ModelAdmin):
    list_display = (
        'usuario',
        'data',
        'nao_trabalhado_util',
        'horas_trabalhadas_minutos',
        'horas_extras_minutos',
        'atualizado_em',
    )
    list_filter = ('nao_trabalhado_util', 'data', 'usuario')
    search_fields = ('usuario__username', 'usuario__first_name', 'usuario__last_name')

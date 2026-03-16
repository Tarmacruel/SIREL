from django.contrib.auth.decorators import login_required
from django.contrib.auth import views as auth_views
from django.urls import path, reverse_lazy

from . import views

app_name = 'workflow'


urlpatterns = [
    path(
        'login/',
        auth_views.LoginView.as_view(
            template_name='workflow/login.html',
            redirect_authenticated_user=True,
        ),
        name='login',
    ),
    path(
        'logout/',
        auth_views.LogoutView.as_view(template_name='workflow/logout.html'),
        name='logout',
    ),
    path(
        'senha/',
        login_required(
            auth_views.PasswordChangeView.as_view(
                template_name='workflow/password_change.html',
                success_url=reverse_lazy('workflow:password_change_done'),
            )
        ),
        name='password_change',
    ),
    path(
        'senha/sucesso/',
        login_required(auth_views.PasswordChangeDoneView.as_view(template_name='workflow/password_change_done.html')),
        name='password_change_done',
    ),
    path('perfil/', login_required(views.perfil_usuario), name='perfil'),

    path('', login_required(views.home), name='home'),
    path('cadastros/', login_required(views.cadastros_dashboard), name='cadastros_dashboard'),
    path('cadastros/<str:tipo>/', login_required(views.cadastros_tipo), name='cadastros_tipo'),
    path('dashboards/', login_required(views.dashboards_geral), name='dashboards_geral'),
    path('itens/', login_required(views.itens_rastreamento), name='itens_rastreamento'),
    path('frequencia/', login_required(views.frequencia), name='frequencia'),
    path('frequencia/preview/', login_required(views.frequencia_preview_embed), name='frequencia_preview_embed'),
    path('frequencia/exportar/<str:formato>/', login_required(views.frequencia_exportar), name='frequencia_exportar'),
    path('modulos/', login_required(views.modulos), name='modulos'),
    path('modulos/<str:modulo>/', login_required(views.modulo_detail), name='modulo_detail'),
    path(
        'documentos/processo/<int:processo_id>/integral/pdf/',
        login_required(views.documentos_gerar_processo_pdf),
        name='documentos_gerar_processo_pdf',
    ),
    path(
        'documentos/processo/<int:processo_id>/etcm/',
        login_required(views.documentos_gerar_processo_etcm),
        name='documentos_gerar_processo_etcm',
    ),
    path('licitacao/novo-externo/', login_required(views.licitacao_novo_externo), name='licitacao_novo_externo'),
    path('licitacao/<int:processo_id>/', login_required(views.licitacao_detail), name='licitacao_detail'),
    path(
        'licitacao/<int:processo_id>/documentos/<str:codigo>/html/',
        login_required(views.licitacao_ci_documento),
        name='licitacao_ci_documento',
    ),
    path(
        'licitacao/<int:processo_id>/edital/html/',
        login_required(views.licitacao_edital_generator),
        name='licitacao_edital_generator',
    ),
    path(
        'licitacao/<int:processo_id>/relatorio-pendencias/',
        login_required(views.licitacao_relatorio_pendencias),
        name='licitacao_relatorio_pendencias',
    ),
    path(
        'licitacao/<int:processo_id>/documentos/upload/',
        login_required(views.licitacao_upload_documento),
        name='licitacao_upload_documento',
    ),
    path('integracoes/', login_required(views.integracoes), name='integracoes'),
    path('integracoes/pncp/', login_required(views.importar_pncp), name='importar_pncp'),
    path('integracoes/pncp/fila/processar/', login_required(views.processar_fila_pncp_manual), name='processar_fila_pncp'),
    path(
        'integracoes/pncp/publicacoes/',
        login_required(views.importar_pncp_publicacoes_auto),
        name='importar_pncp_publicacoes',
    ),
    path(
        'integracoes/pncp/publicacoes/status/',
        login_required(views.importar_pncp_publicacoes_status),
        name='importar_pncp_publicacoes_status',
    ),
    path('integracoes/bll/', login_required(views.importar_bll), name='importar_bll'),
    path('processos/<int:processo_id>/', login_required(views.processo_resumo), name='processo_resumo'),
    path(
        'processos/<int:processo_id>/documentos-assinados/upload/',
        login_required(views.processo_upload_documento_assinado),
        name='processo_upload_documento_assinado',
    ),
    path(
        'processos/<int:processo_id>/pncp/reprocessar/',
        login_required(views.processo_reprocessar_pncp),
        name='processo_reprocessar_pncp',
    ),
    path(
        'processos/<int:processo_id>/pncp/enviar/',
        login_required(views.processo_enviar_pncp),
        name='processo_enviar_pncp',
    ),
    path(
        'processos/<int:processo_id>/bll/exportar/xlsx/',
        login_required(views.processo_exportar_bll_xlsx),
        name='processo_exportar_bll_xlsx',
    ),
    path(
        'processos/<int:processo_id>/comunicacao-interna/',
        login_required(views.processo_comunicacao_interna),
        name='processo_comunicacao_interna',
    ),
    path(
        'processos/<int:processo_id>/movimentar/<str:acao>/',
        login_required(views.processo_movimentar),
        name='processo_movimentar',
    ),

    path('planejamento/', login_required(views.planejamento_dashboard), name='planejamento_dashboard'),
    path('planejamento/novo/', login_required(views.planejamento_novo), name='planejamento_novo'),
    path(
        'planejamento/pessoas/autocomplete/',
        login_required(views.planejamento_pessoas_autocomplete),
        name='planejamento_pessoas_autocomplete',
    ),
    path(
        'planejamento/catalogo/autocomplete/',
        login_required(views.planejamento_catalogo_autocomplete),
        name='planejamento_catalogo_autocomplete',
    ),
    path(
        'planejamento/<int:processo_id>/preview/<str:doc>/',
        login_required(views.planejamento_preview_embed),
        name='planejamento_preview_embed',
    ),
    path('planejamento/<int:processo_id>/', login_required(views.planejamento_detail), name='planejamento_detail'),
    path('planejamento/<int:processo_id>/dfd/', login_required(views.planejamento_salvar_dfd), name='planejamento_salvar_dfd'),
    path('planejamento/<int:processo_id>/itens/', login_required(views.planejamento_adicionar_item), name='planejamento_adicionar_item'),
    path(
        'planejamento/<int:processo_id>/itens/catalogo/',
        login_required(views.planejamento_adicionar_itens_catalogo),
        name='planejamento_adicionar_itens_catalogo',
    ),
    path(
        'planejamento/<int:processo_id>/itens/<int:item_id>/editar/',
        login_required(views.planejamento_editar_item),
        name='planejamento_editar_item',
    ),
    path(
        'planejamento/<int:processo_id>/itens/<int:item_id>/excluir/',
        login_required(views.planejamento_excluir_item),
        name='planejamento_excluir_item',
    ),
    path('planejamento/<int:processo_id>/catalogo/', login_required(views.planejamento_criar_catalogo), name='planejamento_criar_catalogo'),
    path('planejamento/<int:processo_id>/etp/', login_required(views.planejamento_salvar_etp), name='planejamento_salvar_etp'),
    path('planejamento/<int:processo_id>/fontes/', login_required(views.planejamento_adicionar_fonte), name='planejamento_adicionar_fonte'),
    path('planejamento/<int:processo_id>/cotacoes/', login_required(views.planejamento_adicionar_cotacao), name='planejamento_adicionar_cotacao'),
    path(
        'planejamento/<int:processo_id>/cotacoes/<int:cotacao_id>/editar/',
        login_required(views.planejamento_editar_cotacao),
        name='planejamento_editar_cotacao',
    ),
    path(
        'planejamento/<int:processo_id>/cotacoes/<int:cotacao_id>/considerar/',
        login_required(views.planejamento_alterar_consideracao_cotacao),
        name='planejamento_alterar_consideracao_cotacao',
    ),
    path(
        'planejamento/<int:processo_id>/cotacoes/<int:cotacao_id>/excluir/',
        login_required(views.planejamento_excluir_cotacao),
        name='planejamento_excluir_cotacao',
    ),
    path('planejamento/<int:processo_id>/tr/', login_required(views.planejamento_salvar_tr), name='planejamento_salvar_tr'),
    path('planejamento/<int:processo_id>/lotes/', login_required(views.planejamento_adicionar_lote), name='planejamento_adicionar_lote'),
    path(
        'planejamento/<int:processo_id>/lotes/<int:lote_id>/editar/',
        login_required(views.planejamento_editar_lote),
        name='planejamento_editar_lote',
    ),
    path(
        'planejamento/<int:processo_id>/lotes/<int:lote_id>/excluir/',
        login_required(views.planejamento_excluir_lote),
        name='planejamento_excluir_lote',
    ),
    path('planejamento/<int:processo_id>/dotacoes/', login_required(views.planejamento_adicionar_dotacao), name='planejamento_adicionar_dotacao'),
    path(
        'planejamento/<int:processo_id>/dotacoes/<int:dotacao_id>/excluir/',
        login_required(views.planejamento_excluir_dotacao),
        name='planejamento_excluir_dotacao',
    ),
    path(
        'planejamento/<int:processo_id>/dotacoes/referencias/',
        login_required(views.planejamento_criar_referencia_dotacao),
        name='planejamento_criar_referencia_dotacao',
    ),
    path(
        'planejamento/<int:processo_id>/distribuicoes/',
        login_required(views.planejamento_adicionar_distribuicao),
        name='planejamento_adicionar_distribuicao',
    ),
    path(
        'planejamento/<int:processo_id>/encaminhar/<str:destino>/',
        login_required(views.planejamento_encaminhar),
        name='planejamento_encaminhar',
    ),
    path(
        'planejamento/<int:processo_id>/exportar/<str:doc>/<str:formato>/',
        login_required(views.planejamento_exportar),
        name='planejamento_exportar',
    ),
    path('compras/<int:processo_id>/', login_required(views.compras_detail), name='compras_detail'),
    path(
        'compras/<int:processo_id>/preview/<str:doc>/',
        login_required(views.compras_preview_embed),
        name='compras_preview_embed',
    ),
    path(
        'compras/<int:processo_id>/exportar/<str:doc>/<str:formato>/',
        login_required(views.compras_exportar),
        name='compras_exportar',
    ),
    path('compras/<int:processo_id>/pesquisa/', login_required(views.compras_salvar_pesquisa), name='compras_salvar_pesquisa'),
    path('compras/<int:processo_id>/fontes/', login_required(views.compras_adicionar_fonte), name='compras_adicionar_fonte'),
    path(
        'compras/<int:processo_id>/fontes/<int:fonte_id>/excluir/',
        login_required(views.compras_excluir_fonte),
        name='compras_excluir_fonte',
    ),
    path('compras/<int:processo_id>/comprovantes/', login_required(views.compras_anexar_comprovante), name='compras_anexar_comprovante'),
    path(
        'compras/<int:processo_id>/comprovantes/<int:doc_id>/excluir/',
        login_required(views.compras_excluir_comprovante),
        name='compras_excluir_comprovante',
    ),
    path('compras/<int:processo_id>/cotacoes/', login_required(views.compras_adicionar_cotacao), name='compras_adicionar_cotacao'),
    path(
        'compras/<int:processo_id>/cotacoes/<int:cotacao_id>/editar/',
        login_required(views.compras_editar_cotacao),
        name='compras_editar_cotacao',
    ),
    path(
        'compras/<int:processo_id>/cotacoes/<int:cotacao_id>/considerar/',
        login_required(views.compras_alterar_consideracao_cotacao),
        name='compras_alterar_consideracao_cotacao',
    ),
    path(
        'compras/<int:processo_id>/cotacoes/<int:cotacao_id>/excluir/',
        login_required(views.compras_excluir_cotacao),
        name='compras_excluir_cotacao',
    ),
]

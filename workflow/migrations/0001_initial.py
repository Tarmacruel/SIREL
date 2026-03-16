from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ('core', '0011_alter_fornecimentoitem_status_item_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='DocumentoProcessoWorkflow',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('modulo', models.CharField(choices=[('PLANEJAMENTO', '1 - Planejamento'), ('COMPRAS', '2 - Compras'), ('LICITACAO', '3 - Licitação'), ('PROCURADORIA', '4 - Procuradoria'), ('CONTROLADORIA', '5 - Controladoria'), ('CONTRATOS', '6 - Contratos'), ('DASHBOARDS', '7 - Dashboards'), ('DOCUMENTOS', '8 - Documentos'), ('INTEGRACAO', '9 - Integração')], max_length=30)),
                ('tipo_documento', models.CharField(max_length=120)),
                ('arquivo', models.FileField(upload_to='workflow_documentos/%Y/%m/')),
                ('ordem_cronologica', models.PositiveIntegerField(default=0)),
                ('gerar_no_etcm', models.BooleanField(default=True)),
                ('criado_em', models.DateTimeField(auto_now_add=True)),
                ('processo', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='documentos_workflow', to='core.processo')),
            ],
            options={'ordering': ['ordem_cronologica', 'id'], 'verbose_name': 'Documento do workflow', 'verbose_name_plural': 'Documentos do workflow'},
        ),
        migrations.CreateModel(
            name='IntegracaoProcesso',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tipo', models.CharField(choices=[('PNCP', 'PNCP'), ('BLL_IMPORTACAO', 'BLL Importação'), ('BLL_EXPORTACAO', 'BLL Exportação')], max_length=30)),
                ('identificador_externo', models.CharField(blank=True, default='', max_length=120)),
                ('status', models.CharField(default='PENDENTE', max_length=40)),
                ('mensagem', models.TextField(blank=True, default='')),
                ('payload_resumo', models.JSONField(blank=True, default=dict)),
                ('criado_em', models.DateTimeField(auto_now_add=True)),
                ('processo', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='integracoes', to='core.processo')),
            ],
            options={'ordering': ['-criado_em'], 'verbose_name': 'Log de integração', 'verbose_name_plural': 'Logs de integração'},
        ),
        migrations.CreateModel(
            name='ProcessoMovimentacao',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('modulo_origem', models.CharField(blank=True, choices=[('PLANEJAMENTO', '1 - Planejamento'), ('COMPRAS', '2 - Compras'), ('LICITACAO', '3 - Licitação'), ('PROCURADORIA', '4 - Procuradoria'), ('CONTROLADORIA', '5 - Controladoria'), ('CONTRATOS', '6 - Contratos'), ('DASHBOARDS', '7 - Dashboards'), ('DOCUMENTOS', '8 - Documentos'), ('INTEGRACAO', '9 - Integração')], default='', max_length=30)),
                ('modulo_destino', models.CharField(choices=[('PLANEJAMENTO', '1 - Planejamento'), ('COMPRAS', '2 - Compras'), ('LICITACAO', '3 - Licitação'), ('PROCURADORIA', '4 - Procuradoria'), ('CONTROLADORIA', '5 - Controladoria'), ('CONTRATOS', '6 - Contratos'), ('DASHBOARDS', '7 - Dashboards'), ('DOCUMENTOS', '8 - Documentos'), ('INTEGRACAO', '9 - Integração')], max_length=30)),
                ('descricao', models.CharField(max_length=255)),
                ('observacao', models.TextField(blank=True, default='')),
                ('criado_em', models.DateTimeField(auto_now_add=True)),
                ('processo', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='movimentacoes_workflow', to='core.processo')),
            ],
            options={'ordering': ['-criado_em'], 'verbose_name': 'Movimentação do processo', 'verbose_name_plural': 'Movimentações do processo'},
        ),
        migrations.CreateModel(
            name='ProcessoWorkflow',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('modulo_atual', models.CharField(choices=[('PLANEJAMENTO', '1 - Planejamento'), ('COMPRAS', '2 - Compras'), ('LICITACAO', '3 - Licitação'), ('PROCURADORIA', '4 - Procuradoria'), ('CONTROLADORIA', '5 - Controladoria'), ('CONTRATOS', '6 - Contratos'), ('DASHBOARDS', '7 - Dashboards'), ('DOCUMENTOS', '8 - Documentos'), ('INTEGRACAO', '9 - Integração')], default='PLANEJAMENTO', max_length=30)),
                ('situacao', models.CharField(choices=[('RASCUNHO', 'Rascunho'), ('EM_ANDAMENTO', 'Em andamento'), ('AGUARDANDO', 'Aguardando ação externa'), ('CONCLUIDO', 'Concluído'), ('SUSPENSO', 'Suspenso')], default='RASCUNHO', max_length=20)),
                ('etapa_atual', models.CharField(blank=True, default='DFD', max_length=120)),
                ('irp_aplicavel', models.BooleanField(default=False)),
                ('divisao_por_secretaria', models.BooleanField(default=True)),
                ('publicado', models.BooleanField(default=False)),
                ('homologado', models.BooleanField(default=False)),
                ('finalizado_licitacao', models.BooleanField(default=False)),
                ('pncp_numero_controle', models.CharField(blank=True, default='', max_length=80)),
                ('pncp_ultima_importacao', models.DateTimeField(blank=True, null=True)),
                ('bll_ultima_importacao', models.DateTimeField(blank=True, null=True)),
                ('criado_em', models.DateTimeField(auto_now_add=True)),
                ('atualizado_em', models.DateTimeField(auto_now=True)),
                ('processo', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='workflow', to='core.processo')),
            ],
            options={'verbose_name': 'Workflow do processo', 'verbose_name_plural': 'Workflows dos processos'},
        ),
    ]

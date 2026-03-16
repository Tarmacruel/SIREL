# Generated manually for planning module
import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0011_alter_fornecimentoitem_status_item_and_more'),
        ('workflow', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='DFDItemCatalogo',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('codigo', models.PositiveIntegerField(unique=True)),
                ('descricao', models.TextField()),
                ('unidade', models.CharField(blank=True, default='', max_length=30)),
                ('criado_em', models.DateTimeField(auto_now_add=True)),
            ],
            options={'ordering': ['descricao']},
        ),
        migrations.CreateModel(
            name='ETPPlanejamento',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('metodologia_cotacao', models.CharField(choices=[('MEDIA', 'Média Aritmética'), ('MEDIANA', 'Mediana'), ('MENOR', 'Menor Preço')], default='MEDIA', max_length=20)),
                ('havera_irp', models.BooleanField(default=False)),
                ('observacoes', models.TextField(blank=True, default='')),
                ('criado_em', models.DateTimeField(auto_now_add=True)),
                ('atualizado_em', models.DateTimeField(auto_now=True)),
                ('processo', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='planejamento_etp', to='core.processo')),
            ],
        ),
        migrations.CreateModel(
            name='PlanejamentoDFD',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('objeto_resumido', models.CharField(max_length=255)),
                ('descricao_detalhada', models.TextField(blank=True, default='')),
                ('data_demanda', models.DateField(default=django.utils.timezone.now)),
                ('modalidade_pretendida', models.CharField(choices=[('PREGAO', 'Pregão'), ('DISPENSA_ELETRONICA', 'Dispensa Eletrônica'), ('DISPENSA_SIMPLIFICADA', 'Dispensa Simplificada'), ('INEXIGIBILIDADE', 'Inexigibilidade'), ('CONCORRENCIA', 'Concorrência'), ('CREDENCIAMENTO', 'Credenciamento'), ('ADESAO_ARP', 'Adesão a Ata de Registro de Preços')], default='PREGAO', max_length=30)),
                ('tipo_contratacao_planejamento', models.CharField(choices=[('SRP', 'SRP'), ('AQUISICAO', 'Aquisição'), ('OBRA_SERV_ENG', 'Obra/Serv. de Engenharia')], default='AQUISICAO', max_length=30)),
                ('responsavel_demanda', models.CharField(blank=True, default='', max_length=200)),
                ('cargo_funcao', models.CharField(blank=True, default='', max_length=120)),
                ('justificativa_contratacao', models.TextField(blank=True, default='')),
                ('fundamento_legal', models.TextField(blank=True, default='')),
                ('previsao_entrega_execucao', models.TextField(blank=True, default='')),
                ('criado_em', models.DateTimeField(auto_now_add=True)),
                ('atualizado_em', models.DateTimeField(auto_now=True)),
                ('processo', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='planejamento_dfd', to='core.processo')),
            ],
        ),
        migrations.CreateModel(
            name='TRPlanejamento',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('arquivo_tr_pdf', models.FileField(blank=True, null=True, upload_to='planejamento/tr/')),
                ('arquivo_irp_pdf', models.FileField(blank=True, null=True, upload_to='planejamento/irp/')),
                ('criterio_julgamento', models.CharField(choices=[('MENOR_PRECO_GLOBAL', 'Menor preço global'), ('MENOR_PRECO_POR_ITEM', 'Menor preço por item'), ('MENOR_PRECO_POR_LOTE', 'Menor preço por lote'), ('MAIOR_PERCENTUAL_DESCONTO', 'Maior percentual de desconto'), ('MENOR_TAXA_ADMINISTRATIVA', 'Menor taxa administrativa')], default='MENOR_PRECO_POR_ITEM', max_length=40)),
                ('nao_aplica_divisao_secretaria', models.BooleanField(default=False)),
                ('permite_exclusividade_me_epp', models.BooleanField(default=False)),
                ('permite_cota_reservada', models.BooleanField(default=False)),
                ('comunicacao_demanda_pdf', models.FileField(blank=True, null=True, upload_to='planejamento/comunicacoes/')),
                ('criado_em', models.DateTimeField(auto_now_add=True)),
                ('atualizado_em', models.DateTimeField(auto_now=True)),
                ('processo', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='planejamento_tr', to='core.processo')),
            ],
        ),
        migrations.CreateModel(
            name='ETPCotacaoFonte',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nome_fonte', models.CharField(max_length=255)),
                ('tipo_fonte', models.CharField(choices=[('FORNECEDOR', 'Fornecedor'), ('BANCO_PRECOS', 'Banco de preços'), ('SITE', 'Sítio oficial'), ('OUTRO', 'Outro')], default='FORNECEDOR', max_length=20)),
                ('identificacao_documento', models.CharField(blank=True, default='', max_length=255)),
                ('criado_em', models.DateTimeField(auto_now_add=True)),
                ('etp', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='fontes', to='workflow.etpplanejamento')),
            ],
            options={'ordering': ['nome_fonte']},
        ),
        migrations.CreateModel(
            name='DFDItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('codigo', models.PositiveIntegerField()),
                ('descricao', models.TextField()),
                ('unidade', models.CharField(blank=True, default='', max_length=30)),
                ('quantidade', models.DecimalField(decimal_places=3, default=0, max_digits=18)),
                ('criado_em', models.DateTimeField(auto_now_add=True)),
                ('catalogo', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='workflow.dfditemcatalogo')),
                ('dfd', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='itens', to='workflow.planejamentodfd')),
            ],
            options={'ordering': ['codigo'], 'unique_together': {('dfd', 'codigo')}},
        ),
        migrations.CreateModel(
            name='TRDotacao',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('criado_em', models.DateTimeField(auto_now_add=True)),
                ('elemento_despesa', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='core.elementodespesa')),
                ('fonte_recurso', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='core.fonterecurso')),
                ('projeto_atividade', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='core.projetoatividade')),
                ('secretaria', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='core.secretaria')),
                ('unidade_orcamentaria', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='core.unidadeorcamentaria')),
                ('tr', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='dotacoes', to='workflow.trplanejamento')),
            ],
        ),
        migrations.CreateModel(
            name='DFDSecretaria',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('principal', models.BooleanField(default=False)),
                ('dfd', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='secretarias_vinculadas', to='workflow.planejamentodfd')),
                ('secretaria', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='core.secretaria')),
            ],
            options={'ordering': ['-principal', 'secretaria__sigla'], 'unique_together': {('dfd', 'secretaria')}},
        ),
        migrations.CreateModel(
            name='ETPCotacaoItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('valor_unitario', models.DecimalField(decimal_places=4, default=0, max_digits=18)),
                ('considerar_no_calculo', models.BooleanField(default=True)),
                ('sobrepreco', models.BooleanField(default=False)),
                ('inexequivel', models.BooleanField(default=False)),
                ('observacao', models.TextField(blank=True, default='')),
                ('criado_em', models.DateTimeField(auto_now_add=True)),
                ('etp', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='cotacoes', to='workflow.etpplanejamento')),
                ('fonte', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='cotacoes', to='workflow.etpcotacaofonte')),
                ('item', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='cotacoes_etp', to='workflow.dfditem')),
            ],
            options={'ordering': ['item__codigo', 'fonte__nome_fonte']},
        ),
        migrations.CreateModel(
            name='TRLote',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('numero', models.PositiveIntegerField()),
                ('titulo', models.CharField(max_length=255)),
                ('itens', models.ManyToManyField(blank=True, related_name='lotes_tr', to='workflow.dfditem')),
                ('tr', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='lotes', to='workflow.trplanejamento')),
            ],
            options={'ordering': ['numero'], 'unique_together': {('tr', 'numero')}},
        ),
        migrations.CreateModel(
            name='TRDistribuicaoSecretaria',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('quantidade', models.DecimalField(decimal_places=3, default=0, max_digits=18)),
                ('item', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='workflow.dfditem')),
                ('secretaria', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='core.secretaria')),
                ('tr', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='distribuicoes', to='workflow.trplanejamento')),
            ],
            options={'ordering': ['secretaria__sigla', 'item__codigo'], 'unique_together': {('tr', 'secretaria', 'item')}},
        ),
    ]

from django.db import models
from django.conf import settings
from django.utils import timezone
from datetime import datetime

class ModuloSistema(models.TextChoices):
    PLANEJAMENTO = 'PLANEJAMENTO', '1 - Planejamento'
    COMPRAS = 'COMPRAS', '2 - Compras'
    LICITACAO = 'LICITACAO', '3 - Licitação'
    PROCURADORIA = 'PROCURADORIA', '4 - Procuradoria'
    CONTROLADORIA = 'CONTROLADORIA', '5 - Controladoria'
    CONTRATOS = 'CONTRATOS', '6 - Contratos'
    DASHBOARDS = 'DASHBOARDS', '7 - Dashboards'
    DOCUMENTOS = 'DOCUMENTOS', '8 - Documentos'
    INTEGRACAO = 'INTEGRACAO', '9 - Integração'
    FREQUENCIA = 'FREQUENCIA', '10 - Frequência'

class SituacaoWorkflow(models.TextChoices):
    RASCUNHO = 'RASCUNHO', 'Rascunho'
    EM_ANDAMENTO = 'EM_ANDAMENTO', 'Em andamento'
    AGUARDANDO = 'AGUARDANDO', 'Aguardando ação externa'
    CONCLUIDO = 'CONCLUIDO', 'Concluído'
    SUSPENSO = 'SUSPENSO', 'Suspenso'

class ProcessoWorkflow(models.Model):
    processo = models.OneToOneField('core.Processo', on_delete=models.CASCADE, related_name='workflow')
    modulo_atual = models.CharField(max_length=30, choices=ModuloSistema.choices, default=ModuloSistema.PLANEJAMENTO)
    situacao = models.CharField(max_length=20, choices=SituacaoWorkflow.choices, default=SituacaoWorkflow.RASCUNHO)
    etapa_atual = models.CharField(max_length=120, blank=True, default='DFD')
    irp_aplicavel = models.BooleanField(default=False)
    divisao_por_secretaria = models.BooleanField(default=True)
    publicado = models.BooleanField(default=False)
    homologado = models.BooleanField(default=False)
    finalizado_licitacao = models.BooleanField(default=False)
    pncp_numero_controle = models.CharField(max_length=80, blank=True, default='')
    pncp_ultima_importacao = models.DateTimeField(null=True, blank=True)
    bll_ultima_importacao = models.DateTimeField(null=True, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Workflow do processo'
        verbose_name_plural = 'Workflows dos processos'

    def __str__(self):
        return f'Workflow {self.processo}'

class ProcessoMovimentacao(models.Model):
    processo = models.ForeignKey('core.Processo', on_delete=models.CASCADE, related_name='movimentacoes_workflow')
    modulo_origem = models.CharField(max_length=30, choices=ModuloSistema.choices, blank=True, default='')
    modulo_destino = models.CharField(max_length=30, choices=ModuloSistema.choices)
    descricao = models.CharField(max_length=255)
    observacao = models.TextField(blank=True, default='')
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-criado_em']
        verbose_name = 'Movimentação do processo'
        verbose_name_plural = 'Movimentações do processo'

    def __str__(self):
        return f'{self.processo} -> {self.modulo_destino}'


class ComunicacaoInterna(models.Model):
    processo = models.ForeignKey('core.Processo', on_delete=models.CASCADE, related_name='comunicacoes_internas')
    processo_referencia = models.ForeignKey(
        'core.Processo',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='comunicacoes_referenciadas',
    )
    modulo_origem = models.CharField(max_length=30, choices=ModuloSistema.choices)
    modulo_destino = models.CharField(max_length=30, choices=ModuloSistema.choices)
    ano_exercicio = models.PositiveIntegerField()
    numero_sequencial = models.PositiveIntegerField()
    data_comunicacao = models.DateField(default=timezone.now)
    assunto = models.CharField(max_length=255)
    mensagem = models.TextField()
    observacao = models.TextField(blank=True, default='')
    responsavel_envio = models.CharField(max_length=255, blank=True, default='')
    signatarios = models.ManyToManyField('core.Pessoa', blank=True, related_name='comunicacoes_internas')
    criado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='comunicacoes_internas_criadas',
    )
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-ano_exercicio', '-numero_sequencial', '-id']
        constraints = [
            models.UniqueConstraint(
                fields=['modulo_origem', 'ano_exercicio', 'numero_sequencial'],
                name='uq_ci_numero_por_modulo_ano',
            )
        ]

    @property
    def numero_formatado(self):
        return f'{self.numero_sequencial:03d}/{self.ano_exercicio}'

    def __str__(self):
        return f'CI {self.numero_formatado} - {self.get_modulo_origem_display()}'


class PNCPContratacaoSnapshot(models.Model):
    processo = models.OneToOneField('core.Processo', on_delete=models.CASCADE, related_name='pncp_snapshot')
    numero_controle_pncp = models.CharField(max_length=80, unique=True)
    numero_compra = models.CharField(max_length=50, blank=True, default='')
    ano_compra = models.PositiveIntegerField(null=True, blank=True)
    processo_origem = models.CharField(max_length=80, blank=True, default='')

    tipo_instrumento_convocatorio_id = models.IntegerField(null=True, blank=True)
    tipo_instrumento_convocatorio_nome = models.CharField(max_length=120, blank=True, default='')
    modalidade_id = models.IntegerField(null=True, blank=True)
    modalidade_nome = models.CharField(max_length=120, blank=True, default='')
    modo_disputa_id = models.IntegerField(null=True, blank=True)
    modo_disputa_nome = models.CharField(max_length=120, blank=True, default='')
    criterio_julgamento_id = models.IntegerField(null=True, blank=True)
    criterio_julgamento_nome = models.CharField(max_length=120, blank=True, default='')
    situacao_compra_id = models.IntegerField(null=True, blank=True)
    situacao_compra_nome = models.CharField(max_length=120, blank=True, default='')

    objeto_compra = models.TextField(blank=True, default='')
    informacao_complementar = models.TextField(blank=True, default='')
    srp = models.BooleanField(default=False)

    amparo_legal_codigo = models.IntegerField(null=True, blank=True)
    amparo_legal_nome = models.CharField(max_length=255, blank=True, default='')
    amparo_legal_descricao = models.TextField(blank=True, default='')

    valor_total_estimado = models.DecimalField(max_digits=18, decimal_places=4, default=0)
    valor_total_homologado = models.DecimalField(max_digits=18, decimal_places=4, default=0)

    data_abertura_proposta = models.DateTimeField(null=True, blank=True)
    data_encerramento_proposta = models.DateTimeField(null=True, blank=True)
    data_publicacao_pncp = models.DateField(null=True, blank=True)
    data_inclusao = models.DateField(null=True, blank=True)
    data_atualizacao = models.DateField(null=True, blank=True)
    sequencial_compra = models.IntegerField(null=True, blank=True)

    orgao_cnpj = models.CharField(max_length=20, blank=True, default='')
    orgao_razao_social = models.CharField(max_length=255, blank=True, default='')
    orgao_poder_id = models.CharField(max_length=3, blank=True, default='')
    orgao_esfera_id = models.CharField(max_length=3, blank=True, default='')

    unidade_codigo = models.CharField(max_length=40, blank=True, default='')
    unidade_nome = models.CharField(max_length=255, blank=True, default='')
    unidade_codigo_ibge = models.CharField(max_length=12, blank=True, default='')
    unidade_municipio_nome = models.CharField(max_length=120, blank=True, default='')
    unidade_uf_sigla = models.CharField(max_length=2, blank=True, default='')
    unidade_uf_nome = models.CharField(max_length=120, blank=True, default='')

    orgao_subrogado_cnpj = models.CharField(max_length=20, blank=True, default='')
    orgao_subrogado_razao_social = models.CharField(max_length=255, blank=True, default='')
    orgao_subrogado_poder_id = models.CharField(max_length=3, blank=True, default='')
    orgao_subrogado_esfera_id = models.CharField(max_length=3, blank=True, default='')

    unidade_subrogada_codigo = models.CharField(max_length=40, blank=True, default='')
    unidade_subrogada_nome = models.CharField(max_length=255, blank=True, default='')
    unidade_subrogada_codigo_ibge = models.CharField(max_length=12, blank=True, default='')
    unidade_subrogada_municipio_nome = models.CharField(max_length=120, blank=True, default='')
    unidade_subrogada_uf_sigla = models.CharField(max_length=2, blank=True, default='')
    unidade_subrogada_uf_nome = models.CharField(max_length=120, blank=True, default='')

    usuario_nome = models.CharField(max_length=255, blank=True, default='')
    link_sistema_origem = models.URLField(blank=True, default='')
    justificativa_presencial = models.TextField(blank=True, default='')

    payload_completo = models.JSONField(default=dict, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-atualizado_em', '-id']
        verbose_name = 'Snapshot PNCP da contratação'
        verbose_name_plural = 'Snapshots PNCP das contratações'

    def __str__(self):
        return f'PNCP {self.numero_controle_pncp} - {self.processo}'


class IntegracaoProcesso(models.Model):
    class Tipo(models.TextChoices):
        PNCP = 'PNCP', 'PNCP'
        BLL_IMPORTACAO = 'BLL_IMPORTACAO', 'BLL Importação'
        BLL_EXPORTACAO = 'BLL_EXPORTACAO', 'BLL Exportação'

    processo = models.ForeignKey('core.Processo', on_delete=models.CASCADE, related_name='integracoes')
    tipo = models.CharField(max_length=30, choices=Tipo.choices)
    identificador_externo = models.CharField(max_length=120, blank=True, default='')
    status = models.CharField(max_length=40, default='PENDENTE')
    mensagem = models.TextField(blank=True, default='')
    payload_resumo = models.JSONField(default=dict, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-criado_em']
        verbose_name = 'Log de integração'
        verbose_name_plural = 'Logs de integração'

    def __str__(self):
        return f'{self.get_tipo_display()} - {self.processo}'


class PNCPDetalhamentoFila(models.Model):
    class Status(models.TextChoices):
        PENDENTE = 'PENDENTE', 'Pendente'
        PROCESSANDO = 'PROCESSANDO', 'Processando'
        CONCLUIDO = 'CONCLUIDO', 'Concluido'
        PARCIAL = 'PARCIAL', 'Parcial'
        ERRO = 'ERRO', 'Erro'

    processo = models.OneToOneField('core.Processo', on_delete=models.CASCADE, related_name='pncp_detalhamento_fila')
    numero_controle_pncp = models.CharField(max_length=80, blank=True, default='')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDENTE)
    prioridade = models.PositiveIntegerField(default=100)
    tentativas = models.PositiveIntegerField(default=0)
    ultimo_erro = models.TextField(blank=True, default='')
    origem = models.CharField(max_length=30, blank=True, default='IMPORTACAO_LOTE')
    payload_resumo = models.JSONField(default=dict, blank=True)
    agendado_em = models.DateTimeField(auto_now_add=True)
    iniciado_em = models.DateTimeField(null=True, blank=True)
    finalizado_em = models.DateTimeField(null=True, blank=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['prioridade', '-agendado_em']
        verbose_name = 'Fila de detalhamento PNCP'
        verbose_name_plural = 'Fila de detalhamento PNCP'

    def __str__(self):
        return f'Fila PNCP {self.processo_id} - {self.get_status_display()}'


class DocumentoProcessoWorkflow(models.Model):
    processo = models.ForeignKey('core.Processo', on_delete=models.CASCADE, related_name='documentos_workflow')
    modulo = models.CharField(max_length=30, choices=ModuloSistema.choices)
    tipo_documento = models.CharField(max_length=120)
    arquivo = models.FileField(upload_to='workflow_documentos/%Y/%m/')
    ordem_cronologica = models.PositiveIntegerField(default=0)
    gerar_no_etcm = models.BooleanField(default=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['ordem_cronologica', 'id']
        verbose_name = 'Documento do workflow'
        verbose_name_plural = 'Documentos do workflow'

    def __str__(self):
        return f'{self.tipo_documento} - {self.processo}'


class PlanejamentoDFD(models.Model):
    class ModalidadePretendida(models.TextChoices):
        PREGAO = 'PREGAO', 'Pregão'
        DISPENSA_ELETRONICA = 'DISPENSA_ELETRONICA', 'Dispensa Eletrônica'
        DISPENSA_SIMPLIFICADA = 'DISPENSA_SIMPLIFICADA', 'Dispensa Simplificada'
        INEXIGIBILIDADE = 'INEXIGIBILIDADE', 'Inexigibilidade'
        CONCORRENCIA = 'CONCORRENCIA', 'Concorrência'
        CREDENCIAMENTO = 'CREDENCIAMENTO', 'Credenciamento'
        ADESAO_ARP = 'ADESAO_ARP', 'Adesão a Ata de Registro de Preços'
    class TipoContratacao(models.TextChoices):
        SRP = 'SRP', 'SRP'
        AQUISICAO = 'AQUISICAO', 'Aquisição'

    class EspecieContratacao(models.TextChoices):
        MATERIAL = 'MATERIAL', 'Materiais'
        SERVICO = 'SERVICO', 'Serviços'
        MATERIAL_SERVICO = 'MATERIAL_SERVICO', 'Materiais/Serviços'
        OBRA_SERV_ENG = 'OBRA_SERV_ENG', 'Obra/Serv. de Engenharia'

    processo = models.OneToOneField('core.Processo', on_delete=models.CASCADE, related_name='planejamento_dfd')
    objeto_resumido = models.CharField(max_length=255)
    descricao_detalhada = models.TextField(blank=True, default='')
    data_demanda = models.DateField(default=timezone.now)
    modalidade_pretendida = models.CharField(max_length=30, choices=ModalidadePretendida.choices, default=ModalidadePretendida.PREGAO)
    tipo_contratacao_planejamento = models.CharField(max_length=30, choices=TipoContratacao.choices, default=TipoContratacao.AQUISICAO)
    especie_contratacao = models.CharField(max_length=30, choices=EspecieContratacao.choices, default=EspecieContratacao.MATERIAL)
    responsavel_pessoa = models.ForeignKey('core.Pessoa', null=True, blank=True, on_delete=models.SET_NULL, related_name='dfds_responsavel')
    responsavel_demanda = models.CharField(max_length=200, blank=True, default='')
    cargo_funcao = models.CharField(max_length=120, blank=True, default='')
    justificativa_contratacao = models.TextField(blank=True, default='')
    fundamento_legal = models.TextField(blank=True, default='')
    previsao_entrega_execucao = models.TextField(blank=True, default='')
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

class DFDSecretaria(models.Model):
    dfd = models.ForeignKey(PlanejamentoDFD, on_delete=models.CASCADE, related_name='secretarias_vinculadas')
    secretaria = models.ForeignKey('core.Secretaria', on_delete=models.CASCADE)
    principal = models.BooleanField(default=False)
    class Meta:
        unique_together = [('dfd','secretaria')]
        ordering = ['-principal','secretaria__sigla']

class DFDItemCatalogo(models.Model):
    codigo = models.PositiveIntegerField(unique=True)
    descricao = models.TextField()
    unidade = models.CharField(max_length=30, blank=True, default='')
    criado_em = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ['descricao']
    def __str__(self):
        return f'{self.codigo} - {self.descricao[:80]}'

class DFDItem(models.Model):
    dfd = models.ForeignKey(PlanejamentoDFD, on_delete=models.CASCADE, related_name='itens')
    catalogo = models.ForeignKey(DFDItemCatalogo, null=True, blank=True, on_delete=models.SET_NULL)
    codigo = models.PositiveIntegerField()
    descricao = models.TextField()
    unidade = models.CharField(max_length=30, blank=True, default='')
    quantidade = models.DecimalField(max_digits=18, decimal_places=3, default=0)
    criado_em = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ['codigo']
        unique_together = [('dfd','codigo')]

    def __str__(self):
        return f'{self.codigo} - {self.descricao[:90]}'

class ETPPlanejamento(models.Model):
    class MetodologiaCotacao(models.TextChoices):
        MEDIA = 'MEDIA', 'Média Aritmética'
        MEDIANA = 'MEDIANA', 'Mediana'
        MENOR = 'MENOR', 'Menor Preço'
    processo = models.OneToOneField('core.Processo', on_delete=models.CASCADE, related_name='planejamento_etp')
    metodologia_cotacao = models.CharField(max_length=20, choices=MetodologiaCotacao.choices, default=MetodologiaCotacao.MEDIA)
    havera_irp = models.BooleanField(default=False)
    observacoes = models.TextField(blank=True, default='')
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

class ETPCotacaoFonte(models.Model):
    class TipoFonte(models.TextChoices):
        FORNECEDOR = 'FORNECEDOR', 'Fornecedor'
        BANCO_PRECOS = 'BANCO_PRECOS', 'Banco de preços'
        SITE = 'SITE', 'Sítio oficial'
        OUTRO = 'OUTRO', 'Outro'
    etp = models.ForeignKey(ETPPlanejamento, on_delete=models.CASCADE, related_name='fontes')
    fornecedor = models.ForeignKey('core.Fornecedor', null=True, blank=True, on_delete=models.SET_NULL, related_name='fontes_etp')
    nome_fonte = models.CharField(max_length=255)
    tipo_fonte = models.CharField(max_length=20, choices=TipoFonte.choices, default=TipoFonte.FORNECEDOR)
    data_consulta = models.DateField(null=True, blank=True)
    identificacao_documento = models.CharField(max_length=255, blank=True, default='')
    criado_em = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ['nome_fonte']
    def __str__(self):
        return self.nome_fonte

class ETPCotacaoItem(models.Model):
    etp = models.ForeignKey(ETPPlanejamento, on_delete=models.CASCADE, related_name='cotacoes')
    item = models.ForeignKey(DFDItem, on_delete=models.CASCADE, related_name='cotacoes_etp')
    fonte = models.ForeignKey(ETPCotacaoFonte, on_delete=models.CASCADE, related_name='cotacoes')
    valor_unitario = models.DecimalField(max_digits=18, decimal_places=4, default=0)
    considerar_no_calculo = models.BooleanField(default=True)
    sobrepreco = models.BooleanField(default=False)
    inexequivel = models.BooleanField(default=False)
    observacao = models.TextField(blank=True, default='')
    criado_em = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ['item__codigo','fonte__nome_fonte']

class TRPlanejamento(models.Model):
    class CriterioJulgamento(models.TextChoices):
        MENOR_PRECO_GLOBAL = 'MENOR_PRECO_GLOBAL', 'Menor preço global'
        MENOR_PRECO_POR_ITEM = 'MENOR_PRECO_POR_ITEM', 'Menor preço por item'
        MENOR_PRECO_POR_LOTE = 'MENOR_PRECO_POR_LOTE', 'Menor preço por lote'
        MAIOR_PERCENTUAL_DESCONTO = 'MAIOR_PERCENTUAL_DESCONTO', 'Maior percentual de desconto'
        MENOR_TAXA_ADMINISTRATIVA = 'MENOR_TAXA_ADMINISTRATIVA', 'Menor taxa administrativa'
    processo = models.OneToOneField('core.Processo', on_delete=models.CASCADE, related_name='planejamento_tr')
    arquivo_tr_pdf = models.FileField(upload_to='planejamento/tr/', blank=True, null=True)
    arquivo_irp_pdf = models.FileField(upload_to='planejamento/irp/', blank=True, null=True)
    criterio_julgamento = models.CharField(max_length=40, choices=CriterioJulgamento.choices, default=CriterioJulgamento.MENOR_PRECO_POR_ITEM)
    nao_aplica_divisao_secretaria = models.BooleanField(default=False)
    permite_exclusividade_me_epp = models.BooleanField(default=False)
    permite_cota_reservada = models.BooleanField(default=False)
    comunicacao_demanda_pdf = models.FileField(upload_to='planejamento/comunicacoes/', blank=True, null=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

class TRLote(models.Model):
    tr = models.ForeignKey(TRPlanejamento, on_delete=models.CASCADE, related_name='lotes')
    numero = models.PositiveIntegerField()
    titulo = models.CharField(max_length=255)
    itens = models.ManyToManyField(DFDItem, blank=True, related_name='lotes_tr')
    class Meta:
        ordering = ['numero']
        unique_together = [('tr','numero')]
    def __str__(self):
        return f'Lote {self.numero} - {self.titulo}'

class TRDotacao(models.Model):
    tr = models.ForeignKey(TRPlanejamento, on_delete=models.CASCADE, related_name='dotacoes')
    secretaria = models.ForeignKey('core.Secretaria', null=True, blank=True, on_delete=models.SET_NULL)
    unidade_orcamentaria = models.ForeignKey('core.UnidadeOrcamentaria', null=True, blank=True, on_delete=models.SET_NULL)
    projeto_atividade = models.ForeignKey('core.ProjetoAtividade', null=True, blank=True, on_delete=models.SET_NULL)
    elemento_despesa = models.ForeignKey('core.ElementoDespesa', null=True, blank=True, on_delete=models.SET_NULL)
    fonte_recurso = models.ForeignKey('core.FonteRecurso', null=True, blank=True, on_delete=models.SET_NULL)
    criado_em = models.DateTimeField(auto_now_add=True)

class TRDistribuicaoSecretaria(models.Model):
    tr = models.ForeignKey(TRPlanejamento, on_delete=models.CASCADE, related_name='distribuicoes')
    secretaria = models.ForeignKey('core.Secretaria', on_delete=models.CASCADE)
    item = models.ForeignKey(DFDItem, on_delete=models.CASCADE)
    quantidade = models.DecimalField(max_digits=18, decimal_places=3, default=0)
    class Meta:
        unique_together = [('tr','secretaria','item')]
        ordering = ['secretaria__sigla','item__codigo']


class FrequenciaRegistro(models.Model):
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='frequencias_registros')
    data = models.DateField()

    entrada = models.TimeField(null=True, blank=True)
    inicio_intervalo = models.TimeField(null=True, blank=True)
    fim_intervalo = models.TimeField(null=True, blank=True)
    saida = models.TimeField(null=True, blank=True)

    nao_trabalhado_util = models.BooleanField(default=False)
    justificativa_nao_trabalhado = models.TextField(blank=True, default='')
    justificativa_horas_extras = models.TextField(blank=True, default='')
    observacao = models.TextField(blank=True, default='')

    horas_trabalhadas_minutos = models.PositiveIntegerField(default=0)
    horas_extras_minutos = models.PositiveIntegerField(default=0)

    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-data', '-id']
        unique_together = [('usuario', 'data')]
        verbose_name = 'Registro de frequência'
        verbose_name_plural = 'Registros de frequência'

    def __str__(self):
        return f'{self.usuario} - {self.data}'

    @staticmethod
    def _diff_minutes(t1, t2):
        if not t1 or not t2:
            return 0
        dt1 = datetime.combine(timezone.localdate(), t1)
        dt2 = datetime.combine(timezone.localdate(), t2)
        return int((dt2 - dt1).total_seconds() // 60)

    def calcular_totais(self):
        if self.nao_trabalhado_util:
            return 0, 0
        if not all([self.entrada, self.inicio_intervalo, self.fim_intervalo, self.saida]):
            return 0, 0
        manha = self._diff_minutes(self.entrada, self.inicio_intervalo)
        tarde = self._diff_minutes(self.fim_intervalo, self.saida)
        total = max(0, manha + tarde)
        extras = max(0, total - (8 * 60))
        return total, extras

    def save(self, *args, **kwargs):
        total, extras = self.calcular_totais()
        self.horas_trabalhadas_minutos = total
        self.horas_extras_minutos = extras
        super().save(*args, **kwargs)

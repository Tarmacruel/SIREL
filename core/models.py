# -*- coding: utf-8 -*-
import re
from decimal import Decimal

from django.db import models, transaction
from django.contrib.auth import get_user_model
from django.utils import timezone
from simple_history.models import HistoricalRecords
from .utils.formatters import fmt_brl

User = get_user_model()

# ======= Cadastros Base =======
class Secretaria(models.Model):
    sigla = models.CharField(max_length=20, unique=True)
    nome = models.CharField(max_length=200)
    class Meta: ordering = ["sigla"]
    def __str__(self): return f"{self.sigla} - {self.nome}"

class Modalidade(models.Model):
    nome = models.CharField(max_length=60, unique=True)
    base_legal = models.CharField(max_length=255, blank=True, default="")
    class Meta: ordering = ["nome"]
    def __str__(self): return self.nome

class StatusProcesso(models.Model):
    nome = models.CharField(max_length=60, unique=True)
    class Meta:
        ordering = ["nome"]
        verbose_name = "Status do Processo"
        verbose_name_plural = "Status dos Processos"
    def __str__(self): return self.nome

class FonteRecurso(models.Model):
    codigo = models.CharField(max_length=20, unique=True)
    descricao = models.CharField(max_length=255)
    class Meta: ordering = ["codigo"]
    def __str__(self): return f"{self.codigo} - {self.descricao}"

class ElementoDespesa(models.Model):
    codigo = models.CharField(max_length=20, unique=True)
    descricao = models.CharField(max_length=255)
    class Meta:
        ordering = ["codigo"]
        verbose_name = "Elemento de despesa"
        verbose_name_plural = "Elementos de despesa"
    def __str__(self): return f"{self.codigo} - {self.descricao}"

class ProjetoAtividade(models.Model):
    codigo = models.CharField(max_length=30, unique=True)
    descricao = models.CharField(max_length=255)
    class Meta:
        ordering = ["codigo"]
        verbose_name = "Projeto/Atividade"
        verbose_name_plural = "Projetos/Atividades"
    def __str__(self): return f"{self.codigo} - {self.descricao}"

class UnidadeOrcamentaria(models.Model):
    sigla = models.CharField(max_length=20, unique=True)
    nome = models.CharField(max_length=255)
    class Meta:
        ordering = ["sigla"]
        verbose_name = "Unidade orçamentária"
        verbose_name_plural = "Unidades orçamentárias"
    def __str__(self): return f"{self.sigla} - {self.nome}"

class Fornecedor(models.Model):
    razao_social = models.CharField(max_length=255)
    cnpj = models.CharField(max_length=18, unique=True)  # aceita CPF/CNPJ com máscara
    email = models.EmailField(blank=True, null=True)
    telefone = models.CharField(max_length=30, blank=True, default="")
    endereco = models.CharField(max_length=255, blank=True, default="")
    bairro = models.CharField(max_length=100, blank=True, default="")
    complemento = models.CharField(max_length=100, blank=True, default="")
    cep = models.CharField(max_length=10, blank=True, default="")
    cidade = models.CharField(max_length=100, blank=True, default="")
    estado = models.CharField(max_length=2, blank=True, default="")
    class Meta: ordering = ["razao_social"]
    def __str__(self): return f"{self.razao_social} ({self.cnpj})"
    def valor_total_homologado(self):
        total = (
            ProcessoItem.objects.filter(fornecedor_homologado=self)
            .aggregate(total=models.Sum("valor_homologado_total"))
            .get("total")
            or Decimal("0")
        )
        if total <= 0:
            total = (
                ProcessoItemResultado.objects.filter(
                    fornecedor=self,
                    ativo=True,
                    status_resultado__in=[
                        ProcessoItemResultado.StatusResultado.HOMOLOGADO,
                        ProcessoItemResultado.StatusResultado.VENCEDOR,
                    ],
                )
                .aggregate(total=models.Sum("valor_total"))
                .get("total")
                or Decimal("0")
            )
        return fmt_brl(total)

class FornecedorDocumentoExterno(models.Model):
    class Origem(models.TextChoices):
        PNCP = "PNCP", "PNCP"
        BLL = "BLL", "BLL"
        OUTRO = "OUTRO", "Outro"

    fornecedor = models.ForeignKey(Fornecedor, on_delete=models.CASCADE, related_name="documentos_externos")
    origem = models.CharField(max_length=20, choices=Origem.choices, default=Origem.OUTRO)
    documento_digits = models.CharField(max_length=20, blank=True, default="")
    identificador_externo = models.CharField(max_length=120, blank=True, default="")
    payload_resumo = models.JSONField(default=dict, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["origem", "documento_digits", "id"]
        unique_together = (("origem", "documento_digits"), ("origem", "identificador_externo"))

    def __str__(self):
        base = self.documento_digits or self.identificador_externo or "-"
        return f"{self.get_origem_display()} - {base}"


class ItemCatalogo(models.Model):
    codigo = models.PositiveIntegerField(unique=True)
    descricao_padrao = models.TextField()
    unidade_padrao = models.CharField(max_length=30, blank=True, default="")
    especificacao_tecnica = models.TextField(blank=True, default="")
    ativo = models.BooleanField(default=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["codigo"]
        verbose_name = "Item de catalogo"
        verbose_name_plural = "Itens de catalogo"

    def __str__(self):
        return f"{self.codigo} - {self.descricao_padrao[:80]}"

class Pessoa(models.Model):
    nome = models.CharField(max_length=200)
    cpf = models.CharField(max_length=14, blank=True, default="")
    cargo = models.CharField(max_length=120, blank=True, default="")
    secretaria = models.ForeignKey(Secretaria, on_delete=models.SET_NULL, null=True, blank=True)
    class Meta: ordering = ["nome"]
    def __str__(self): return self.nome


class OrgaoEntidade(models.Model):
    nome_fantasia = models.CharField(max_length=200, blank=True, default="")
    razao_social = models.CharField(max_length=255)
    cnpj = models.CharField(max_length=18, blank=True, default="")
    inscricao_estadual = models.CharField(max_length=40, blank=True, default="")
    endereco = models.CharField(max_length=255, blank=True, default="")
    numero = models.CharField(max_length=20, blank=True, default="")
    complemento = models.CharField(max_length=80, blank=True, default="")
    bairro = models.CharField(max_length=120, blank=True, default="")
    cidade = models.CharField(max_length=120, blank=True, default="")
    uf = models.CharField(max_length=2, blank=True, default="")
    cep = models.CharField(max_length=10, blank=True, default="")
    telefone = models.CharField(max_length=30, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    site = models.URLField(blank=True, default="")
    logo = models.ImageField(upload_to="orgaos/logos/", blank=True, null=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-atualizado_em", "-id"]
        verbose_name = "Orgao/Entidade"
        verbose_name_plural = "Orgaos/Entidades"

    def __str__(self):
        return self.nome_fantasia or self.razao_social

    @property
    def endereco_completo(self):
        partes = [self.endereco, self.numero, self.complemento, self.bairro, self.cidade]
        texto = ", ".join([p for p in partes if p]).strip(", ")
        if self.uf:
            texto = f"{texto} - {self.uf}" if texto else self.uf
        if self.cep:
            texto = f"{texto} - CEP {self.cep}" if texto else f"CEP {self.cep}"
        return texto

# ======= Processo / Lote / Item =======
class Processo(models.Model):
    class EscopoDisputa(models.TextChoices):
        ITEM = "ITEM", "Por item"
        LOTE = "LOTE", "Por lote"
        GLOBAL = "GLOBAL", "Global"
    class CriterioJulgamento(models.TextChoices):
        MENOR_PRECO_POR_ITEM = "MENOR_PRECO_POR_ITEM", "Menor preço por item"
        MENOR_PRECO_POR_LOTE = "MENOR_PRECO_POR_LOTE", "Menor preço por lote"
        MENOR_PRECO_GLOBAL = "MENOR_PRECO_GLOBAL", "Menor preço global"
        MAIOR_DESCONTO = "MAIOR_DESCONTO", "Maior desconto"
        TECNICA_E_PRECO = "TECNICA_E_PRECO", "Técnica e preço"
        MELHOR_TECNICA = "MELHOR_TECNICA", "Melhor técnica"
    class ModoDisputa(models.TextChoices):
        ABERTO = "ABERTO", "Aberto"
        FECHADO = "FECHADO", "Fechado"
        ABERTO_FECHADO = "ABERTO_FECHADO", "Aberto-Fechado"
        FECHADO_ABERTO = "FECHADO_ABERTO", "Fechado-Aberto"
    class TipoObjeto(models.TextChoices):
        PRODUTO = "PRODUTO", "Produto"
        SERVICO = "SERVICO", "Serviço"
        OBRA = "OBRA", "Obra"
        SERVICO_ENG = "SERVICO_ENG", "Serviço de Engenharia"
    class TipoContratacao(models.TextChoices):
        AQUISICAO = "AQUISICAO", "Aquisição"
        REGISTRO_PRECO = "REGISTRO_PRECO", "Registro de Preço"
        AQUISICAO_PARCELADA = "AQUISICAO_PARCELADA", "Aquisição Parcelada"

    history = HistoricalRecords(related_name='historico_processo')
    protocolo = models.CharField(max_length=40, blank=True, default="")
    numero_processo_sirel = models.CharField(max_length=40, blank=True, default="")
    numero_processo_adm = models.CharField(max_length=40, blank=True, default="")
    numero_edital = models.CharField(max_length=40, blank=True, default="")
    identificador_bll = models.CharField(max_length=60, blank=True, default="")
    promotor_bll = models.CharField(max_length=255, blank=True, default="")
    link_bll = models.URLField(max_length=500, blank=True, default="")
    ano_referencia = models.PositiveIntegerField()
    secretaria = models.ForeignKey(Secretaria, on_delete=models.SET_NULL, null=True, blank=True)
    modalidade = models.ForeignKey(Modalidade, on_delete=models.SET_NULL, null=True, blank=True)
    status = models.ForeignKey(StatusProcesso, on_delete=models.SET_NULL, null=True, blank=True)
    objeto = models.TextField(blank=True, default="")
    escopo_disputa = models.CharField(max_length=10, choices=EscopoDisputa.choices, default=EscopoDisputa.LOTE)
    criterio_julgamento = models.CharField(max_length=30, choices=CriterioJulgamento.choices, blank=True, default="")
    modo_disputa = models.CharField(max_length=30, choices=ModoDisputa.choices, blank=True, default="")
    tipo_objeto = models.CharField(max_length=30, choices=TipoObjeto.choices, blank=True, default="")
    tipo_contratacao = models.CharField(max_length=30, choices=TipoContratacao.choices, blank=True, default="")
    dispensa_com_disputa = models.BooleanField(default=False)
    autoridade_competente = models.ForeignKey(Pessoa, on_delete=models.SET_NULL, null=True, blank=True, related_name="proc_autoridade")
    condutor_processo = models.ForeignKey(Pessoa, on_delete=models.SET_NULL, null=True, blank=True, related_name="proc_condutor")
    data_publicacao = models.DateField(null=True, blank=True)
    data_hora_abertura = models.DateTimeField(null=True, blank=True)
    inicio_recolhimento_propostas = models.DateTimeField(null=True, blank=True)
    fim_recolhimento_propostas = models.DateTimeField(null=True, blank=True)
    fim_impugnacao_esclarecimentos = models.DateTimeField(null=True, blank=True)
    valor_estimado = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    valor_homologado = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)
    class Meta: ordering = ["-criado_em"]

    @staticmethod
    def _parse_numero_sirel_seq(numero: str, ano_referencia: int) -> int:
        texto = str(numero or "").strip()
        match = re.match(r"^(\d+)\s*/\s*(\d{4})$", texto)
        if not match:
            return 0
        try:
            sequencial = int(match.group(1))
            ano = int(match.group(2))
        except ValueError:
            return 0
        if ano != int(ano_referencia):
            return 0
        return sequencial

    @classmethod
    def gerar_numero_processo_sirel(cls, ano_referencia: int | None = None) -> str:
        ano = int(ano_referencia or timezone.localdate().year)
        with transaction.atomic():
            existentes = (
                cls.objects
                .select_for_update()
                .filter(ano_referencia=ano)
                .exclude(numero_processo_sirel="")
                .values_list("numero_processo_sirel", flat=True)
            )
            maior_seq = 0
            for numero in existentes:
                seq = cls._parse_numero_sirel_seq(numero, ano)
                if seq > maior_seq:
                    maior_seq = seq
            return f"{maior_seq + 1:04d}/{ano}"

    @property
    def numero_processo_externo(self) -> str:
        return (self.numero_processo_adm or "").strip()

    @property
    def numero_processo_principal(self) -> str:
        return (
            (self.numero_processo_sirel or "").strip()
            or (self.numero_processo_adm or "").strip()
            or (self.numero_edital or "").strip()
            or "-"
        )

    @property
    def numero_processo_secundario(self) -> str:
        if (self.numero_processo_sirel or "").strip() and (self.numero_processo_adm or "").strip():
            return self.numero_processo_adm.strip()
        return ""

    def save(self, *args, **kwargs):
        if not self.ano_referencia:
            self.ano_referencia = timezone.localdate().year
        if not (self.numero_processo_sirel or "").strip():
            self.numero_processo_sirel = self.__class__.gerar_numero_processo_sirel(self.ano_referencia)
            if kwargs.get("update_fields") is not None:
                update_fields = set(kwargs["update_fields"])
                update_fields.update({"numero_processo_sirel", "ano_referencia"})
                kwargs["update_fields"] = update_fields
        return super().save(*args, **kwargs)

    def __str__(self):
        base = self.numero_processo_principal
        if f"/{self.ano_referencia}" in base:
            return base
        return f"{base}-{self.ano_referencia}"
    def valor_estimado_brl(self): return fmt_brl(self.valor_estimado)
    def valor_homologado_brl(self): return fmt_brl(self.valor_homologado)

class Lote(models.Model):
    processo = models.ForeignKey(Processo, on_delete=models.CASCADE, related_name="lotes")
    numero = models.PositiveIntegerField()
    titulo = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=50, blank=True, default="")
    escopo = models.CharField(max_length=50, blank=True, default="GLOBAL")
    qtd_itens = models.PositiveIntegerField(default=0)
    quantidade = models.DecimalField(max_digits=18, decimal_places=3, default=0)
    intervalo_minimo = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    exclusivo_me = models.BooleanField(default=False)
    local_entrega = models.CharField(max_length=255, blank=True, default="")
    garantia = models.CharField(max_length=255, blank=True, default="")
    valor_referencia = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    melhor_oferta = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    vencedor = models.CharField(max_length=255, blank=True, default="")
    TIPO_LANCE_CHOICES = [('UNITARIO','Unitário'),('GLOBAL','Global'),('KIT','Kit')]
    tipo_lance = models.CharField(max_length=20, choices=TIPO_LANCE_CHOICES, blank=True, default="")
    history = HistoricalRecords(related_name='historico_lote')
    class Meta:
        unique_together = (("processo", "numero"),)
        ordering = ["numero"]
    def __str__(self): return f"Lote {self.numero} — {self.processo}"

class FornecimentoItem(models.Model):
    processo = models.ForeignKey(Processo, on_delete=models.CASCADE, related_name="itens")
    lote = models.ForeignKey(Lote, null=True, blank=True, on_delete=models.SET_NULL, related_name="itens")
    numero_item = models.PositiveIntegerField()
    descricao = models.TextField()
    unidade = models.CharField(max_length=50, blank=True, default="")
    quantidade = models.DecimalField(max_digits=18, decimal_places=3, default=0)
    valor_unitario = models.DecimalField(max_digits=18, decimal_places=4, default=0)
    valor_total = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    fornecedor = models.ForeignKey('Fornecedor', null=True, blank=True, on_delete=models.SET_NULL, related_name="itens_fornecidos")
    marca = models.CharField(max_length=120, blank=True, default="")
    modelo = models.CharField(max_length=120, blank=True, default="")
    proposta_inicial = models.DecimalField(max_digits=18, decimal_places=4, default=0)
    proposta_final = models.DecimalField(max_digits=18, decimal_places=4, default=0)
    numero_controle_pncp = models.CharField(max_length=80, blank=True, default="")
    codigo_item_externo = models.CharField(max_length=120, blank=True, default="")
    situacao_item_pncp = models.CharField(max_length=120, blank=True, default="")
    situacao_resultado_pncp = models.CharField(max_length=120, blank=True, default="")
    criterio_julgamento_item_pncp = models.CharField(max_length=120, blank=True, default="")
    tipo_item_pncp = models.CharField(max_length=120, blank=True, default="")
    categoria_item_pncp = models.CharField(max_length=120, blank=True, default="")
    ordem_classificacao = models.PositiveIntegerField(null=True, blank=True)
    data_resultado_homologacao = models.DateField(null=True, blank=True)
    valor_unitario_estimado = models.DecimalField(max_digits=18, decimal_places=4, default=0)
    valor_total_estimado = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    valor_unitario_homologado = models.DecimalField(max_digits=18, decimal_places=4, default=0)
    valor_total_homologado = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    pncp_ultima_atualizacao = models.DateTimeField(null=True, blank=True)
    class StatusItem(models.TextChoices):
        PLANEJADO = "PLANEJADO", "Planejado"
        FRACASSADO = "FRACASSADO", "Fracassado"
        CANCELADO = "CANCELADO", "Cancelado"
        HOMOLOGADO = "HOMOLOGADO", "Homologado"
    status_item = models.CharField(max_length=20, choices=StatusItem.choices, blank=True, default=StatusItem.PLANEJADO)
    history = HistoricalRecords(related_name='historico_item')
    class Meta:
        ordering = ["numero_item"]
        unique_together = (("processo", "lote", "numero_item"),)
    def __str__(self): return f"Item {self.numero_item} ({self.processo})"
    def valor_unitario_brl(self): return fmt_brl(self.valor_unitario)
    def valor_total_brl(self): return fmt_brl(self.valor_total)
    def proposta_inicial_brl(self): return fmt_brl(self.proposta_inicial)
    def proposta_final_brl(self): return fmt_brl(self.proposta_final)


class ProcessoItem(models.Model):
    class StatusConsolidado(models.TextChoices):
        PLANEJADO = "PLANEJADO", "Planejado"
        EM_COTACAO = "EM_COTACAO", "Em cotacao"
        HOMOLOGADO = "HOMOLOGADO", "Homologado"
        FRACASSADO = "FRACASSADO", "Fracassado"
        CANCELADO = "CANCELADO", "Cancelado"

    processo = models.ForeignKey(Processo, on_delete=models.CASCADE, related_name="itens_canonicos")
    numero_item = models.PositiveIntegerField()
    item_catalogo = models.ForeignKey(ItemCatalogo, null=True, blank=True, on_delete=models.SET_NULL, related_name="itens_processo")
    descricao_snapshot = models.TextField()
    unidade_snapshot = models.CharField(max_length=30, blank=True, default="")
    quantidade = models.DecimalField(max_digits=18, decimal_places=3, default=0)
    status_consolidado = models.CharField(
        max_length=20,
        choices=StatusConsolidado.choices,
        default=StatusConsolidado.PLANEJADO,
    )
    fornecedor_homologado = models.ForeignKey(
        Fornecedor,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="itens_homologados_processo",
    )
    valor_referencia_unitario = models.DecimalField(max_digits=18, decimal_places=4, default=0)
    valor_referencia_total = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    valor_homologado_unitario = models.DecimalField(max_digits=18, decimal_places=4, default=0)
    valor_homologado_total = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    conflito_lote = models.BooleanField(default=False)
    pncp_ultima_atualizacao = models.DateTimeField(null=True, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["processo_id", "numero_item"]
        unique_together = (("processo", "numero_item"),)
        indexes = [
            models.Index(fields=["processo", "status_consolidado"]),
            models.Index(fields=["numero_item"]),
        ]

    def __str__(self):
        return f"Item proc. {self.processo_id}/{self.numero_item}"


class ProcessoLoteItem(models.Model):
    processo = models.ForeignKey(Processo, on_delete=models.CASCADE, related_name="lote_itens_canonicos")
    lote = models.ForeignKey(Lote, on_delete=models.CASCADE, related_name="itens_canonicos")
    item = models.ForeignKey(ProcessoItem, on_delete=models.CASCADE, related_name="lotes_vinculados")
    ativo = models.BooleanField(default=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["processo_id", "lote__numero", "item__numero_item"]
        unique_together = (("lote", "item"),)
        indexes = [
            models.Index(fields=["processo", "item"]),
            models.Index(fields=["processo", "lote"]),
        ]

    def __str__(self):
        return f"Proc {self.processo_id} - Lote {self.lote_id} - Item {self.item_id}"


class ProcessoItemResultado(models.Model):
    class Origem(models.TextChoices):
        OFERTA = "OFERTA", "Oferta"
        RESULTADO_LOTE = "RESULTADO_LOTE", "Resultado do lote"
        ITEM_LEGADO = "ITEM_LEGADO", "Item legado"
        PNCP = "PNCP", "PNCP"
        MANUAL = "MANUAL", "Manual"

    class StatusResultado(models.TextChoices):
        CLASSIFICADO = "CLASSIFICADO", "Classificado"
        DESCLASSIFICADO = "DESCLASSIFICADO", "Desclassificado"
        INABILITADO = "INABILITADO", "Inabilitado"
        VENCEDOR = "VENCEDOR", "Vencedor"
        HOMOLOGADO = "HOMOLOGADO", "Homologado"
        FRACASSADO = "FRACASSADO", "Fracassado"
        CANCELADO = "CANCELADO", "Cancelado"

    processo = models.ForeignKey(Processo, on_delete=models.CASCADE, related_name="resultados_itens_canonicos")
    processo_item = models.ForeignKey(ProcessoItem, on_delete=models.CASCADE, related_name="resultados")
    fornecedor = models.ForeignKey(
        Fornecedor,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="resultados_itens_processo",
    )
    origem = models.CharField(max_length=20, choices=Origem.choices, default=Origem.MANUAL)
    chave_origem = models.CharField(max_length=160, blank=True, default="")
    status_resultado = models.CharField(
        max_length=20,
        choices=StatusResultado.choices,
        default=StatusResultado.CLASSIFICADO,
    )
    classificacao = models.PositiveIntegerField(null=True, blank=True)
    valor_unitario = models.DecimalField(max_digits=18, decimal_places=4, default=0)
    valor_total = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    data_resultado = models.DateField(null=True, blank=True)
    situacao_texto = models.CharField(max_length=140, blank=True, default="")
    payload_resumo = models.JSONField(default=dict, blank=True)
    ativo = models.BooleanField(default=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["processo_id", "processo_item__numero_item", "classificacao", "id"]
        unique_together = (("processo_item", "origem", "chave_origem"),)
        indexes = [
            models.Index(fields=["processo", "origem"]),
            models.Index(fields=["processo_item", "status_resultado"]),
            models.Index(fields=["fornecedor"]),
        ]

    def __str__(self):
        return f"Res {self.processo_item_id} - {self.origem} - {self.status_resultado}"




class ItemResultado(models.Model):
    lote = models.ForeignKey(Lote, on_delete=models.CASCADE, related_name="resultados")
    posicao = models.PositiveIntegerField()
    fornecedor = models.ForeignKey(Fornecedor, null=True, blank=True, on_delete=models.SET_NULL)
    valor_total = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    microempresa = models.BooleanField(default=False)
    classificado = models.BooleanField(default=False)
    habilitado = models.BooleanField(default=False)
    history = HistoricalRecords(related_name='historico_resultado')
    class Meta:
        unique_together = (("lote", "posicao"),)
        ordering = ["lote__numero", "posicao"]
    def __str__(self): return f"Classificação {self.lote} pos. {self.posicao}"
    def valor_total_brl(self): return fmt_brl(self.valor_total)

# ======= Ligações N:N do Processo =======
class ProcessoFonte(models.Model):
    processo = models.ForeignKey(Processo, on_delete=models.CASCADE)
    fonte = models.ForeignKey(FonteRecurso, on_delete=models.CASCADE)
    class Meta: unique_together = (("processo", "fonte"),)

class ProcessoElemento(models.Model):
    processo = models.ForeignKey(Processo, on_delete=models.CASCADE)
    elemento = models.ForeignKey(ElementoDespesa, on_delete=models.CASCADE)
    class Meta: unique_together = (("processo", "elemento"),)

class ProcessoProjeto(models.Model):
    processo = models.ForeignKey(Processo, on_delete=models.CASCADE)
    projeto = models.ForeignKey(ProjetoAtividade, on_delete=models.CASCADE)
    class Meta: unique_together = (("processo", "projeto"),)

class ProcessoUnidade(models.Model):
    processo = models.ForeignKey(Processo, on_delete=models.CASCADE)
    unidade = models.ForeignKey(UnidadeOrcamentaria, on_delete=models.CASCADE)
    class Meta: unique_together = (("processo", "unidade"),)

# ======= Observações e CI =======
class Observacao(models.Model):
    processo = models.ForeignKey(Processo, on_delete=models.CASCADE, related_name="observacoes")
    data_hora = models.DateTimeField(auto_now_add=True)
    titulo = models.CharField(max_length=200)
    texto = models.TextField(blank=True, default="")
    usuario = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    history = HistoricalRecords(related_name='historico_observacao')
    class Meta: ordering = ["-data_hora"]
    def __str__(self): return self.titulo

class CI(models.Model):
    class Tipo(models.TextChoices):
        RESERVA = "RESERVA", "Reserva Orçamentária"
        PARECER_JURIDICO = "PARECER_JURIDICO", "Parecer Jurídico"
        PARECER_TECNICO = "PARECER_TECNICO", "Parecer Técnico"
        OUTROS = "OUTROS", "Outros"
    processo = models.ForeignKey(Processo, on_delete=models.CASCADE, related_name="cis")
    tipo = models.CharField(max_length=30, choices=Tipo.choices)
    numero = models.CharField(max_length=50, blank=True, default="")
    data = models.DateField(null=True, blank=True)
    assunto = models.CharField(max_length=255, blank=True, default="")
    conteudo = models.TextField(blank=True, default="")
    history = HistoricalRecords(related_name='historico_ci')
    class Meta: ordering = ["-data"]
    def __str__(self): return f"{self.get_tipo_display()} - {self.numero}"

# ======= CONTRATOS =======
class Contrato(models.Model):
    processo = models.ForeignKey(Processo, on_delete=models.PROTECT, related_name="contratos")
    fornecedor = models.ForeignKey(Fornecedor, on_delete=models.PROTECT, related_name="contratos")
    # Opcional: quando desejarmos separar por lote explicitamente
    lote = models.ForeignKey(Lote, null=True, blank=True, on_delete=models.SET_NULL, related_name="contratos")
    numero = models.CharField(max_length=40, blank=True, default="")  # ex.: 123/2025
    objeto = models.TextField(blank=True, default="")
    secretaria = models.ForeignKey(Secretaria, on_delete=models.SET_NULL, null=True, blank=True)
    data_assinatura = models.DateField(null=True, blank=True)
    vigencia_inicio = models.DateField(null=True, blank=True)
    vigencia_fim = models.DateField(null=True, blank=True)
    valor_inicial = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    valor_atual = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    publicado_em = models.DateField(null=True, blank=True)
    link_publicacao = models.URLField(blank=True, default="")
    history = HistoricalRecords(related_name='historico_contrato')

    class Meta:
        ordering = ["-data_assinatura", "fornecedor__razao_social"]
        unique_together = (("processo", "fornecedor", "numero"),)

    def __str__(self):
        base = self.numero or "Contrato"
        return f"{base} - {self.fornecedor.razao_social}"

    # Helpers BRL
    def valor_inicial_brl(self): return fmt_brl(self.valor_inicial)
    def valor_atual_brl(self): return fmt_brl(self.valor_atual)

class ContratoItem(models.Model):
    contrato = models.ForeignKey(Contrato, on_delete=models.CASCADE, related_name="itens")
    lote = models.ForeignKey(Lote, null=True, blank=True, on_delete=models.SET_NULL)
    item = models.ForeignKey(FornecimentoItem, on_delete=models.SET_NULL, null=True, blank=True)
    descricao_snapshot = models.TextField(blank=True, default="")
    unidade_snapshot = models.CharField(max_length=50, blank=True, default="")
    quantidade = models.DecimalField(max_digits=18, decimal_places=3, default=0)
    valor_unitario = models.DecimalField(max_digits=18, decimal_places=4, default=0)
    valor_total = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    history = HistoricalRecords(related_name='historico_contrato_item')

    class Meta:
        ordering = ["contrato_id", "lote_id"]

    def valor_unitario_brl(self): return fmt_brl(self.valor_unitario)
    def valor_total_brl(self): return fmt_brl(self.valor_total)

class Aditivo(models.Model):
    class Tipo(models.TextChoices):
        PRORROGACAO = "PRORROGACAO", "Prorrogação"
        ACRESCIMO = "ACRESCIMO", "Acréscimo"
        SUPRESSAO = "SUPRESSAO", "Supressão"
        REEQUILIBRIO = "REEQUILIBRIO", "Reequilíbrio"
        OUTROS = "OUTROS", "Outros"
    contrato = models.ForeignKey(Contrato, on_delete=models.CASCADE, related_name="aditivos")
    numero = models.CharField(max_length=40, blank=True, default="")
    tipo = models.CharField(max_length=20, choices=Tipo.choices)
    data = models.DateField(null=True, blank=True)
    dias_prorrogacao = models.PositiveIntegerField(default=0)
    valor_acrescimo = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    valor_supressao = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    novo_vigencia_fim = models.DateField(null=True, blank=True)
    justificativa = models.TextField(blank=True, default="")
    history = HistoricalRecords(related_name='historico_aditivo')

    class Meta:
        ordering = ["contrato_id", "data"]

    def efeito_valor(self):
        return (self.valor_acrescimo or 0) - (self.valor_supressao or 0)

    def efeito_valor_brl(self): return fmt_brl(self.efeito_valor())

class Empenho(models.Model):
    contrato = models.ForeignKey(Contrato, on_delete=models.CASCADE, related_name="empenhos")
    numero = models.CharField(max_length=60)
    data = models.DateField(null=True, blank=True)
    valor = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    history = HistoricalRecords(related_name='historico_empenho')
    class Meta: ordering = ["-data"]
    def __str__(self): return self.numero
    def valor_brl(self): return fmt_brl(self.valor)

class Pagamento(models.Model):
    contrato = models.ForeignKey(Contrato, on_delete=models.CASCADE, related_name="pagamentos")
    data = models.DateField(null=True, blank=True)
    valor = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    nota_fiscal = models.CharField(max_length=60, blank=True, default="")
    observacao = models.TextField(blank=True, default="")
    history = HistoricalRecords(related_name='historico_pagamento')
    class Meta: ordering = ["-data"]
    def valor_brl(self): return fmt_brl(self.valor)

class FiscalContrato(models.Model):
    contrato = models.ForeignKey(Contrato, on_delete=models.CASCADE, related_name="fiscais")
    pessoa = models.ForeignKey(Pessoa, on_delete=models.PROTECT)
    titular = models.BooleanField(default=False)
    history = HistoricalRecords(related_name='historico_fiscal_contrato')
    class Meta:
        unique_together = (("contrato","pessoa"),)

class PublicacaoContrato(models.Model):
    contrato = models.ForeignKey(Contrato, on_delete=models.CASCADE, related_name="publicacoes")
    diario = models.CharField(max_length=120, blank=True, default="Diário Oficial")
    data = models.DateField(null=True, blank=True)
    link = models.URLField(blank=True, default="")
    history = HistoricalRecords(related_name='historico_publicacao_contrato')
    class Meta: ordering = ["-data"]

from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

from django import forms
from django.contrib.auth import get_user_model
from django.forms import ModelForm
from django.utils.dateparse import parse_date
from django.utils import timezone

from core.models import (
    ElementoDespesa,
    FonteRecurso,
    Fornecedor,
    Modalidade,
    OrgaoEntidade,
    Pessoa,
    Processo,
    ProjetoAtividade,
    Secretaria,
    StatusProcesso,
    UnidadeOrcamentaria,
)
from .models import (
    DFDItem,
    DFDItemCatalogo,
    ETPCotacaoFonte,
    ETPCotacaoItem,
    ETPPlanejamento,
    FrequenciaRegistro,
    ModuloSistema,
    PlanejamentoDFD,
    TRDistribuicaoSecretaria,
    TRDotacao,
    TRLote,
    TRPlanejamento,
)


def _parse_initial_date(valor):
    if not valor:
        return None
    if hasattr(valor, "isoformat"):
        return valor
    if isinstance(valor, str):
        convertido = parse_date(valor)
        if convertido:
            return convertido
        for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
            try:
                return datetime.strptime(valor, fmt).date()
            except ValueError:
                continue
    return None


def _to_bool(value):
    return value in (True, "True", "true", "1", 1, "on", "sim", "Sim")


def _bool_choice(value):
    return "1" if bool(value) else "0"


User = get_user_model()

DOC_ASSINADO_CHOICES = [
    ("dfd", "DFD"),
    ("mapa", "Mapa comparativo (ETP)"),
    ("distribuicao", "Mapa de distribuição por secretaria"),
    ("tr", "Termo de Referência"),
    ("ci", "Comunicação Interna (C.I.)"),
    ("sd", "Solicitação de Despesa"),
    ("mapa_compras", "Mapa comparativo (Compras)"),
    ("declaracao_desconsideracao", "Declaração de preços desconsiderados"),
]


class ProcessoPlanejamentoForm(forms.Form):
    ano_referencia = forms.IntegerField(
        label="Ano de referência",
        min_value=2023,
        max_value=2100,
        initial=lambda: timezone.localdate().year,
    )
    numero_processo_externo = forms.CharField(
        label="Número de referência externa (opcional)",
        max_length=40,
        required=False,
    )
    objeto = forms.CharField(label="Objeto resumido do processo", widget=forms.Textarea(attrs={"rows": 3}))


class LicitacaoProcessoExternoForm(forms.Form):
    ano_referencia = forms.IntegerField(
        label="Ano de referência",
        min_value=2023,
        max_value=2100,
        initial=lambda: timezone.localdate().year,
    )
    numero_processo_externo = forms.CharField(
        label="Número do processo externo",
        max_length=40,
        required=True,
    )
    numero_edital = forms.CharField(
        label="Número do edital (opcional)",
        max_length=40,
        required=False,
    )
    objeto = forms.CharField(
        label="Objeto resumido",
        widget=forms.Textarea(attrs={"rows": 3}),
        required=True,
    )
    secretaria = forms.ModelChoiceField(
        label="Secretaria responsável",
        queryset=Secretaria.objects.none(),
        required=False,
        empty_label="Selecione (opcional)",
    )
    modalidade = forms.ModelChoiceField(
        label="Modalidade",
        queryset=Modalidade.objects.none(),
        required=True,
        empty_label=None,
    )
    status = forms.ModelChoiceField(
        label="Status do processo",
        queryset=StatusProcesso.objects.none(),
        required=False,
        empty_label="Selecionar automaticamente",
    )
    data_publicacao = forms.DateField(
        label="Data de publicação (opcional)",
        required=False,
        input_formats=["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"],
        widget=forms.DateInput(format="%Y-%m-%d", attrs={"type": "date"}),
    )
    valor_estimado = forms.DecimalField(
        label="Valor estimado (opcional)",
        required=False,
        max_digits=18,
        decimal_places=2,
        min_value=Decimal("0"),
    )
    confirmar_pendencias = forms.BooleanField(
        label="Confirmo o registro mesmo com pendências documentais",
        required=False,
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["secretaria"].queryset = Secretaria.objects.order_by("sigla", "nome")
        self.fields["modalidade"].queryset = Modalidade.objects.order_by("nome")
        self.fields["status"].queryset = StatusProcesso.objects.order_by("nome")

        modalidade_inicial = (
            Modalidade.objects.filter(nome__icontains="dispensa").order_by("nome").first()
            or Modalidade.objects.order_by("nome").first()
        )
        if modalidade_inicial and not self.initial.get("modalidade"):
            self.initial["modalidade"] = modalidade_inicial.id

        status_inicial = (
            StatusProcesso.objects.filter(nome__icontains="LICIT").order_by("nome").first()
            or StatusProcesso.objects.filter(nome__icontains="ANDAMENTO").order_by("nome").first()
        )
        if status_inicial and not self.initial.get("status"):
            self.initial["status"] = status_inicial.id


class ComunicacaoInternaForm(forms.Form):
    destinatario_modulo = forms.ChoiceField(label="Destinatário (departamento)")
    processo_referencia = forms.ModelChoiceField(
        label="Processo de referência",
        queryset=Processo.objects.none(),
        required=False,
        empty_label="Selecione (opcional)",
    )
    data_comunicacao = forms.DateField(
        label="Data da comunicação",
        required=True,
        input_formats=["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"],
        widget=forms.DateInput(format="%Y-%m-%d", attrs={"type": "date"}),
    )
    assunto = forms.CharField(label="Assunto", max_length=255)
    mensagem = forms.CharField(label="Corpo da comunicação", widget=forms.Textarea(attrs={"rows": 12}))
    responsavel_envio = forms.CharField(label="Responsável pelo envio", max_length=255)
    signatarios = forms.ModelMultipleChoiceField(
        label="Signatários",
        queryset=Pessoa.objects.none(),
        required=True,
        widget=forms.SelectMultiple(attrs={"size": 8}),
    )
    observacao = forms.CharField(
        label="Observações complementares",
        required=False,
        widget=forms.Textarea(attrs={"rows": 4}),
    )

    def __init__(self, *args, **kwargs):
        modulo_origem = kwargs.pop("modulo_origem", None)
        processo_atual = kwargs.pop("processo_atual", None)
        destino_inicial = kwargs.pop("destino_inicial", "")
        super().__init__(*args, **kwargs)

        choices = []
        for codigo, rotulo in ModuloSistema.choices:
            if codigo == modulo_origem:
                continue
            if codigo in [ModuloSistema.DASHBOARDS, ModuloSistema.DOCUMENTOS, ModuloSistema.INTEGRACAO, ModuloSistema.FREQUENCIA]:
                continue
            choices.append((codigo, rotulo))
        self.fields["destinatario_modulo"].choices = choices
        if destino_inicial:
            self.initial["destinatario_modulo"] = destino_inicial
        elif choices:
            self.initial["destinatario_modulo"] = choices[0][0]

        self.fields["processo_referencia"].queryset = Processo.objects.order_by(
            "-ano_referencia",
            "-numero_processo_sirel",
            "-numero_processo_adm",
        )[:400]
        if processo_atual:
            self.initial.setdefault("processo_referencia", processo_atual.id)

        self.fields["signatarios"].queryset = Pessoa.objects.select_related("secretaria").order_by("nome")


class DFDForm(ModelForm):
    responsavel_pessoa_id = forms.IntegerField(required=False, widget=forms.HiddenInput())
    data_demanda = forms.DateField(
        label="Data da demanda",
        required=True,
        input_formats=["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"],
        widget=forms.DateInput(format="%Y-%m-%d", attrs={"type": "date"}),
    )
    previsao_entrega_execucao = forms.DateField(
        label="Previsão de entrega/execução",
        required=False,
        input_formats=["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"],
        widget=forms.DateInput(format="%Y-%m-%d", attrs={"type": "date"}),
    )
    secretarias = forms.ModelMultipleChoiceField(
        label="Secretarias participantes",
        queryset=Secretaria.objects.all(),
        required=False,
        widget=forms.CheckboxSelectMultiple,
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        data_demanda = _parse_initial_date(self.initial.get("data_demanda"))
        previsao = _parse_initial_date(self.initial.get("previsao_entrega_execucao"))
        if data_demanda:
            self.initial["data_demanda"] = data_demanda
        if previsao:
            self.initial["previsao_entrega_execucao"] = previsao

        self.fields["responsavel_demanda"].widget = forms.TextInput(
            attrs={
                "autocomplete": "off",
                "placeholder": "Digite para buscar a pessoa cadastrada",
                "data-pessoa-autocomplete": "1",
                "list": "responsavel-demanda-sugestoes",
            }
        )

        pessoa = getattr(self.instance, "responsavel_pessoa", None)
        if pessoa:
            self.initial["responsavel_pessoa_id"] = pessoa.id
            if not self.initial.get("responsavel_demanda"):
                self.initial["responsavel_demanda"] = pessoa.nome
            if not self.initial.get("cargo_funcao"):
                self.initial["cargo_funcao"] = pessoa.cargo

        self._responsavel_pessoa = pessoa

    def clean(self):
        cleaned_data = super().clean()
        pessoa_id = cleaned_data.get("responsavel_pessoa_id")
        nome_digitado = (cleaned_data.get("responsavel_demanda") or "").strip()
        pessoa = None

        if pessoa_id:
            pessoa = Pessoa.objects.filter(pk=pessoa_id).first()
            if not pessoa:
                raise forms.ValidationError("A pessoa selecionada para responsável não foi encontrada.")
        elif nome_digitado:
            pessoa = Pessoa.objects.filter(nome__iexact=nome_digitado).first()

        if pessoa:
            cleaned_data["responsavel_demanda"] = pessoa.nome
            cleaned_data["cargo_funcao"] = pessoa.cargo or cleaned_data.get("cargo_funcao", "")
            self._responsavel_pessoa = pessoa
        else:
            # Se não houver cadastro prévio, a pessoa será criada no save.
            self._responsavel_pessoa = None

        return cleaned_data

    def save(self, commit=True):
        obj = super().save(commit=False)
        previsao = self.cleaned_data.get("previsao_entrega_execucao")
        obj.previsao_entrega_execucao = previsao.isoformat() if previsao else ""

        pessoa = self._responsavel_pessoa
        nome_digitado = (self.cleaned_data.get("responsavel_demanda") or "").strip()
        cargo_digitado = (self.cleaned_data.get("cargo_funcao") or "").strip()
        if not pessoa and nome_digitado:
            pessoa = Pessoa.objects.filter(nome__iexact=nome_digitado).first()
            if not pessoa:
                pessoa = Pessoa.objects.create(nome=nome_digitado, cargo=cargo_digitado)
            elif cargo_digitado and not pessoa.cargo:
                pessoa.cargo = cargo_digitado
                pessoa.save(update_fields=["cargo"])
            obj.responsavel_demanda = pessoa.nome
            obj.cargo_funcao = pessoa.cargo or cargo_digitado

        obj.responsavel_pessoa = pessoa
        if commit:
            obj.save()
        return obj

    class Meta:
        model = PlanejamentoDFD
        fields = [
            "objeto_resumido",
            "descricao_detalhada",
            "data_demanda",
            "modalidade_pretendida",
            "tipo_contratacao_planejamento",
            "especie_contratacao",
            "responsavel_demanda",
            "cargo_funcao",
            "justificativa_contratacao",
            "fundamento_legal",
            "previsao_entrega_execucao",
        ]
        widgets = {
            "descricao_detalhada": forms.Textarea(attrs={"rows": 4}),
            "justificativa_contratacao": forms.Textarea(attrs={"rows": 4}),
            "fundamento_legal": forms.Textarea(attrs={"rows": 3}),
        }


class DFDItemCatalogoForm(ModelForm):
    class Meta:
        model = DFDItemCatalogo
        fields = ["descricao", "unidade"]
        widgets = {
            "descricao": forms.Textarea(attrs={"rows": 12, "placeholder": "Descrição completa do item do catálogo"}),
            "unidade": forms.TextInput(attrs={"placeholder": "UND, KG, L, M2..."}),
        }


class DFDItemForm(ModelForm):
    descricao = forms.CharField(
        label="Descrição",
        required=False,
        widget=forms.Textarea(attrs={"rows": 10, "placeholder": "Descrição detalhada do item"}),
    )
    unidade = forms.CharField(
        label="Unidade",
        required=False,
        widget=forms.TextInput(attrs={"placeholder": "UND, KG, L, M2...", "maxlength": "30"}),
    )
    usar_catalogo = forms.ModelChoiceField(
        queryset=DFDItemCatalogo.objects.all().order_by("descricao"),
        required=False,
        widget=forms.HiddenInput(),
    )
    catalogo_item_id = forms.IntegerField(required=False, widget=forms.HiddenInput())
    catalogo_busca = forms.CharField(
        label="Buscar item no catálogo",
        required=False,
        widget=forms.TextInput(
            attrs={
                "autocomplete": "off",
                "placeholder": "Digite código ou descrição para localizar item",
                "list": "catalogo-item-sugestoes",
            }
        ),
    )

    def clean(self):
        cleaned_data = super().clean()
        catalogo_item_id = cleaned_data.get("catalogo_item_id")
        if catalogo_item_id:
            item_catalogo = DFDItemCatalogo.objects.filter(pk=catalogo_item_id).first()
            if not item_catalogo:
                raise forms.ValidationError("O item selecionado no catálogo não foi encontrado.")
            cleaned_data["usar_catalogo"] = item_catalogo

        if not cleaned_data.get("usar_catalogo") and not cleaned_data.get("descricao"):
            raise forms.ValidationError("Informe a descrição manualmente ou selecione um item do catálogo.")
        return cleaned_data

    class Meta:
        model = DFDItem
        fields = ["descricao", "unidade", "quantidade"]


class DFDItemEdicaoForm(ModelForm):
    class Meta:
        model = DFDItem
        fields = ["descricao", "unidade", "quantidade"]
        widgets = {
            "descricao": forms.Textarea(attrs={"rows": 8}),
            "unidade": forms.TextInput(attrs={"maxlength": "30"}),
        }


class ETPForm(ModelForm):
    havera_irp = forms.TypedChoiceField(
        label="Haverá IRP",
        choices=(("1", "Sim"), ("0", "Não")),
        coerce=_to_bool,
        widget=forms.Select,
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.pk:
            self.initial["havera_irp"] = _bool_choice(self.instance.havera_irp)

    class Meta:
        model = ETPPlanejamento
        fields = ["metodologia_cotacao", "havera_irp", "observacoes"]
        widgets = {"observacoes": forms.Textarea(attrs={"rows": 4})}


class ETPCotacaoFonteForm(ModelForm):
    fornecedor = forms.ModelChoiceField(
        label="Fornecedor cadastrado",
        required=False,
        queryset=Fornecedor.objects.all().order_by("razao_social"),
        empty_label="Selecione (opcional)",
    )

    def clean(self):
        cleaned_data = super().clean()
        fornecedor = cleaned_data.get("fornecedor")
        nome_fonte = (cleaned_data.get("nome_fonte") or "").strip()
        tipo_fonte = cleaned_data.get("tipo_fonte")
        if tipo_fonte == ETPCotacaoFonte.TipoFonte.FORNECEDOR:
            if fornecedor and not nome_fonte:
                cleaned_data["nome_fonte"] = fornecedor.razao_social
            if not fornecedor and not nome_fonte:
                raise forms.ValidationError("Selecione um fornecedor cadastrado ou informe o nome da fonte.")
        return cleaned_data

    class Meta:
        model = ETPCotacaoFonte
        fields = ["fornecedor", "nome_fonte", "tipo_fonte", "identificacao_documento", "data_consulta"]
        widgets = {
            "data_consulta": forms.DateInput(attrs={"type": "date"}),
        }


class ETPCotacaoItemForm(ModelForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["item"].label_from_instance = lambda item: f"{item.codigo} - {item.descricao[:90]}"
        self.fields["fonte"].label_from_instance = lambda fonte: f"{fonte.nome_fonte} ({fonte.get_tipo_fonte_display()})"

    def clean_valor_unitario(self):
        valor = self.cleaned_data["valor_unitario"]
        return Decimal(valor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    class Meta:
        model = ETPCotacaoItem
        fields = ["item", "fonte", "valor_unitario", "observacao"]
        widgets = {"observacao": forms.Textarea(attrs={"rows": 2})}


class ETPCotacaoEdicaoForm(ModelForm):
    def clean_valor_unitario(self):
        valor = self.cleaned_data["valor_unitario"]
        return Decimal(valor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    class Meta:
        model = ETPCotacaoItem
        fields = ["valor_unitario", "observacao"]
        widgets = {"observacao": forms.Textarea(attrs={"rows": 3})}


class TRForm(ModelForm):
    nao_aplica_divisao_secretaria = forms.TypedChoiceField(
        label="Não aplica divisão por secretaria",
        choices=(("1", "Sim"), ("0", "Não")),
        coerce=_to_bool,
        widget=forms.Select,
    )
    permite_exclusividade_me_epp = forms.TypedChoiceField(
        label="Permite exclusividade ME/EPP",
        choices=(("1", "Sim"), ("0", "Não")),
        coerce=_to_bool,
        widget=forms.Select,
    )
    permite_cota_reservada = forms.TypedChoiceField(
        label="Permite cota reservada",
        choices=(("1", "Sim"), ("0", "Não")),
        coerce=_to_bool,
        widget=forms.Select,
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.pk:
            self.initial["nao_aplica_divisao_secretaria"] = _bool_choice(self.instance.nao_aplica_divisao_secretaria)
            self.initial["permite_exclusividade_me_epp"] = _bool_choice(self.instance.permite_exclusividade_me_epp)
            self.initial["permite_cota_reservada"] = _bool_choice(self.instance.permite_cota_reservada)

    class Meta:
        model = TRPlanejamento
        fields = [
            "arquivo_tr_pdf",
            "arquivo_irp_pdf",
            "criterio_julgamento",
            "nao_aplica_divisao_secretaria",
            "permite_exclusividade_me_epp",
            "permite_cota_reservada",
            "comunicacao_demanda_pdf",
        ]


class TRLoteForm(ModelForm):
    class Meta:
        model = TRLote
        fields = ["titulo"]


class TRDotacaoForm(ModelForm):
    def clean(self):
        cleaned_data = super().clean()
        campos = ["secretaria", "unidade_orcamentaria", "projeto_atividade", "elemento_despesa", "fonte_recurso"]
        if not any(cleaned_data.get(campo) for campo in campos):
            raise forms.ValidationError("Informe pelo menos um campo para adicionar a dotação.")
        return cleaned_data

    class Meta:
        model = TRDotacao
        fields = ["secretaria", "unidade_orcamentaria", "projeto_atividade", "elemento_despesa", "fonte_recurso"]


class TRDistribuicaoSecretariaForm(ModelForm):
    class Meta:
        model = TRDistribuicaoSecretaria
        fields = ["secretaria", "item", "quantidade"]


class CadastroPessoaForm(ModelForm):
    class Meta:
        model = Pessoa
        fields = ["nome", "cpf", "cargo", "secretaria"]


class CadastroSecretariaForm(ModelForm):
    class Meta:
        model = Secretaria
        fields = ["sigla", "nome"]


class CadastroUnidadeOrcamentariaForm(ModelForm):
    class Meta:
        model = UnidadeOrcamentaria
        fields = ["sigla", "nome"]


class CadastroProjetoAtividadeForm(ModelForm):
    class Meta:
        model = ProjetoAtividade
        fields = ["codigo", "descricao"]


class CadastroElementoDespesaForm(ModelForm):
    class Meta:
        model = ElementoDespesa
        fields = ["codigo", "descricao"]


class CadastroFonteRecursoForm(ModelForm):
    class Meta:
        model = FonteRecurso
        fields = ["codigo", "descricao"]


class CadastroFornecedorForm(ModelForm):
    class Meta:
        model = Fornecedor
        fields = [
            "razao_social",
            "cnpj",
            "email",
            "telefone",
            "endereco",
            "bairro",
            "complemento",
            "cep",
            "cidade",
            "estado",
        ]


class CadastroOrgaoForm(ModelForm):
    class Meta:
        model = OrgaoEntidade
        fields = [
            "nome_fantasia",
            "razao_social",
            "cnpj",
            "inscricao_estadual",
            "endereco",
            "numero",
            "complemento",
            "bairro",
            "cidade",
            "uf",
            "cep",
            "telefone",
            "email",
            "site",
            "logo",
        ]


class CadastroCatalogoItemForm(ModelForm):
    class Meta:
        model = DFDItemCatalogo
        fields = ["codigo", "descricao", "unidade"]
        widgets = {
            "descricao": forms.Textarea(attrs={"rows": 4}),
        }


class CadastroUsuarioForm(ModelForm):
    senha = forms.CharField(
        label="Senha",
        required=False,
        widget=forms.PasswordInput(render_value=True),
        help_text="Preencha para definir/alterar senha. Deixe em branco para manter.",
    )

    class Meta:
        model = User
        fields = ["username", "first_name", "last_name", "email", "is_active", "is_staff"]
        labels = {
            "first_name": "Nome",
            "last_name": "Sobrenome",
            "is_active": "Ativo",
            "is_staff": "Equipe/Admin",
        }

    def save(self, commit=True):
        usuario = super().save(commit=False)
        senha = (self.cleaned_data.get("senha") or "").strip()
        if senha:
            usuario.set_password(senha)
        elif not usuario.pk:
            usuario.set_unusable_password()
        if commit:
            usuario.save()
        return usuario


class PerfilUsuarioForm(ModelForm):
    class Meta:
        model = User
        fields = ["first_name", "last_name", "email"]
        labels = {
            "first_name": "Nome",
            "last_name": "Sobrenome",
            "email": "E-mail",
        }


class DocumentoAssinadoUploadForm(forms.Form):
    doc_key = forms.ChoiceField(label="Documento gerado", choices=DOC_ASSINADO_CHOICES)
    arquivo = forms.FileField(label="Arquivo assinado")


class LicitacaoDocumentoUploadForm(forms.Form):
    doc_codigo = forms.ChoiceField(label="Documento da checklist")
    arquivo = forms.FileField(label="Arquivo do documento")

    def __init__(self, *args, **kwargs):
        doc_choices = kwargs.pop("doc_choices", ())
        super().__init__(*args, **kwargs)
        self.fields["doc_codigo"].choices = list(doc_choices)


class ComprasPesquisaForm(ModelForm):
    class Meta:
        model = ETPPlanejamento
        fields = ["metodologia_cotacao", "observacoes"]
        widgets = {
            "observacoes": forms.Textarea(attrs={"rows": 4}),
        }


class ComprasComprovanteUploadForm(forms.Form):
    arquivo = forms.FileField(label="Arquivo de comprovação (PDF/planilha/imagem)")


class FrequenciaRegistroForm(ModelForm):
    nao_trabalhado_util = forms.TypedChoiceField(
        label='Dia útil não trabalhado',
        choices=(('0', 'Não'), ('1', 'Sim')),
        coerce=_to_bool,
        widget=forms.Select,
    )

    class Meta:
        model = FrequenciaRegistro
        fields = [
            'data',
            'nao_trabalhado_util',
            'entrada',
            'inicio_intervalo',
            'fim_intervalo',
            'saida',
            'justificativa_horas_extras',
            'justificativa_nao_trabalhado',
            'observacao',
        ]
        widgets = {
            'data': forms.DateInput(attrs={'type': 'date'}),
            'entrada': forms.TimeInput(attrs={'type': 'time', 'step': 60}),
            'inicio_intervalo': forms.TimeInput(attrs={'type': 'time', 'step': 60}),
            'fim_intervalo': forms.TimeInput(attrs={'type': 'time', 'step': 60}),
            'saida': forms.TimeInput(attrs={'type': 'time', 'step': 60}),
            'justificativa_horas_extras': forms.Textarea(attrs={'rows': 3}),
            'justificativa_nao_trabalhado': forms.Textarea(attrs={'rows': 3}),
            'observacao': forms.Textarea(attrs={'rows': 2}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.pk:
            self.initial['nao_trabalhado_util'] = _bool_choice(self.instance.nao_trabalhado_util)
        else:
            self.initial.setdefault('nao_trabalhado_util', '0')

    def clean(self):
        cleaned_data = super().clean()
        nao_trabalhado = bool(cleaned_data.get('nao_trabalhado_util'))
        entrada = cleaned_data.get('entrada')
        inicio_intervalo = cleaned_data.get('inicio_intervalo')
        fim_intervalo = cleaned_data.get('fim_intervalo')
        saida = cleaned_data.get('saida')
        justificativa_nao_trabalhado = (cleaned_data.get('justificativa_nao_trabalhado') or '').strip()
        justificativa_extras = (cleaned_data.get('justificativa_horas_extras') or '').strip()

        if nao_trabalhado:
            if not justificativa_nao_trabalhado:
                raise forms.ValidationError('Informe justificativa para dia útil não trabalhado.')
            cleaned_data['entrada'] = None
            cleaned_data['inicio_intervalo'] = None
            cleaned_data['fim_intervalo'] = None
            cleaned_data['saida'] = None
            cleaned_data['justificativa_horas_extras'] = ''
            return cleaned_data

        if not all([entrada, inicio_intervalo, fim_intervalo, saida]):
            raise forms.ValidationError('Para dia trabalhado, informe entrada, início e volta do intervalo e saída.')

        if not (entrada < inicio_intervalo < fim_intervalo < saida):
            raise forms.ValidationError('A ordem dos horários deve ser: entrada < início intervalo < volta intervalo < saída.')

        dummy = FrequenciaRegistro(
            data=cleaned_data.get('data'),
            entrada=entrada,
            inicio_intervalo=inicio_intervalo,
            fim_intervalo=fim_intervalo,
            saida=saida,
            nao_trabalhado_util=False,
        )
        _, minutos_extras = dummy.calcular_totais()
        if minutos_extras > 0 and not justificativa_extras:
            raise forms.ValidationError('Informe justificativa para horas extras.')

        return cleaned_data

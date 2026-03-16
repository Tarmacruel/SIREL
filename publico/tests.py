from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse

from core.models import Fornecedor, Processo, ProcessoItem
from docs.models import ProcessoAnexo
from workflow.models import ProcessoWorkflow


class PublicoConsultaTest(TestCase):
    def setUp(self):
        self.processo_publico = Processo.objects.create(
            numero_processo_adm="PROC-PUB-001",
            numero_edital="PE-001",
            ano_referencia=2026,
            objeto="Processo publicado para consulta",
            valor_estimado=1000,
            valor_homologado=900,
        )
        ProcessoWorkflow.objects.create(
            processo=self.processo_publico,
            publicado=True,
            etapa_atual="PUBLICADO NO PNCP",
        )

        self.processo_privado = Processo.objects.create(
            numero_processo_adm="PROC-PRIV-001",
            numero_edital="PE-PRIV",
            ano_referencia=2026,
            objeto="Processo interno ainda nao publicado",
            valor_estimado=500,
            valor_homologado=0,
        )
        ProcessoWorkflow.objects.create(
            processo=self.processo_privado,
            publicado=False,
            etapa_atual="EM PLANEJAMENTO",
        )

    def test_lista_publica_retorna_200_e_filtra_publicados(self):
        response = self.client.get(reverse("publico:lista"))
        self.assertEqual(response.status_code, 200)
        ids = [p.id for p in response.context["lista"]]
        self.assertIn(self.processo_publico.id, ids)
        self.assertNotIn(self.processo_privado.id, ids)

    def test_detalhe_de_processo_nao_publicado_retorna_404(self):
        response = self.client.get(reverse("publico:detalhe", args=[self.processo_privado.id]))
        self.assertEqual(response.status_code, 404)

    def test_detalhe_publico_aplica_lgpd_em_documento_fornecedor(self):
        fornecedor = Fornecedor.objects.create(
            razao_social="Fornecedor Publico",
            cnpj="12345678000199",
        )
        ProcessoItem.objects.create(
            processo=self.processo_publico,
            numero_item=1,
            descricao_snapshot="Item de teste publico",
            unidade_snapshot="UND",
            quantidade=1,
            fornecedor_homologado=fornecedor,
            status_consolidado=ProcessoItem.StatusConsolidado.HOMOLOGADO,
            valor_referencia_total=100,
            valor_homologado_total=90,
        )
        ProcessoAnexo.objects.create(
            processo=self.processo_publico,
            tipo=ProcessoAnexo.Tipo.EDITAL,
            descricao="Edital publicado",
            arquivo=SimpleUploadedFile("edital.txt", b"conteudo"),
        )
        ProcessoAnexo.objects.create(
            processo=self.processo_publico,
            tipo=ProcessoAnexo.Tipo.PARECER,
            descricao="Parecer interno",
            arquivo=SimpleUploadedFile("parecer.txt", b"conteudo"),
        )

        response = self.client.get(reverse("publico:detalhe", args=[self.processo_publico.id]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "12.***.***/****-99")
        self.assertEqual(response.context["anexos"].count(), 1)

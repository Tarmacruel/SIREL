from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase

from core.middleware import MojibakeRepairMiddleware
from core.utils.text_encoding import fix_mojibake, fix_mojibake_segments


class TextEncodingTests(SimpleTestCase):
    def test_fix_mojibake_repairs_portuguese_text(self):
        broken = "M\u00c3\u00b3dulo Licita\u00c3\u00a7\u00c3\u00a3o"
        self.assertEqual(fix_mojibake(broken), "Módulo Licitação")

    def test_fix_mojibake_segments_preserves_html(self):
        broken = "<strong>Pend\u00c3\u00aancias</strong> do m\u00c3\u00b3dulo"
        self.assertEqual(
            fix_mojibake_segments(broken),
            "<strong>Pendências</strong> do módulo",
        )

    def test_middleware_repairs_html_response_content(self):
        factory = RequestFactory()
        middleware = MojibakeRepairMiddleware(
            lambda request: HttpResponse(
                "<h1>M\u00c3\u00b3dulo Licita\u00c3\u00a7\u00c3\u00a3o</h1>",
                content_type="text/html; charset=utf-8",
            )
        )

        response = middleware(factory.get("/sirel/teste/"))

        self.assertIn("Módulo Licitação", response.content.decode("utf-8"))

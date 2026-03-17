from __future__ import annotations

from django.http import HttpResponse

from core.utils.text_encoding import fix_mojibake_segments


class MojibakeRepairMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        return self._repair_response(response)

    def _repair_response(self, response: HttpResponse):
        if getattr(response, "streaming", False):
            return response

        content_type = str(response.get("Content-Type", "") or "").lower()
        if "text/html" not in content_type:
            return response

        charset = getattr(response, "charset", None) or "utf-8"
        try:
            original = response.content.decode(charset)
        except Exception:
            return response

        fixed = fix_mojibake_segments(original)
        if fixed != original:
            response.content = fixed.encode(charset)
        return response

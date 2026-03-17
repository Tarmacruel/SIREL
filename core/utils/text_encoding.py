from __future__ import annotations

import re


_MOJIBAKE_SEGMENT_RE = re.compile(r"(?:Ã.|Â.|â.|ï»¿|�)+")
_ACCENT_RE = re.compile(r"[ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç]")


def _suspicious_score(text: str) -> int:
    texto = str(text or "")
    return texto.count("Ã") + texto.count("Â") + texto.count("â") + texto.count("�")


def _accent_score(text: str) -> int:
    return len(_ACCENT_RE.findall(str(text or "")))


def fix_mojibake(text: str, *, max_rounds: int = 3) -> str:
    value = str(text or "")
    if not value:
        return value

    current = value
    for _ in range(max(1, int(max_rounds or 1))):
        best_candidate = current
        best_score = (_suspicious_score(current), -_accent_score(current), len(current))
        for source_encoding in ("latin-1", "cp1252"):
            try:
                candidate = current.encode(source_encoding, errors="ignore").decode("utf-8", errors="ignore")
            except Exception:
                continue
            if not candidate or candidate == current:
                continue
            candidate_score = (
                _suspicious_score(candidate),
                -_accent_score(candidate),
                len(candidate),
            )
            if candidate_score < best_score:
                best_candidate = candidate
                best_score = candidate_score
        if best_candidate == current:
            break
        current = best_candidate
    return current


def fix_mojibake_segments(text: str) -> str:
    value = str(text or "")
    if not value:
        return value

    def _replace(match: re.Match[str]) -> str:
        segment = match.group(0)
        fixed = fix_mojibake(segment)
        return fixed if fixed and _suspicious_score(fixed) < _suspicious_score(segment) else segment

    return _MOJIBAKE_SEGMENT_RE.sub(_replace, value)

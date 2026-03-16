# -*- coding: utf-8 -*-
from decimal import Decimal

def fmt_brl(value):
    """Formata número como moeda BRL com separadores pt-BR: R$ 1.234,56"""
    try:
        if value is None:
            return "R$ 0,00"
        if isinstance(value, str):
            s = value.strip().replace("R$", "").replace(" ", "")
            s = s.replace(".", "").replace(",", ".")
            value = float(s or 0)
        formatted = f"{float(value):,.2f}"
        formatted = formatted.replace(",", "X").replace(".", ",").replace("X", ".")
        return f"R$ {formatted}"
    except Exception:
        return "R$ 0,00"

def parse_brl(value):
    """Converte string 'R$ 1.234,56' para Decimal('1234.56'). Aceita números já numéricos."""
    try:
        if value is None:
            return Decimal("0.00")
        if isinstance(value, (float, int, Decimal)):
            return Decimal(str(value))
        s = str(value).strip().replace("R$", "").replace(" ", "")
        s = s.replace(".", "").replace(",", ".")
        return Decimal(s or "0")
    except Exception:
        return Decimal("0.00")

def valor_por_extenso(valor, moeda=True) -> str:
    """
    Converte número para extenso em pt-BR. Requer 'num2words' (pip install num2words).
    - moeda=True: usa extenso monetário (reais/centavos).
    """
    try:
        from num2words import num2words
    except Exception:
        # Fallback simples se biblioteca não estiver instalada
        return str(valor)
    valor = Decimal(str(valor or 0)).quantize(Decimal("0.01"))
    if moeda:
        inteiro = int(valor)
        centavos = int((valor - inteiro) * 100)
        parte1 = num2words(inteiro, lang='pt_BR')
        if centavos:
            parte2 = num2words(centavos, lang='pt_BR')
            moeda_txt = "real" if inteiro == 1 else "reais"
            cent_txt = "centavo" if centavos == 1 else "centavos"
            return f"{parte1} {moeda_txt} e {parte2} {cent_txt}"
        else:
            moeda_txt = "real" if inteiro == 1 else "reais"
            return f"{parte1} {moeda_txt}"
    else:
        return num2words(valor, lang='pt_BR')

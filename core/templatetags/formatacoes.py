from decimal import Decimal, ROUND_HALF_UP
from django import template
from num2words import num2words

register = template.Library()

# ===== Formatador de moeda BRL =====
@register.filter(name="moeda_brl")
def moeda_brl(valor):
    if valor is None:
        return "R$ 0,00"
    if not isinstance(valor, Decimal):
        try:
            valor = Decimal(str(valor))
        except Exception:
            return "R$ 0,00"
    quantizado = valor.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    # Converte para string com vírgula como separador decimal
    inteiro, centavos = f"{quantizado:.2f}".split('.')
    inteiro_fmt = f"{int(inteiro):,}".replace(',', '.')  # 1000000 -> 1.000.000
    return f"R$ {inteiro_fmt},{centavos}"

# ===== Valor por extenso em PT-BR =====
@register.filter(name="por_extenso")
def por_extenso(valor):
    """
    Converte 5713.51 -> "cinco mil, setecentos e treze reais e cinquenta e um centavos".
    Aceita int, str ou Decimal.
    """
    if valor is None:
        valor = Decimal('0')
    if not isinstance(valor, Decimal):
        valor = Decimal(str(valor))
    valor = valor.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    reais = int(valor)
    centavos = int((valor - int(valor)) * 100)

    # Parte inteira
    if reais == 0:
        parte_reais = "zero reais"
    elif reais == 1:
        parte_reais = "um real"
    else:
        parte_reais = f"{num2words(reais, lang='pt_BR')} reais"

    # Centavos
    if centavos == 0:
        parte_centavos = ""
    elif centavos == 1:
        parte_centavos = " e um centavo"
    else:
        parte_centavos = f" e {num2words(centavos, lang='pt_BR')} centavos"

    # Limpeza de hífens (opcional) e caixa baixa
    frase = (parte_reais + parte_centavos).replace('-', ' ').lower()
    return frase
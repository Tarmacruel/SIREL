from __future__ import annotations
import csv
from decimal import Decimal


def parse_bll_csv(file_obj):
    content = file_obj.read().decode('utf-8-sig', errors='ignore').splitlines()
    reader = csv.DictReader(content, delimiter=';')
    rows = []
    for row in reader:
        rows.append({k.strip(): (v or '').strip() for k, v in row.items()})
    return rows


def decimal_or_zero(value: str) -> Decimal:
    value = (value or '').replace('.', '').replace(',', '.')
    try:
        return Decimal(value)
    except Exception:
        return Decimal('0')

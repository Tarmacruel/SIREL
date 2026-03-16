# -*- coding: utf-8 -*-
from __future__ import annotations

import csv
import re
from decimal import Decimal, InvalidOperation
from io import BytesIO, StringIO
from uuid import uuid4


def _decode_bytes(raw_bytes: bytes) -> str:
    for enc in ('utf-8-sig', 'utf-8', 'cp1252', 'latin-1'):
        try:
            return raw_bytes.decode(enc)
        except Exception:
            continue
    return raw_bytes.decode('latin-1', errors='ignore')


def _parse_rows_from_csv_semicolon(raw_bytes: bytes):
    txt = _decode_bytes(raw_bytes)
    reader = csv.reader(StringIO(txt), delimiter=';')
    return list(reader)


def _parse_rows_from_xlsx(raw_bytes: bytes):
    try:
        import openpyxl
    except Exception as exc:
        raise RuntimeError("Para importar XLSX, instale 'openpyxl' (pip install openpyxl).") from exc
    wb = openpyxl.load_workbook(BytesIO(raw_bytes), data_only=True)
    ws = wb.active
    rows = []
    for row in ws.iter_rows(values_only=True):
        rows.append([str(c) if c is not None else '' for c in row])
    return rows


def _parse_bll_multisection_pipe(raw_bytes: bytes):
    txt = _decode_bytes(raw_bytes)
    lines = txt.strip().splitlines()
    section = None
    data = {
        'PARTICIPANTES': [],
        'PROCESSO': [],
        'LOTES': [],
        'VALORES': [],
        'CLASSIFICACAO': [],
    }
    for line in lines:
        line = (line or '').strip()
        if not line:
            continue
        if line.startswith('<') and line.endswith('>'):
            key = line.strip('<>').strip().upper().replace('\ufeff', '')
            if key in ('PARTICIPANTES', 'PROCESSO', 'LOTES', 'CLASSIFICACAO'):
                section = key
            elif key in ('VALORES UNITARIOS', 'VALORES_UNITARIOS', 'VALORES'):
                section = 'VALORES'
            else:
                section = None
            continue
        if section:
            data[section].append([c.strip() for c in line.split('|')])
    return data


def _to_decimal(value):
    if value is None:
        return None
    txt = str(value).strip()
    if not txt:
        return None
    if ',' in txt:
        txt = txt.replace('.', '').replace(',', '.')
    try:
        return Decimal(txt)
    except (InvalidOperation, ValueError):
        return None


def _only_digits(value):
    return ''.join(ch for ch in str(value or '') if ch.isdigit())


def _as_int(value, default=None):
    try:
        return int(_only_digits(value))
    except Exception:
        return default


def _to_bool_flag(value, default=True):
    txt = str(value if value is not None else '').strip().upper()
    if txt in ('', '-', 'NONE', 'NULL'):
        return default
    if txt in ('1', 'S', 'SIM', 'Y', 'YES', 'TRUE'):
        return True
    if txt in ('0', 'N', 'NAO', 'NÃO', 'NO', 'FALSE', '2'):
        return False
    return default


def _fallback_cnpj():
    return f'BLL{uuid4().hex[:15]}'


def _find_fornecedor_by_doc(Fornecedor, doc_digits: str):
    if not doc_digits:
        return None
    direto = Fornecedor.objects.filter(cnpj=doc_digits).first()
    if direto:
        return direto
    for row in Fornecedor.objects.only('id', 'cnpj'):
        if _only_digits(row.cnpj) == doc_digits:
            return row
    return None


def _upsert_fornecedor(Fornecedor, *, cnpj_raw='', razao='', cidade='', estado=''):
    doc_digits = _only_digits(cnpj_raw)
    razao = (razao or '').strip()
    cidade = (cidade or '').strip()[:100]
    estado = (estado or '').strip()[:2]

    fornecedor = _find_fornecedor_by_doc(Fornecedor, doc_digits) if doc_digits else None
    if not fornecedor and razao:
        fornecedor = Fornecedor.objects.filter(razao_social=razao).first()

    if not fornecedor:
        fornecedor = Fornecedor.objects.create(
            razao_social=(razao or f'Fornecedor BLL {doc_digits or "N/I"}')[:255],
            cnpj=(doc_digits or _fallback_cnpj())[:18],
            cidade=cidade,
            estado=estado,
        )
        return fornecedor

    changed = []
    if razao and fornecedor.razao_social != razao[:255]:
        fornecedor.razao_social = razao[:255]
        changed.append('razao_social')
    if cidade and fornecedor.cidade != cidade:
        fornecedor.cidade = cidade
        changed.append('cidade')
    if estado and fornecedor.estado != estado:
        fornecedor.estado = estado
        changed.append('estado')
    if changed:
        fornecedor.save(update_fields=changed)
    return fornecedor


def import_bll_file(processo, uploaded_file):
    file_name = (uploaded_file.name or '').lower()
    raw_bytes = uploaded_file.read()
    try:
        uploaded_file.seek(0)
    except Exception:
        pass

    decoded_peek = _decode_bytes(raw_bytes[:8000]).upper()
    looks_multisection = (
        '<PARTICIPANTES>' in decoded_peek
        or '<PROCESSO>' in decoded_peek
        or '<VALORES UNITARIOS>' in decoded_peek
        or '<CLASSIFICACAO>' in decoded_peek
    )

    rows = None
    data = None
    if file_name.endswith('.xlsx'):
        rows = _parse_rows_from_xlsx(raw_bytes)
        mode = 'xlsx_semicolon_like_export'
    elif looks_multisection:
        data = _parse_bll_multisection_pipe(raw_bytes)
        mode = 'bll_pipe_multisection'
    else:
        rows = _parse_rows_from_csv_semicolon(raw_bytes)
        mode = 'csv_semicolon_like_export'

    from ofertas.models import ItemOferta
    from core.models import Fornecedor, FornecedorDocumentoExterno, FornecimentoItem, Lote

    def _registrar_doc_externo_bll(fornecedor, cnpj_raw='', identificador=''):
        if not fornecedor:
            return
        doc_digits = _only_digits(cnpj_raw)
        identificador = (identificador or '').strip()[:120]
        if not doc_digits and not identificador:
            return
        defaults = {
            'fornecedor': fornecedor,
            'payload_resumo': {'identificador': identificador},
        }
        if doc_digits:
            obj, _ = FornecedorDocumentoExterno.objects.update_or_create(
                origem='BLL',
                documento_digits=doc_digits,
                defaults=defaults,
            )
            if identificador and obj.identificador_externo != identificador:
                obj.identificador_externo = identificador
                obj.save(update_fields=['identificador_externo', 'atualizado_em'])
        else:
            FornecedorDocumentoExterno.objects.update_or_create(
                origem='BLL',
                identificador_externo=identificador,
                defaults=defaults,
            )

    created, updated = 0, 0

    if mode in ('csv_semicolon_like_export', 'xlsx_semicolon_like_export'):
        if rows and rows[0] and str(rows[0][0]).lower().startswith('processo id'):
            rows = rows[1:]
        itens_by_key = {(it.lote.numero if it.lote else None, it.numero_item): it for it in processo.itens.all().select_related('lote')}
        for row in rows:
            if len(row) < 14:
                continue
            lote_num = _as_int(row[3], 0)
            num_item = _as_int(row[4], None)
            if num_item is None:
                continue

            item = itens_by_key.get((lote_num or None, num_item))
            if not item:
                lote = None
                if lote_num:
                    lote, _ = Lote.objects.get_or_create(
                        processo=processo,
                        numero=lote_num,
                        defaults={'titulo': f'Lote {lote_num}'},
                    )
                item = FornecimentoItem.objects.create(
                    processo=processo,
                    lote=lote,
                    numero_item=num_item,
                    descricao=row[5] or '',
                    unidade=row[6] or '',
                    quantidade=_to_decimal(row[7]) or 0,
                )
                itens_by_key[(lote_num or None, num_item)] = item

            fornecedor_nome = (row[8] or '').strip()
            if not fornecedor_nome:
                continue
            fornecedor = _upsert_fornecedor(Fornecedor, razao=fornecedor_nome)
            _registrar_doc_externo_bll(fornecedor, identificador=fornecedor_nome)

            try:
                classificacao = int(row[9]) if row[9] not in (None, '', 'None') else None
            except Exception:
                classificacao = None
            proposta_inicial = _to_decimal(row[10])
            proposta_final = _to_decimal(row[11])
            valor_unitario = _to_decimal(row[12])
            status = (row[13] or '').strip().upper() or 'CLASSIFICADO'
            if status not in ('CLASSIFICADO', 'DESCLASSIFICADO', 'INABILITADO', 'VENCEDOR'):
                status = 'CLASSIFICADO'
            if (classificacao or 0) == 1 and status == 'CLASSIFICADO':
                status = 'VENCEDOR'

            _, created_flag = ItemOferta.objects.update_or_create(
                item=item,
                fornecedor=fornecedor,
                defaults={
                    'classificacao': classificacao or 0,
                    'proposta_inicial': proposta_inicial or 0,
                    'proposta_final': proposta_final or 0,
                    'valor_unitario': valor_unitario or 0,
                    'status': status,
                },
            )
            if created_flag:
                created += 1
            else:
                updated += 1

    elif mode == 'bll_pipe_multisection':
        proc_rows = [row for row in (data.get('PROCESSO') or []) if any((c or '').strip() for c in row)]
        if proc_rows:
            row = proc_rows[0]
            edital = None
            ano = None
            if len(row) == 1:
                match = re.match(r'^(?P<edital>.+)-(?P<ano>\d{4})$', row[0].strip())
                if match:
                    edital = match.group('edital').strip()
                    ano = match.group('ano').strip()
            else:
                edital = (row[0] or '').strip()
                ano = (row[1] or '').strip()
            changed_fields = []
            if edital and getattr(processo, 'numero_edital', '') != edital:
                processo.numero_edital = edital
                changed_fields.append('numero_edital')
            if ano and _as_int(ano) is not None:
                ano_int = _as_int(ano)
                if getattr(processo, 'ano_referencia', None) != ano_int:
                    processo.ano_referencia = ano_int
                    changed_fields.append('ano_referencia')
            if hasattr(processo, 'numero_processo_adm') and edital:
                composto = f'{edital}-{ano}' if ano else edital
                if processo.numero_processo_adm != composto:
                    processo.numero_processo_adm = composto
                    changed_fields.append('numero_processo_adm')
            if changed_fields:
                try:
                    processo.save(update_fields=list(dict.fromkeys(changed_fields)))
                except Exception:
                    processo.save()

        fornecedores_by_cnpj = {}
        for idx, row in enumerate(data.get('PARTICIPANTES') or []):
            if not row:
                continue
            if idx == 0 and (('CNPJ' in ''.join(row).upper()) or ('RAZAO' in ''.join(row).upper())):
                continue
            cnpj = (row[1] if len(row) > 1 else '').strip()
            razao = (row[2] if len(row) > 2 else '').strip()
            endereco = (row[3] if len(row) > 3 else '').strip()
            bairro = (row[4] if len(row) > 4 else '').strip()
            complemento = (row[5] if len(row) > 5 else '').strip()
            cep = _only_digits(row[6] if len(row) > 6 else '')
            cidade = (row[7] if len(row) > 7 else '').strip()
            estado = (row[8] if len(row) > 8 else '').strip()
            if not cnpj and not razao:
                continue
            fornecedor = _upsert_fornecedor(
                Fornecedor,
                cnpj_raw=cnpj,
                razao=razao,
                cidade=cidade,
                estado=estado,
            )
            up = []
            if endereco and fornecedor.endereco != endereco:
                fornecedor.endereco = endereco
                up.append('endereco')
            if bairro and fornecedor.bairro != bairro:
                fornecedor.bairro = bairro
                up.append('bairro')
            if complemento and fornecedor.complemento != complemento:
                fornecedor.complemento = complemento
                up.append('complemento')
            if cep and fornecedor.cep != cep:
                fornecedor.cep = cep
                up.append('cep')
            if up:
                fornecedor.save(update_fields=up)
            if cnpj:
                fornecedores_by_cnpj[_only_digits(cnpj)] = fornecedor
            _registrar_doc_externo_bll(fornecedor, cnpj_raw=cnpj, identificador=razao)

        lotes_by_num = {}
        for row in data.get('LOTES') or []:
            if not row:
                continue
            numero = _as_int(row[0], None)
            if numero is None:
                continue
            status_txt = (row[1] if len(row) > 1 else '').strip().upper()
            tipo_lance = (row[2] if len(row) > 2 else '').strip().upper()
            qtd_itens = _as_int(row[3] if len(row) > 3 else None, 0) or 0
            map_tipo = {'UNITARIO': 'UNITARIO', 'UNITÁRIO': 'UNITARIO', 'GLOBAL': 'GLOBAL', 'KIT': 'KIT'}
            tipo_lance = map_tipo.get(tipo_lance, 'UNITARIO')
            lote, _ = Lote.objects.get_or_create(
                processo=processo,
                numero=numero,
                defaults={'titulo': f'Lote {numero}', 'tipo_lance': tipo_lance},
            )
            changed = []
            if lote.tipo_lance != tipo_lance:
                lote.tipo_lance = tipo_lance
                changed.append('tipo_lance')
            if status_txt and lote.status != status_txt:
                lote.status = status_txt
                changed.append('status')
            if qtd_itens and lote.qtd_itens != qtd_itens:
                lote.qtd_itens = qtd_itens
                changed.append('qtd_itens')
            if changed:
                lote.save(update_fields=changed)
            lotes_by_num[numero] = lote

        itens_by_key = {}
        for it in processo.itens.all().select_related('lote'):
            lote_key = it.lote.numero if it.lote else None
            ext_num = _as_int(it.codigo_item_externo, None)
            if ext_num is not None:
                itens_by_key[(lote_key, ext_num)] = it
            itens_by_key[(lote_key, it.numero_item)] = it

        pares_lote_item = set()
        ocorrencias_num_item = {}
        for row in data.get('VALORES') or []:
            lote_num = _as_int(row[0] if len(row) > 0 else None, None)
            num_item_ext = _as_int(row[1] if len(row) > 1 else None, None)
            if num_item_ext is None:
                continue
            key = (lote_num, num_item_ext)
            if key in pares_lote_item:
                continue
            pares_lote_item.add(key)
            ocorrencias_num_item[num_item_ext] = ocorrencias_num_item.get(num_item_ext, 0) + 1

        def _numero_item_interno(lote_numero, numero_externo):
            if numero_externo is None:
                return None
            if ocorrencias_num_item.get(numero_externo, 0) > 1 and lote_numero is not None:
                # Evita colapso da camada canonica quando a BLL reinicia o numero do item em cada lote.
                return (int(lote_numero) * 1000) + int(numero_externo)
            return int(numero_externo)

        itens_por_lote = {}
        valores_unitarios_map = {}
        for idx, row in enumerate(data.get('VALORES') or []):
            if not row:
                continue
            if idx == 0 and ('NUMERO' in ''.join(row).upper() or 'NÚMERO' in ''.join(row).upper()):
                continue
            lote_num = _as_int(row[0], None)
            num_item_ext = _as_int(row[1], None)
            if num_item_ext is None:
                continue
            num_item = _numero_item_interno(lote_num, num_item_ext)
            lote = lotes_by_num.get(lote_num)
            desc = (row[2] if len(row) > 2 else '').strip()
            qtd = _to_decimal(row[3] if len(row) > 3 else None) or Decimal('0')
            unidade = (row[4] if len(row) > 4 else '').strip()
            valor_estimado = _to_decimal(row[5] if len(row) > 5 else None)
            marca = (row[6] if len(row) > 6 else '').strip()
            modelo = (row[7] if len(row) > 7 else '').strip()
            prop_ini = _to_decimal(row[8] if len(row) > 8 else None)
            prop_fin = _to_decimal(row[9] if len(row) > 9 else None)

            item = itens_by_key.get((lote_num, num_item_ext)) or itens_by_key.get((lote_num, num_item))
            if not item:
                item = FornecimentoItem.objects.create(
                    processo=processo,
                    lote=lote,
                    numero_item=num_item,
                    codigo_item_externo=str(int(num_item_ext)),
                    descricao=desc,
                    unidade=unidade,
                    quantidade=qtd,
                    valor_unitario=valor_estimado or Decimal('0'),
                    proposta_inicial=prop_ini or Decimal('0'),
                    proposta_final=prop_fin or Decimal('0'),
                    marca=marca,
                    modelo=modelo,
                )
                itens_by_key[(lote_num, num_item)] = item
            else:
                changed = []
                patches = {
                    'lote': lote,
                    'numero_item': num_item,
                    'codigo_item_externo': str(int(num_item_ext)),
                    'descricao': desc or item.descricao,
                    'unidade': unidade or item.unidade,
                    'quantidade': qtd if qtd > 0 else item.quantidade,
                    'valor_unitario': valor_estimado if valor_estimado is not None else item.valor_unitario,
                    'proposta_inicial': prop_ini if prop_ini is not None else item.proposta_inicial,
                    'proposta_final': prop_fin if prop_fin is not None else item.proposta_final,
                    'marca': marca or item.marca,
                    'modelo': modelo or item.modelo,
                }
                for field, val in patches.items():
                    if val is not None and getattr(item, field) != val:
                        setattr(item, field, val)
                        changed.append(field)
                if changed:
                    item.save(update_fields=changed)

            itens_por_lote.setdefault(lote_num, []).append(item)
            valores_unitarios_map[(lote_num, num_item_ext)] = {
                'qtd': qtd,
                'valor_estimado': valor_estimado,
                'prop_ini': prop_ini,
                'prop_fin': prop_fin,
            }

        for items in itens_por_lote.values():
            items.sort(key=lambda x: _as_int(x.codigo_item_externo, x.numero_item) or 0)

        for idx, row in enumerate(data.get('CLASSIFICACAO') or []):
            if not row:
                continue
            if idx == 0 and ('CLASSIFICA' in ''.join(row).upper() or 'RAZAO' in ''.join(row).upper()):
                continue
            lote_num = _as_int(row[0], None)
            classificacao = _as_int(row[1], 0) or 0
            razao = (row[2] if len(row) > 2 else '').strip()
            cnpj = (row[3] if len(row) > 3 else '').strip()
            valor_total = _to_decimal(row[4] if len(row) > 4 else None)
            microempresa = _to_bool_flag(row[5] if len(row) > 5 else None, default=True)
            classificado_flag = _to_bool_flag(row[6] if len(row) > 6 else None, default=True)
            habilitado_flag = _to_bool_flag(row[7] if len(row) > 7 else None, default=True)

            candidatos = itens_por_lote.get(lote_num, [])
            if not candidatos:
                continue
            item_alvo = candidatos[0]

            fornecedor = _upsert_fornecedor(
                Fornecedor,
                cnpj_raw=cnpj,
                razao=razao,
            )
            _registrar_doc_externo_bll(fornecedor, cnpj_raw=cnpj, identificador=razao or cnpj)

            if not habilitado_flag:
                status = 'INABILITADO'
            elif not classificado_flag:
                status = 'DESCLASSIFICADO'
            elif classificacao == 1:
                status = 'VENCEDOR'
            else:
                status = 'CLASSIFICADO'

            ext_num_item = _as_int(item_alvo.codigo_item_externo, item_alvo.numero_item)
            info = valores_unitarios_map.get((lote_num, ext_num_item), {})
            qtd = info.get('qtd') or item_alvo.quantidade or Decimal('0')
            proposta_inicial = info.get('prop_ini')
            proposta_final = info.get('prop_fin')
            valor_unitario = proposta_final
            if valor_unitario is None and valor_total is not None and qtd not in (None, Decimal('0'), 0):
                try:
                    valor_unitario = (valor_total / qtd).quantize(Decimal('0.0001'))
                except Exception:
                    valor_unitario = None
            if proposta_inicial is None and valor_unitario is not None:
                proposta_inicial = valor_unitario
            if proposta_final is None and valor_unitario is not None:
                proposta_final = valor_unitario

            _, created_flag = ItemOferta.objects.update_or_create(
                item=item_alvo,
                fornecedor=fornecedor,
                defaults={
                    'classificacao': classificacao,
                    'status': status,
                    'proposta_inicial': proposta_inicial or Decimal('0'),
                    'proposta_final': proposta_final or Decimal('0'),
                    'valor_unitario': valor_unitario or Decimal('0'),
                },
            )
            if created_flag:
                created += 1
            else:
                updated += 1

    else:
        raise RuntimeError(
            "Formato de arquivo não reconhecido. Envie CSV/XLSX exportado ou layout BLL com '|' e seções."
        )

    return {'created': created, 'updated': updated, 'mode': mode}

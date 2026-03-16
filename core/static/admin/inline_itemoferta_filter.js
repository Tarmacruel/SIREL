(function() {
  function ready(fn) {
    if (document.readyState !== 'loading'){ fn(); }
    else { document.addEventListener('DOMContentLoaded', fn); }
  }

  function createToolbar(container) {
    const bar = document.createElement('div');
    bar.className = 'oferta-toolbar';
    bar.innerHTML = [
      '<input type="text" placeholder="Pesquisar (fornecedor, status, classificação)..." class="oferta-search" />',
      '<select class="oferta-status">',
        '<option value="">-- Todos status --</option>',
        '<option value="CLASSIFICADO">Classificado</option>',
        '<option value="DESCLASSIFICADO">Desclassificado</option>',
        '<option value="INABILITADO">Inabilitado</option>',
        '<option value="VENCEDOR">Vencedor</option>',
      '</select>',
      '<span class="oferta-count"></span>'
    ].join('');
    container.prepend(bar);
    return bar;
  }

  function textOf(el) {
    return (el ? el.textContent || el.innerText || '' : '' ).trim();
  }

  function filterRows(groupEl) {
    const bar = groupEl.querySelector('.oferta-toolbar');
    if (!bar) return;
    const q = bar.querySelector('.oferta-search').value.toLowerCase();
    const st = (bar.querySelector('.oferta-status').value || '').toLowerCase();

    // TabularInline tabela:
    const table = groupEl.querySelector('table');
    if (!table) return;

    const rows = Array.from(table.querySelectorAll('tr.form-row'));
    let visible = 0;
    rows.forEach(function(row) {
      if (row.classList.contains('empty-form')) return; // ignora template
      const hay = row.textContent.toLowerCase();
      const okQ = !q || hay.indexOf(q) >= 0;

      // status: tenta pegar do select, senão do texto
      let rowStatus = '';
      const stSel = row.querySelector('.field-status select');
      if (stSel) rowStatus = (stSel.value || '').toLowerCase();
      if (!rowStatus) {
        const stCell = row.querySelector('.field-status');
        rowStatus = (stCell ? stCell.textContent : '').trim().toLowerCase();
      }
      const okSt = !st || rowStatus === st || hay.indexOf(st) >= 0;

      const show = okQ && okSt;
      row.style.display = show ? '' : 'none';
      if (show) visible++;
    });

    const count = bar.querySelector('.oferta-count');
    if (count) {
      const total = rows.filter(r => !r.classList.contains('empty-form')).length;
      count.textContent = 'Mostrando ' + visible + ' de ' + total;
    }
  }

  ready(function() {
    // encontra o grupo do inline de ItemOferta (id padrão: itemoferta_set-group)
    const groups = Array.from(document.querySelectorAll('.inline-group'));
    groups.forEach(function(group) {
      const id = group.getAttribute('id') || '';
      const isItemOferta = /itemoferta_set-group$/.test(id) || /ofertas.*itemoferta/i.test(group.textContent);
      if (!isItemOferta) return;
      const bar = createToolbar(group);
      bar.addEventListener('input', function() { filterRows(group); });
      bar.addEventListener('change', function() { filterRows(group); });
      filterRows(group);
    });
  });
})();

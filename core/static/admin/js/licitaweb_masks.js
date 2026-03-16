// licitaweb_masks.js — v0.5
// Corrige bug: ao digitar vírgula ou ponto o campo "zerava".
// Regras:
//  - Digitação livre (dígitos + vírgula). Ponto vira vírgula automaticamente.
//  - Se o usuário digitar vírgula/ponto logo de cara, vira "0," sem zerar.
//  - Formata como BRL (R$ 1.234,56) somente ao sair do campo (blur).
//  - Antes de enviar o formulário, converte para 1234.56 (aceito pelo Django).
//  - Sem jQuery e sem plugins.

(function() {
  // ===== Utils =====
  function caretToEnd(el){ try{ el.selectionStart = el.selectionEnd = el.value.length; }catch(e){} }

  function onlyDigitsAndComma(v){
    v = (v || '').toString().replace(/\./g, ','); // ponto vira vírgula
    v = v.replace(/[^\d,]/g, '');
    const parts = v.split(',');
    if (parts.length > 2) v = parts[0] + ',' + parts.slice(1).join('');
    return v;
  }

  function normalizeToIntDec(v){
    v = onlyDigitsAndComma(v);
    // caso especial: só uma vírgula
    if (v === ',') return {intP:'0', decP:''};
    let [intP, decP=''] = v.split(',');
    intP = (intP || '').replace(/\D/g, '');
    decP = (decP || '').replace(/\D/g, '').slice(0,2);
    if (!intP.length) intP = '0';
    return {intP, decP};
  }

  function formatThousandsBR(intP){
    return intP.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function maskBRL_onBlur(v){
    const {intP, decP} = normalizeToIntDec(v);
    const intFmt = formatThousandsBR(intP);
    const decFmt = (decP.length ? decP : '00');
    return 'R$ ' + intFmt + ',' + decFmt;
  }

  function unmaskBRL(v){
    v = (v || '').toString().replace(/[R$\s\.]/g, '').replace(',', '.');
    return v || '0';
  }

  // ===== Outras máscaras (CPF/CNPJ/Data/Hora) =====
  function maskCPF(v){ v=v.replace(/\D/g,'').slice(0,11);
    return v.replace(/(\d{3})(\d)/,'$1.$2')
            .replace(/(\d{3})(\d)/,'$1.$2')
            .replace(/(\d{3})(\d{1,2})$/,'$1-$2');}

  function maskCNPJ(v){ v=v.replace(/\D/g,'').slice(0,14);
    return v.replace(/^(\d{2})(\d)/,'$1.$2')
            .replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3')
            .replace(/\.(\d{3})(\d)/,'.$1/$2')
            .replace(/(\d{4})(\d)/,'$1-$2');}

  function maskDate(v){ v=v.replace(/\D/g,'').slice(0,8);
    if(v.length>=5){ return v.slice(0,2)+'/'+v.slice(2,4)+'/'+v.slice(4,8); }
    if(v.length>=3){ return v.slice(0,2)+'/'+v.slice(2,4); }
    return v; }

  function maskTime(v){
    v = v.replace(/\D/g,'').slice(0,4);
    if(v.length >= 3){
      var h = v.slice(0,2), m = v.slice(2,4);
      var hi = Math.min(parseInt(h || '0',10), 23);
      var mi = Math.min(parseInt(m || '0',10), 59);
      return String(hi).padStart(2,'0') + ':' + String(mi).padStart(2,'0');
    }
    return v;
  }

  function applyMask(el, fn){ el.addEventListener('input', function(){ this.value = fn(this.value); }); }

  // Datalist tempos 08:00–17:00 a cada 15 min
  function generateTimes(start, end, stepMin){
    var out = [], [sh, sm] = start.split(':').map(Number), [eh, em] = end.split(':').map(Number);
    var totalStart = sh*60 + sm, totalEnd = eh*60 + em;
    for (var t = totalStart; t <= totalEnd; t += stepMin){
      var h = Math.floor(t/60), m = t%60;
      out.push(String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0'));
    }
    return out;
  }
  function ensureDatalist(id, values){
    var dl = document.getElementById(id);
    if(!dl){ dl = document.createElement('datalist'); dl.id = id; document.body.appendChild(dl); }
    dl.innerHTML = ''; values.forEach(function(v){ var o=document.createElement('option'); o.value=v; dl.appendChild(o); });
    return dl;
  }
  function attachTimeHelpers(input){
    if(!input || input.dataset.hasTimeHelper) return;
    applyMask(input, maskTime);
    var times = generateTimes('08:00','17:00',15);
    var dl = ensureDatalist('times_15min_08_17', times);
    input.setAttribute('list', dl.id);
    input.placeholder = 'hh:mm';
    input.dataset.hasTimeHelper = '1';
  }

  // ===== Inicialização =====
  document.addEventListener('DOMContentLoaded', function(){
    // CNPJ/CPF (Fornecedor)
    document.querySelectorAll('input[name$="cnpj"]').forEach(function(el){
      el.placeholder = 'CNPJ ou CPF';
      el.addEventListener('input', function(){
        var numbers = this.value.replace(/\D/g,'');
        this.value = (numbers.length<=11) ? maskCPF(this.value) : maskCNPJ(this.value);
      });
    });

    // CPF (Pessoa)
    document.querySelectorAll('input[name$="cpf"]').forEach(function(el){
      el.placeholder = '000.000.000-00'; applyMask(el, maskCPF);
    });

    // Datas dd/mm/aaaa
    document.querySelectorAll('input[type="text"][name$="data_publicacao"], input[name$="data_publicacao"]').forEach(function(el){
      el.placeholder='dd/mm/aaaa'; applyMask(el, maskDate);
    });

    // DateTimeFields (AdminSplitDateTime): _0 = data, _1 = hora
    var dtFields = ['data_hora_abertura','inicio_recolhimento_propostas','fim_recolhimento_propostas','fim_impugnacao_esclarecimentos'];
    dtFields.forEach(function(field){
      document.querySelectorAll('input[name$="'+field+'_0"]').forEach(function(el){
        el.placeholder='dd/mm/aaaa'; applyMask(el, maskDate);
      });
      document.querySelectorAll('input[name$="'+field+'_1"]').forEach(function(el){
        attachTimeHelpers(el);
      });
    });

    // BRL (data-brl="1")
    document.querySelectorAll('input[data-brl="1"]').forEach(function(el){
      // Digitar ponto/virgula logo de cara vira "0,"
      el.addEventListener('keydown', function(ev){
        if (ev.key === ',' || ev.key === '.') {
          if (this.selectionStart === 0 && this.selectionEnd === this.value.length) {
            ev.preventDefault();
            this.value = '0,';
            caretToEnd(this);
          } else if (!this.value) {
            ev.preventDefault();
            this.value = '0,';
          }
        }
      });

      // Ao focar: remove R$ e pontos para facilitar digitação
      el.addEventListener('focus', function(){
        var raw = this.value || '';
        raw = raw.replace(/R\$\s?/,'').replace(/\./g,',');
        this.value = onlyDigitsAndComma(raw);
        // caso o valor seja só vírgula, já vira "0,"
        if (this.value === ',') this.value = '0,';
      });

      // Enquanto digita: normaliza
      el.addEventListener('input', function(){
        const raw = this.value.replace(/\./g, ','); // ponto → vírgula
        const norm = onlyDigitsAndComma(raw);
        const parts = norm.split(',');
        if (norm === ',') {
          this.value = '0,'; return;
        }
        const intP = (parts[0] || '0').replace(/\D/g,'');
        const decP = (parts[1] || '').replace(/\D/g,'').slice(0,2);
        this.value = intP.replace(/^0+(?=\d)/,'') + (decP.length ? ','+decP : (norm.endsWith(',') ? ',' : ''));
        if (this.value === '') this.value = '0,';
      });

      // Ao sair do campo: formata
      el.addEventListener('blur', function(){
        this.value = maskBRL_onBlur(this.value);
      });

      // Antes de enviar: 1234.56
      if (el.form){
        el.form.addEventListener('submit', function(){
          el.value = unmaskBRL(el.value);
        });
      }

      // Formata inicialmente se vier algo do servidor
      if (el.value && !/^R\$\s/.test(el.value)) {
        el.value = maskBRL_onBlur(el.value);
      }
    });
  });
})();
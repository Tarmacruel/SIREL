LICITAWEB — AJUSTES APLICADOS (AGOSTO/2025)

O que foi implementado:
1) PORTAL PÚBLICO (sem login)
   - Rotas:
     • /  → lista de licitações com filtros por ano, modalidade, secretaria e status
     • /licitacao/<id>/ → detalhe de uma licitação com links de anexos
   - Templates em core/templates/publico/* (Bootstrap).

2) ANEXOS DO PROCESSO (Edital, Avisos, Termos, Parecer)
   - Novo app 'docs' com o modelo docs.ProcessoAnexo (FK para core.Processo).
   - Publicação e download direto pelo portal público.
   - Admin para gerenciar anexos em: Admin → Docs → Processo anexos.

3) GERAÇÃO DE DOCUMENTOS (DOCX) no Admin
   - Endpoints:
     • /docs/termo-autuacao/<id>.docx
     • /docs/termo-autorizacao/<id>.docx
     • /docs/aviso-licitacao/<id>.docx
   - Usam python-docx (já presente no .venv).

4) BLL COMPRAS — Importação/Exportação
   - Mantidos os comandos existentes core/management/commands (import/export) e telas no admin.
   - Corrigimos rotas públicas e instruções de uso no passo a passo abaixo.

5) PNCP e Integrações
   - Estrutura de dados compatível (Processo, Lote, Itens, Fornecedor, Resultado). Exportadores permanecem em core/utils.
   - (Opcional) Endpoint de API pode ser adicionado facilmente; ver instruções.

6) CONTRATOS — Acompanhamento por XLSX do Portal da Transparência
   - Comando: python manage.py import_contratos_xlsx --file caminho.xlsx
   - Atualiza/insere contratos vinculados aos processos.

Como aplicar (produção e desenvolvimento):
A) Ambiente
   1. Requisitos (Ubuntu/Debian):
      sudo apt-get update && sudo apt-get install -y python3.12 python3.12-venv poppler-utils
   2. Dentro do projeto:
      python3 -m venv .venv
      source .venv/bin/activate  (Windows: .venv\Scripts\activate)
      pip install -U pip wheel
      pip install -r requirements.txt  (se não existir, pip install django==5.2.5 djangorestframework django-import-export django-simple-history python-docx openpyxl pandas)
   3. Variáveis:
      export DJANGO_SETTINGS_MODULE=licitaweb.settings

B) Migrações e arquivos estáticos
   python manage.py makemigrations docs
   python manage.py migrate
   python manage.py collectstatic --noinput

C) Usuário admin (se necessário)
   python manage.py createsuperuser

D) Teste local
   python manage.py runserver 0.0.0.0:8000
   Acesse:
     • Admin: /admin/
     • Portal público: /
     • Downloads DOCX: /docs/...

E) Publicar anexos
   1. No Admin: cadastre ou edite um Processo.
   2. Vá até Admin → Docs → Processo anexos → Adicionar.
   3. Selecione o Processo, escolha o Tipo (Edital, Aviso, etc.) e envie o arquivo.
   4. Esses anexos aparecerão na página pública do processo.

F) Importar BLL (arquivo)
   1. No Admin, abra o Processo desejado.
   2. Use a ação “Importar arquivo BLL” no topo (tela própria). Carregue o XLSX ou CSV fornecido pelo BLL.
   3. Alternativamente via CLI:
      python manage.py import_bll_xlsx --processo-id <ID> --file "/caminho/arquivo.xlsx"
   4. Para exportar:
      python manage.py export_bll_xlsx --processo-id <ID> --out "/caminho/saida.xlsx"

G) Importar Contratos (XLSX do Portal)
   python manage.py import_contratos_xlsx --file "/caminho/contratos.xlsx"

H) Produção (Gunicorn/Nginx - exemplo rápido)
   1. Gunicorn:
      gunicorn licitaweb.wsgi:application --bind 0.0.0.0:8000 --workers 3
   2. Nginx (trecho):
      location /static/ { alias /caminho/para/staticfiles/; }
      location /media/  { alias /caminho/para/media/; }
      location / { proxy_pass http://127.0.0.1:8000; proxy_set_header Host $host; }

I) Testes básicos após atualizar
   [Admin]
   - Abrir /admin/ e verificar menu "Docs" (Processo anexos).
   - No cadastro de Processo, confirmar campos padrão e ações de BLL.
   - Baixar os DOCX via /docs/.../ID.
   [Portal Público]
   - Acessar /, filtrar por ano/modo/secretaria e abrir detalhe.
   - Ver/baixar anexos publicados.
   [CLI]
   - Rodar import_contratos_xlsx e validar que contratos são vinculados.

Observações:
- Caso surja erro de 'python-docx' ausente, instale: pip install python-docx
- Para habilitar API PNCP em /api/pncp/processos/<id>, solicite que eu gere o serializer/urls conforme seu layout de PNCP.
- Se o servidor retornar 'arquivo não encontrado' nos anexos, verifique MEDIA_ROOT/MEDIA_URL e permissões (www-data pode ler 'media/').

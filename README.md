# SIREL Modular

Sistema de Registro e Gestão de Licitações com arquitetura modular, workflow por etapas, integrações com PNCP e BLL, geração documental e consolidação de processos para envio ao e-TCM/BA.

## Visão geral

O projeto organiza a rotina administrativa da contratação pública em módulos operacionais integrados, preservando a base do sistema anterior e ampliando o fluxo com:

- planejamento da contratação;
- compras e pesquisa de preços;
- licitação e montagem documental;
- integrações com PNCP e BLL;
- portal público;
- geração de documentos em HTML, PDF e DOCX;
- consolidação de processo completo para auditoria e envio ao e-TCM.

## Principais funcionalidades

### Workflow modular

Área principal em ` /sirel/ ` com navegação por módulos:

- Planejamento
- Compras
- Licitação
- Documentos
- Integrações
- Dashboards
- Itens
- Frequência
- Cadastros

### Planejamento

- abertura de processo;
- DFD com suporte a múltiplas secretarias;
- ETP com fontes, cotações e alertas;
- TR com lotes, dotações e distribuição;
- exportações auxiliares em PDF, DOCX e XLSX.

### Compras

- pesquisa de preços;
- lançamento de fontes e cotações;
- anexação de comprovantes;
- documentos auxiliares do fluxo de compras.

### Licitação

- geração de comunicações internas;
- gerador HTML de documentos com visual institucional;
- geração de edital por tipo de contratação;
- pré-visualização em tempo real;
- exportação em PDF e DOCX.

### Documentos

- consolidação do processo completo mesmo que esteja parcial;
- capa inicial do processo;
- capa individual por anexo;
- montagem cronológica dos documentos anexados;
- exportação integral em PDF;
- geração de pacote para e-TCM/BA com divisão automática por tamanho.

### Padrão e-TCM/BA

Na exportação documental o sistema aplica:

- padronização para A4;
- paginação institucional;
- compressão por página;
- preservação de texto nativo quando o PDF já é pesquisável;
- OCR seletivo nas páginas rasterizadas;
- divisão em partes de até 4 MB no fluxo de envio e-TCM.

### Integrações

- importação de processos por JSON;
- importação PNCP;
- fila de processamento PNCP;
- importação e exportação BLL por CSV e XLSX;
- importação de contratos por XLSX.

### Portal público

- lista pública de licitações;
- página de detalhe por processo;
- publicação de anexos;
- downloads de documentos públicos.

## Tecnologias

- Python 3.12
- Django 5.2.5
- Django REST Framework
- django-import-export
- django-simple-history
- ReportLab
- python-docx
- OpenPyXL
- pandas
- PyMuPDF
- pypdf
- easyocr

## Estrutura do projeto

```text
.
├── api/          API e endpoints auxiliares
├── core/         modelos centrais da contratação e admin
├── docs/         anexos e modelos DOCX
├── licitaweb/    configurações do projeto Django
├── ofertas/      estruturas de fornecedores/ofertas
├── publico/      portal público
├── scripts/      automações operacionais em PowerShell
├── templates/    templates compartilhados
├── tools/        utilitários de apoio
└── workflow/     módulos, telas, serviços e exportações do SIREL
```

## Requisitos

- Python 3.12 ou superior
- pip atualizado
- ambiente virtual recomendado

## Instalação local

### Windows PowerShell

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

### Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

## Scripts úteis

Na pasta `scripts/` existem rotinas prontas para uso local:

- `_instalar_dependencias.ps1`
- `_migrar_e_estaticos.ps1`
- `_popular_basicos.ps1`
- `_rodar_local.ps1`
- `agendar_importacao_dados_licitacao_0300.ps1`

## URLs principais

- Área modular: `http://127.0.0.1:8000/sirel/`
- Admin: `http://127.0.0.1:8000/admin/`
- Portal público: `http://127.0.0.1:8000/`

## Comandos de gestão

### Integrações e carga

```powershell
python manage.py import_dados_licitacao_json
python manage.py processar_fila_pncp
python manage.py import_bll_csv --help
python manage.py import_bll_xlsx --help
python manage.py export_bll_csv --help
python manage.py export_bll_xlsx --help
python manage.py import_contratos_xlsx --help
```

### Base inicial e manutenção

```powershell
python manage.py seed_basicos
python manage.py fill_lotes
python manage.py sync_itens_canonicos
python manage.py sync_lotes_from_itens
```

## Geração documental

O sistema possui dois grupos principais de geração de documentos:

### Modelos DOCX

Rotas em `docs/urls.py` para:

- termo de autuação;
- ato/termo de autorização;
- aviso de licitação;
- CI para procuradoria;
- CI para contabilidade;
- CI para controladoria;
- declaração de não fracionamento.

### Documentos HTML

No módulo de Licitação há geração com:

- formulário editável;
- pré-visualização em tempo real;
- exportação PDF;
- exportação DOCX;
- impressão de rascunho.

## Processo completo e e-TCM

No módulo Documentos é possível:

- gerar o processo completo em PDF;
- montar capas automáticas por documento;
- respeitar a ordem de anexação;
- consolidar documentos do workflow e anexos do módulo `docs`;
- gerar pacote e-TCM com fracionamento automático por tamanho.

## Observações operacionais

- `db.sqlite3`, `media/`, caches e arquivos temporários não são versionados.
- o projeto está preparado para uso local imediato, mas algumas rotinas dependem do conteúdo cadastrado no banco.
- a exportação documental usa preservação de texto nativo e OCR seletivo para manter desempenho aceitável.

## Versionamento

Repositório remoto oficial:

- `https://github.com/Tarmacruel/SIREL`

## Próximos passos recomendados

- consolidar documentação funcional por módulo;
- registrar usuário responsável em todos os anexos persistidos;
- ampliar testes automatizados dos fluxos documentais;
- preparar configuração de produção com banco dedicado, arquivos estáticos e mídia externos.

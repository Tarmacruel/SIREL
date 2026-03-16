SIREL MODULAR - BASE PRONTA PARA RODAR

Esta entrega foi construída em cima da versão anterior do LicitaWeb/SIREL e reorganizada para iniciar a transição para o modelo modular solicitado.

O QUE JÁ FICOU ENTREGUE NESTA BASE
1) Estrutura de navegação do SIREL Modular em /sirel/
2) 9 módulos cadastrados conceitualmente:
   - Planejamento
   - Compras
   - Licitação
   - Procuradoria
   - Controladoria
   - Contratos
   - Dashboards
   - Documentos
   - Integração
3) App novo "workflow" para controlar módulo atual, etapa atual, movimentações e logs de integração.
4) Tela de integrações com:
   - importação PNCP por número de controle (consulta via API)
   - importação BLL por CSV
5) Resumo por processo com workflow, movimentações e integrações.
6) Manutenção da base anterior de admin, documentos DOCX, portal público e estruturas já existentes.
7) requirements.txt corrigido com dependências que a base já usava e não estavam declaradas, como whitenoise e requests.

IMPORTANTE
- Esta base está PRONTA PARA RODAR como projeto Django.
- Ela já contém a fundação modular e preserva a base anterior.
- A implementação integral de todas as telas de negócio descritas por você (DFD em tempo real, ETP completo, TR com lotes e secretarias, consolidador e-TCM com OCR, fluxos completos por setor etc.) ainda demanda continuação de desenvolvimento sobre esta base.
- Ou seja: a base entregue é rodável e já preparada para a virada modular, mas não representa 100% de todas as regras finais que você especificou.

COMO RODAR
1. Instale Python 3.11 ou superior.
2. Abra a pasta do projeto.
3. Crie e ative um ambiente virtual.
4. Instale as dependências:
   pip install -r requirements.txt
5. Rode as migrações:
   python manage.py migrate
6. Crie um superusuário:
   python manage.py createsuperuser
7. Rode o servidor:
   python manage.py runserver

URLS PRINCIPAIS
- Área modular: http://127.0.0.1:8000/sirel/
- Admin: http://127.0.0.1:8000/admin/
- Portal público: http://127.0.0.1:8000/

PRÓXIMAS IMPLEMENTAÇÕES RECOMENDADAS SOBRE ESTA BASE
1. Módulo Planejamento com DFD, ETP e TR completos
2. Módulo Compras com mapa comparativo e SD
3. Licitação completa da publicidade à homologação
4. Consolidador documental e-TCM com OCR, A4, paginação e corte por tamanho
5. Contratos com saldos e alertas
6. Vinculação detalhada do CSV da BLL às tabelas de resultado
7. Importação PNCP preenchendo efetivamente os campos do processo


ATUALIZAÇÃO v3 - MÓDULO DE PLANEJAMENTO
- Novo painel em /sirel/planejamento/
- Criação de processo no Planejamento
- DFD funcional com múltiplas secretarias e regra de secretaria principal
- Cadastro de itens e catálogo
- ETP com fontes, cotações e alerta de inexequível/sobrepreço
- TR com lotes, dotações, distribuição por secretaria e encaminhamento
- Exportações: DFD DOCX/PDF/XLSX, mapa ETP XLSX e resumo TR DOCX

Se estiver vindo da v2, rode:
python manage.py migrate

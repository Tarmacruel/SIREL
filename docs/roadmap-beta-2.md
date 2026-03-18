# Roadmap da Beta 2.0

Este documento consolida a direção de evolução da Beta 2.0 com foco em operação local, gestão pública, UX institucional e preparação futura para IA.

## 1. Fundamentos do produto

Princípios ativos:

- operação local estável e com backup;
- interface em português do Brasil e UTF-8;
- responsividade nativa para desktop, tablet e smartphone;
- rastreabilidade completa de ações críticas;
- modularidade para crescer sem retrabalho estrutural.

## 2. Módulos e evolução sugerida

### Autenticação e usuários

Entregue na base atual:

- login local;
- troca de senha;
- redefinição de senha por admin;
- perfil `auditor`;
- log local de autenticação;
- bloqueio temporário por tentativas inválidas.

Próximos passos:

- recuperação de senha;
- políticas de senha mais fortes;
- trilha de acesso por estação e IP;
- filtro de eventos por período, usuário e tipo.

### Dashboard

Objetivo de evolução:

- KPIs em tempo real;
- agenda do usuário;
- busca global;
- gráficos por secretaria, modalidade e status;
- atalhos operacionais.

### Processos

Objetivo de evolução:

- tags, prioridade e vínculos;
- visão de gargalos por módulo;
- tempo parado por etapa;
- resumo estruturado indexável para buscas futuras.

### Planejamento

Base atual:

- DFD, ETP, cotações preliminares e TR externo.

Próximos passos:

- central documental da fase;
- geração nativa de TR no sistema;
- relatórios e documentos consolidados;
- maior integração com Compras.

### Licitação

Base atual:

- subetapas estruturadas;
- licitantes, propostas, lances, recursos e homologação;
- documentos da fase.

Próximos passos:

- timeline visual da licitação;
- prazos automáticos;
- maior detalhamento documental por subetapa;
- visão gerencial das fases da Lei 14.133/2021.

### Itens

Objetivo de evolução:

- catálogo mestre com rastreabilidade;
- uso por processo, contrato e fornecedor;
- saldo contratual;
- indicadores de vigência e reaproveitamento.

### Documentos

Objetivo de evolução:

- upload versionado;
- metadados;
- busca por tipo, processo e período;
- publicação controlada para portal público.

### Contratos

Objetivo de evolução:

- vigência;
- aditivos;
- itens contratados e saldo;
- alertas de vencimento.

## 3. Módulos novos prioritários

### Central de Consultas

Finalidade:

- localizar qualquer processo, documento ou informação com rapidez.

Capacidades previstas:

- busca textual;
- filtros por secretaria, modalidade, status, período e valor;
- paginação;
- visualização rápida da última movimentação.

### Painel de Prazos e Alertas

Finalidade:

- acompanhar prazos críticos e evitar atrasos processuais.

Capacidades previstas:

- alertas por data;
- lembretes locais;
- notificações internas;
- quadro diário e semanal.

### Relatórios e Exportação

Finalidade:

- suporte à gestão, controle interno e prestação de contas.

Capacidades previstas:

- relatórios por status, secretaria, modalidade e valores;
- exportação PDF, XLSX, CSV e JSON;
- base futura para exportação e-TCM.

## 4. Direção visual e UX

Diretrizes:

- tema azul royal institucional;
- tipografia consistente;
- foco visível;
- contraste adequado;
- navegação clara em telas pequenas;
- componentes reutilizáveis e auditáveis.

## 5. Operação local

Itens mínimos já ativados ou em implantação:

- script de inicialização local;
- script de backup local;
- seed básico para homologação;
- operação em rede local.

Próximos passos:

- validação periódica de restauração;
- checklist operacional de suporte;
- rotina de backup diária agendada.

## 6. Preparação para IA

A Beta 2.0 deve evoluir com preparação técnica, sem dependência imediata de serviços externos.

Frentes previstas:

- normalização textual;
- resumos indexáveis por processo;
- busca semântica futura;
- assistente de consulta natural.

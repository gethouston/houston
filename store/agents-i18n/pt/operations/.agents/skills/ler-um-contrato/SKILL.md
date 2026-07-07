---
name: ler-um-contrato
title: "Ler um contrato"
description: "Extraia as cláusulas padrão de um contrato ou de uma pasta inteira deles sem precisar ler o juridiquês você mesmo. Eu extraio os limites de responsabilidade, os termos de rescisão, a renovação automática, os termos de pagamento, a propriedade intelectual, o tratamento de dados, os compromissos de disponibilidade e a exclusividade, cada um com a citação literal, um resumo em linguagem simples e um alerta sobre qualquer coisa desfavorável para sua postura com fornecedores. O calendário de renovações é atualizado automaticamente."
version: 1
category: Operações
featured: no
image: clipboard
integrations: [googledrive]
---


# Ler um contrato

## Quando usar

- "extraia a {cláusula} deste contrato" (documento único).
- "quais são os termos de renovação automática em todos os contratos desta pasta" (em lote).
- "extraia o limite de responsabilidade e a linguagem de rescisão do contrato-mestre de serviços da {fornecedor}".

## Conexões que eu preciso

Eu executo trabalho externo através do Composio. Antes desta habilidade rodar, eu verifico se as categorias abaixo estão conectadas. Faltando → eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Arquivos** (Google Drive) - Obrigatório para execuções em lote e buscas por fornecedor específico. Eu vasculho pastas ou contratos nomeados aqui.
- **Processamento de documentos** (OCR ou extração de texto de PDF) - Obrigatório. Extrai o texto real de PDFs escaneados ou nativos para eu poder extrair as cláusulas ao pé da letra.

Se nenhum provedor de arquivos estiver conectado e você não tiver colado o contrato, eu paro e peço para você conectar o Google Drive ou colar o documento.

## Informações que eu preciso

Eu leio o seu contexto operacional primeiro. Para cada campo obrigatório que estiver faltando, eu faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > arquivo enviado > URL > colar) e espero.

- **O contrato em si** - Obrigatório. Por que eu preciso: não posso extrair do nada. Se estiver faltando, eu pergunto: "Envie o contrato ou me indique a pasta. PDF, Word ou um Google Doc, tudo funciona."
- **Postura com fornecedores** - Obrigatório. Por que eu preciso: define quais termos contam como alerta. Uma postura conservadora sinaliza mais agressivamente do que uma postura de risco rápido. Se estiver faltando, eu pergunto: "Como você lida com termos de fornecedores, conservador, equilibrado, ou avançar rápido?"
- **Documento de contexto operacional** - Obrigatório. Por que eu preciso: ancora os limites inegociáveis para eu sinalizar cláusulas que os violariam. Se estiver faltando, eu pergunto: "Quer que eu configure seu contexto operacional primeiro? Ajuda a identificar termos desfavoráveis com mais confiança."

## Passos

1. **Leio `context/operations-context.md`.** Se estiver faltando: paro, peço ao usuário para rodar a habilidade `set-up-my-ops-info` primeiro. Postura com fornecedores + limites inegociáveis ancoram os alertas de "termos desfavoráveis".

2. **Leio `config/procurement.json`**, a postura de aprovação decide quais termos contam como "dignos de alerta" (fundador conservador sinaliza mais, fundador de risco rápido só sinaliza o realmente grave).

3. **Identifico o(s) contrato(s) alvo.**
   - Arquivo único: usuário cola o texto, compartilha URL, ou indica um arquivo no drive conectado.
   - Em lote (pasta): `composio search drive` → lista arquivos na pasta especificada → filtra para os que parecem contrato (PDF/DOCX/DOC).
   - Fornecedor nomeado: procuro em `contracts/` primeiro; se ausente, procuro no drive via `composio search drive`.

4. **Analiso cada contrato.** Uso `composio search doc-processing` para achar a melhor ferramenta de processamento de documento para o formato (OCR para PDFs escaneados, extrator de texto para PDFs nativos, leitor de DOCX). Executo pelo slug, extraio o texto completo.

5. **Extraio as cláusulas padrão.** Por contrato, localizo e extraio:
   - **Limite de responsabilidade** - citação + valor do limite + exceções.
   - **Rescisão** - termos por justa causa, termos por conveniência, prazos de aviso.
   - **Renovação automática** - presença, duração do prazo, janela de aviso para não renovar.
   - **Termos de pagamento** - valor, frequência, ajuste / excedente, multas por atraso.
   - **Propriedade intelectual** - quem é dono do produto do trabalho, regras de propriedade intelectual pré-existente.
   - **Tratamento de dados / acordo de processamento de dados** - presença de acordo de processamento de dados, residência dos dados, compromisso de tempo de resposta para notificação de violação.
   - **Compromisso de disponibilidade** - compromisso de disponibilidade, remédios.
   - **Exclusividade / não concorrência** - presença + escopo.

   Por cláusula: **citação literal** + **resumo de 1 linha em linguagem simples** + **alerta de 1 linha** se for incomum ou desfavorável conforme a postura com fornecedores. Se a cláusula estiver ausente, marco `ABSENT` explicitamente, nunca omito.

6. **Escrevo** em `contracts/{vendor-slug}-{YYYY-MM-DD}.md` com a extração completa. Execuções em lote: um arquivo por contrato + `contracts/batch-{YYYY-MM-DD}-summary.md` consolidando os alertas de todo o lote.

7. **Atualizo o calendário de renovações.** Se o contrato tiver data de renovação, chamo a habilidade `track-my-renewals` internamente (ou anoto que `track-my-renewals` deveria rodar de novo) e adiciono/atualizo a entrada em `renewals/calendar.md`.

8. **Escritas atômicas** - `*.tmp` → renomear.

9. **Adiciono a `outputs.json`** com `type: "contract"`, status "ready" por contrato. Lote: uma entrada `contract` para o resumo + uma por contrato processado.

10. **Resumo para o usuário** - o alerta nº 1 que mais merece a atenção do fundador (ex.: "a renovação automática é em 11 dias e a janela de aviso é de 30 dias, já é tarde demais para parar essa"). Caminho do(s) arquivo(s).

## Saídas

- `contracts/{vendor-slug}-{YYYY-MM-DD}.md` (um por contrato)
- Opcional `contracts/batch-{YYYY-MM-DD}-summary.md` (execuções em lote)
- Atualizações em `renewals/calendar.md`
- Adiciona a `outputs.json` com `type: "contract"`.

## O que eu nunca faço

- **Assinar** ou aceitar qualquer contrato.
- **Inventar** cláusula. Se o contrato não tem limite de responsabilidade, marco `ABSENT`.
- **Interpretar juridicamente.** Sinalizo para a atenção do fundador; fundador consulta o jurídico.

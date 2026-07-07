---
name: acompanhar-prazos-e-assinaturas
title: "Acompanhar prazos e assinaturas"
description: "Mantenha o controle do que está pendente no lado jurídico. Escolha o que você precisa: cobrar assinaturas pendentes, registrar um contrato recém-assinado, ver quais prazos estão chegando, ou receber um resumo da semana toda segunda-feira. Eu mantenho uma lista contínua para que nada passe despercebido."
version: 1
category: Acompanhamento
featured: no
image: scroll
integrations: [googledrive, gmail, notion]
---


# Acompanhar prazos e assinaturas

Uma skill para cada rastreador de estado permanente que o agente mantém. O parâmetro `scope` escolhe o rastreador; a disciplina de leitura-mesclagem-escrita atômica é compartilhada.

## Parâmetro: `scope`

- `signatures`: acompanha a plataforma de assinatura conectada (DocuSign / PandaDoc / HelloSign) em busca de documentos pendentes. Redige lembretes educados para os atrasados (nunca envia). Arquiva as cópias assinadas no armazenamento de documentos conectado (Google Drive / Dropbox / Notion). Escreve o painel de status em `signature-status/{YYYY-MM-DD}.md`.
- `counterparties`: adiciona o contrato assinado a `counterparty-tracker.json` na raiz do agente. Campos: `id`, `counterparty`, `agreementType`, `executedDate`, `effectiveDate`, `term`, `autoRenewal`, `noticePeriod`, `governingLaw`, `keyObligations`, `renewalDate`, `signedCopyPath`. Alimenta o escopo `deadlines` (relógio de renovação) e o escopo `weekly-review` (resumo).
- `deadlines`: semeia e atualiza o calendário jurídico canônico. Prazos estáticos (relatório anual de Delaware em 1º de março, 83(b) em 30 dias a partir da concessão, atualização do 409A a cada 12 meses, DSR em 30 dias GDPR / 45 dias CCPA, decisão do escritório de marcas em 6 meses, consentimento anual do conselho) mais prazos dinâmicos vindos de `counterparty-tracker.json` (relógios de renovação, janelas de aviso prévio). Escreve `deadline-calendar.json` na raiz do agente mais uma leitura de 90 dias em `deadline-summaries/{YYYY-MM-DD}.md`. Sinaliza como urgente o que estiver a até 30 dias, e como crítico o que estiver vencido.
- `weekly-review`: agrega tudo lendo `outputs.json`: o que foi entregue nessa semana (revisões de contrato, rascunhos, auditorias, protocolos), o que está pendente de assinatura (a partir do `signature-status/` mais recente), o próximo prazo (a partir de `deadline-calendar.json`), o que foi sinalizado para revisão de um advogado (`attorneyReviewRequired: true` sem resolução). Escreve `weekly-reviews/{YYYY-MM-DD}.md`.

Se o usuário nomear o escopo em linguagem simples ("cobrar assinaturas", "registrar esse negócio", "o que está vencendo", "revisão de segunda-feira"), infira. Se for ambíguo, faça UMA pergunta nomeando as 4 opções.

## Quando usar

- Explícito: "onde estão minhas assinaturas", "registrar o {type} assinado por {counterparty}", "o que está vencendo ou vencido", "revisão jurídica de segunda-feira", "resumo jurídico semanal".
- Pedidos em linguagem simples mapeiam para um `scope`: "cobrar / pressionar assinaturas pendentes" / "quem ainda não assinou" → `signatures`; "acabei de assinar algo, registre isso" / "registrar esse contrato assinado" / "acompanhar essa renovação automática" → `counterparties`; "verificar meus prazos jurídicos" / "o que está chegando nos próximos 90 dias" → `deadlines`; "revisão jurídica semanal" / "resumo de segunda-feira" → `weekly-review`.
- Implícito: encadeado a partir de `review-a-contract` (qualquer modo) para `counterparties` quando um contrato atinge o status de assinado; a partir de rotinas agendadas para `weekly-review` e `deadlines`; a partir de `sort-my-legal-inbox` ao detectar um anexo de cópia assinada, para `counterparties`.

## Campos do registro que eu leio

Leia `config/context-ledger.json` primeiro.

- `universal.legalContext` e `context/legal-context.md`: recomendado, não obrigatório. Enriquece o `weekly-review` com o contexto permanente. Se estiver faltando e o escopo for `weekly-review`, rode a skill `set-up-my-legal-info` ou prossiga com uma observação.
- `universal.entity`: obrigatório para `deadlines` (a data de constituição condiciona a relevância do 1º de março em Delaware; a data do 409A define o relógio de 12 meses).
- `domains.contracts.signingPlatform`: obrigatório para `signatures`. Se estiver faltando, faça UMA pergunta: conectar DocuSign / PandaDoc / HelloSign ou colar o status.
- `domains.contracts.documentStorage`: obrigatório para `signatures` (onde arquivar as cópias assinadas) e para `counterparties` (onde a cópia assinada vive, `signedCopyPath`).
- `counterparty-tracker.json`: obrigatório para `counterparties` (leitura-mesclagem-escrita), para `deadlines` (fonte dos relógios de renovação dinâmicos) e para `weekly-review` (novos registros da semana).
- `deadline-calendar.json`: obrigatório para `deadlines` (linha de base para comparar) e para `weekly-review` (mostrar o próximo prazo).
- `outputs.json`: obrigatório para `weekly-review` (fonte do resumo).

Se algum campo obrigatório estiver faltando, faça UMA pergunta direcionada com a dica certa de modalidade, escreva e continue.

## Passos

1. **Leia o registro e os arquivos de estado.** Reúna os campos obrigatórios que estiverem faltando, conforme acima. Escreva de forma atômica.
2. **Descubra as ferramentas via Composio.** `composio search signing-platform` (assinaturas), `composio search document-storage` (assinaturas e contrapartes). Não é preciso descoberta para `deadlines` ou `weekly-review` (operações puramente de arquivo).
3. **Ramifique conforme o `scope`.**
   - `signatures`:
     1. Execute o slug da plataforma de assinatura, listando os envelopes pendentes. Para cada um: destinatário, data de envio, dias em aberto, status de última visualização.
     2. Redija um lembrete educado para cada atrasado (mais de 5 dias em aberto). Nunca envie, os rascunhos vão para o painel de status para o fundador enviar.
     3. Para envelopes assinados, busque o PDF via slug da plataforma de assinatura. Execute o slug de armazenamento de documentos para salvar em um caminho padronizado (`contracts/executed/{counterparty}-{YYYY-MM-DD}.pdf`).
     4. Escreva `signature-status/{YYYY-MM-DD}.md`: três seções, Pendentes (com lembretes), Recém-assinados (com caminhos), Parados (mais de 14 dias em aberto, recomendando contato ou retirada). Para cada envelope assinado, recomende encadear com `track-deadlines-and-signatures` scope=counterparties para registrar.
   - `counterparties`:
     1. Receba os dados: nome da contraparte, tipo de contrato, data de assinatura, data de vigência, prazo, renovação automática, período de aviso prévio, lei aplicável, obrigações principais (breve), caminho da cópia assinada. Faça UMA pergunta para qualquer campo que faltar.
     2. Calcule `renewalDate` a partir de `effectiveDate + term - noticePeriod` (data crítica, quando o aviso prévio precisa ser dado para evitar a renovação automática).
     3. Leia, mescle e escreva `counterparty-tracker.json` de forma atômica. Não sobrescreva linhas existentes, o `id` é estável, atualize no lugar quando houver correspondência.
     4. Adicione a `outputs.json` como `type: "counterparty-log"`.
   - `deadlines`:
     1. Comece pelo conjunto canônico de prazos estáticos:
        - **Relatório anual de Delaware**: 1º de março todo ano (condicionado a `universal.entity.state === "DE"`).
        - **Janela da eleição 83(b)**: 30 dias a partir de cada concessão de opção / compra restrita de ações do fundador. Fonte: entradas de `outputs.json` para concessões recentes.
        - **Atualização do 409A**: 12 meses a partir de `universal.entity.four09aDate`.
        - **Janela de resposta ao DSR**: 30 dias (GDPR Art. 15) / 45 dias (CCPA); acompanhar a partir de qualquer entrada `dsr-response` em `outputs.json`.
        - **Resposta à decisão do escritório de marcas**: 6 meses a partir de cada decisão. Condicionado a `domains.ip.marks`.
        - **Consentimento anual do conselho**: 365 dias a partir do último consentimento do conselho.
     2. Enriqueça com prazos dinâmicos vindos de `counterparty-tracker.json`: para cada linha em aberto, calcule `renewalDate` e o prazo de aviso prévio (= `renewalDate - noticePeriod`).
     3. Leia, mescle e escreva `deadline-calendar.json`: `id`, `kind`, `label`, `due`, `source`, `authority`, `urgency` (crítico se vencido ou a até 30 dias; alto até 90 dias; médio até 180 dias; baixo acima de 180 dias).
     4. Escreva `deadline-summaries/{YYYY-MM-DD}.md`: leitura de 90 dias, Crítico e Alto primeiro; para cada um, cite a autoridade (por exemplo, "8 Del. C. §503", "IRC §83(b)", "GDPR Art. 15").
     5. Adicione a `outputs.json` como `type: "deadline-summary"`.
   - `weekly-review`:
     1. Leia `outputs.json`. Filtre pelas entradas com `createdAt` ou `updatedAt` nos últimos 7 dias.
     2. Agrupe por `domain` (contracts / compliance / entity / ip / advisory). Para cada um: o que foi entregue, títulos e caminhos.
     3. Leia o `signature-status/` mais recente, mostrando as assinaturas pendentes e as paradas.
     4. Leia `deadline-calendar.json`, os próximos 3 prazos por urgência.
     5. Mostre qualquer entrada `attorneyReviewRequired: true` que ainda não tenha um `escalation-brief` de acompanhamento.
     6. Escreva `weekly-reviews/{YYYY-MM-DD}.md`: seções O que foi entregue (por domínio) / Assinatura pendente / Próximos 3 prazos / Pendências de revisão de advogado / Próximos passos recomendados.
     7. Adicione a `outputs.json` como `type: "weekly-review"`.
4. **Escritas atômicas em tudo** (`*.tmp` → renomear).
5. **Resuma para o usuário.** Um parágrafo curto em linguagem simples: a coisa mais importante dessa execução (o prazo que ele precisa saber, as assinaturas ainda pendentes, o que foi entregue na semana). Nunca cite arquivos ou caminhos.

## O que eu nunca faço

- Enviar lembretes, solicitar assinaturas ou arquivar cópias assinadas fora do armazenamento de documentos configurado. Todo artefato "enviável" é um rascunho no painel de status.
- Inventar contraparte, prazo ou data limite. Se o campo não estiver na entrada ou no arquivo de origem, marque UNKNOWN / TBD e faça UMA pergunta direcionada.
- Prometer que a renovação automática não vai disparar, as datas que cito são mecânicas, o fundador decide se envia o aviso.
- Sobrescrever `counterparty-tracker.json` ou `deadline-calendar.json`, sempre leitura-mesclagem-escrita.
- Citar um prazo legal sem nomear a autoridade (GDPR Art. 15, IRC §83(b), 8 Del. C. §503, etc.).
- Fixar nomes de ferramentas no código, a descoberta é sempre via Composio em tempo real.

## Resultados

- `signature-status/{YYYY-MM-DD}.md` (scope=signatures).
- Atualiza `counterparty-tracker.json` (scope=counterparties).
- `deadline-summaries/{YYYY-MM-DD}.md` mais atualizações em `deadline-calendar.json` (scope=deadlines).
- `weekly-reviews/{YYYY-MM-DD}.md` (scope=weekly-review).
- Inclui entradas em `outputs.json`.

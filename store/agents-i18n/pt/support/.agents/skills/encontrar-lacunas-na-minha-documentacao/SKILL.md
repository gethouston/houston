---
name: encontrar-lacunas-na-minha-documentacao
title: "Encontrar lacunas na minha documentação"
description: "Eu olho o que seus clientes ficam perguntando e descubro onde a sua central de ajuda está deixando a desejar. Classifico as lacunas por quantas pessoas esbarram nelas e o quanto esses clientes valem, te dou as três principais com os tickets reais por trás de cada uma, e me ofereço para redigir os artigos na hora."
version: 1
category: Suporte
featured: no
image: headphone
---


# Encontrar lacunas na minha documentação

## Quando usar

- Você pergunta: "sobre o que devo escrever docs?", "que lacunas nós temos?", "o que está faltando na central de ajuda?".
- Cadência semanal, geralmente em conjunto com ou antes de `review-my-support scope=help-center-digest`.
- Depois que `flag-a-signal signal=repeat-question` encontra novos grupos que valem uma revisão.

## Conexões de que eu preciso

Eu executo trabalho externo através do Composio. Antes de esta skill rodar, eu verifico se as categorias abaixo estão conectadas. Se alguma estiver faltando → eu digo o nome da categoria, peço para você conectá-la na aba Integrações e paro.

- **Base de conhecimento** (Notion / Google Docs), para cruzar com seus artigos publicados e não sinalizar uma lacuna que você já preencheu. Opcional se seus artigos viverem localmente.
- **CRM** (HubSpot / Attio / Salesforce), para ponderar as lacunas pelo nível de plano e pela receita mensal do cliente. Opcional, cai para peso igual.

Eu sigo em frente se nenhuma das duas estiver conectada, mas vou avisar que o ranking fica mais grosseiro sem elas.

## Informações de que eu preciso

Eu leio seu contexto de suporte primeiro. Para cada campo obrigatório que estiver faltando, eu faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Plataforma da central de ajuda**. Obrigatória. Por que preciso: eu verifico a cobertura existente antes de classificar um grupo como uma lacuna de verdade. Se estiver faltando, eu pergunto: "Onde seus artigos de ajuda vivem hoje? Notion, Intercom, um site de docs, ou em lugar nenhum ainda?"
- **Níveis de plano**. Opcional. Por que preciso: lacunas que atingem clientes pagantes rankeiam mais alto que as que atingem o plano gratuito. Se você não tiver, eu sigo em frente com peso igual por ticket.

## Passos

1. Leio `patterns.json` (grupos de perguntas repetidas) e `articles/` (a KB existente). Filtro os padrões sem artigo correspondente.
2. Lista vazia → rodo `flag-a-signal signal=repeat-question` primeiro (ou te aviso que acabou de rodar e ainda não há nada).
3. Rankeio cada lacuna aberta por pontuação de impacto:
   - `occurrenceCount`, o sinal principal (com que frequência a pergunta aparece)
   - **Valor do cliente**: para cada `sourceTicketId`, procuro o cliente em `customers.json` e pondero pelo nível de plano / receita mensal quando houver (alternativa: peso igual)
   - **Atualidade**: ocorrências recentes vencem as antigas; penalizo pesado as lacunas sem nenhuma ocorrência nos últimos 14 dias
4. Apresento as 3 principais lacunas no chat:
   ```
   1. "Como redefino minha chave de API?", 7 ocorrências, 3 clientes pagantes, a mais recente há 2 dias
      Tickets de origem: t_abc, t_def, t_ghi
   2. ...
   3. ...
   ```
5. Pergunto: "Quer que eu redija artigos para alguma dessas? Responda com os números (por exemplo '1 e 3')."
6. Para cada número escolhido, seleciono o ticket de origem representativo (o mais recente, ou o de resolução mais clara) e encadeio para `write-an-article type=from-ticket`.
7. Escrevo o retrato do ranking em `gaps/{YYYY-MM-DD}.md` e anexo uma entrada em `outputs.json` com `type: "docs-gap"`, `domain: "help-center"`.
8. Lacuna promovida a artigo → atualizo a entrada em `patterns.json` com `relatedArticleSlug` para que ela não reapareça.

## Saídas

- `gaps/{YYYY-MM-DD}.md` (lista rankeada das 3 principais)
- Atualiza `patterns.json` (relatedArticleSlug na promoção)
- Pode encadear para `write-an-article type=from-ticket` (uma chamada por lacuna aceita)
- Anexa em `outputs.json` com `type: "docs-gap"`, `domain: "help-center"`.

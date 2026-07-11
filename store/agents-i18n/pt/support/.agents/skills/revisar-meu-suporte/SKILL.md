---
name: revisar-meu-suporte
title: "Revisar meu suporte"
description: "Receba um relatório estruturado de como o suporte está indo. Um resumo semanal que cobre todas as áreas com volume, principais temas, promessas atrasadas e alertas de cancelamento abertos. Um resumo da central de ajuda que mostra os temas dos tickets, a velocidade dos pedidos, e o artigo mais útil para escrever a seguir. Ou uma revisão por conta que mapeia vitórias, pedidos entregues, fricções em aberto, e próximos passos, para você chegar preparado na ligação."
version: 1
category: Suporte
featured: yes
image: headphone
integrations: [googledocs, notion, slack]
---


# Revisar meu suporte

Uma skill para consolidado / relatório / revisão. Ramifica por `scope`.

## Quando usar

- **weekly**, "revisão de segunda-feira" / "relatório semanal de suporte" / "como
  foi a semana do suporte?" / rotina cron de segunda-feira.
- **help-center-digest**, "resumo semanal da central de ajuda" / "o que
  aconteceu nos docs esta semana?" / rotina cron de domingo.
- **account-review**, "prepare a revisão de conta de {account}" / "roteiro para o check-in
  com {customer}."

## Conexões de que preciso

Eu executo trabalho externo pelo Composio. Antes de rodar esta skill, verifico se as categorias abaixo estão conectadas. Se faltar alguma, eu nomeio a categoria, peço para você conectá-la na aba de Integrações e paro.

- **Docs / notas** (Google Docs / Notion), publicar o relatório onde seu time realmente vai ler. Opcional, cai para markdown local.
- **Mensagens** (Slack), soltar o resumo semanal em um canal do time. Opcional.
- **CRM** (HubSpot / Attio), puxar o registro da conta para o escopo de revisão de conta. Obrigatório para `account-review`.
- **Cobrança** (Stripe), puxar a receita mensal e a data de renovação para o escopo de revisão de conta. Obrigatório para `account-review`.

Se você pedir uma revisão de conta e seu CRM não estiver conectado, eu paro e peço para você conectá-lo.

## Informações de que preciso

Eu leio seu contexto de suporte primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Superfície do produto + mapa de níveis de plano**, Obrigatório. Por que preciso disso: os consolidados agrupam itens por área e nível. Se faltar, eu pergunto: "Quais planos você vende, e mais ou menos o que cada um inclui?"
- **Segmento de revisão de conta**, Obrigatório para `account-review`. Por que preciso disso: nem todo cliente recebe uma revisão de conta; preciso saber onde está a linha. Se faltar, eu pergunto: "Com quais clientes você realmente faz revisões de conta, só enterprise, qualquer um acima de uma certa receita mensal?"
- **Cadência de revisão**, Obrigatório para `weekly`. Por que preciso disso: define a janela do consolidado. Se faltar, eu pergunto: "Você quer isso semanalmente, a cada duas semanas, ou mensalmente?"

## Parâmetro: `scope`

- `weekly`, consolidado de todas as áreas. Volume, principais temas,
  itens de alta prioridade sem resolução, alertas de cancelamento abertos, promessas com prazo
  nesta semana, próximos passos agrupados por área. Escreve em
  `reviews/{YYYY-MM-DD}.md`.
- `help-center-digest`, consolidado específico dos docs. Volume de tickets, top
  3 temas de `patterns.json`, itens de alta prioridade sem resolução,
  velocidade de pedidos de funcionalidade, alertas de cancelamento. Escreve em
  `digests/{YYYY-MM-DD}.md`.
- `account-review`, revisão por conta. 4 seções: vitórias (o que
  foi conquistado), pedidos entregues (pedidos que enviei), fricção
  (dores ainda em aberto), próximos passos (renovação / expansão /
  investimento). Escreve em `account-reviews/{account}-{YYYY-MM-DD}.md`.

## Passos

1. **Ler `context/support-context.md`.** Se estiver faltando, parar.
2. **Ler o ledger.** Preencher lacunas.
3. **Ramificar por `scope`:**
   - `weekly`: ler `outputs.json` filtrado para os últimos 7 dias.
     Agrupar por `domain`. Por área: contagem + manchete de 1 linha +
     1 item sem resolução. Ler `followups.json` filtrado para prazos desta semana.
     Ler `churn-flags.json` filtrado para abertos nesta semana. Terminar com
     "2-3 coisas que recomendo você fazer esta semana" considerando o
     agente inteiro.
   - `help-center-digest`: ler as contagens de `conversations.json` para a
     janela, os top 3 temas de `patterns.json`, a velocidade de `requests.json`,
     as mudanças de estado de `known-issues.json`. Apresentar a
     única lacuna de docs mais útil para escrever a seguir.
   - `account-review`: encadear `look-up-a-customer view=timeline` para a conta.
     Ler `requests.json` + `bug-candidates.json` + `followups.json`
     filtrados para a conta. Estruturar o documento como vitórias /
     pedidos entregues / fricção / próximos passos, cada seção fundamentada
     na linha do tempo + IDs de pedidos.
4. **Escrever o artefato** atomicamente.
5. **Adicionar a `outputs.json`** com `type` =
   `weekly-review` | `help-center-digest` | `account-review`,
   `domain: "quality"` (para `weekly` / `help-center-digest`) ou
   `domain: "success"` (para `account-review`), título, resumo, caminho.
6. **Resumir para mim**: leitura de 2 minutos. Para `weekly` / `digest`,
   sempre apresentar, semana calma também é notícia.

## Saídas

- `reviews/{YYYY-MM-DD}.md` (para `scope = weekly`)
- `digests/{YYYY-MM-DD}.md` (para `scope = help-center-digest`)
- `account-reviews/{account}-{YYYY-MM-DD}.md` (para `scope = account-review`)
- Adiciona a `outputs.json`.

## O que eu nunca faço

- Inventar números para encher uma semana calma. Volume baixo, escrevo isso.
- Incluir "próximos passos" sem fundamentar em uma saída específica
  ou em um id de ticket.

---
name: pontuar-meu-pipeline
title: "Pontuar meu pipeline"
description: "Pontuo o que você precisar pontuar. Escolha o assunto: cada lead sem pontuação frente ao seu perfil de cliente ideal, o encaixe e ângulo de um único lead, cada negócio aberto de acordo com seus fatores de saúde, ou a cor de cada cliente. Nomeio os dois principais fatores de cada linha para que nenhum número seja uma caixa preta."
version: 1
category: Vendas
featured: no
image: handshake
integrations: [hubspot, salesforce, attio, stripe]
---


# Pontuar Meu Pipeline

Uma skill, quatro superfícies de pontuação. O parâmetro `subject` escolhe a rubrica. A disciplina de "fatores transparentes, sem números mágicos" é compartilhada.

## Parâmetro: `subject`

- `lead`  -  pontua em lote todo lead ainda não pontuado em `leads.json` (mais qualquer visão de novos leads no CRM conectado). Uma passada geral do sistema, não de um único lead. Retorna uma tabela classificada.
- `lead-fit`  -  um único lead nomeado: pontuação de encaixe e ângulo para o pitch. Rápido, uma linha só.
- `deal-health`  -  todo negócio aberto em `deals.json` (ou na visão de negócios abertos do CRM conectado). Fatores: tempo no estágio, completude da qualificação, tempo desde o último contato. Retorna GREEN / YELLOW / RED por negócio.
- `customer-health`  -  todo cliente atual em `customers.json`. Fatores: tendência de uso do produto, índice de satisfação quando capturado, volume de tickets de suporte, sinal de cobrança (proximidade de downgrade). GREEN / YELLOW / RED, com os 2 principais fatores nomeados por linha.

Se o pedido do usuário nomear o assunto em linguagem simples ("pontua os leads", "checa o encaixe", "saúde do pipeline", "quem está no vermelho"), eu infiro. Senão, faço UMA pergunta nomeando as 4 opções.

## Quando usar

- Gatilhos explícitos na descrição.
- Implícito: dentro de `manage-my-crm action=route` (o roteamento precisa da pontuação); dentro de `write-my-outreach stage=churn-save` (uma linha vermelha de customer-health dispara a tentativa de retenção); dentro de `check-my-sales subject=pipeline` (o consolidado de saúde usa as pontuações por negócio).

## Conexões que preciso

Faço o trabalho externo através do Composio. Antes de esta skill rodar, verifico se as categorias abaixo estão conectadas. Se faltar alguma, nomeio a categoria, peço para você conectá-la na aba Integrações, e paro.

- **CRM**  -  busco leads, negócios abertos, registros de clientes. Obrigatório para `lead`, `deal-health`, `customer-health`.
- **Cobrança**  -  busco sinal de downgrade ou cancelamento. Obrigatório para `customer-health`.
- **Varredura / Busca**  -  enriqueço um único lead para `lead-fit`. Opcional.

Se o seu CRM não estiver conectado, paro e peço para você vincular o HubSpot, Salesforce, Attio, Pipedrive, ou Close primeiro.

## Informações que preciso

Primeiro leio o seu contexto de vendas. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > arquivo > URL > colar) e espero.

- **Seu playbook de vendas**  -  Obrigatório. Por que preciso: o seu perfil de cliente ideal e os desqualificadores definem a pontuação de lead e de encaixe; o framework de qualificação e os critérios de saída de estágio definem o deal-health. Se estiver faltando, pergunto: "Ainda não tenho o seu playbook. Quer que eu rascunhe um agora?"
- **CRM conectado**  -  Obrigatório para `lead`, `deal-health`, `customer-health`. Por que preciso: pontuo linhas reais, não inventadas. Se estiver faltando, pergunto: "Conecte o seu CRM (HubSpot, Salesforce, Attio, Pipedrive ou Close) para eu buscar leads, negócios e clientes."
- **Limites de saúde**  -  Opcional, para `customer-health`. Por que preciso: transforma os fatores em GREEN/YELLOW/RED. Se você não tiver os seus próprios, sigo com padrões sensatos (GREEN = ativo semanalmente e sem sinal de downgrade; YELLOW = uma preocupação; RED = duas ou mais) e confirmo antes de travá-los.
- **Fonte de uso do produto**  -  Opcional, útil para `customer-health`. Por que preciso: a tendência de uso é o fator de saúde mais forte. Se você não tiver, sigo com TBD nesse fator.

## Passos

1. **Leio o ledger e o playbook.** Coleto os campos obrigatórios que faltam (uma pergunta por vez, começando pela melhor modalidade). Escrevo de forma atômica.

2. **Busco a população.**
   - `lead`: leio `leads.json` e `composio <crm> get-new-leads` (ou equivalente para o CRM conectado).
   - `lead-fit`: a linha do lead nomeado (ou dados colados).
   - `deal-health`: `deals.json` e `composio <crm> get-open-deals`.
   - `customer-health`: `customers.json` e `composio <crm> get-customers`; busco o sinal de cobrança via Stripe; busco o sinal de uso via PostHog / Mixpanel / Amplitude, se conectado.

3. **Pontuo, de acordo com a rubrica.**
   - `lead` / `lead-fit`: por linha, comparo com o perfil de cliente ideal e os desqualificadores do playbook. Pontuo cada dimensão de 0 a 3. Qualquer desqualificador definitivo joga para RED. Somo → GREEN (≥ 80%) / YELLOW (50-79%) / RED (< 50% ou qualquer desqualificador). Produzo um **ângulo** (uma única dor do playbook) para cada GREEN.
   - `deal-health`: três fatores por negócio: **tempo no estágio** em relação à linha de base do playbook (RED se >2x a linha de base), **qualificação** (% dos pilares do framework cobertos, RED se <50%), **tempo desde o último contato relevante** (RED se >14 dias em estágios ativos). O geral é o pior fator.
   - `customer-health`: fatores por cliente: **tendência de uso** (% da linha de base das últimas 4 semanas), **índice de satisfação** quando capturado, **tickets de suporte** (quantidade × gravidade, se acessível), **sinal de cobrança** (downgrade ou cancelamento em andamento). O geral é o pior fator. Nomeio os 2 principais fatores por linha.

4. **Escrevo o lote pontuado** de forma atômica em `scores/{subject}-{YYYY-MM-DD}.md`: tabela classificada, fatores por linha e próximos passos sugeridos. Para `lead-fit`, o mesmo formato mas com uma linha só.

5. **Atualizo o arquivo da entidade relevante.**
   - `lead` + `lead-fit`: atualizo a linha em `leads.json` com `fitScore` e `scoredAt`.
   - `deal-health`: atualizo a linha em `deals.json` com `healthScore`, `healthDrivers` e `scoredAt`.
   - `customer-health`: atualizo a linha em `customers.json` com `healthColor`, `healthDrivers` e `scoredAt`.

6. **Adiciono a `outputs.json`**  -  lendo, mesclando e escrevendo de forma atômica: `{ id (uuid v4), type: "score", title: "Pontuação de {Subject}  -  {YYYY-MM-DD}", summary: "<N linhas. {R} vermelhas, {Y} amarelas, {G} verdes.>", path, status: "ready", createdAt, updatedAt, domain: "<outbound (lead/lead-fit) | crm (deal-health) | retention (customer-health)>" }`.

7. **Resumo para o usuário.** As contagens e a principal linha para agir. Sugiro a próxima skill ("Rotear os GREEN com `manage-my-crm action=route`?" / "Rascunhar tentativas de retenção para os RED com `write-my-outreach stage=churn-save`?").

## O que eu nunca faço

- Inventar número ou sinal. Cada fator cita um dado concreto (linha, contagem de eventos, dias).
- Enviar pontuações para o CRM sem aprovação. As atualizações ficam nos índices locais `leads.json` / `deals.json` / `customers.json`; qualquer coisa que altere sistemas externos passa por `manage-my-crm action=queue-followup`.
- Resultado caixa-preta. Sempre nomeio os fatores.

## Saídas

- `scores/{subject}-{YYYY-MM-DD}.md`
- Atualiza as linhas de `leads.json` / `deals.json` / `customers.json`.
- Adiciona a `outputs.json` com `type: "score"`.

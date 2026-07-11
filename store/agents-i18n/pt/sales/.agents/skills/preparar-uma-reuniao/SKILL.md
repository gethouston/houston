---
name: preparar-uma-reuniao
title: "Preparar uma reunião"
description: "Te preparo para uma reunião no formato que fizer sentido: uma folha de preparação de uma página com as perguntas certas para o pilar de qualificação mais fraco do negócio, ou um pacote de revisão de conta com resultados entregues, tendência de uso, riscos e prazo até a renovação. Os dois partem do seu playbook e do histórico do negócio ou cliente, sem modelos genéricos."
version: 1
category: Vendas
featured: yes
image: handshake
integrations: [googlecalendar, hubspot, salesforce, attio, gong, fireflies, stripe, linkedin]
---


# Preparar Uma Reunião

Uma skill, dois formatos de preparação de reunião. O parâmetro `type` escolhe a estrutura. A base no playbook e o princípio de "sem modelos genéricos" são compartilhados.

## Parâmetro: `type`

- `call`  -  folha de uma página pré-call (discovery / demo / followup / late-stage). Objetivo · participantes · perguntas · objeções · critérios de saída.
- `account-review`  -  pacote trimestral de revisão de conta para cliente existente. Resultados · tendência de uso · pedidos em aberto · riscos · meta do próximo trimestre.

Se o pedido do usuário nomear o tipo em linguagem simples ("preparação de call", "revisão de conta"), eu infiro. Senão, faço UMA pergunta nomeando as 2 opções.

## Quando usar

- Gatilhos explícitos na descrição.
- Implícito: `brief-me-for-today` detecta uma reunião iminente sem preparação e encadeia aqui com `type=call`; a rotina de retenção de clientes encadeia aqui com `type=account-review` antes da janela de renovação.

## Conexões que preciso

Faço o trabalho externo através do Composio. Antes de esta skill rodar, verifico se as categorias abaixo estão conectadas. Se faltar alguma, nomeio a categoria, peço para você conectá-la na aba Integrações, e paro.

- **Calendário**  -  busco o horário da reunião e os participantes. Obrigatório.
- **CRM**  -  leio o registro do negócio ou cliente (estágio, responsável, contatos). Obrigatório.
- **Reuniões**  -  busco as transcrições de calls anteriores para `type=call`. Opcional.
- **Redes sociais**  -  enriqueço os perfis dos participantes via LinkedIn. Opcional.
- **Cobrança**  -  busco o status de cobrança para `type=account-review`. Opcional.

Se o calendário ou o CRM não estiverem conectados, paro e peço para você conectá-los primeiro. A preparação é baseada na reunião e no negócio.

## Informações que preciso

Primeiro leio o seu contexto de vendas. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > arquivo > URL > colar) e espero.

- **Seu playbook de vendas**  -  Obrigatório. Por que preciso: priorizo as perguntas de acordo com o seu framework de qualificação e busco o seu objetivo principal de primeira call. Se estiver faltando, pergunto: "Ainda não tenho o seu playbook. Quer que eu rascunhe um agora?"
- **Para qual reunião é**  -  Obrigatório. Por que preciso: busco o evento no calendário, os participantes, e o negócio ao qual ela está vinculada. Se estiver faltando, pergunto: "Para qual reunião você quer que eu prepare? Com quem é e mais ou menos quando?"
- **CRM conectado**  -  Obrigatório. Por que preciso: leio o estágio do negócio e os contatos anteriores para focar o banco de perguntas. Se estiver faltando, pergunto: "Conecte o seu CRM (HubSpot, Salesforce, Attio, Pipedrive ou Close), ou cole o contexto do negócio."
- **Fonte de uso do produto**  -  Opcional, útil para `type=account-review`. Por que preciso: cito tendências de uso reais. Se você não tiver, sigo com TBD na seção de uso.

## Passos

1. **Leio o ledger e o playbook.** Coleto os campos obrigatórios que faltam (uma pergunta por vez, começando pela melhor modalidade). Escrevo de forma atômica.

2. **Ramifico de acordo com o tipo.**
   - `call`:
     1. Leio a linha do negócio em `deals.json` e as notas de calls
        anteriores em `calls/{slug}/`. Leio o briefing da conta
        `accounts/{slug}/brief-*.md` (encadeio
        `research-an-account depth=full-brief` se estiver faltando
        e o usuário aprovar).
     2. Busco os detalhes da reunião no Google Calendar (via
        Composio) se o horário estiver especificado. Capturo os
        participantes (cargo e função, enriquecendo via LinkedIn se
        a informação for escassa).
     3. Componho a folha de uma página:
        - **Objetivo da reunião**  -  a partir do objetivo principal de primeira call do playbook, ajustado para o estágio (discovery / demo / late-stage).
        - **Participantes**  -  nome, cargo, perfil de uma linha e provável motivação para esta reunião.
        - **Recapitulação de contexto**  -  2 a 3 tópicos do briefing da conta e da análise de calls anteriores.
        - **Banco de perguntas**  -  5 a 8 perguntas do framework de qualificação do playbook. Priorizo o pilar mais fraco no estado atual do negócio (referenciando análises de calls anteriores, se existirem).
        - **Objeções prováveis**  -  as 2 principais do manual de objeções do playbook, cada uma com a melhor reformulação atual.
        - **Critérios de saída**  -  o que precisa ser verdade ao final da call para o negócio avançar de estágio (da seção de estágios e critérios de saída do playbook).
        - **Armadilhas a evitar**  -  qualquer padrão de perda sinalizado em `call-insights/*.md` para o segmento.
     4. Salvo em `deals/{slug}/call-prep-{YYYY-MM-DD}.md` (atômico,
        `*.tmp` → renomeio). Crio `deals/{slug}/` se não existir.
     5. Atualizo a linha em `deals.json`, definindo `lastCallPrepAt`.
   - `account-review`:
     1. Leio a linha do cliente em `customers.json` e a revisão de
        conta anterior (`customers/{slug}/account-review-*.md`) para
        atualizar, não reescrever do zero.
     2. Busco a tendência de uso via PostHog / Mixpanel / Amplitude
        (se conectado). Busco o status de cobrança via Stripe.
        Busco tickets de suporte em aberto se a ferramenta de
        tickets estiver conectada.
     3. Componho o pacote de revisão de conta:
        - **Resultados entregues**  -  em relação à métrica de sucesso travada no kickoff (de `customers/{slug}/onboarding-plan.md`, se existir). Mostro números.
        - **Tendência de uso**  -  trimestre a trimestre. Cito a fonte da métrica.
        - **Pedidos em aberto**  -  solicitações de funcionalidades e escalonamentos de suporte em aberto.
        - **Riscos**  -  fatores amarelos/vermelhos da última execução de `score-my-pipeline subject=customer-health`.
        - **Meta do próximo trimestre**  -  um resultado concreto, ligado ao roadmap do produto quando visível.
        - **Prazo até a renovação**  -  dias até a renovação e um lembrete da postura de preço (do playbook).
     4. Salvo em `customers/{slug}/account-review-{YYYY-QN}.md`.
     5. Atualizo a linha em `customers.json`, definindo `lastAccountReviewAt`.

3. **Adiciono a `outputs.json`**  -  lendo, mesclando e escrevendo de forma atômica: `{ id (uuid v4), type: "call-prep" (para call) | "account-review-prep" (para account-review), title, summary: "<objetivo da reunião | maior risco + maior resultado>", path, status: "ready", createdAt, updatedAt, domain: "<meetings | retention>" }`.

4. **Resumo para o usuário.** Objetivo da reunião (ou maior resultado, no caso de revisão de conta) e as 3 principais perguntas (ou maior risco, no caso de revisão de conta), direto no chat. Caminho para a preparação completa.

## O que eu nunca faço

- Inventar participantes, números de uso, fatos de calls anteriores. Cada linha cita a fonte.
- Entregar um modelo genérico de call de discovery. Todo banco de perguntas é priorizado de acordo com o estado atual de qualificação do negócio.
- Escrever a revisão de conta como um dashboard. É uma narrativa com 3 riscos e 3 vitórias, não um gráfico.

## Saídas

- `call` → `deals/{slug}/call-prep-{YYYY-MM-DD}.md`; atualiza `deals.json`.
- `account-review` → `customers/{slug}/account-review-{YYYY-QN}.md`; atualiza `customers.json`.
- Adiciona a `outputs.json`.

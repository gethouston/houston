---
name: redigir-um-playbook
title: "Redigir um playbook"
description: "Eu escrevo um playbook de resposta a incidentes passo a passo, para que na próxima vez que algo quebrar você já saiba quem acionar, o que dizer aos clientes e quando publicar atualizações. Cobre desde a detecção até o post-mortem, com nomes reais, canais reais e modelos de comunicação na sua voz. Um documento que você escreve uma vez e usa sempre."
version: 1
category: Suporte
featured: no
image: headphone
integrations: [github, linear, slack, microsoftteams]
---


# Redigir um playbook

## Quando usar

- "redija o playbook de P1" / "runbook para quedas" / "playbook de incidente de segurança."
- Depois de um incidente em que você diz "precisamos de um playbook de verdade para isso."
- Quando o onboarding marca a resposta a incidentes como `TBD`.

## Conexões de que eu preciso

Eu executo trabalho externo através do Composio. Antes de esta skill rodar, eu verifico se as categorias abaixo estão conectadas. Se alguma estiver faltando → eu digo o nome da categoria, peço para você conectá-la na aba Integrações e paro.

- **Mensagens** (Slack / Microsoft Teams), um canal interno nomeado para o passo de acionamento dos "primeiros 15 minutos". Obrigatória.
- **Rastreador de dev** (GitHub / Linear), destino nomeado para o repasse à engenharia e o acompanhamento do post-mortem. Obrigatória.

Se nenhuma das duas estiver conectada, eu paro e peço para você conectar o Slack (ou o Teams) primeiro. O playbook depende de um canal interno real.

## Informações de que eu preciso

Eu leio seu contexto de suporte primeiro. Para cada campo obrigatório que estiver faltando, eu faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Definição de severidade para este tipo de incidente**. Obrigatória. Por que preciso: a linha de gatilho no topo do playbook precisa de um limite real. Se estiver faltando, eu pergunto: "O que conta como P1 para você? Me dê 2 ou 3 exemplos de tickets que se qualificariam."
- **Rodízio de plantão + contatos nomeados**. Obrigatório. Por que preciso: o playbook aciona pessoas reais, não "a engenharia". Se estiver faltando, eu pergunto: "Quem é o plantonista da engenharia quando algo quebra às 2 da manhã, e como você fala com essa pessoa?"
- **Lista de VIPs**. Obrigatória. Por que preciso: VIPs recebem uma mensagem 1:1 durante incidentes, não um email em massa. Se estiver faltando, eu pergunto: "Quais 3 a 5 clientes devem sempre receber uma nota pessoal sua quando houver um incidente?"
- **Página de status / canal público de comunicação**. Opcional. Por que preciso: o passo dos "primeiros 15 minutos" a muda para "investigando". Se você não tiver, eu sigo em frente com TBD.
- **Voz de comunicação com clientes**. Opcional. Por que preciso: os modelos de incidente soam mais verdadeiros no seu tom. Se você não tiver, eu sigo em frente com TBD e recomendo rodar a calibração de voz.

## Passos

1. **Ler `context/support-context.md`.** Puxo os níveis atuais de tempo de resposta, a lista de VIPs e os contatos de escalonamento. Faltando? Rode `set-up-my-support-info` primeiro.

2. **Fazer duas perguntas direcionadas**, não mais que isso:
   - **O que conta como {type} para este produto?** (definição de P1, queda = o quê, incidente de segurança = o quê). Dê 2 a 3 exemplos de frases de tickets.
   - **Quem precisa ser envolvido?** Plantonista da engenharia, VIPs nomeados, contato de jurídico/compliance, operador da página de status, seguradora (para incidentes de dados).

3. **Sintetizar o runbook**, em markdown, ~300 a 500 palavras, estruturado por linha do tempo:

   ```markdown
   # {Playbook Title}

   **Gatilho:** {what qualifies}
   **Severidade:** P{N}
   **Responsável principal:** {role}

   ## Primeiros 15 minutos, detectar e conter

   1. Confirme o recebimento em {internal-channel}, cole a
      mensagem do cliente palavra por palavra.
   2. Acione {on-call contact} via Composio.
   3. Confirme o escopo, quantos clientes, qual superfície.
   4. Página de status: mude para "Investigando" com uma linha de
      reconhecimento.

   ## Primeiros 60 minutos, comunicação com clientes

   1. Envie o modelo "já sabemos, estamos cuidando disso" aos
      clientes afetados (modelo abaixo).
   2. VIPs (veja `context/support-context.md#segments`) recebem um Slack/DM
      1:1 seu, não um email em massa.
   3. Atualize a página de status na marca dos 30 minutos com o progresso.

   ### Modelo de comunicação com clientes, "já sabemos, estamos cuidando disso"

   > Assunto: {Issue}, estamos cuidando disso
   > Oi {name},
   > {one-line description of what's broken}. Detectamos isso às
   > {time} e estamos investigando ativamente. Vou te atualizar de novo
   > dentro de {window}. Você não precisa fazer nada do seu lado.

   ## Mesmo dia, esboço da causa raiz

   1. A engenharia publica um resumo da causa raiz em 5 tópicos em {internal-channel}.
   2. O suporte redige o texto de causa raiz voltado ao cliente (veja o modelo abaixo).
   3. VIPs recebem uma nota direta com o texto de causa raiz antes de ele ir a público.

   ### Modelo de texto de causa raiz voltado ao cliente

   > Assunto: {Issue}, o que aconteceu e o que estamos fazendo
   > {Two paragraphs: what broke, what we did, what's changing so
   > it doesn't happen again. Plain, no jargon.}

   ## Acompanhamento em até 48 horas, post-mortem

   1. Documento interno de post-mortem (sem apontar culpados). Responsável:
      {engineering lead}.
   2. Artigo de problema conhecido publicado via `write-an-article type=known-issue`.
   3. Todo cliente que passou pelo problema recebe um acompanhamento pessoal.

   ## O que nunca fazemos

   - Culpar uma pessoa específica na comunicação com clientes.
   - Prometer uma data de correção que não podemos cumprir.
   - Deixar a página de status em silêncio por mais de 30 min durante um
     incidente aberto.
   ```

4. **Preencher as seções do modelo**, usando os nomes reais dos VIPs, o nome do canal interno e a ferramenta de rastreamento (de `context/support-context.md`). Pré-preencho os modelos de comunicação com clientes com a sua voz (de `context/support-context.md#voice`).

5. **Escrever em `playbooks/{slug}.md`** de forma atômica (`.tmp` → renomear). Slug = kebab-case (por exemplo `p1-outage.md`, `security-incident.md`, `data-loss.md`).

6. **Anexar em `outputs.json`** com `type: "escalation-playbook"`, `domain: "quality"`, título = nome do playbook, resumo = 2 frases sobre gatilho + responsável principal, caminho `playbooks/{slug}.md`, status `draft`.

7. **Resumir para você.** Um parágrafo: o que está no playbook, quais seções ainda precisam do seu julgamento ("nomear o contato de plantão da engenharia", "escolher o canal interno"), e o lembrete: "Edite uma vez. Todo incidente depois deste roda pelo mesmo documento."

## Saídas

- `playbooks/{slug}.md`
- Anexa em `outputs.json` com `type: "escalation-playbook"`, `domain: "quality"`.

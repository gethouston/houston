---
name: redigir-uma-resposta
title: "Redigir uma resposta"
description: "Me diga qual conversa e eu escrevo sua resposta. Eu busco o histórico do cliente, leio suas mensagens anteriores para acertar sua voz, e redijo algo que realmente responda ao que foi perguntado, seja um bug, um passo a passo ou uma questão de cobrança. Eu nunca envio e nunca prometo uma data que você não tenha aprovado."
version: 1
category: Suporte
featured: yes
image: headphone
integrations: [gmail, outlook]
---


# Redigir uma resposta

## Quando usar

- Você diz "redija uma resposta para {conversation id}" ou "redija minha resposta."
- `check-my-inbox` destacou a conversa no resumo da manhã e você clicou nela.
- Uma conversa triada está com status `open` / `waiting_founder` e ainda sem `draft.md`.
- **Nunca** é chamada para enviar. Esta skill só redige.

## Conexões de que eu preciso

Eu executo trabalho externo através do Composio. Antes de esta skill rodar, eu verifico se as categorias abaixo estão conectadas. Se alguma estiver faltando → eu digo o nome da categoria, peço para você conectá-la na aba Integrações e paro.

- **Caixa de entrada** (Gmail / Outlook), para puxar a conversa ao vivo e amostrar suas respostas enviadas para captar o tom. Obrigatória.
- **CRM** (HubSpot / Attio / Salesforce), para puxar plano, responsável e registro da conta para o dossiê que eu leio antes de redigir. Opcional se `customers.json` já estiver preenchido.
- **Cobrança** (Stripe), para puxar a receita mensal em respostas com teor de cobrança. Opcional.

Se sua caixa de entrada não estiver conectada, eu paro e peço para você conectar o Gmail ou o Outlook primeiro.

## Informações de que eu preciso

Eu leio seu contexto de suporte primeiro. Para cada campo obrigatório que estiver faltando, eu faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Documento de contexto de suporte**. Obrigatório. Por que preciso: superfície do produto, regras de roteamento, níveis de tempo de resposta e frases proibidas vivem todos lá. Se estiver faltando, eu pergunto: "Quer que eu te guie primeiro na configuração do seu contexto de suporte? É uma entrevista rápida."
- **Amostras de voz**. Obrigatórias. Por que preciso: rascunhos na voz errada acabam reescritos de qualquer jeito. Se estiverem faltando, eu pergunto: "Quer que eu puxe de 10 a 20 das suas respostas recentes para aprender seu tom, ou você pode colar 3 a 5 exemplos?"
- **A própria conversa**. Obrigatória. Por que preciso: eu redijo com base na mensagem real do cliente, não em uma paráfrase. Se estiver faltando, eu pergunto: "Para qual conversa devo redigir? Compartilhe o nome do cliente ou o email mais recente."

## Passos

1. **Ler `context/support-context.md`.** Se estiver faltando ou vazio, paro e digo para você rodar `set-up-my-support-info` primeiro.
2. **Carregar a conversa** de `conversations/{id}/thread.json`. Identifico a mensagem mais recente do cliente, o rascunho responde a ela.
3. **Encadear `look-up-a-customer view=dossier`** para o cliente da conversa. Puxo: plano, receita mensal, candidatos a bug em aberto, acompanhamentos em aberto (de `followups.json`), qualquer entrada em `churn-flags.json`, e as últimas 3 conversas do histórico.
4. **Amostrar a voz.** Leio `config/voice.md`. Se estiver faltando ou sampleCount < 5, rodo `calibrate-my-voice` primeiro. Espelho as pistas de tom: saudação, despedida, comprimento das frases, se você usa o primeiro nome do cliente. Nada de "Peço desculpas pelo inconveniente." Nada de rodeios corporativos.
5. **Redigir a resposta.** Adequo ao pedido:
   - **Bug**: reconheço, confirmo a reprodução se possível, declaro o próximo passo. Nunca prometo uma data de correção que você não tenha aprovado, digo "vou te retornar com um prazo."
   - **Como fazer**: respondo de forma direta, com link para o artigo da KB se existir um em `articles/{slug}.md` (verifico antes de linkar).
   - **Cobrança**: declaro os fatos, proponho uma ação (reembolso / crédito / mudança de plano). Escalo para você antes de assumir qualquer compromisso.
   - **Linguagem de churn**: resposta enxuta, honesta, sem culpa. Ofereço uma opção genuína; nunca prometo o que não for política em `context/support-context.md`.
6. **Anexar o trecho do dossiê** em `conversations/{id}/notes.md` (plano, receita mensal, bugs em aberto, status de churn) para que você tenha contexto na hora de aprovar.
7. **Escrever `conversations/{id}/draft.md`** de forma atômica. Atualizo a entrada em `conversations.json`: status = `waiting_founder`, renovo `updatedAt`.
8. **Anexar em `outputs.json`** com `type: "reply-draft"`, `domain: "inbox"`, título = "Resposta para {customer} sobre {subject}", resumo = a linha de abertura, caminho.
9. **Encadear `track-my-promises`.** Se o rascunho contiver um compromisso ("vou checar com a engenharia até sexta", "vou lançar semana que vem"), rodo `track-my-promises` para que a data de vencimento caia em `followups.json`.

## Saídas

- `conversations/{id}/draft.md`
- `conversations/{id}/notes.md` (anexa o trecho do dossiê)
- Atualização da entrada em `conversations.json`
- Anexa em `outputs.json` com `type: "reply-draft"`, `domain: "inbox"`.

## O que eu nunca faço

- Enviar a resposta. Você envia toda mensagem que sai.
- Prometer data / reembolso / exceção que não esteja em `context/support-context.md`.
- Inventar histórico do cliente se o dossiê estiver fraco. Marco como UNKNOWN e pergunto.

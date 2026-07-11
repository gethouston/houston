---
name: me-atualizar-sobre-uma-conversa
title: "Me atualizar sobre uma conversa"
description: "Aponte para uma conversa com um cliente e eu te dou a versão resumida: como estão as coisas, o que você prometeu, e o que o cliente está esperando. Três tópicos em vez de reler uma conversa de 20 mensagens. Especialmente útil antes de você redigir uma resposta para algo que ficou parado."
version: 1
category: Suporte
featured: no
image: headphone
integrations: [gmail, outlook]
---


# Me Atualizar Sobre uma Conversa

## Quando usar
`conversations/{id}/thread.json` tem mais do que um punhado de mensagens e você precisa de contexto rápido. Gatilhos típicos:
- Você: "qual é a história da conversa com a Acme?"
- Reabrir uma conversa parada há mais de 3 dias.
- Antes de `draft-a-reply` em uma conversa com 5+ mensagens: rode isto primeiro, o rascunho sai melhor.

## Conexões de que preciso

Eu executo trabalho externo via Composio. Antes de esta skill rodar, verifico se as categorias abaixo estão conectadas. Faltando alguma, eu nomeio a categoria, peço para você conectá-la na aba de Integrações, e paro.

- **Caixa de entrada** (Gmail / Outlook), para puxar a conversa ao vivo se ela ainda não estiver em `conversations.json`. Opcional.
- **Helpdesk de suporte** (Intercom / Zendesk / Help Scout), fonte alternativa de conversas. Opcional.

Eu sigo em frente com o índice local de conversas se nenhuma das duas estiver conectada, mas aviso que o resumo pode estar sem a resposta mais recente.

## Informações de que preciso

Eu leio seu contexto de suporte primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e aguardo.

- **Qual conversa**, obrigatória. Por que preciso: eu resumo uma conversa específica, não "o suporte em geral". Se estiver faltando, pergunto: "Qual conversa devo resumir? Compartilhe o nome do cliente ou o assunto mais recente."
- **Público do resumo**, opcional. Por que preciso: um resumo de 3 tópicos para você é diferente de uma passagem de bastão para um colega. Se você não tiver, eu sigo com TBD e escrevo para os seus olhos.

## Passos
1. **Carregar** `conversations/{id}/thread.json` e a linha do índice em `conversations.json`.
2. **Percorrer a conversa em ordem cronológica.** Anotar: o pedido original do cliente, mudanças de escopo, cada promessa feita, cada resposta dada.
3. **Produzir exatamente três tópicos:**
   - **Onde estamos**: última mensagem, remetente, estado atual (esperando o cliente / esperando a gente / rascunhando).
   - **O que prometemos**: compromissos pendentes. Puxar de `followups.json` filtrado pela conversa, mais promessas não capturadas na conversa (recomendar `track-my-promises` se encontrar alguma).
   - **O que o cliente espera a seguir**: o pedido explícito ou implícito mais recente.
4. **Acrescentar o resumo** como um bloco datado em `conversations/{id}/notes.md`, persistido para a próxima vez.

## Saídas
- Retorna o resumo de 3 tópicos no chat
- Acrescenta um bloco de resumo datado em `conversations/{id}/notes.md`

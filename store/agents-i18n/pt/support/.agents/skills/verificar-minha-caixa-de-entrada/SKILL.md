---
name: verificar-minha-caixa-de-entrada
title: "Verificar minha caixa de entrada"
description: "Tenha uma visão rápida da sua caixa de suporte. Escolha o que você precisa: um resumo matinal que classifica os 5 a 10 tickets que realmente precisam de você hoje, uma checagem de atrasados que sinaliza tudo que está prestes a estourar o prazo de resposta ou que já está atrasado, ou uma varredura de conversas paradas que pega aquelas que você deixou de lado. Eu analiso, classifico e digo por onde começar."
version: 1
category: Suporte
featured: no
image: headphone
integrations: [gmail, outlook]
---


# Verificar Minha Caixa de Entrada

Uma skill para todo pedido de "o que eu preciso olhar agora?". Ramifica por `scope`.

## Quando usar

- **morning-brief**: "resumo matinal" / "o que tem no meu prato?" / "por onde eu começo?"
- **overdue**: "o que está atrasado?" / "o que está prestes a estourar o prazo de resposta?" / chamado automaticamente dentro de `morning-brief`.
- **stale-threads**: "o que está esperando por mim?" / "algo parado?", conversas há mais de 48h no meio da resolução, com a bola do seu lado.

## Conexões de que preciso

Eu executo trabalho externo via Composio. Antes de esta skill rodar, verifico se as categorias abaixo estão conectadas. Faltando alguma, eu nomeio a categoria, peço para você conectá-la na aba de Integrações, e paro.

- **Caixa de entrada** (Gmail / Outlook), para varrer a caixa ao vivo em busca de itens novos, não só `conversations.json`. Obrigatória.
- **Helpdesk de suporte** (Intercom / Zendesk / Help Scout), alternativa à Caixa de entrada se as mensagens de clientes caem lá. Obrigatória se você não usa Gmail / Outlook para suporte.

Se nem a caixa de entrada nem o helpdesk estiverem conectados, eu paro e peço para você conectar o que você realmente usa.

## Informações de que preciso

Eu leio seu contexto de suporte primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e aguardo.

- **Prazos de resposta**, obrigatório. Por que preciso: os limites de "atrasado" vêm dos seus números, não dos meus. Se estiver faltando, pergunto: "Qual tempo de resposta você quer atingir para tickets urgentes, e o que é aceitável para o resto?"
- **Lista de VIPs**, obrigatória. Por que preciso: VIPs sempre ficam acima de não-VIPs no resumo matinal. Se estiver faltando, pergunto: "Quais 3 a 5 clientes devem sempre subir para o topo da fila?"
- **Canais conectados**, obrigatório. Por que preciso: eu preciso saber quais caixas contam como "suporte" para não varrer seu e-mail pessoal. Se estiver faltando, pergunto: "Qual caixa de entrada ou helpdesk guarda as conversas com seus clientes?"

## Parâmetro: `scope`

- `morning-brief`: os 5 a 10 itens do topo, ranqueados por (VIP × risco de estourar prazo de resposta × desbloquear a engenharia). Cada item: manchete de 1 linha + próxima ação. Escreve em `briefings/{YYYY-MM-DD}.md`.
- `overdue`: conversas abertas a menos de 2h de estourar o prazo de resposta OU já atrasadas, com o nível do cliente, tempo restante, próxima ação exata. Escreve em `overdue-reports/{YYYY-MM-DD}.md`.
- `stale-threads`: conversas quietas há mais de 48h em que fui o último a responder, agrupadas em "o cliente respondeu e eu não vi" vs "eu devo algo a ele". Escreve em `stale-rescues/{YYYY-MM-DD}.md`.

## Passos

1. **Ler `context/support-context.md`.** Se estiver faltando, parar. Me avisar para rodar `set-up-my-support-info` primeiro.
2. **Ler o ledger.** Preencher lacunas.
3. **Ler `conversations.json`** para todos os itens abertos / aguardando.
4. **Ramificar por `scope`:**
   - `morning-brief`: calcular o rank por conversa = tier_weight × response_time_risk × content_urgency. Limitar a 10 itens. Para cada um, adicionar a próxima ação em uma linha ("redigir a resposta," "escalar para a engenharia," "fechar, nada a fazer"). Incluir resumo de uma linha dos itens de `followups.json` que vencem hoje.
   - `overdue`: filtrar `conversations.json` para itens abertos em que `firstResponseAt` ou `lastActivityAt` mais a janela do prazo de resposta está a menos de 2h de agora. Para cada um, listar: cliente, nível, tempo restante, próxima ação.
   - `stale-threads`: filtrar conversas quietas há mais de 48h. Agrupar em "vez deles" vs "minha vez", só "minha vez" é acionável. Para cada uma, sugerir: rascunho de lembrete (encadear `draft-a-reply`) ou fechar com explicação de uma linha.
5. **Escrever o artefato** de forma atômica. Acrescentar em `outputs.json` com `type` = `morning-brief` | `overdue-report` | `stale-rescue`, `domain: "inbox"`.
6. **Resumir para mim**: as 2 ou 3 coisas que realmente precisam de mim hoje.

## Saídas

- `briefings/{YYYY-MM-DD}.md` (para `scope = morning-brief`)
- `overdue-reports/{YYYY-MM-DD}.md` (para `scope = overdue`)
- `stale-rescues/{YYYY-MM-DD}.md` (para `scope = stale-threads`)
- Acrescenta em `outputs.json` com `domain: "inbox"`.

## O que eu nunca faço

- Inflar o ranking para encher o resumo. Dia calmo, eu digo isso em uma linha.
- Usar limites de prazo de resposta fixos no código. Sempre leio de `context/support-context.md#response-times` ou do ledger.

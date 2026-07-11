---
name: sinalizar-um-alerta
title: "Sinalizar um alerta"
description: "Eu percebo algo em um ticket que é maior que o próprio ticket e registro isso do jeito certo. Um relato de bug é documentado com passos de reprodução e severidade, para que a engenharia possa agir. Um pedido de funcionalidade é atribuído ao cliente que pediu. E se eu vir a mesma pergunta aparecer três vezes ou mais sem um artigo de ajuda, sinalizo a lacuna na documentação e me ofereço para escrever um."
version: 1
category: Suporte
featured: no
image: headphone
integrations: [gmail, github, linear, jira]
---


# Sinalizar um Alerta

Uma skill para todo pedido do tipo "essa conversa contém um sinal que precisa ser registrado". Ramifica em `signal`.

## Quando usar

- **bug**  -  "isso é um bug? registre" / a mensagem contém mensagens de erro, stack traces, "funcionava antes, agora não funciona mais", passos de reprodução, ou capturas de tela de UI quebrada.
- **feature-request**  -  a conversa ou DM contém um pedido de funcionalidade ("vocês conseguem adicionar X?", "seria ótimo se tivesse Y").
- **repeat-question**  -  em cron semanal, ou ao escanear os últimos 30 a 60 dias e encontrar um agrupamento de perguntas recebidas semanticamente semelhantes que chegue a ≥3 sem um artigo correspondente.

## Conexões que eu preciso

Eu executo trabalho externo através do Composio. Antes desta skill rodar, verifico se as categorias abaixo estão conectadas. Se faltar alguma, eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Rastreador de desenvolvimento** (GitHub / Linear / Jira)  -  rascunha um issue para candidatos a bug confirmados. Obrigatório para `bug` se você quiser que eu encadeie com o seu rastreador.
- **Caixa de entrada** (Gmail)  -  fonte das conversas para agrupar perguntas repetidas. Opcional se `conversations.json` já cobrir o período.

Se você quiser que eu registre candidatos a bug em um rastreador, eu paro e pergunto qual você realmente usa para conectar.

## Informações que eu preciso

Eu leio primeiro o seu contexto de suporte. Para todo campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: aplicativo conectado > envio de arquivo > URL > colar) e aguardo.

- **Superfície do produto**  -  Obrigatório. Por que eu preciso: me diz o que está dentro do escopo (bug real) versus fora do escopo (terceiros). Se faltar, eu pergunto: "O que o seu produto realmente cobre? Compartilhe uma visão geral rápida ou me indique o seu site."
- **Regras de classificação de bug versus funcionalidade**  -  Obrigatório. Por que eu preciso: a linha entre "quebrado" e "faltando" determina para onde o alerta vai. Se faltar, eu pergunto: "Quando um cliente relata que algo não funciona, o que faz isso ser um bug para você em vez de um pedido de funcionalidade?"
- **Plataforma da central de ajuda**  -  Obrigatório para `repeat-question`. Por que eu preciso: verifico a cobertura existente da base de conhecimento antes de sinalizar um agrupamento como lacuna de documentação. Se faltar, eu pergunto: "Onde os seus artigos de ajuda vivem hoje? Notion, Intercom, um site de documentação, ou em lugar nenhum ainda?"

## Parâmetro: `signal`

- `bug`  -  extrai passos de reprodução, versão afetada, cliente afetado. Atribui a severidade conforme `context/support-context.md#severity`. Adiciona a `bug-candidates.json`. Oferece encadear com o rastreador conectado (GitHub / Linear / Jira via Composio).
- `feature-request`  -  extrai o pedido e o slug do cliente solicitante. Adiciona ou mescla em `requests.json`. Se mesclar, incrementa a contagem de solicitantes; se for VIP, sinaliza.
- `repeat-question`  -  escaneia os últimos 30 a 60 dias de `conversations.json`. Agrupa perguntas recebidas semanticamente semelhantes. Para cada agrupamento ≥3 sem artigo correspondente, adiciona a `patterns.json` e destaca como lacuna de documentação.

## Passos

1. **Ler `context/support-context.md`.** Se estiver faltando, paro.
2. **Ler o registro.** Preencher as lacunas.
3. **Ramificar em `signal`:**
   - `bug`: ler a fonte `conversations/{id}/thread.json`. Extrair reprodução (passos numerados), versão afetada, mensagem de erro / stack trace. Atribuir severidade. Escrever uma nova entrada em `bug-candidates.json` (ler-mesclar-escrever) com `{id, title, severity, affectedCustomers, reproSteps, sourceConversationId, status: "new"}`. Se solicitado, encadear com o rastreador conectado chamando a ferramenta de criação de issue dele.
   - `feature-request`: ler a mensagem de origem. Extrair o pedido em uma única frase. Procurar quase-duplicatas em `requests.json`; se encontrar, adicionar o slug do cliente e incrementar. Se for novo, criar entrada. Nunca atribuir um pedido a um cliente que não o fez.
   - `repeat-question`: ler `conversations.json` dos últimos 30 a 60 dias. Agrupar por tópico / semelhança de primeira linha. Para cada agrupamento ≥3, verificar `articles/` em busca de resposta existente. Se não houver, adicionar novo padrão a `patterns.json` com `{cluster, exampleIds, count, suggestedTitle}`. Oferecer encadear `write-an-article type=from-ticket` para o principal candidato.
4. **Adicionar a `outputs.json`** com `type` = `bug-candidate` | `feature-request` | `repeat-question`, `domain: "inbox"` (bug / feature-request) ou `domain: "help-center"` (repeat-question), título, resumo, caminho.
5. **Resumir para você**: o que foi registrado, onde, e o próximo encadeamento recomendado.

## Saídas

- entrada em `bug-candidates.json` (para `signal = bug`)
- entrada em `requests.json` (para `signal = feature-request`)
- entrada em `patterns.json` (para `signal = repeat-question`)
- Adições a `outputs.json`.

## O que eu nunca faço

- Registrar um bug no rastreador conectado sem a sua aprovação. Rascunho o issue; você cria.
- Atribuir um pedido de funcionalidade a um cliente que não pediu.
- Sinalizar um agrupamento de pergunta repetida que já tem artigo, sempre verifico `articles/` primeiro.

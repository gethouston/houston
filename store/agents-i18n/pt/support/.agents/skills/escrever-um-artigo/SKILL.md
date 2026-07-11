---
name: escrever-um-artigo
title: "Escrever um artigo"
description: "Eu transformo um ticket resolvido em um artigo da central de ajuda, redijo uma página de status para um problema conhecido quando algo quebra, envio notas personalizadas de 'você pediu, a gente lançou' para os clientes que pediram uma funcionalidade, ou sinalizo artigos desatualizados que precisam de uma revisão depois de uma mudança no produto. Escolha o tipo e receba um rascunho pronto para publicar, baseado em conversas reais e na sua voz."
version: 1
category: Suporte
featured: no
image: headphone
integrations: [googledocs, notion, github, linear]
---


# Escrever um artigo

Uma skill para todo pedido de escrita da central de ajuda. Ramifica por `type`.

## Quando usar

- **from-ticket**: "transforma este ticket em artigo" / "documenta esta
  resolução" / "respondi a mesma pergunta 3 vezes, escreve isso." Chamada
  implicitamente por `flag-a-signal signal=repeat-question` quando o cluster
  chega a ≥3 e não há artigo correspondente.
- **known-issue**: "redige um doc de problema conhecido para {bug}" / "é P1, sobe
  uma página de status" / encadeada a partir de `draft-a-playbook`.
- **broadcast-shipped**: "lançamos X, avisa os clientes que pediram" /
  "envia a nota de 'você pediu, a gente lançou'."
- **refresh-stale**: "atualiza os artigos afetados por este lançamento" /
  "audita os docs, o preço mudou" / rotina mensal da central de ajuda.

## Conexões que eu preciso

Eu executo trabalho externo através do Composio. Antes de rodar esta skill, verifico se as categorias abaixo estão conectadas. Se faltar alguma, eu digo qual é a categoria, peço para você conectá-la na aba de Integrações, e paro.

- **Base de conhecimento** (Notion / Google Docs / Help Scout / Intercom), para espelhar o rascunho na sua KB publicada. Obrigatória para `from-ticket` e `refresh-stale` se você quiser que eu envie o rascunho para lá.
- **Rastreador de desenvolvimento** (GitHub / Linear), para buscar o contexto do bug para o doc de `known-issue`. Obrigatório para `known-issue`.
- **Caixa de entrada** (Gmail), para buscar a conversa resolvida quando ela ainda não está em `conversations.json`. Opcional.

Se você pedir uma página de problema conhecido e o seu rastreador não estiver conectado, eu paro e peço para você conectá-lo.

## Informações que eu preciso

Eu leio o seu contexto de suporte primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor forma: app conectado > envio de arquivo > URL > colar) e aguardo.

- **Plataforma da central de ajuda**. Obrigatório. Por que preciso: formato e tom variam conforme o destino. Se faltar, pergunto: "Onde vivem seus artigos de ajuda hoje, Notion, Intercom, um site de docs, ou em lugar nenhum ainda?"
- **Amostras de voz**. Obrigatório. Por que preciso: artigos de KB na voz errada acabam reescritos. Se faltar, pergunto: "Quer que eu analise sua pasta de enviados para captar o tom, ou você pode me passar 3 a 5 dos seus emails recentes para clientes?"
- **Perfil de tom da KB**. Opcional. Por que preciso: algumas equipes querem a KB mais formal que as respostas de chat. Se você não tiver, eu sigo em frente com TBD e uso a voz das suas respostas.
- **O que foi lançado**. Obrigatório para `broadcast-shipped`. Por que preciso: não vou anunciar um vago "lançamos umas coisas." Se faltar, pergunto: "O que você lançou, me dê um título e uma frase sobre o que há de novo?"
- **O que mudou**. Obrigatório para `refresh-stale`. Por que preciso: varro os artigos em busca de referências ao que mudou. Se faltar, pergunto: "O que mudou, preço, nome de funcionalidade, um fluxo da interface, outra coisa?"

## Parâmetro: `type`

- `from-ticket`: artigo baseado em uma conversa resolvida. Busco a
  conversa, extraio a resposta reutilizável, escrevo em `articles/{slug}.md`.
  Espelho na plataforma de KB conectada, se houver.
- `known-issue`: entrada de status voltada ao cliente. Escrevo em
  `known-issues/{slug}.md` + adiciono ao `known-issues.json` com
  `{id, title, affectedProduct, currentStatus, postedAt, updatedAt}`.
- `broadcast-shipped`: rascunhos personalizados de "você pediu, a gente
  lançou", um por cliente em `requests.json` que pediu exatamente o que
  acabou de ser lançado. Escrevo em `broadcasts/{YYYY-MM-DD}-{slug}.md`.
- `refresh-stale`: varro `articles/` em busca de referências agora erradas
  (preço, interface, nome de funcionalidade), marco `needsReview: true` em
  `outputs.json`, redijo a atualização.

## Passos

1. **Ler `context/support-context.md`.** Não existe? Paro.
2. **Ler o registro de contexto.** Preencho as lacunas.
3. **Ramificar por `type`:**
   - `from-ticket`: pergunto qual `{conversation id}` usar como fonte, ou
     escolho automaticamente do cluster apontado por `flag-a-signal
     signal=repeat-question`. Leio
     `conversations/{id}/thread.json`. Extraio pergunta, resposta,
     capturas de tela, referências de código. Redijo no tom definido em
     `domains.help-center.toneProfile`.
   - `known-issue`: pergunto o id do bug + título, se não informados. Leio
     `bug-candidates.json` para os detalhes. Redijo o doc de status: o que
     quebrou, quem é afetado, contorno, status atual, previsão (só
     se pré-aprovada). Adiciono ao `known-issues.json`.
   - `broadcast-shipped`: pergunto o que foi lançado (título + frase
     curta). Leio `requests.json`, filtro para os clientes que pediram
     exatamente isso. Redijo uma nota pessoal curta por cliente,
     referenciando o pedido específico. Nunca envio em massa, um arquivo por cliente em
     `broadcasts/`.
   - `refresh-stale`: pergunto o que mudou (preço / interface / nome de
     funcionalidade). Varro cada `articles/{slug}.md` via grep em busca de
     referências ao elemento alterado. Para cada ocorrência: escrevo um diff com a
     reescrita proposta, sem sobrescrever. Marco `needsReview: true` em `outputs.json`.
4. **Escrever o artefato** atomicamente.
5. **Adicionar ao `outputs.json`** com `type` =
   `kb-article` | `known-issue` | `broadcast` | `article-refresh`,
   `domain: "help-center"`, título, resumo, caminho, status `draft`.
6. **Resumir**: manchete + o que revisar + onde publicar.

## Saídas

- `articles/{slug}.md` (para `type = from-ticket`, `refresh-stale`)
- `known-issues/{slug}.md` + entrada em `known-issues.json` (para
  `type = known-issue`)
- `broadcasts/{YYYY-MM-DD}-{slug}.md` (para `type = broadcast-shipped`)
- Adiciona ao `outputs.json` com `domain: "help-center"`.

## O que eu nunca faço

- Publicar direto na KB conectada. Eu redijo; você publica.
- Inventar previsão para `known-issue`. A engenharia não se comprometeu? Escrevo
  "investigando."
- Usar modelo genérico para `broadcast-shipped`. Cada nota cita um
  pedido específico.

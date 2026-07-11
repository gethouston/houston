---
name: carregar-leads-no-airtable
title: "Carregar leads no Airtable"
description: "Crio uma nova tabela no Airtable com o esquema completo de acompanhamento de leads (campos do lead + campos de enriquecimento + status de prospecção) e carrego os registros em lote a partir de um arquivo de scraping. Uso 4 agentes em paralelo para carregar 4 vezes mais rápido, contornando o limite do Airtable de um registro por chamada. É a fase 2 dos dois pipelines, e também pode ser executada de forma independente se você tiver uma lista de leads em JSON."
version: 1
category: Prospecção
featured: no
image: card-index-dividers
integrations: [airtable]
---


# Carregador de Leads no Airtable

Crio uma tabela nova no Airtable para uma lista de leads, com todas as colunas que o resto do pipeline precisa já em vigor, e depois carrego cada registro em lote. Uso agentes em paralelo porque o Airtable impõe um limite de um registro por chamada de criação, carregar 500 registros de forma serial levaria de 8 a 10 minutos; 4 agentes em paralelo reduzem isso para 2 a 3 minutos.

## Quando usar

- "Carregue esses leads no Airtable: <caminho do arquivo>".
- "Crie uma nova tabela no Airtable para esse scraping".
- Fase 2 de qualquer um dos dois pipelines do LinkedIn (chamada pelo orquestrador).
- Você tem uma lista de leads em JSON de qualquer origem e quer colocá-los no Airtable com o esquema padrão do pipeline.

## Conexões de que preciso

- **Airtable** (banco de dados) - Obrigatória. Listo as bases, crio a tabela e carrego os registros pela API REST do Airtable via Composio.

Se o Airtable não estiver conectado, eu paro e peço para você conectá-lo na aba Integrações.

## Informações de que preciso

- **O arquivo de origem com os leads** - Obrigatório. Array JSON de objetos. No mínimo, cada linha precisa de `profileUrl` e `fullName`. Opcional: `headline`, `commentText`, `reactionCount`, `location`, `connectionsCount`, `experience`, `education`, `skills`. Se estiver faltando, eu pergunto: "Onde está a lista de leads? Me passe o caminho de um arquivo JSON ou cole o array."
- **A base do Airtable** - Obrigatória. Se você tiver só uma base, eu a uso. Se tiver várias, eu listo e pergunto qual delas. Se estiver faltando, eu pergunto: "Em qual base do Airtable devo criar a nova tabela?"
- **Um nome para a tabela** - Opcional. O padrão é `LinkedIn {sourceType} - {author} - {YYYY-MM-DD}`, onde `sourceType` é "Commenters" ou "Reactors". Substitua por chamada se você tiver uma convenção de nomes própria.

## O esquema da tabela

Crio a tabela com estes campos. Os tipos de campo seguem as convenções da API REST do Airtable.

**Identificação do lead (sempre preenchido no carregamento):**
- `Full Name` (singleLineText)
- `Profile URL` (url)
- `Headline` (singleLineText)
- `Source Type` (singleSelect: "comment", "reaction")
- `Source Post URL` (url)
- `Source Author` (singleLineText)
- `Scraped At` (dateTime)

**Extras da origem por comentário (preenchidos apenas em scrapings de comentários):**
- `Comment Text` (multilineText)
- `Reaction Count` (number)

**Extras da origem por reação (preenchidos apenas em scrapings de reações):**
- `Location` (singleLineText)
- `Connections Count` (number)
- `Reaction Type` (singleSelect: "LIKE", "CELEBRATE", "LOVE", "INSIGHTFUL", "FUNNY", "SUPPORT")
- `Top Role` (singleLineText), o mais recente `experience[0]`, formatado como "{cargo} at {empresa}"
- `Top School` (singleLineText), o mais recente `education[0].school`
- `Top Skills` (multipleSelects), as 5 primeiras de `skills`

**Enriquecimento (preenchido por `apollo-enrichment`):**
- `Email` (email)
- `Email Confidence` (singleSelect: "verified", "guessed", "no-match")
- `Company` (singleLineText)
- `Title` (singleLineText)
- `Apollo Contact URL` (url)
- `Enriched At` (dateTime)

**Status de prospecção (preenchido por `instantly-campaign`):**
- `Loaded To Campaign` (singleLineText), nome da campanha no Instantly
- `Loaded At` (dateTime)
- `Reply Status` (singleSelect: "no-reply", "interested", "not-now", "not-relevant", "unsubscribed", "bounced"), preenchido manualmente por você, não por mim

## Passos

1. **Listar as bases.** Chamar o "list bases" do Airtable via Composio. Se houver só uma, usá-la. Se houver várias e quem chamou não tiver indicado uma, perguntar ao usuário.

2. **Criar a tabela.** Fazer um POST de uma nova tabela na base escolhida com o esquema acima. O esquema varia um pouco conforme o tipo de origem: se toda linha do arquivo de origem tiver `commentText`, tratar como origem de comentário; se toda linha tiver `experience`, tratar como origem de reação; caso contrário, tratar como origem de comentário (esquema menor, opção mais segura). Salvar o novo `baseId` e `tableId` para a etapa de carregamento.

3. **Dividir em lotes.** Dividir a lista de origem em lotes de `ceil(N / 4)`. Quatro lotes de tamanho aproximadamente igual.

4. **Carregamento em paralelo.** Disparar 4 agentes em paralelo, um por lote. Cada agente percorre seu lote e chama o endpoint `create record` do Airtable por linha (o Airtable impõe um registro por chamada, não importa como a API documenta isso). Cada agente reporta sua contagem de sucessos e falhas ao terminar. Aguardar os 4.

5. **Verificar a contagem carregada.** Buscar novamente a contagem de linhas na nova tabela. Se `loaded != expected`, registrar a diferença em `runs/{runId}/notes.md` (os `profileUrl`s ausentes) para que você saiba quais linhas não entraram. Continuar, cargas parciais ainda são úteis, a diferença só precisa ficar visível.

6. **Escrever `airtable.md` na pasta da execução.** Caminho: `runs/{runId}/airtable.md`. Conteúdo: link para a nova tabela na interface do Airtable, ID da base, ID da tabela, contagem de linhas esperada vs. real, lista de quaisquer `profileUrl`s que falharam.

7. **Adicionar ao `outputs.json`.** Uma linha: `{type: "airtable-load", title: "{tableName}", summary: "{N} records loaded into Airtable. Base {baseId}.", path: "runs/{runId}/airtable.md", status: "ready", domain: "sources"}`.

8. **Resumir para o usuário.** Uma linha: "Carreguei {N} registros na tabela do Airtable '{tableName}'. Abra no Airtable: <url>."

## Resultados

- Nova tabela no Airtable na base escolhida, com o esquema completo do pipeline.
- `runs/{runId}/airtable.md`, link + IDs + diferença de carga (se houver).
- `outputs.json`, uma linha, `type: "airtable-load"`.

## Falhas comuns

| Falha | Por quê | Correção |
|---|---|---|
| Erro de limite de tokens em `list_records` | O Airtable limita a taxa do endpoint de leitura | Não liste os registros para verificar a contagem; use o campo `record_count` da tabela, ou pagine em lotes de 100 |
| Limite de lote excedido | Tentativa de criar 10 registros em uma única chamada | O Airtable impõe 1 registro por chamada de criação; o design de agentes em paralelo contorna isso sem mudar o formato por chamada |
| Incompatibilidade de tipo de campo na criação | A linha de origem tinha um valor para um singleSelect que não estava na lista de opções | Colete antecipadamente os valores únicos da origem e adicione todos como opções do singleSelect no momento da criação da tabela, antes do carregamento |
| Algumas linhas descartadas silenciosamente | O Airtable rejeitou por um erro de validação de campo | A etapa de verificação da contagem no passo 5 expõe a diferença; trate manualmente os `profileUrl`s ausentes |

## O que eu nunca faço

- **Fixar o ID da base do Airtable.** Sempre descoberto via Composio em tempo de execução.
- **Usar carregamento serial.** 500 registros de forma serial leva de 8 a 10 minutos; o design de 4 agentes em paralelo é o padrão.
- **Alterar uma tabela existente.** Cada execução do pipeline recebe uma tabela nova. Se você quiser mesclar em uma tabela existente, isso é uma skill diferente (não disponível no momento).
- **Mexer no campo `Reply Status`.** Esse campo é seu (ou de uma integração Instantly → Airtable que você configurou separadamente). Eu nunca escrevo nele.

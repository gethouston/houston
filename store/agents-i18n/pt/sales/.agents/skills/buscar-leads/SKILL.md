---
name: buscar-leads
title: "Buscar leads"
description: "Encontro leads novos em um segmento a partir da fonte que você escolher: parecidos com seus ganhos no CRM, uma thread de comentários no LinkedIn, um feed de rodadas de investimento recentes, uma busca no Google Maps, ou um subreddit. Faço uma pontuação rápida de cada um contra os desqualificadores duros do seu playbook e só mantenho os VERDE e AMARELO. Cada linha cita o sinal que fez ele aparecer."
version: 1
category: Vendas
featured: yes
image: handshake
integrations: [hubspot, salesforce, attio, linkedin, twitter, reddit, firecrawl]
---


# Buscar Leads

Trago leads novos no segmento.

## Quando usar

- "encontre {N} leads em {segmento}".
- "traga leads que eu possa abordar essa semana".
- "compile leads de {post do LinkedIn / subreddit / evento}".
- Agendado: rotina semanal de prospecção.

## Conexões que eu preciso

Eu executo trabalho externo pelo Composio. Antes desta skill rodar eu verifico se as categorias abaixo estão conectadas. Se faltar, eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **CRM** - expandir a partir de parecidos com suas contas ganhas. Obrigatório se você escolher essa fonte.
- **Redes sociais** - puxar comentaristas de um post ou thread do LinkedIn. Obrigatório se você escolher essa fonte.
- **Busca / pesquisa** - puxar sinais de rodadas de investimento ou contratações recentes. Obrigatório se você escolher essa fonte.
- **Raspagem de sites** - analisar uma página de resultados do Google Maps ou um subreddit. Obrigatório se você escolher essa fonte.

Se nenhuma das categorias de fonte estiver conectada eu paro e peço para você conectar pelo menos uma (o CRM é o melhor ponto de partida porque parecidos com contas ganhas convertem melhor).

## Informações que eu preciso

Eu leio seu contexto de vendas primeiro. Para cada campo obrigatório que estiver faltando eu faço UMA pergunta em linguagem simples (melhor formato: app conectado > arquivo > URL > texto colado) e espero.

- **Seu playbook de vendas** - Obrigatório. Por que eu preciso: preciso do seu perfil de cliente ideal e dos desqualificadores para pontuar os candidatos honestamente. Se estiver faltando eu pergunto: "Ainda não tenho seu playbook, quer que eu redija um agora?"
- **O segmento onde você quer leads** - Obrigatório. Por que eu preciso: "leads" é amplo demais para filtrar contra seu perfil de cliente ideal. Se estiver faltando eu pergunto: "De qual segmento eu devo puxar, indústria, tamanho da empresa, cargo, geografia?"
- **Quantos leads você quer** - Obrigatório. Por que eu preciso: limita a busca e o arquivo. Se estiver faltando eu pergunto: "Quantos leads você quer que eu traga, 10, 20, 50?"
- **De onde buscar** - Obrigatório. Por que eu preciso: cada fonte usa uma ferramenta conectada diferente. Se estiver faltando eu pergunto: "Devo expandir parecidos a partir do seu CRM, puxar comentaristas de um post do LinkedIn, escanear um feed de rodadas de investimento recentes, raspar uma área no Google Maps, ou trazer uma thread de um subreddit?"

## Passos

1. **Ler o registro + o playbook.** Reúno os campos obrigatórios que
   faltam (UMA pergunta cada, começando pelo melhor formato). Escrevo atomicamente.

2. **Escolher a fonte.** Com base no segmento + na intenção sua,
   pergunto qual fonte (a menos que já esteja nomeada):
   - **CRM conectado** - expandir a partir de parecidos com contas ganhas.
   - **Thread de comentários do LinkedIn** - cole a URL do post; compilo
     os comentaristas.
   - **Motor de busca / feed de investimentos** - sinais de rodadas de
     investimento ou contratações recentes no segmento.
   - **Google Maps** - segmentos de negócios locais.
   - **Subreddit / comunidade** - posts recentes de alto engajamento.

3. **Puxar candidatos.** Via `composio search <category>` para a fonte
   escolhida. Limito a cerca de 3x a quantidade pedida para filtrar depois.

4. **Pontuação rápida por candidato** - aplico os desqualificadores
   duros do playbook. Descarto VERMELHO. Para cada candidato sobrevivente, capturo:
   - Empresa + URL do LinkedIn / site.
   - Nome do contato principal + cargo + LinkedIn (se disponível).
   - Sinal que fez ele aparecer (post de contratação, Série B,
     comentou na thread X, avaliação de 4,8 estrelas, cito especificamente).
   - Encaixe rápido: VERDE / AMARELO (pulo VERMELHO, já descartado).

5. **Escrevo o arquivo do lote** em `leads/batches/{segment-slug}-{YYYY-
   MM-DD}.md` (atômico, `*.tmp` → renomear), consulta, fonte, data, lista de
   leads com os sinais citados.

6. **Adiciono ao `leads.json`.** Para cada candidato sobrevivente, adiciono
   uma linha nova com `status: "new"`, `source` (slug dessa
   busca), `fitScore` (VERDE/AMARELO). Sem duplicados, verifico
   linhas existentes por empresa + nome. Leio, mesclo e escrevo atomicamente.

7. **Adiciono ao `outputs.json`:**

   ```json
   {
     "id": "<uuid v4>",
     "type": "lead-batch",
     "title": "Leads - {segmento}",
     "summary": "<N leads trazidos de {fonte}. Principal sinal: {sinal}.>",
     "path": "leads/batches/{segment-slug}-{date}.md",
     "status": "ready",
     "createdAt": "<ISO>",
     "updatedAt": "<ISO>",
     "domain": "outbound"
   }
   ```

8. **Resumir para você.** Os top 3 leads direto no chat + o caminho
   completo do arquivo. Sugiro: "rodar `research-an-account depth=enrich-contact`
   no #1 agora?" ou "`score-my-pipeline subject=lead-fit` em lote para todos esses?".

## O que eu nunca faço

- Inventar leads, nomes, cargos, sinais. Todo lead se liga
  a uma resposta real de ferramenta ou observação de URL.
- Contatar alguém ou colocar leads no CRM sem sua aprovação.
- Fixar nomes de ferramentas no código, descoberta pelo Composio sempre em tempo real.

## Saídas

- `leads/batches/{segment-slug}-{YYYY-MM-DD}.md`
- Adiciona ao `leads.json` (só linhas novas).
- Adiciona ao `outputs.json` com `type: "lead-batch"`,
  `domain: "outbound"`.

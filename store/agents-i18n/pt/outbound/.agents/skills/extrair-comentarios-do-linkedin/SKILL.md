---
name: extrair-comentarios-do-linkedin
title: "Extrair comentários do LinkedIn"
description: "Extraio todas as pessoas que comentaram em uma publicação do LinkedIn usando o Apify. Obtenho nomes, títulos, URLs de perfil, o texto do comentário e o número de reações, removo duplicados pela URL do perfil, descarto perfis nulos, e salvo a lista em um arquivo por execução. É a fase 1 do pipeline de comentários para prospecção, mas também pode ser executada de forma independente se você só precisar da lista."
version: 1
category: Prospecção
featured: no
image: chains
integrations: [apify, linkedin]
---


# Extração de Comentários do LinkedIn

Extraio todo mundo que comentou em uma publicação do LinkedIn para uma lista limpa e sem duplicados. Fase 1 do pipeline de comentários para prospecção, mas você pode rodar de forma independente se só precisar da lista (ex.: como entrada para uma outra ferramenta mais adiante).

## Quando usar

- "Extraia os comentaristas dessa publicação do LinkedIn: <URL>".
- "Puxe uma lista de quem comentou nessa publicação".
- Você quer uma lista limpa e sem duplicados de comentaristas para qualquer uso, não necessariamente prospecção fria.

## Quando NÃO usar

- Você quer quem **reagiu** a uma publicação (não comentou), use a `linkedin-reaction-scraper`.
- Você quer o pipeline completo do início ao fim até o Instantly, use a `linkedin-comment-to-outreach`.

## Conexões de que preciso

- **Apify** (extração) - Obrigatório. Uso o ator `harvestapi/linkedin-post-comments`.

Se o Apify não estiver conectado, eu paro e peço para você conectar na aba Integrações.

## Informações de que preciso

- **A URL da publicação do LinkedIn** - Obrigatório. Se faltar, eu pergunto: "Qual publicação do LinkedIn eu devo extrair?"
- **Uma meta de quantidade de itens** - Opcional. O padrão é `defaultMaxItems` do seu contexto de prospecção (500). Pode ser sobrescrito por chamada se você só quiser um teste rápido.

## Passos

1. **Validar a URL.** Confirme que a URL é de uma publicação do LinkedIn (`linkedin.com/posts/...` ou `linkedin.com/feed/update/...`). Rejeite URLs de perfil, de artigo, de empresa. Se a entrada for um link curto ou um redirecionamento, siga uma vez para resolver a URL canônica da publicação antes de extrair.

2. **Extração de teste.** Primeira chamada ao ator com `maxItems: 20` para confirmar que a publicação está acessível e que o ator retorna o formato esperado. Se a extração de teste retornar 0 itens, pare e mostre o motivo (publicação apagada, comentários desativados, bloqueio geográfico, ator ainda "esquentando").

3. **Extração completa.** Chame o ator com `maxItems: {meta}` (padrão 500). Espere a execução terminar. O Apify geralmente leva de 2 a 5 minutos para a extração completa.

4. **Remover duplicados.** Agrupe os itens brutos por `profileUrl`. Para duplicados dentro de uma mesma extração (a mesma pessoa comentou várias vezes), mantenha a linha com o texto de `comment` mais longo. Descarte linhas onde `profileUrl` é nulo ou onde `fullName` é nulo, essas são falhas da extração, não leads de verdade.

5. **Salvar no arquivo.** Escreva em `runs/{runId}/scrape.json` se chamado por um orquestrador (o orquestrador passa o `runId`). Se chamado de forma independente, escreva em `runs/{YYYY-MM-DD}-{post-slug}/scrape.json`. Esquema por linha:

   ```jsonc
   {
     "profileUrl": "https://www.linkedin.com/in/janedoe",
     "fullName": "Jane Doe",
     "headline": "VP Operations at Northwind",
     "commentText": "Same pattern at every 200+ person company we look at.",
     "reactionCount": 14,
     "scrapedAt": "<ISO>"
   }
   ```

6. **Atualizar o `leads.json`.** Para cada linha sobrevivente, adicione ao `leads.json` se o `profileUrl` for novo. Linhas existentes permanecem, não sobrescreva o `email` / `company` / `title` delas já que podem ter sido definidos por uma execução de enriquecimento anterior. Defina `source: "linkedin-comment"`, `sourcePostUrl`, `sourceAuthor`, `scrapedAt`.

7. **Adicionar ao `outputs.json`.** Uma linha: `{type: "scrape", title: "LinkedIn commenters - {author} post", summary: "{N} unique commenters scraped, deduped by profile URL.", path: "runs/{runId}/scrape.json", status: "ready", domain: "sources"}`.

8. **Resumir para o usuário.** Uma linha: "Extraí {N} comentaristas únicos da publicação de {author}. Salvo na sua pasta de execuções."

## Resultados

- `runs/{runId}/scrape.json` - lista de comentaristas sem duplicados.
- `leads.json` - novos comentaristas adicionados (linhas existentes intocadas).
- `outputs.json` - uma linha, `type: "scrape"`, `domain: "sources"`.

## Falhas comuns

| Falha | Por quê | Correção |
|---|---|---|
| Só 20 resultados retornados na extração completa | Eu esqueci de aumentar o `maxItems` além do valor de teste | Rode de novo com `maxItems: 500` (ou o padrão do seu contexto) |
| O ator retorna 0 itens | Publicação apagada, comentários desativados, bloqueio geográfico | Confirme a URL em um navegador, depois tente outra publicação se a original sumiu |
| Todo `profileUrl` nulo | O LinkedIn serviu ao ator uma visão deslogada da publicação | Espere de 5 a 10 minutos (aquecimento do ator) e tente de novo |
| A mesma pessoa aparece 5 vezes na saída bruta | Ela comentou 5 vezes | O passo de remoção de duplicados mantém só o comentário mais longo por perfil |

## O que eu nunca faço

- **Fixar no código o ID do ator no Apify.** Eu busco isso via Composio em tempo de execução para que um ator diferente ou uma versão bifurcada funcione sem mudança de código.
- **Limitar a remoção de duplicados por `fullName`.** Pessoas diferentes compartilham nomes; `profileUrl` é a única chave segura.
- **Persistir o texto do comentário no `leads.json`.** Isso fica só no arquivo de extração da execução, não no índice de leads entre execuções. Mantém o índice pequeno e estável.

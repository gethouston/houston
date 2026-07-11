---
name: extrair-reacoes-do-linkedin
title: "Extrair reações do LinkedIn"
description: "Extraio todas as pessoas que reagiram a uma publicação do LinkedIn usando o Apify com profileScraperMode=main, para que cada linha volte com o perfil completo do LinkedIn: histórico de experiência, formação, habilidades, certificações, localização e número de conexões. Gera de 5 a 10 vezes mais leads do que a extração de comentários, com dados muito mais ricos por lead. É a fase 1 do pipeline de reações para prospecção, e também pode ser executada de forma independente."
version: 1
category: Prospecção
featured: no
image: link
integrations: [apify, linkedin]
---


# Extração de Reações do LinkedIn

Extraio todo mundo que reagiu a uma publicação do LinkedIn para uma lista limpa e sem duplicados, com um perfil completo do LinkedIn anexado a cada linha em uma única passada. Fase 1 do pipeline de reações para prospecção; também pode ser executada de forma independente se você só precisar da lista.

O grande ganho sobre a extração de comentários: `profileScraperMode: "main"` faz o ator retornar o histórico de experiência, formação, habilidades, certificações, localização e número de conexões da pessoa que reagiu diretamente. Não precisa de uma segunda passada de enriquecimento para dados de perfil (o enriquecimento do Apollo continua sendo necessário para e-mails verificados).

## Quando usar

- "Extraia quem reagiu a essa publicação do LinkedIn: <URL>".
- "Puxe uma lista de quem reagiu a essa publicação, com os perfis".
- Você quer uma lista limpa e sem duplicados de quem reagiu, com dados de perfil ricos, para qualquer uso.

## Quando NÃO usar

- Você quer **comentaristas** (menor volume, maior intenção por lead), use a `linkedin-comment-scraper`.
- Você quer o pipeline completo do início ao fim até o Instantly, use a `linkedin-reaction-to-outreach`.

## Conexões de que preciso

- **Apify** (extração) - Obrigatório. Uso o ator `harvestapi/linkedin-post-reactions` com `profileScraperMode: "main"`.

Se o Apify não estiver conectado, eu paro e peço para você conectar na aba Integrações.

## Informações de que preciso

- **A URL da publicação do LinkedIn** - Obrigatório.
- **Uma meta de quantidade de itens** - Opcional. O padrão é `defaultMaxItems` do seu contexto de prospecção (500). Extrações de reação costumam passar de 500 em uma publicação popular; aumente se você quiser cobertura total de uma publicação viral.

## Passos

1. **Validar a URL.** Mesmas regras da extração de comentários: precisa ser uma URL de publicação do LinkedIn. Rejeite URLs de perfil, artigo ou empresa. Resolva links curtos uma vez.

2. **Extração de teste.** Primeira chamada ao ator com `maxItems: 20` e `profileScraperMode: "main"`. Confirme que o formato inclui `experience`, `education`, `skills`, `connectionsCount`. Se estiverem faltando, o ator não recebeu a sinalização de modo correta, falhe com destaque para que você veja.

3. **Extração completa.** Chame o ator com `maxItems: {meta}` (padrão 500), `profileScraperMode: "main"`. A extração de reações com perfis completos demora mais que a de comentários, espere de 5 a 15 minutos para 500 itens.

4. **Remover duplicados.** Agrupe por `profileUrl`. Descarte linhas com `profileUrl` nulo ou `fullName` nulo (falhas da extração).

5. **Salvar no arquivo.** Escreva em `runs/{runId}/scrape.json` se chamado pelo orquestrador; caso contrário `runs/{YYYY-MM-DD}-{post-slug}-reactions/scrape.json`. Esquema por linha:

   ```jsonc
   {
     "profileUrl": "https://www.linkedin.com/in/janedoe",
     "fullName": "Jane Doe",
     "headline": "VP Operations at Northwind",
     "location": "San Francisco, CA",
     "connectionsCount": 2840,
     "reactionType": "LIKE | CELEBRATE | LOVE | INSIGHTFUL | FUNNY | SUPPORT",
     "experience": [
       { "company": "Northwind", "role": "VP Operations", "startDate": "2024-03", "endDate": null },
       { "company": "Helios", "role": "Director of Ops", "startDate": "2021-01", "endDate": "2024-02" }
     ],
     "education": [
       { "school": "Stanford", "degree": "MBA", "endDate": "2020-06" }
     ],
     "skills": ["Operations", "Process Design", "RevOps", "Salesforce"],
     "certifications": [],
     "scrapedAt": "<ISO>"
   }
   ```

6. **Atualizar o `leads.json`.** Adicione novos `profileUrl`s com `source: "linkedin-reaction"`, `sourcePostUrl`, `sourceAuthor`, `scrapedAt`. Linhas existentes permanecem (não sobrescreva o enriquecimento de execuções anteriores).

7. **Adicionar ao `outputs.json`.** Uma linha: `{type: "scrape", title: "LinkedIn reactors - {author} post", summary: "{N} unique reactors scraped with full profiles.", path: "runs/{runId}/scrape.json", status: "ready", domain: "sources"}`.

8. **Resumir para o usuário.** Uma linha: "Extraí {N} pessoas únicas que reagiram à publicação de {author} (com perfis completos). Salvo na sua pasta de execuções."

## Resultados

- `runs/{runId}/scrape.json` - lista de quem reagiu, sem duplicados, com perfis completos.
- `leads.json` - novas pessoas que reagiram adicionadas.
- `outputs.json` - uma linha, `type: "scrape"`, `domain: "sources"`.

## Falhas comuns

| Falha | Por quê | Correção |
|---|---|---|
| Só 20 resultados retornados na extração completa | Eu esqueci de aumentar o `maxItems` além do valor de teste | Rode de novo com `maxItems: 500` |
| `experience`, `education`, `skills` todos vazios | `profileScraperMode: "main"` não foi definido | Rode de novo com a sinalização definida; sem ela o ator retorna só campos superficiais |
| Execução demora mais de 30 minutos | A publicação tem 1000+ pessoas que reagiram | Aceite a espera ou divida por tipo de reação em várias execuções |
| Todo `profileUrl` nulo | O LinkedIn serviu ao ator uma visão deslogada | Espere de 5 a 10 minutos e tente de novo |

## O que eu nunca faço

- **Fixar no código o ID do ator no Apify.** Busca via Composio em tempo de execução.
- **Pular a sinalização `profileScraperMode: "main"`.** Sem ela, some o motivo inteiro de usar esse extrator em vez do de comentários.
- **Persistir `experience` / `education` / `skills` no `leads.json`.** Esses dados ficam só no arquivo de extração da execução, não no índice entre execuções. Dados de perfil envelhecem rápido; eu fixo eles na execução que os capturou.

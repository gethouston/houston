---
name: pesquisar-um-tema
title: "Pesquisar um tema"
description: "Te dou um briefing estruturado sobre qualquer tema que você precise entender antes de tomar uma decisão de marketing. Faço uma pesquisa profunda, cito cada fonte e entrego ângulos que valem a pena desenvolver. Alimenta rascunhos de blog, estratégias de anúncios e planos de conteúdo."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [firecrawl, perplexityai]
---


# Pesquisar Um Tema

Template de origem: Gumloop "AI Research Agent with Automated Report Generation". Adaptado para repasse a outros quatro agentes de marketing, não memorandos de investidor de 20 páginas.

## Quando usar

- "pesquisar {topic}" / "preciso de um briefing sobre {topic}" / "qual é o estado de {topic}".
- "resumir o que está acontecendo em {category}".
- Chamado implicitamente por outras skills (`plan-a-campaign`, `watch-my-competitors`, `profile-my-customer`) quando elas encontram uma lacuna de evidência que precisa de uma pesquisa dedicada.

## Conexões que preciso

Eu executo trabalho externo através do Composio. Antes desta skill rodar, verifico se as categorias abaixo estão conectadas. Se faltar, eu nomeio a categoria, peço para você conectar na aba Integrações e paro.

- **Busca na web (Exa ou Perplexity)** - o motor que encontra e classifica as fontes. Obrigatório, sem alternativa útil, eu preciso de um índice de busca para começar.
- **Raspagem de web (Firecrawl)** - opcional, busca o texto completo de forma limpa. Se não estiver conectado, eu recorro a uma busca HTTP básica em cada URL de fonte, mais rústica, mas o suficiente para puxar citações de páginas estáticas.

Se a busca na web não estiver conectada, eu paro. A alternativa de raspagem me mantém funcionando por conta própria.

## Informações que preciso

Eu leio primeiro o seu contexto de marketing. Para cada campo obrigatório que estiver faltando, eu faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > upload de arquivo > URL > colar) e espero.

- **Seu posicionamento** - Obrigatório. Por que preciso: um briefing que não filtra pelo seu cliente ideal e categoria é só pesquisa genérica da internet. Se estiver faltando, eu pergunto: "Quer que eu redija seu posicionamento primeiro? É uma skill, leva uns cinco minutos."
- **A pergunta de pesquisa** - Obrigatório. Por que preciso: escopo inflado torna os briefings inúteis. Se estiver faltando, eu pergunto: "Qual é a única pergunta que esse briefing deve responder, e qual decisão ele destrava?"
- **Profundidade** - Opcional, padrão standard. Se estiver faltando, eu pergunto: "Quão fundo devo ir, uma varredura de quinze minutos, um mergulho de uma hora, ou uma execução profunda? Se você não tiver preferência, eu sigo com a profundidade padrão."

## Passos

1. **Esclarecer o escopo em uma troca curta (pular se o pedido do usuário já for específico).** Perguntar:
   - Para que o briefing vai alimentar, post de blog, ângulos de anúncio, e-mail de lifecycle, calendário social, ou só para sua própria leitura?
   - Qual decisão precisa destravar?
   - Profundidade, varredura de 15 min, mergulho de 60 min, ou profunda?

2. **Ler o documento de posicionamento** (arquivo próprio): `context/marketing-context.md`. Fundamentar o briefing no nosso cliente ideal e categoria, pesquisa genérica da internet não é um briefing.

3. **Descobrir ferramentas de pesquisa em tempo de execução.** NÃO fixar nomes de ferramentas no código. Rodar `composio search research`, `composio search web-search`, `composio search web-scrape` e escolher o melhor slug conectado por etapa. Se a busca na web estiver faltando, parar e pedir ao usuário para conectar um provedor (aba Integrações). Se só a raspagem estiver faltando, continuar com busca HTTP básica e sinalizar que fontes pesadas em JS ficarão rasas.

4. **Rodar a pesquisa em camadas.** Registrar as fontes conforme avança, o briefing final precisa de citações:
   1. **Varredura do panorama** - players, terminologia da categoria, top 5-10 fontes de autoridade.
   2. **Aprofundamento nas evidências** - buscar as principais fontes, extrair afirmações, citações, dados. Citar URL + timestamp de busca por afirmação.
   3. **Checagem de contradições** - onde as fontes discordam? Nomear os dois lados; não misturar tudo numa média confusa.
   4. **Filtro de relevância** - quais achados importam para NOSSO cliente ideal / NOSSO posicionamento / a decisão em questão? Cortar o resto.

5. **Estruturar o briefing (markdown, ~500-900 palavras em profundidade padrão).**

   1. **A pergunta** - uma frase.
   2. **TL;DR** - 3-5 tópicos que o usuário pode agir hoje.
   3. **Principais achados** - numerados. Cada um: afirmação, evidência (citação), implicação para nós.
   4. **Onde as fontes discordam** - seção curta. Não esconder.
   5. **O que não sabemos** - lacunas explícitas. Marcar `UNKNOWN` + tipo de fonte que resolveria.
   6. **Próximos movimentos recomendados** - marcados por agente. Exemplo: `[seo-content] Buscar o cluster "{keyword}", 8 de 10 páginas mais bem rankeadas são rasas.`
   7. **Fontes** - URL + título + timestamp de busca.

6. **Nunca inventar.** Nenhuma afirmação sintetizada do tipo "parece provável que..." sem fonte citada. Se a pesquisa estiver rasa, dizer isso e parar, briefings ruins custam mais caro do que nenhum briefing.

7. **Escrever atomicamente** em `research/{topic-slug}.md`, `{path}.tmp` e depois renomear. `{topic-slug}` é o kebab-case do tema (por exemplo, `research/geo-audits-category.md`).

8. **Adicionar ao `outputs.json`.** Ler-mesclar-escrever atomicamente:

   ```json
   {
     "id": "<uuid v4>",
     "type": "research",
     "title": "<Tema>",
     "summary": "<2-3 frases - o TL;DR>",
     "path": "research/<slug>.md",
     "status": "draft",
     "createdAt": "<ISO-8601>",
     "updatedAt": "<ISO-8601>"
   }
   ```

9. **Resumir para o usuário.** Um parágrafo: pergunta, TL;DR em uma linha, 1 próximo movimento, caminho para o briefing.

## Resultados

- `research/{topic-slug}.md`
- Adiciona ao `outputs.json` com `type: "research"`.

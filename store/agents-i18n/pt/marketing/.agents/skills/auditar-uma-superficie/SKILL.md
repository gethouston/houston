---
name: auditar-uma-superficie
title: "Auditar uma superfície"
description: "Avalio uma superfície de marketing específica e te dou uma lista de correções priorizada. Escolha o que auditar: a saúde de SEO do seu site, sua visibilidade em buscadores com IA como ChatGPT e Perplexity, uma landing page avaliada em seis dimensões, ou um formulário que está perdendo conversões. Cada descoberta é classificada por impacto e facilidade."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [firecrawl, semrush, ahrefs, perplexityai]
---


# Auditar uma superfície

Quatro superfícies de auditoria possíveis. O parâmetro `surface` escolhe a sondagem;

## Parâmetro: `surface`

- `site-seo`  -  auditoria on-page + técnica + de conteúdo do domínio
  configurado via Semrush / Ahrefs / Firecrawl.
- `ai-search`  -  sondagem de visibilidade no ChatGPT / Perplexity / Gemini /
  Google AI Overviews + recomendações de GEO.
- `landing-page`  -  busca via Firecrawl, pontuação de 6 dimensões de 0 a 3,
  lista de correções priorizada.
- `form`  -  sinaliza campos desnecessários, reescreve rótulos + textos de
  ajuda, ordena por fricção (formulários que não são de cadastro  -  demo /
  contato / lead / checkout).

O usuário nomeia a superfície em linguagem simples ("auditoria de SEO", "GEO", "destrinche minha landing page", "conserte meu formulário de demo") -> inferir. Ambíguo -> fazer UMA pergunta nomeando as 4 opções.

## Quando usar

- Explícito: "rode uma auditoria de SEO", "audite a visibilidade em busca
  com IA", "auditoria de GEO", "critique {URL}", "audite meu formulário de leads".
- Gatilhos de `ai-search`: "eu apareço no ChatGPT?", "estamos visíveis
  no Perplexity / Gemini para a nossa categoria?", "quem aparece quando
  alguém pergunta sobre {category} no ChatGPT?".
- Gatilhos de `form`: "audite meu formulário de demo", "meu formulário de
  contato está vazando", "este formulário de leads está longo demais  -  o
  que dá para cortar?", "reescreva os rótulos deste formulário",
  "revise os campos do formulário de inscrição / checkout".
- Implícito: dentro de `plan-a-campaign` (paid / launch) quando a landing
  page roteada precisa ser afiada, ou dentro de `check-my-marketing` (content-gap)
  quando a saúde base do site é desconhecida.
- Cadência por superfície: site-seo no máximo semanal, ai-search no máximo
  mensal, landing-page sob demanda, form sob demanda.

## Conexões que eu preciso

Eu executo trabalho externo através do Composio. Antes desta skill rodar, eu verifico se as categorias abaixo estão conectadas. Faltando -> eu nomeio a categoria, peço para você conectá-la na aba de Integrações e paro.

- **Web scrape (Firecrawl)**  -  opcional. Se não estiver conectado, eu recorro a uma busca HTTP básica para `landing-page`, `form` e a passada on-page de `site-seo`, mais grosseira, mas funcional em páginas estáticas.
- **SEO (Semrush ou Ahrefs)**  -  auditoria on-page, indexação, aderência de conteúdo, dados de ranqueamento. Obrigatório para `site-seo`  -  sem alternativa, esses dados são proprietários.
- **Busca com IA (Perplexity / provedores de busca)**  -  sondar ChatGPT / Perplexity / Gemini / AI Overviews pela sua visibilidade. Obrigatório para `ai-search`  -  sem alternativa útil, os motores exigem acesso via API.

Para `site-seo` eu paro se nenhuma ferramenta de SEO estiver conectada. Para `ai-search` eu paro se nenhum provedor de busca com IA estiver conectado. Para `landing-page` e `form`, a busca HTTP básica cobre a falta do scrape, então eu sigo em frente.

## Informações que eu preciso

Eu leio seu contexto de marketing primeiro. Para cada campo obrigatório que estiver faltando, eu faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Seu posicionamento**  -  Obrigatório. Por que eu preciso: toda auditoria avalia o conteúdo em relação a quem você atende e o que você defende. Se faltar, eu pergunto: "Quer que eu rascunhe seu posicionamento primeiro? É uma skill só, leva uns cinco minutos."
- **Seu cliente ideal**  -  Obrigatório para `landing-page` e `form` (para eu poder avaliar o tratamento de objeções e a escolha de campos). Se faltar, eu pergunto: "Quem é o cliente que você quer que esta página ou formulário converta? Um parágrafo curto ou algo colado do seu CRM já resolve."
- **O domínio do seu site**  -  Obrigatório para `site-seo` e `ai-search`. Se faltar, eu pergunto: "Qual é o domínio que você quer que eu audite? Cole a URL."
- **Sua ferramenta de SEO**  -  Obrigatório para `site-seo` e `ai-search`. Se faltar, eu pergunto: "Abra Integrações e conecte o Semrush ou o Ahrefs, ou cole uma lista de páginas que você quer que eu avalie."

## Passos

1. **Ler o ledger + posicionamento.** Coletar os campos obrigatórios
   faltantes conforme acima (UMA pergunta cada, melhor modalidade primeiro).
   Escrever de forma atômica.
2. **Descobrir ferramentas via Composio.** Rodar `composio search seo` /
   `composio search web-scrape` / `composio search ai-search` /
   `composio search perplexity` conforme a superfície. Para `site-seo` e
   `ai-search`, parar se nenhuma ferramenta proprietária estiver conectada
   (dados de SEO e sondagens de busca com IA não podem ser replicados).
   Para `landing-page` e `form`, recorrer à busca HTTP básica quando o
   Firecrawl estiver ausente e sinalizar páginas pesadas em JS onde o
   resultado fica raso.
3. **Ramificar pela superfície.**
   - `site-seo`: executar os slugs de ferramenta descobertos contra o
     domínio + URLs principais, três passadas:
     - **On-page**  -  title tags, meta descriptions, hierarquia de H1/H2,
       canonical tags, schema, alt text, links internos.
     - **Técnica**  -  robots.txt / sitemap, indexação, Core Web
       Vitals, usabilidade mobile, HTTPS, links quebrados, redirecionamentos.
     - **Conteúdo**  -  páginas de melhor desempenho, conteúdo raso,
       canibalização, aderência entre conteúdo e posicionamento.
   - `ai-search`: montar o conjunto de consultas (3 grupos de 3-5 consultas
     cada): **Marca** ("o que é {product}", "{product} vs {competitor}",
     "preços de {product}"), **Categoria** (principais perguntas de JTBD do
     posicionamento), **Problema** (formulações das dores do cliente ideal).
     Consultar cada motor via os slugs descobertos  -  no mínimo ChatGPT /
     Perplexity / Gemini / Google AI Overviews. Por par consulta-motor, capturar:
     citado (sim / mencionado / não), URL citada, quem foi citado no lugar,
     como a IA enquadra a categoria.
   - `landing-page`: executar o slug de web scrape para buscar a URL
     (HTML renderizado + texto visível + imagens principais + meta + quaisquer
     sinais de velocidade da página). Pontuar 6 dimensões de 0 a 3 com uma
     justificativa de uma frase citando a página:
     1. **Clareza do título** (QUEM + O QUÊ em <=12 palavras).
     2. **Proposta de valor acima da dobra** (resultado visível sem
        rolar a página).
     3. **Prova social** (credibilidade + proximidade do CTA).
     4. **CTA principal** (uma ação inequívoca alinhada à conversão
        principal).
     5. **Tratamento de objeções** (FAQ / garantia / preços contra as
        2-3 principais objeções do cliente ideal vindas do posicionamento).
     6. **Hierarquia visual** (caminho do olhar -> CTA, sem CTAs concorrentes).
     Bônus: sinais de velocidade da página se a ferramenta os retornar.
   - `form`: aceitar URL, captura de tela ou lista de campos colada. URL ->
     executar o slug de web scrape. Identificar o tipo de formulário (lead /
     contato / demo / inscrição / pesquisa / checkout  -  NÃO cadastro, isso é
     `write-my-page-copy` surface=signup-flow). Fazer UMA pergunta sobre
     contexto de negócio se não estiver claro (o que acontece com os envios,
     quais campos são usados no follow-up, conformidade). Campo a campo:
     **Veredito** (manter / remover / adiar / make-optional /
     compliance-required), **Razão**, **Reescrita do rótulo**
     (conversacional, uma pergunta por campo), **Correção do tipo de input**
     (teclado mobile, validação inline, padrões inteligentes, detecção de
     erro de digitação no e-mail). Reescrever a proposta de valor acima do
     formulário. Nomear os anti-padrões (cognitive-load, privacy-anxiety-no-trust,
     missing-value-prop, too-many-fields, poor-mobile-keyboard,
     error-shaming, captcha-above-submit, no-progress-signal).
     Substituir "Enviar" por ação + resultado.
4. **Pontuar + priorizar.** Marcar cada descoberta com `{severity: critical /
   high / medium / low}` x `{effort: quick-win / medium / heavy}`.
   Trazer para o topo os 5 principais quick wins de severidade critical ou high.
   Para `landing-page`, incluir o placar por dimensão para o total
   ficar autoevidente:
   ```
   Clareza do título                 1/3
   Proposta de valor acima da dobra  1/3
   Prova social                      3/3
   CTA principal                     1/3
   Tratamento de objeções            2/3
   Hierarquia visual                 2/3
   Total                            10/21
   ```
   Sempre mostrar as seis linhas + o total. Nunca mostrar só o total sozinho.
5. **Escrever** de forma atômica em
   `audits/{surface}-{slug}-{YYYY-MM-DD}.md` (`*.tmp` -> renomear).
   Slug: `site-seo` / `ai-search` usam o domínio; `landing-page` /
   `form` usam o kebab da URL ou do nome do formulário. Estrutura: Resumo
   executivo -> Top 5 quick wins / maior vazamento -> Descobertas por passada ->
   Plano recomendado de 30 dias (site-seo) / Lista de correções priorizada
   (landing-page, form) / Recomendações de GEO (ai-search).
6. **Adicionar ao `outputs.json`**  -  ler-mesclar-escrever de forma atômica:
   `{ id (uuid v4), type: "audit", title, summary, path, status:
   "ready", createdAt, updatedAt }`.
7. **Resumir para o usuário.** Um parágrafo com os 5 principais quick wins
   (ou a maior correção única) e o caminho.

## O que eu nunca faço

- Inventar descobertas, taxas citadas ou contagens de campos de formulário.
  Toda afirmação se conecta a uma resposta real de ferramenta ou a uma
  observação da URL. Dados faltando -> marcados como UNKNOWN ou TBD.
- Prometer percentual de melhora  -  auditorias levantam hipóteses.
- Remover campo de formulário exigido por lei (pergunto se houver dúvida).
- Fixar nomes de ferramentas  -  descoberta via Composio em tempo de execução, sempre.

## Saídas

- `audits/{surface}-{slug}-{YYYY-MM-DD}.md`
- Adiciona entrada ao `outputs.json` com tipo `audit`.

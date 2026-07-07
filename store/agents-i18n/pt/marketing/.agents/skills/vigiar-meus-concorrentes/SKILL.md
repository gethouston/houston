---
name: vigiar-meus-concorrentes
title: "Vigiar meus concorrentes"
description: "Fico de olho no que seus concorrentes estão fazendo e se algo disso realmente importa. Escolha o que vigiar: os movimentos de produto e mudanças de mensagem deles, os anúncios que estão rodando, ou publicações no seu feed que valem a pena aproveitar. Ameaças reais versus ruído, não uma descarga de notícias."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [linkedin, twitter, reddit, instagram, googleads, metaads, firecrawl]
---


# Vigiar meus concorrentes

Uma skill, três fontes de sinal. O parâmetro `source` escolhe a sonda. Julgamento fundamentado no posicionamento + regra de "nunca inventar citações" compartilhados entre todas.

## Parâmetro: `source`

- `product`  -  blog + notas de versão + página inicial / preços via Firecrawl; análise profunda de um único concorrente OU resumo semanal de N concorrentes.
- `ads`  -  Meta Ad Library + LinkedIn Ad Library + Google Ads Transparency Center via scraping pelo Composio; extraio ângulos, ganchos, públicos, o que apareceu de novo nesta semana.
- `social-feed`  -  timeline / subreddit / menções filtradas por relevância temática + oportunidade de engajamento (LinkedIn / X / Reddit / Instagram).

Você nomeia a fonte em linguagem simples ("análise de concorrente", "que anúncios a Ramp está rodando", "escaneie minha timeline do X") -> eu infiro. Ambíguo -> faço UMA pergunta nomeando 3 opções.

## Quando usar

- Explícito: "pulso semanal dos concorrentes", "análise profunda de {X}", "que anúncios {Y} está rodando", "escaneie minha timeline", "sinal no Reddit em {subreddit}", "menções no IG".
- Implícito: depois de `plan-a-campaign` (paid / launch) quando o posicionamento dos concorrentes afeta os ângulos; antes de `write-a-post` channel=reddit para levantar as threads exatas que valem uma resposta.

## Conexões que eu preciso

Executo trabalho externo através do Composio. Antes de esta skill rodar, verifico se as categorias abaixo estão conectadas. Faltando -> nomeio a categoria, peço para você conectá-la na aba Integrações, paro.

- **Web scrape (Firecrawl)**  -  opcional para `product`. Se não estiver conectado, recorro a uma busca HTTP básica no blog / changelog / preços / página inicial do concorrente, mais rudimentar mas funcional em páginas estáticas.
- **Bibliotecas de anúncios (Meta Ads, LinkedIn Ads, Google Ads)**  -  puxam os criativos de anúncios ativos dos concorrentes. Obrigatório para `ads`  -  sem alternativa útil, as bibliotecas controlam o acesso.
- **Plataformas sociais (LinkedIn, X, Reddit, Instagram)**  -  leem sua timeline ou o subreddit indicado. Obrigatório para `social-feed`, escolha a plataforma onde você realmente vive  -  sem alternativa, o acesso exige OAuth.

Se `ads` ou `social-feed` exige uma conexão que não existe, eu paro. Para `product`, o scraping é o único requisito e a busca HTTP básica me mantém rodando.

## Informações que eu preciso

Leio seu contexto de marketing primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Seu posicionamento**  -  Obrigatório para toda fonte. Por que preciso: me dá sua lista de concorrentes e os diferenciais contra os quais avalio as ameaças. Se faltar, pergunto: "Quer que eu redija seu posicionamento primeiro? É uma skill só, leva uns cinco minutos."
- **Seu cliente ideal**  -  Obrigatório. Por que preciso: filtra quais sinais dos concorrentes realmente importam para o seu comprador. Se faltar, pergunto: "Quem é o cliente que você está tentando conquistar? Um parágrafo basta, ou me aponte para o seu CRM."
- **Suas plataformas sociais e temas**  -  Obrigatório para `social-feed`. Por que preciso: me diz qual feed escanear e o que conta como relevante. Se faltar, pergunto: "Em quais plataformas você publica, e que temas você quer que eu acompanhe no seu feed?"

## Passos

1. **Ler o ledger + posicionamento.** Extraio a lista nomeada de concorrentes + nossos diferenciais + as 2-3 principais objeções do cliente ideal. Coleto os campos obrigatórios que faltam (UMA pergunta cada).
2. **Determinar modo + lista de alvos.**
   - `product`: você nomeou um -> análise profunda; "pulso semanal" ou vários -> resumo (padrão: top 3 do posicionamento).
   - `ads`: você nomeou um -> esse concorrente; senão, top 3 do posicionamento. Verifico `competitor-briefs/` anteriores em busca de mudanças.
   - `social-feed`: interpreto o pedido  -  "minha timeline" -> X, "meu feed do LinkedIn" -> LinkedIn, "{subreddit}" -> Reddit, "menções no IG" -> Instagram. Padrão: plataforma principal de `domains.social.platforms`. Janela: últimas 24-48h com teto de ~50 publicações, a menos que você especifique.
3. **Descobrir ferramentas via Composio.** Rodo as chamadas apropriadas de `composio search`:
   - `product` -> `web-scrape` (página inicial / blog / changelog), `web-search` (notícias / investimento), opcionalmente `seo-intel`, opcionalmente `ad-intel`.
   - `ads` -> ferramentas de biblioteca / inteligência de anúncios (Meta Ad Library, LinkedIn Ad Library, Google Ads Transparency) + `web-scrape` como alternativa.
   - `social-feed` -> ferramenta de leitura de feed / top posts / menções da plataforma.
   Categoria necessária não conectada -> anoto no briefing ("sem conexão de ad-intel  -  atividade de anúncios: UNKNOWN") e continuo, ou (social-feed, onde a fonte É a plataforma) nomeio a categoria a conectar e paro.
4. **Ramificar pela fonte.**
   - `product` (resumo: últimos 7 dias; análise profunda: últimos 30): por concorrente coleto **site / mensagem** (hero da página inicial, copy alterado), **produto / changelog** (novas funcionalidades, mudanças de preço), **conteúdo** (blog recente, podcasts, newsletters), **SEO** (ganhos / perdas de ranking em palavras-chave relevantes ao posicionamento, se conectado), **social / notícias** (investimento, contratações, lançamentos). Comparo com o nosso posicionamento  -  para cada sinal pergunto: ameaça os NOSSOS diferenciais? Abre uma lacuna que NÓS atacamos? Cito textualmente lado a lado (copy do concorrente vs o do nosso documento de posicionamento).
   - `ads`: de cada anúncio coletado extraio plataforma + formato, título + texto principal (textual), CTA, público inferido, ângulo inferido (dor / status / urgência / prova social / focado em funcionalidade / focado em preço), duração estimada de veiculação. Sintetizo: ângulo(s) dominante(s), dores nomeadas (textuais), diferenciais alegados, mix de formatos criativos, mudanças vs coletas anteriores.
   - `social-feed`: para cada publicação julgo a **Relevância temática** (toca `domains.social.topics`? alta / média / nenhuma), a **Oportunidade de engajamento** (agrega valor real  -  discordância com substância, pergunta afiada, experiência específica? ou basta curtir?), o **Risco** (sinalizo o que for político / pessoal / fora da marca). Mantenho 5-10 publicações de alto valor. Redijo sugestões de resposta de 1-3 frases para as 3-5 principais, na voz registrada no ledger.
5. **Destaques de oportunidade.** Para cada fonte, aponto movimentos concretos:
   - `product` -> movimentos recomendados etiquetados com a skill do agente que os executa (ex.: `[write-a-post:blog]`, `[plan-a-campaign:paid]`, `[write-my-page-copy:landing]`).
   - `ads` -> ângulos que eles estão deixando passar e que o nosso posicionamento domina, alegações a rebater na nossa landing page, padrões criativos a testar (entrego a `plan-a-campaign:paid` ou à geração de conteúdo).
   - `social-feed` -> lista curta de "também vale uma curtida" + a publicação número 1 para responder primeiro.
6. **Escrever** atomicamente em:
   - análise profunda de `product`: `competitor-briefs/product-{competitor-slug}-{YYYY-MM-DD}.md`
   - resumo de `product`: `competitor-briefs/product-weekly-{YYYY-MM-DD}.md`
   - `ads`: `competitor-briefs/ads-{competitor-slug}-{YYYY-MM-DD}.md`
   - `social-feed`: `competitor-briefs/social-feed-{platform}-{YYYY-MM-DD}.md`
   Toda afirmação fica amarrada a URL + timestamp ou marcada como UNKNOWN.
7. **Anexar em `outputs.json`**  -  ler, mesclar e escrever atomicamente:
   `{ id (uuid v4), type: "competitor-brief", title, summary, path,
   status: "draft", createdAt, updatedAt }`.
8. **Resumir para você.** Um parágrafo:
   - `product` -> maior ameaça + maior oportunidade + 1 movimento para esta semana + caminho do arquivo.
   - `ads` -> ângulo dominante que eles estão empurrando + uma oportunidade para nós + caminho do arquivo.
   - `social-feed` -> N publicações de alto sinal + a principal + caminho do arquivo.

## O que eu nunca faço

- Inventar títulos de anúncios, citações de concorrentes, contagens de publicações ou estatísticas de engajamento. Toda afirmação textual está amarrada a uma coleta real. Ferramenta não retornou nada -> eu digo isso.
- Responder / publicar / mandar DM em seu nome. Apenas rascunhos.
- Fixar nomes de ferramentas no código. Descoberta via Composio apenas em tempo de execução.

## Saídas

- `competitor-briefs/{source}-{slug-or-date}.md`
- Anexa uma entrada em `outputs.json` com tipo `competitor-brief`.

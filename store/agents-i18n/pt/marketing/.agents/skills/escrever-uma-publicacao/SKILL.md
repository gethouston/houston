---
name: escrever-uma-publicacao
title: "Escrever uma publicação"
description: "Redijo um conteúdo na sua voz, baseado no seu posicionamento. Escolha o canal: um post de blog longo, uma publicação no LinkedIn, uma thread no X, uma newsletter, ou uma resposta no Reddit. Copy nativo do canal que soa como você, não como uma fábrica de conteúdo. Apenas rascunhos, você sempre publica."
version: 1
category: Marketing
featured: yes
image: megaphone
integrations: [googledocs, linkedin, twitter, reddit, mailchimp, firecrawl]
---


# Escrever uma publicação

Redação nativa por canal, uma skill só. O parâmetro `channel` escolhe o formato. A disciplina central  -  posicionamento, voz, nada de estatísticas inventadas, apenas rascunhos  -  é compartilhada entre todos os canais.

## Parâmetro: `channel`

- `blog`  -  post de 2.000-3.000 palavras com consciência de SEO → `blog-posts/{slug}.md`.
- `linkedin`  -  publicação nativa começando pelo gancho → `posts/linkedin-{slug}.md`.
- `x-thread`  -  thread de 5-12 tweets → `threads/x-{slug}.md`.
- `newsletter`  -  assunto + prévia + corpo, um fio condutor único →
  `newsletters/{YYYY-MM-DD}.md`.
- `reddit`  -  resposta de comunidade com valor em primeiro lugar (thread de origem via
  Composio/Firecrawl) → `community-replies/{source-slug}.md`.

Você nomeia o canal em linguagem simples ("thread no X", "resposta no Reddit", "a newsletter desta semana") → eu infiro. Ambíguo → faço UMA pergunta nomeando as 5 opções.

## Quando usar

- Explícito: "redija um {post de blog / publicação no LinkedIn / thread no X /
  newsletter / resposta no Reddit} sobre {tema}", "escreva uma publicação sobre {X}",
  "responda a esta thread em {URL}".
- Implícito: chamada por `plan-a-campaign` (lançamento / anúncio) para as
  peças de canal, ou por `watch-my-competitors`
  (social-feed) quando uma thread de alto sinal é marcada.

## Conexões que eu preciso

Executo trabalho externo através do Composio. Antes de esta skill rodar, verifico se as categorias abaixo estão conectadas. Faltando → nomeio a categoria, peço para você conectá-la na aba Integrações, paro.

- **Busca na web (Exa, Perplexity)**  -  varredura de SERP para `blog`, embasamento leve para publicações. Obrigatório para `blog`  -  sem alternativa útil, preciso de um buscador para comparar a cobertura existente.
- **Web scrape (Firecrawl)**  -  opcional. Se não estiver conectado, recorro a uma busca HTTP básica nas URLs de concorrentes / fontes, mais rudimentar mas funcional em páginas estáticas.
- **Google Docs**  -  espelha o rascunho do blog em um Doc que você pode entregar a qualquer pessoa para revisão. Opcional para `blog`.
- **Reddit**  -  lê a thread de origem para `reddit`. Obrigatório para `reddit`  -  sem alternativa, a API controla o acesso.
- **Plataformas sociais (LinkedIn, X)**  -  opcional para `linkedin` e `x-thread`.
- **Plataforma de e-mail (Customer.io, Loops, Mailchimp, Kit)**  -  deposita a newsletter em um rascunho. Opcional para `newsletter`.

Para `blog`, eu paro se a busca na web não estiver conectada. Para `reddit`, eu paro se o Reddit não estiver conectado. A alternativa de web scrape me mantém rodando sozinha.

## Informações que eu preciso

Leio seu contexto de marketing primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **O nome e o pitch da sua empresa**  -  Obrigatório para todo canal. Por que preciso: ancora a publicação no que você realmente faz. Se faltar, pergunto: "Qual é o nome da empresa, e como você descreve o que ela faz em uma frase?"
- **Sua voz**  -  Obrigatório para todo canal. Por que preciso: uma publicação com cara genérica é ignorada. Se faltar, pergunto: "Conecte seu LinkedIn ou sua caixa de enviados para eu amostrar sua voz, ou cole duas ou três coisas que você escreveu."
- **Seu posicionamento**  -  Obrigatório para todo canal. Se faltar, pergunto: "Quer que eu redija seu posicionamento primeiro? É uma skill só, leva uns cinco minutos."
- **Suas plataformas sociais e temas**  -  Obrigatório para `linkedin`, `x-thread`, `reddit`. Se faltar, pergunto: "Em quais plataformas você publica, e sobre que temas você quer que eu escreva?"
- **Sua plataforma de e-mail**  -  Obrigatório para `newsletter` (para eu nomear a ferramenta em que você vai colar). Se faltar, pergunto: "Qual ferramenta de e-mail você usa para enviar sua newsletter?"

## Passos

1. **Ler o ledger + posicionamento.** Carrego `config/context-ledger.json`
   e `context/marketing-context.md`. Coleto os campos obrigatórios faltantes
   conforme a lista acima (UMA pergunta cada, melhor modalidade primeiro).
2. **Resolver canal + tema.** Confirmo o parâmetro. Tema não explícito →
   faço UMA pergunta: "Qual é o ângulo / gancho /
   palavra-chave alvo?"
3. **Rodada de pesquisa (na escala do canal).**
   - `blog`  -  rodo `composio search seo` / `composio search web` para
     os 5-10 primeiros resultados da SERP na palavra-chave alvo; extraio lacunas
     de ângulo + estrutura esperada.
   - `linkedin` | `x-thread`  -  opcional, `composio search web` para
     1-3 fatos de embasamento. Pulo se for pura história/opinião.
   - `newsletter`  -  puxo o material de origem (colagem, links seus, entradas
     recentes de `blog-posts/` indexadas em `outputs.json`). Nada →
     pergunto: "O que aconteceu nesta semana que vale um e-mail?"
   - `reddit`  -  rodo `composio search web-scrape` (ou
     `composio search reddit`), busco a URL da thread, puxo o OP + os
     3-5 comentários principais. Scraping falhou → peço para você colar.
4. **Avaliar o valor (apenas reddit).** Uma frase: "temos de verdade
   algo a acrescentar aqui?" Não → digo isso, paro. Nada de respostas de enchimento.
5. **Redigir no formato do canal.**
   - `blog`  -  H1 (com a palavra-chave à frente, humano) → introdução (gancho + promessa +
     sumário) → H2/H3 cobrindo a demanda da SERP + uma seção contraintuitiva amarrada
     ao posicionamento → sugestões de links internos no texto → um CTA vindo do
     posicionamento → meta description (≤155 caracteres) → slug (kebab-case)
     → briefing de imagem (texto alternativo + 2-3 ideias).
   - `linkedin`  -  linha 1 é o gancho (4-10 palavras, contraintuitivo / número
     específico) → espaço em branco, linhas curtas → uma conclusão clara →
     3-6 parágrafos curtos → CTA ou pergunta → 0-3 hashtags específicas.
   - `x-thread`  -  tweet 1 com gancho que para o scroll (≤280 caracteres,
     sem enfeite de emoji) → 4-10 tweets numerados em progressão (cada um é um passo,
     ≤280) → tweet final de CTA (seguir / responder / link). O X é mais direto
     que o LinkedIn.
   - `newsletter`  -  escolho UM fio condutor (não consigo enunciar em
     uma frase → peço para você escolher o título) → assunto
     (≤60 caracteres, específico) → prévia (50-90 caracteres) → corpo com 3-5
     seções curtas a serviço do fio condutor → um CTA principal.
     Texto simples em primeiro lugar, cito as URLs das fontes no texto.
   - `reddit`  -  reconheço a pergunta específica do OP (1 linha) →
     valor concreto em 2-4 parágrafos curtos (framework, número, pegadinha,
     passo a passo, contraponto) → menção sutil opcional só se
     diretamente relevante, depois do valor, nome e não link → sem
     assinaturas. Registro muda para o casual da comunidade.
6. **Ajuste de voz.** Todo canal respeita os campos de `voice` do ledger
   (formalidade, hábito de emoji, comprimento de frase). Amostra de voz
   insossa → padrão direto + caloroso.
7. **Escrever atomicamente** no caminho do canal (`*.tmp` → renomear). Slug
   = kebab(primeiras-5-palavras-do-gancho), a menos que outra regra acima se aplique.
   Front-matter do arquivo: `type`, `channel`, `topic`, mais os campos específicos
   do canal (blog: title/slug/metaDescription/targetKeyword/
   wordCount; newsletter: throughLine/sources; reddit: URL de origem
   + subreddit + citação do OP).
8. **Bônus do blog (apenas `channel: blog`).** `googledocs`
   conectado → rodo `composio search googledocs` → executo a
   ferramenta de criar documento, espelho o rascunho lá, incluo a URL no
   resumo.
9. **Anexar em `outputs.json`** na raiz do agente. Ler, mesclar e escrever
   atomicamente: `{ id (uuid v4), type: "blog-post" | "linkedin-post"
   | "x-thread" | "newsletter" | "community-reply", title, summary,
   path, status: "draft", createdAt, updatedAt }`.
10. **Resumir para você.** Um parágrafo nomeando o gancho / fio
    condutor / valor agregado + caminho do arquivo. Lembrete: "Revise, edite e publique
    você mesmo."

## O que eu nunca faço

- Publicar / postar / enviar em seu nome. Apenas rascunhos.
- Inventar estatísticas, citações de clientes, fontes. Toda afirmação citável
  tem URL ou fica marcada como TBD.
- Adivinhar posicionamento ou voz. Leio o ledger + o arquivo de posicionamento ou
  pergunto.
- Fixar nomes de ferramentas no código. Descoberta via Composio apenas em tempo de execução.

## Saídas

- `blog-posts/{slug}.md` | `posts/linkedin-{slug}.md` |
  `threads/x-{slug}.md` | `newsletters/{YYYY-MM-DD}.md` |
  `community-replies/{source-slug}.md`.
- Anexa uma entrada em `outputs.json` com o `type` correspondente.

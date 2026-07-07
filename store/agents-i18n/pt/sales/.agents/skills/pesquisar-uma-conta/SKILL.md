---
name: pesquisar-uma-conta
title: "Pesquisar uma conta"
description: "Pesquiso uma conta alvo ou contato na profundidade que você precisar: uma qualificação de 30 segundos a partir de uma URL, um relatório completo com fontes citadas que inclui varredura do site e doze semanas de notícias, um enriquecimento de uma pessoa específica, ou uma busca de conexões próximas no seu CRM e LinkedIn. Cada afirmação cita uma fonte real, sem notícias, rodadas de investimento ou conexões inventadas."
version: 1
category: Vendas
featured: no
image: handshake
integrations: [gmail, hubspot, salesforce, attio, linkedin, firecrawl, perplexityai]
---


# Pesquisar Uma Conta

Uma skill, quatro formatos de pesquisa. O parâmetro `depth` escolhe a passada. A citação de fontes e a disciplina de "nunca inventar fato" são compartilhadas.

## Parâmetro: `depth`

- `quick-qualify`  -  leitura de 30 segundos de uma única URL. Uma varredura, uma decisão (GOOD-FIT / BORDER / OUT), um ângulo se for GOOD-FIT. Triagem rápida, não um relatório completo.
- `full-brief`  -  relatório completo com múltiplas passadas e fontes citadas sobre uma conta nomeada: varredura do site, notícias recentes (12 semanas), detecção de stack de tecnologia, varredura de redes sociais, sinais de intenção. Alimenta outreach e preparação de call.
- `enrich-contact`  -  pessoa nomeada: dados firmográficos, contexto do cargo, linha de subordinação se descobrível, posts/palestras recentes, sinais de gatilho. Para personalização de outreach.
- `warm-paths`  -  apresentações de primeiro grau: busco no LinkedIn/Gmail/CRM conectados por pessoas que conhecem alguém na conta alvo. Classifico os caminhos por força.

Se o pedido do usuário implicar a profundidade ("leitura rápida", "vai fundo", "enriquece essa pessoa", "quem eu conheço aí"), eu infiro. Senão, faço UMA pergunta nomeando as 4 opções.

## Quando usar

- Gatilhos explícitos na descrição.
- Implícito: dentro de `write-my-outreach stage=cold-email` (o cold email precisa de um sinal, esta skill encontra), e `prep-a-meeting type=call` (a call precisa de um relatório).

## Conexões que preciso

Faço o trabalho externo através do Composio. Antes de esta skill rodar, verifico se as categorias abaixo estão conectadas. Se faltar alguma, nomeio a categoria, peço para você conectá-la na aba Integrações, e paro.

- **Varredura**  -  leio o site da empresa, páginas de produto, sinais de stack de tecnologia. Obrigatório para `quick-qualify` e `full-brief`.
- **Busca / pesquisa**  -  busco notícias recentes, captações, contratações para `full-brief` e `enrich-contact`. Obrigatório para essas profundidades.
- **Redes sociais**  -  leio o perfil público do LinkedIn e posts para `enrich-contact` e `warm-paths`. Obrigatório para essas profundidades.
- **CRM**  -  cruzo conexões de primeiro grau e contatos anteriores para `warm-paths`. Obrigatório para essa profundidade.
- **Caixa de entrada**  -  cruzo com quem você já trocou e-mails na conta alvo para `warm-paths`. Opcional.

Se nenhuma das categorias obrigatórias para a profundidade escolhida estiver conectada, paro e peço para você conectar o Firecrawl primeiro, já que a maioria das profundidades parte da leitura do site.

## Informações que preciso

Primeiro leio o seu contexto de vendas. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > arquivo > URL > colar) e espero.

- **Seu playbook de vendas**  -  Obrigatório. Por que preciso: o seu perfil de cliente ideal e os seus diferenciais fundamentam a decisão de qualificação e o enquadramento do relatório. Se estiver faltando, pergunto: "Ainda não tenho o seu playbook. Quer que eu rascunhe um agora?"
- **O nome ou a URL da empresa alvo**  -  Obrigatório para `quick-qualify`, `full-brief`, `warm-paths`. Por que preciso: a varredura e a busca de notícias se ancoram nisso. Se estiver faltando, pergunto: "Qual empresa devo pesquisar? Cole a URL do site ou me diga o nome."
- **O nome e a empresa da pessoa alvo**  -  Obrigatório para `enrich-contact`. Por que preciso: o enriquecimento é fundamentado em um perfil real do LinkedIn. Se estiver faltando, pergunto: "Quem devo enriquecer? Nome completo e empresa?"
- **CRM conectado**  -  Obrigatório para `warm-paths`. Por que preciso: cruzo os seus contatos anteriores e clientes em comum. Se estiver faltando, pergunto: "Conecte o seu CRM (HubSpot, Salesforce, Attio, Pipedrive ou Close) para eu encontrar caminhos próximos."

## Passos

1. **Leio o ledger e o playbook.** Coleto os campos obrigatórios que faltam (uma pergunta por vez, começando pela melhor modalidade). Escrevo de forma atômica.

2. **Descubro as ferramentas via Composio.** `composio search web-scrape` / `composio search search-research` / `composio search crm` / `composio search linkedin`, de acordo com a profundidade. Se não houver ferramenta conectada para uma categoria obrigatória, nomeio a categoria a conectar e paro.

3. **Ramifico de acordo com a profundidade.**
   - `quick-qualify`: faço a varredura da URL (uma requisição).
     Extraio: o que fazem, para quem vendem, sinal de tamanho de
     equipe, sinal de stack de tecnologia. Aplico os
     desqualificadores do playbook. Saída: **GOOD-FIT** / **BORDER**
     / **OUT** + uma frase de motivo + um ângulo (uma única dor do
     playbook que mais combina com eles). Salvo de forma enxuta em
     `leads/{slug}/qualify-{YYYY-MM-DD}.md` (~150 palavras no
     máximo).
   - `full-brief`: faço a varredura, busco notícias das últimas 12
     semanas (captação, contratações, lançamentos de produto,
     mudanças de liderança), detecto a stack de tecnologia (sinais
     no estilo BuiltWith via varredura), varro os posts do LinkedIn
     da empresa. Estrutura: **Panorama** (um parágrafo) → **Sinais
     recentes** (5 a 8 tópicos, cada um citado com URL e data) →
     **Stack de tecnologia** (5 a 10 sinais) → **Palpites do comitê
     de compra** (extraídos do LinkedIn quando disponível) →
     **Ângulos para outreach** (3 ângulos classificados, cada um
     ligado a um sinal citado). Salvo em
     `accounts/{slug}/brief-{YYYY-MM-DD}.md`.
   - `enrich-contact`: busco a pessoa via LinkedIn e enriquecimento
     de CRM/e-mail conectados. Capturo: cargo, empresa, tempo na
     função, empresas anteriores, posts/palestras/podcasts visíveis
     dos últimos 6 meses, sinal de gatilho (novo cargo, palestrante,
     imprensa). Salvo em `leads/{slug}/enrichment-{YYYY-MM-DD}.md`.
   - `warm-paths`: via LinkedIn (Composio), encontro conexões de
     primeiro grau na empresa alvo. Cruzo com o CRM em busca de
     caminhos de cliente ou investidor em comum. Classifico:
     **Forte** (conexão próxima, contato recente), **Médio** (laço
     fraco, desatualizado), **Fraco** (apenas terceiro grau).
     Rascunho um pedido de apresentação para cada caminho forte.
     Salvo em `leads/{slug}/warm-paths-{YYYY-MM-DD}.md`.

4. **Cito cada afirmação.** Nenhum fato sem citação. Qualquer afirmação sem referência de URL ou campo do CRM é marcada como `(hipótese  -  verificar)`.

5. **Adiciono a `outputs.json`**  -  lendo, mesclando e escrevendo de forma atômica: `{ id (uuid v4), type: "account-brief" | "contact-enrichment" | "warm-paths" | "lead-batch" (para quick-qualify), title, summary, path, status: "ready", createdAt, updatedAt, domain: "outbound" }`.

6. **Resumo para o usuário.** Principal achado e o caminho. Sugiro a próxima skill ("`write-my-outreach stage=cold-email` usando o ângulo nº 1?" ou "`prep-a-meeting type=call` se isso virar reunião?").

## O que eu nunca faço

- Inventar notícias, captações, contratações, fatos de stack de tecnologia, conexões. Cada afirmação cita a fonte.
- Varrer dados privados. Apenas perfil público do LinkedIn, site da empresa e notícias públicas.
- Enriquecer a vida pessoal do contato além da presença profissional.

## Saídas

- `quick-qualify` → `leads/{slug}/qualify-{YYYY-MM-DD}.md`
- `full-brief` → `accounts/{slug}/brief-{YYYY-MM-DD}.md`
- `enrich-contact` → `leads/{slug}/enrichment-{YYYY-MM-DD}.md`
- `warm-paths` → `leads/{slug}/warm-paths-{YYYY-MM-DD}.md`
- Adiciona a `outputs.json`.

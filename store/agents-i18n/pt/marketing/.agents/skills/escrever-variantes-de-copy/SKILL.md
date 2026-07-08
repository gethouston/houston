---
name: escrever-variantes-de-copy
title: "Escrever variantes de copy"
description: "Consiga variantes de copy para a peça que mais precisa de ajuda agora. Escolha a tarefa: variantes de título para uma página, opções de botão de CTA, copy de anúncio para uma campanha, ou uma revisão para deixar um copy existente mais enxuto. Cada variante se baseia em uma citação real de cliente ou uma afirmação de posicionamento, classificadas para você saber o que testar primeiro. Apenas rascunhos."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [reddit, firecrawl, linkedin]
---


# Escrever variantes de copy

Uma skill para toda necessidade de variantes de copy. O parâmetro `job` escolhe o formato, as regras de fonte e o formato de saída. Regra compartilhada entre todas as tarefas: cada variante fundamentada em uma citação real de cliente ou em uma afirmação do documento de posicionamento  -  nada de linguagem de marketeiro, nada de invenção.

## Parâmetro: `job`

- `headlines`  -  10 pares de título + subtítulo para uma página nomeada, cada um citando uma frase textual de cliente, com os 3 melhores para testar primeiro. Saída: `headline-variants/{page-slug}-{YYYY-MM-DD}.md`.
- `ctas`  -  5-7 variantes de texto de botão de CTA, cada uma pareada com a objeção que responde e o resultado que sugere. Saída: `cta-variants/{page-slug}-{YYYY-MM-DD}.md`.
- `ad-copy`  -  10 títulos + 5 descrições + 3 conceitos criativos para uma campanha e plataforma nomeadas, respeitando os limites de caracteres da plataforma, cada um fundamentado em uma citação de origem. Saída: `ad-copy/{campaign-slug}.md`.
- `edit`  -  revisão de enxugamento em cinco varreduras sobre um copy existente (clareza, voz, especificidade, comprimento, CTAs) com antes/depois/porquê para cada linha alterada. Saída: `copy-edits/{page-slug}-{YYYY-MM-DD}.md`.

Você nomeia a tarefa em linguagem simples ("10 títulos para minha página inicial", "um CTA melhor para o cadastro", "copy de anúncio para o lançamento do Q2", "enxugue minha página sobre") -> eu infiro. Ambíguo -> faço UMA pergunta nomeando as quatro tarefas.

## Quando usar

**headlines:**
- "10 variantes de título para minha página inicial"
- "Ganchos alternativos de hero para a landing page da campanha {campaign}"
- "Opções de título para a página de preços"
- Costuma vir depois de `write-my-page-copy` ou `audit-a-surface` (surface=landing-page) quando o título é apontado como a correção.

**ctas:**
- "Um CTA melhor para meu botão de cadastro"
- "Variantes de CTA para a página de preços"
- "O que o botão de demo deveria dizer?"
- Costuma vir depois de `write-copy-variants` (job=headlines) ou `write-copy-variants` (job=edit) quando o CTA é apontado como fraco.

**ad-copy:**
- "Redija 10 variantes de copy de anúncio para o {product}"
- "Escreva títulos de busca do Google para {keyword}"
- "Me dê criativos de Meta para o lançamento da campanha {campaign}"
- "Copy de anúncio que soe como meus clientes realmente falam" / "10 títulos, cada um com a citação por trás" / "minere as avaliações do G2 e escreva variantes de Meta a partir delas"  -  mesma skill, a regra da citação textual já é inegociável.
- Vem depois de `plan-a-campaign` (passagem de bastão: "Para o copy, rode `write-copy-variants` job=ad-copy sobre os ângulos desta campanha") ou de `mine-my-sales-calls` (transformar as frases extraídas em variantes de anúncio).

**edit:**
- "Edite o copy da minha {page}"
- "Enxugue isto  -  está prolixo demais"
- "Dê um polimento na minha página sobre"
- "Revise e afie este texto"
- Chamada depois de `write-my-page-copy` para polir o rascunho final em uma passada focada.

## Conexões que eu preciso

Executo trabalho externo através do Composio. Antes de esta skill rodar, verifico se as categorias abaixo estão conectadas. Faltando -> nomeio a categoria, peço para você conectá-la na aba Integrações, paro.

- **Web scrape (Firecrawl)**  -  opcional para `headlines` e `ad-copy` (busca a página e as avaliações da categoria de forma limpa; recorre à busca HTTP básica). Obrigatório para `edit` quando você me dá uma URL em vez de colar o copy.
- **Reddit**  -  opcional para `headlines` e `ad-copy`, me permite raspar subreddits da categoria em busca de frases textuais quando não existem insights de ligações.
- **Plataformas sociais (LinkedIn)**  -  opcional para `ad-copy`, as restrições de formato variam por plataforma e eu ajusto o copy à que você mirar.
- **Caixa de entrada (Gmail, Outlook)**  -  opcional para `ctas` e `edit`, para amostrar sua voz. As edições ficam sem graça sem isso.

Para `headlines` e `ad-copy`: se você não tem insights de ligações, a página é tão pesada de JS que a busca básica não retorna nada legível, e você não pode colar algumas citações de clientes, eu paro.

Para `ctas`: consigo rodar sem nenhuma conexão  -  seu documento de posicionamento e os insights de ligações são os insumos que sustentam o trabalho.

Para `edit`: consigo rodar sem conexões se você colar o copy diretamente.

## Informações que eu preciso

Leio seu contexto de marketing primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Seu posicionamento**  -  Obrigatório (todas as tarefas). Por que preciso: cada variante tem que estar fundamentada na sua categoria e no seu cliente ideal, não em padrões genéricos. Se faltar, pergunto: "Quer que eu redija seu posicionamento primeiro? É uma skill só, leva uns cinco minutos."
- **Sua voz**  -  Obrigatório (todas as tarefas). Por que preciso: variantes na voz errada são inutilizáveis; para `edit`, sem regras de voz a passada vira fala de chatbot. Se faltar, pergunto: "Conecte sua caixa de enviados para eu amostrar sua voz, ou cole duas ou três coisas que você escreveu."
- **A página e a conversão principal**  -  Obrigatório para `headlines` e `ctas`. Por que preciso: um título de hero e um meta-título carregam restrições diferentes; um CTA de cadastro e um CTA de preços carregam funções diferentes. Se faltar, pergunto: "Para qual página é isto, e qual é a única ação que o visitante deve tomar?"
- **Citações de clientes**  -  Obrigatório para `headlines` e `ad-copy`. Por que preciso: não escrevo um título sem uma frase real por trás. Se faltar, pergunto: "Conecte o Gong ou o Fireflies para eu minerar suas ligações de vendas, cole cinco frases textuais de clientes, ou me aponte para avaliações no G2 / Capterra."
- **Principais objeções**  -  Opcional para `ctas`. Se faltar, pergunto: "O que faz os visitantes hesitarem neste botão? Se você não tiver, eu tiro as principais objeções do seu posicionamento."
- **A plataforma de anúncios**  -  Obrigatório para `ad-copy`. Por que preciso: Google, Meta e LinkedIn carregam limites de caracteres diferentes. Se faltar, pergunto: "Em qual plataforma esses anúncios vão rodar, Google, Meta, LinkedIn, ou outra?"
- **A campanha ou o ângulo**  -  Obrigatório para `ad-copy`. Por que preciso: dez variantes sem um ângulo alvo é atirar para todo lado. Se faltar, pergunto: "Qual é a campanha ou o ângulo desses anúncios?"
- **O copy a editar**  -  Obrigatório para `edit`. Se faltar, pergunto: "Cole o copy que você quer editar, ou me dê a URL da página."

## Passos

### Passos compartilhados (todas as tarefas)

1. **Ler o documento de posicionamento** em `context/marketing-context.md`. Se estiver faltando, peço para você rodar `set-up-my-marketing-info` primeiro e paro.
2. **Ler `config/voice.md`.** Se estiver faltando, faço UMA pergunta nomeando a melhor modalidade (caixa de entrada conectada via Composio > colar 2-3 amostras). Escrevo antes de continuar.
3. **Buscar a linguagem do cliente  -  ordem de prioridade** (para `headlines`, `ctas`, `ad-copy`):
   - a) `call-insights/`  -  pasta existe -> leio os 3-5 arquivos mais recentes. Extraio frases textuais de dor / desejo / gatilho.
   - b) `research/`  -  bancos de citações dos briefings de pesquisa.
   - c) Nenhum existe -> rodo `composio search` por ferramentas de raspagem de avaliações (G2, Capterra, Trustpilot, Reddit, App Store). Puxo avaliações de concorrentes / da categoria. Cito textualmente.
   - d) Nenhuma ferramenta de raspagem de avaliações conectada -> peço para você conectar uma categoria, colar 5-10 citações de clientes, ou apontar URLs de avaliações. Paro.

### Ramificar por `job`:

#### `headlines`

4. **Identificar página + conversão principal.** Leio `config/primary-page.json`. Você nomeou outra página -> pergunto URL / conversão se não for óbvio. Continuo.
5. **Montar o banco de citações.** 10-20 frases textuais, cada uma etiquetada como `pain` / `desire` / `objection` / `trigger` / `positioning-doc`. Cito a fonte (ID da ligação / plataforma de avaliação + URL / linha do posicionamento).
6. **Gerar as variantes.** 10 pares de título + subtítulo. Para cada um:
   - Título (voz do fundador, fundamentado em uma citação específica do banco  -  nomeio a etiqueta da citação).
   - Subtítulo  -  1-2 linhas expandindo o título com especificidade.
   - Rótulo de ângulo  -  um entre: resultado-sobre-funcionalidade, enquadrado-no-problema, "sem X", contraintuitivo, urgência, puxado-por-prova-social, definição-de-categoria, transformação, gancho-de-pergunta, numérico.
   Respeito as restrições de comprimento da página (hero ~<12 palavras, meta-títulos ~60 caracteres)  -  pergunto se não estiver claro.
7. **Classificar os 3 melhores para testar primeiro.** Classifico por: (a) força da citação de origem (frequência / intensidade da dor), (b) alinhamento com a afirmação principal do documento de posicionamento, (c) contraste com o copy atual da página. Nomeio o título mantido como controle + 3 desafiantes.
8. **Ganchos de passagem de bastão.** A variante principal precisa de um teste A/B formal -> nomeio `measure-my-marketing` (scope=ab-test). Precisa de trabalho de CTA -> nomeio `write-copy-variants` (job=ctas) como próximo passo.
9. **Escrever** atomicamente em `headline-variants/{page-slug}-{YYYY-MM-DD}.md` (`*.tmp` -> renomear). Banco de citações primeiro, depois as variantes com a citação de origem ao lado de cada uma.
10. **Anexar em `outputs.json`**  -  `{ id, type: "headline-variants", title, summary, path, status: "draft", createdAt, updatedAt }`.
11. **Resumir para você**  -  as 3 melhores variantes para testar, a dor que cada uma ataca, caminho do arquivo completo.

#### `ctas`

4. **Ler `config/primary-page.json`** para o evento de conversão principal. Se você nomeou outro botão / conversão, aceito + continuo.
5. **Identificar a superfície.** Pergunto (se não estiver claro) UMA pergunta: qual botão, qual página, qual etapa do fluxo. Uma colagem curta serve.
6. **Listar objeções.** Puxo as 3-5 principais objeções do documento de posicionamento (ou de `call-insights/` se existir). Se as objeções não estiverem documentadas, pergunto suas 2 principais ("O que faz os visitantes hesitarem neste botão?") + anoto na saída como "sinalizado pelo fundador".
7. **Redigir 5-7 variantes de CTA.** Cada uma:
   - Texto exato do botão (curto  -  2-5 palavras).
   - Objeção que responde (nomeada da lista acima).
   - Resultado sugerido (o que você ganha ao clicar).
   - Ângulo: puxado-pela-ação, puxado-pelo-resultado, reversão-de-risco, prova-social, microcompromisso, puxado-pela-especificidade, urgência.
   Nunca: "Enviar", "Clique aqui", "Saiba mais", "Começar" sem objeto.
8. **Classificar os 2 melhores para testar primeiro.** Com base em qual objeção é mais comum nas evidências + qual resultado o documento de posicionamento mais sustenta.
9. **Sinalizar o copy de apoio.** Anoto se o CTA precisa de uma linha de confiança abaixo ("Sem cartão de crédito" / "Cancele quando quiser") + se o texto está amarrado a uma política real (não inventar).
10. **Ganchos de passagem de bastão.** Se as variantes principais precisarem de teste A/B, nomeio `measure-my-marketing` (scope=ab-test).
11. **Escrever** atomicamente em `cta-variants/{page-slug}-{YYYY-MM-DD}.md` (`*.tmp` -> renomear).
12. **Anexar em `outputs.json`**  -  `{ id, type: "cta-variants", title, summary, path, status: "draft", createdAt, updatedAt }`.
13. **Resumir para você**  -  os 2 melhores CTAs, a objeção que cada um responde, caminho do arquivo completo.

#### `ad-copy`

4. **Ler a configuração:** `config/channels.json` (as restrições de formato variam por canal  -  Google RSA vs. Meta vs. LinkedIn). Nenhum canal nomeado, pergunto qual plataforma em uma pergunta.
5. **Montar o banco de citações.** 10-20 frases textuais, cada uma etiquetada como `pain` / `desire` / `objection` / `trigger`. Cito a fonte (ID da ligação / plataforma de avaliação / URL).
6. **Gerar as variantes.** Para a campanha / ângulo nomeados, produzo:
   - **Títulos**  -  10 variantes, cada uma fundamentada em uma citação específica (cito a etiqueta da citação ao lado de cada uma). Respeito os limites de caracteres da plataforma (Google RSA 30; Meta principal ~40; LinkedIn ~70).
   - **Descrições**  -  5 variantes, mesma regra de fundamentação.
   - **CTAs**  -  5 variantes.
   - **Conceitos criativos** (para posicionamentos visuais)  -  3 briefings curtos (direção de imagem + texto sobreposto), cada um amarrado ao ângulo.
7. **Classificar** as variantes pela força da hipótese: qual citação carrega a dor mais forte, qual ângulo o documento de posicionamento mais sustenta. Nomeio as 3 melhores para testar primeiro.
8. **Escrever** atomicamente em `ad-copy/{campaign-slug}.md` (`*.tmp` -> renomear). Formato: banco de citações primeiro, depois as variantes com a citação de origem ao lado de cada uma.
9. **Anexar em `outputs.json`**  -  `{ id, type: "ad-copy", title, summary, path, status: "draft", createdAt, updatedAt }`. Mesclar, escrita atômica.
10. **Resumir para você**  -  as 3 melhores variantes para testar, a dor que atacam, caminho do arquivo completo.

#### `edit`

4. **Coletar o copy de origem.** Você colou -> trabalho a partir da colagem. Você deu uma URL -> busco via qualquer raspador conectado no Composio (descubro o slug com `composio search`, executo pelo slug). Nada fornecido -> peço o copy ou a URL e paro.
5. **Rodar as varreduras** em ordem. Cada varredura é focada  -  sem multiplexar. Depois de cada uma, volto e confiro que as varreduras anteriores não foram comprometidas.
   - **Clareza**  -  frases confusas, pronomes ambíguos, jargão, ambiguidade, contexto faltando, frases fazendo coisa demais.
   - **Voz**  -  consistência com `config/voice.md`. Sinalizo as linhas onde a voz quebra (começou casual, virou corporativo; mudou de pessoa; etc.).
   - **Especificidade**  -  troco afirmações vagas por concretas. "Economiza tempo" -> "Corta o relatório semanal de 4 horas para 15 minutos." Números acima de adjetivos. Sem números seus -> marco `[NEEDS NUMBER]` no texto; nada de inventar.
   - **Comprimento**  -  mato o enchimento. "Com o objetivo de" -> "para". "Neste momento atual" -> "agora". Corto pontos de exclamação.
   - **CTAs**  -  troco CTAs fracos ("Enviar" / "Clique aqui" / "Saiba mais") por ação + resultado ("Começar meu teste grátis" / "Ver preços para o meu time"). Mudança estrutural -> entrego a `write-copy-variants` (job=ctas).
6. **Formato de saída.** Cada linha alterada -> três linhas:
   - **Atual** (textual).
   - **Proposta**.
   - **Porquê**  -  uma linha. Nomeio a varredura que pegou (clareza / voz / especificidade / comprimento / CTA).
7. **Preservar a mensagem central.** Precisa reescrever a ideia -> sinalizo, não sobrescrevo. Entrego essa seção a `write-my-page-copy`.
8. **Sinalizar contradições** com o documento de posicionamento em uma seção separada.
9. **Escrever** atomicamente em `copy-edits/{page-slug}-{YYYY-MM-DD}.md` (`*.tmp` -> renomear).
10. **Anexar em `outputs.json`**  -  `{ id, type: "copy-edit", title, summary, path, status: "draft", createdAt, updatedAt }`.
11. **Resumir para você**  -  quantidade de linhas alteradas, a única edição de maior alavancagem, caminho da revisão.

## O que eu nunca faço

- Inventar citações de clientes, estatísticas ou depoimentos para "fortalecer" uma linha. Não consigo apontar um título para uma citação específica ou uma linha do documento de posicionamento -> não escrevo.
- Escrever linguagem de marketeiro ("Plataforma revolucionária com IA") em nenhuma variante  -  vai para o lixo.
- Inventar linhas de confiança ("Sem cartão de crédito" só se for verdade).
- Usar CTAs genéricos sem objeto ("Enviar", "Clique aqui", "Saiba mais", "Começar" sem objeto).
- Prometer resultados que o produto não entrega.
- Reescrever a mensagem central na tarefa `edit`  -  isso é trabalho de `write-my-page-copy`.
- Alisar a sua voz até virar fala genérica de marketing.
- Enviar, postar, publicar ou colocar no ar  -  você lança cada artefato.

## Saídas

- `headline-variants/{page-slug}-{YYYY-MM-DD}.md` (job=headlines)
- `cta-variants/{page-slug}-{YYYY-MM-DD}.md` (job=ctas)
- `ad-copy/{campaign-slug}.md` (job=ad-copy)
- `copy-edits/{page-slug}-{YYYY-MM-DD}.md` (job=edit)
- Todas anexam em `outputs.json` com o `type` correspondente: `"headline-variants"` | `"cta-variants"` | `"ad-copy"` | `"copy-edit"`.

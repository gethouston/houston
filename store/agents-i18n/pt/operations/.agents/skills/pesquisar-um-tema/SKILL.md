---
name: pesquisar-um-tema
title: "Pesquisar um tema"
description: "Receba um briefing estruturado e com fontes citadas sobre um tema, uma empresa, uma pessoa ou seu feed social, em vez de precisar vasculhar tudo você mesmo. Me diga o que investigar e eu busco em provedores de notícias e pesquisa, classifico o que importa segundo suas prioridades, e escrevo um resumo executivo mais uma seção de 'o que isso significa para nós'. Cada afirmação vem acompanhada de uma URL de origem."
version: 1
category: Operações
featured: yes
image: clipboard
integrations: [linkedin, firecrawl, perplexityai]
---


# Pesquisar um tema

Três tipos de sinal, uma habilidade: notícias de mercado, pesquisa na web, monitoramento de feed social. Mantém o fundador atualizado sem precisar vasculhar feeds.

## Quando usar

- "briefing semanal sobre {tema}" / "o que está se movendo em {nossa categoria}".
- "pesquise {empresa} / {pessoa} / {produto} e me dê um resumo".
- "resuma meu feed do X" / "o que minha lista de seguidos postou".
- "quais são as notícias sobre {regulamentação / evento}".

## Conexões que eu preciso

Eu executo trabalho externo através do Composio. Antes desta habilidade rodar, eu verifico se as categorias abaixo estão conectadas. Faltando → eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Pesquisa na web** (Exa, Perplexity, Firecrawl) - Obrigatório. Extrai artigos e pesquisas com URLs de origem para toda afirmação ser citada.
- **Notícias** (NewsAPI ou equivalente) - Opcional. Adiciona um filtro de recência em cima da pesquisa.
- **Rede social / profissional** (LinkedIn, X) - Obrigatório para o modo `feed-digest`. Se você pedir um resumo do feed e nenhum provedor social estiver conectado, eu paro e peço para você conectar um.

Se nenhum provedor de pesquisa na web estiver conectado para briefings de tema ou entidade, eu paro e peço para você conectar um provedor de pesquisa primeiro.

## Informações que eu preciso

Eu leio o seu contexto operacional primeiro. Para cada campo obrigatório que estiver faltando, eu faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > arquivo enviado > URL > colar) e espero.

- **Tema, entidade ou feed** - Obrigatório. Por que eu preciso: a habilidade tem um único alvo por vez. Se estiver faltando, eu pergunto: "O que devo sintetizar, um tema, uma empresa ou pessoa específica, ou seu feed social?"
- **Prioridades ativas** - Obrigatório. Por que eu preciso: guia a seção 'o que isso significa para nós' em vez de notícias genéricas. Se estiver faltando, eu pergunto: "Quais são as 2 a 3 coisas que a empresa está priorizando neste trimestre?"
- **Contatos principais** - Opcional. Por que eu preciso: permite sinalizar posts de pessoas em quem você já confia como sinal de maior peso. Se você não tiver isso, eu sigo em frente com dado pendente usando só recência e autoridade.
- **Janela de tempo** - Opcional. Por que eu preciso: briefings semanais usam 7 dias por padrão, pesquisa aprofundada usa 30. Se você não tiver isso, eu sigo em frente com dado pendente usando esses padrões.

## Passos

1. **Leio `context/operations-context.md`.** A relevância se ancora nas prioridades ativas do fundador. Se estiver faltando: `set-up-my-ops-info` primeiro, paro.

2. **Classifico o pedido.**
   - **topic-brief** - "{tema}" (agentes de IA, precificação de SaaS vertical, etc.). Uso fontes de notícias + pesquisa.
   - **entity-brief** - empresa, pessoa ou produto nomeado. Foco pesado em pesquisa; também confiro notícias.
   - **feed-digest** - feed social monitorado pelo fundador (seguidores no X / LinkedIn / etc.). Precisa de provedor social conectado.

3. **Reúno o sinal conforme a classificação.**

   **topic-brief + entity-brief:**
   - `composio search research` → executo pelo slug com a consulta. Prefiro provedores que retornam URLs de origem (Exa, Perplexity).
   - `composio search news` → executo com janela de tempo (últimos 7 dias por padrão para semanal; últimos 30 para aprofundada).

   **feed-digest:**
   - `composio search social` → ferramenta list-home-timeline ou list-posts-by-list do provedor conectado.
   - Extraio posts da lista de seguidos do fundador na janela pedida.

4. **Filtro e classifico.**
   - Descarto duplicados e quase duplicados.
   - Sinalizo posts/artigos de Contatos Principais (do contexto operacional) como sinal de maior peso.
   - Classifico por: (a) relevância às prioridades ativas, (b) recência, (c) autoridade da fonte.

5. **Sintetizo o briefing estruturado.**

   Salvo em `signals/{slug}-{YYYY-MM-DD}.md`. Estrutura:

   - **Resumo executivo** - no máximo 3 tópicos, escaneável pelo fundador.
   - **O que se moveu** - subseções agrupadas por tema. Cada tópico: afirmação + URL de origem. Cito toda afirmação, sem alegações não citadas.
   - **Quem está tomando qual posição** - quando as fontes se contradizem, listo as posições e quem defende cada uma.
   - **O que isso significa para nós** - 2 a 3 itens: o que ameaça, o que abre porta, o que entra na próxima atualização para investidores/conselho.
   - **Fontes** - lista simples de URLs com descrições de uma linha, em ordem alfabética por domínio.

6. **Escritas atômicas** - `signals/{slug}-{YYYY-MM-DD}.md.tmp` → renomear.

7. **Adiciono a `outputs.json`** com `type: "signal"`, status "ready".

8. **Resumo para o usuário** - resumo executivo + o item de 'o que isso significa para nós' que mais merece ação.

## Saídas

- `signals/{slug}-{YYYY-MM-DD}.md`
- Adiciona a `outputs.json` com `type: "signal"`.

## O que eu nunca faço

- **Citar sem URL de origem.** Toda afirmação remete a um artigo ou post específico, sem "consenso do setor" vago.
- **Repostar citação** da lista de seguidos do fundador na rede social dele mesmo, essa habilidade de sinal é só leitura.
- **Marcar o briefing como pronto sem alertas de incerteza.** Afirmação de fonte única → sinalizo; fontes se contradizem → digo isso.

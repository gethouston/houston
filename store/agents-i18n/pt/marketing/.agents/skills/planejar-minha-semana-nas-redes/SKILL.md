---
name: planejar-minha-semana-nas-redes
title: "Planejar minha semana nas redes"
description: "Construo seu plano de publicações nas redes sociais para a semana. Preencho de segunda a sexta nas suas plataformas ativas com uma mistura de publicações originais, conteúdo reaproveitado e blocos de engajamento. Sem ângulos repetidos, sem enchimento genérico."
version: 1
category: Marketing
featured: yes
image: megaphone
integrations: [linkedin, twitter, reddit, youtube]
---


# Planejar minha semana nas redes

## Quando usar

- Usuário: "planeje as redes desta semana" / "calendário social" / "o que
  devo postar semana que vem" / "conteúdo para {platform} esta semana".
- Semanal, dá para virar rotina (segunda às 9h).

## Conexões que eu preciso

Faço o trabalho externo pelo Composio. Antes de rodar esta skill, verifico se as categorias abaixo estão conectadas. Se faltar alguma, digo qual é a categoria, peço que você conecte pela aba de Integrações e paro.

- **Redes sociais (LinkedIn, X, Reddit)**: as plataformas para as quais eu planejo os espaços. Obrigatório para as plataformas do seu mix ativo.
- **YouTube**: opcional, me permite puxar vídeos recentes como candidatos a reaproveitamento.

Se nenhuma das suas redes sociais ativas estiver conectada, eu paro e peço que você conecte pelo menos aquela em que você mais publica.

## Informações que eu preciso

Leio seu contexto de marketing primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Seu posicionamento**: obrigatório. Por que preciso: cada espaço tem que se conectar de volta à sua categoria e ao seu cliente ideal, não a conteúdo genérico. Se faltar, pergunto: "Quer que eu rascunhe seu posicionamento primeiro? É uma skill só, leva uns cinco minutos."
- **Sua voz**: obrigatório. Por que preciso: o calendário nomeia ângulos e ganchos, e eles precisam soar como você. Se faltar, pergunto: "Conecte sua caixa de enviados para eu amostrar sua voz, ou cole duas ou três coisas que você escreveu."
- **Suas plataformas ativas e temas**: obrigatório. Por que preciso: não vou planejar para plataformas em que você não publica. Se faltar, pergunto: "Em quais plataformas você publica, e por quais temas você quer que eu alterne?"
- **Cadência de publicação**: opcional, padrão LinkedIn 3 / X 5 / Reddit 2 por semana. Se faltar, pergunto: "Quantas publicações por semana por plataforma você quer mirar? Se você não tiver um número, sigo com o padrão."

## Passos

1. **Ler o doc de posicionamento**:
   `context/marketing-context.md`. Se estiver faltando ou
   vazio, paro e digo ao usuário para rodar `set-up-my-marketing-info` primeiro.

2. **Ler `config/platforms.json`, `config/voice.md`,
   `config/topics.json`, `config/calendar-cadence.json` (se existir).**
   Se `calendar-cadence.json` estiver faltando, faço uma pergunta direcionada:
   > "Quantas publicações por semana por plataforma você quer mirar?
   > Padrão: LinkedIn 3, X 5, Reddit 2. Vou gravar isso em
   > `config/calendar-cadence.json`."
   Capturo a resposta e continuo.

3. **Leitura entre agentes, candidatos a reaproveitamento.** Leio
   `outputs.json` (se existir). Filtro `type` em
   `blog-post`, `case-study`, `repurposed` criados nos últimos 14
   dias. Viram espaços candidatos (ex.: post de blog → destaque no
   LinkedIn, YouTube → thread no X). Arquivo faltando, pulo a
   etapa, sem erro.

4. **Determinar o intervalo da semana.** Padrão: próxima segunda a sexta (uso
   a semana ISO; a semana atual se for antes de quarta, a próxima se for de quarta em diante). Respeito
   o intervalo explícito do usuário.

5. **Montar o plano.** Para cada espaço de dia × plataforma:
   - Escolho o tema em `config/topics.json` (alternando entre os temas).
   - Escolho o formato: publicação original / thread / reaproveitamento / resposta /
     bloco de engajamento (15 min de leitura + comentário em 5 publicações).
   - Respeito a cadência de `config/calendar-cadence.json`.
   - Mix alvo: ~60% original, 20% reaproveitado, 20%
     engajamento / respostas.
   - Dica de horário (LinkedIn 8-10h local, X 11h / 16h, Reddit
     à noite). Anoto; não agendo.

6. **Gravar o detalhe da semana** em `social-calendars/{YYYY-WNN}.md`
   de forma atômica. Estrutura do arquivo:
   ```markdown
   # Social Calendar  -  {YYYY}-W{NN}

   **Range:** {Mon date} → {Fri date}
   **Cadence:** {from config}
   **Topics in rotation:** {list}

   ---

   ## Monday

   - **LinkedIn  -  original** · topic: {slug} · angle: {one-line} ·
     suggested skill: `draft-linkedin-post`
   - **X  -  engagement block (15 min)** · comment on 5 posts from
     {handles / hashtags}
   ...

   ## Tuesday
   ...

   (Fri)

   ---

   ## Repurpose candidates pulled from SEO
   - {title} ({type}, created {date}) → {target platform + format}
   ```

7. **Anexar uma seção curta de resumo** (mais recente no topo) ao documento vivo
   `social-calendar.md` na raiz do agente. Estrutura:
   ```markdown
   ## Week {YYYY}-W{NN}  -  {Mon date} to {Fri date}
   - LinkedIn: {N} originals + {M} engagement blocks
   - X: {N} threads + {M} replies
   - Reddit: {N} replies
   - Repurpose: {N} candidates pulled
   - Full detail: [social-calendars/{YYYY-WNN}.md](social-calendars/{YYYY-WNN}.md)
   ```
   Leio o arquivo existente, insiro no início (sem sobrescrever), gravação atômica.

8. **Anexar a `outputs.json`**: nova entrada, `type:
   "social-calendar"`, `title: "Social calendar  -  {YYYY-WNN}"`,
   `path: "social-calendars/{YYYY-WNN}.md"`, `status: "draft"`.

9. **Resumir para o usuário**: um parágrafo: intervalo da semana, total de
   espaços por plataforma, incentivo: "Quer que eu rascunhe algum desses
   agora? Diga `rascunhe o LinkedIn de segunda a partir do calendário`."

## Saídas

- `social-calendars/{YYYY-WNN}.md`
- Anexa a seção da semana em `social-calendar.md` (documento vivo).
- Anexa a `outputs.json` com `{ id, type: "social-calendar",
  title, summary, path, status: "draft", createdAt, updatedAt }`.

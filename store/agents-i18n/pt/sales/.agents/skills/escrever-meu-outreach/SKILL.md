---
name: escrever-meu-outreach
title: "Escrever meu outreach"
description: "Redijo o outreach que você precisar: um e-mail frio fundamentado, um roteiro de ligação fria de sessenta segundos, um acompanhamento pós call, uma resposta a um lead inbound, uma nota de renovação, ou um e-mail para salvar uma conta em risco de cancelar. Cada rascunho imita o tom da sua caixa de enviados, se ancora no seu playbook, e fica em um arquivo até você copiar e enviar."
version: 1
category: Vendas
featured: yes
image: handshake
integrations: [googlecalendar, gmail, outlook, hubspot, salesforce, attio, pipedrive, gong, fireflies, stripe]
---


# Escrever Meu Outreach

Uma skill, todas as superfícies de outreach. O parâmetro `stage` escolhe o formato; tom compatível com sua voz, prova honesta, disciplina de "nunca inventar citação" compartilhada.

## Parâmetro: `stage`

- `cold-email` - e-mail fundamentado de primeiro contato (3 parágrafos curtos no máximo): sinal de gatilho citado → dor específica → um pedido em uma linha. Substitui o e-mail genérico "quem cuida de X".
- `cold-script` - roteiro de ligação fria de 60 a 90 segundos: abertura, quebra de padrão, 2 perguntas de descoberta, CTA suave, cilada a evitar.
- `followup` - e-mail de recapitulação pós call + próximo passo confirmado, na sua voz. Puxa a análise da call de `calls/{slug}/`.
- `inbound-reply` - classifica o inbound como `interested` / `asking-question` / `objection` / `not-now` / `unsubscribe`, redige a resposta certa. Sinaliza spam / pessoa errada de forma limpa.
- `renewal` - reúne resultados entregues, alavancas de expansão, raciocínio de preço em um rascunho de renovação. Nunca compromete preço fora do playbook.
- `churn-save` - salvamento sem postura defensiva. Nomeia o sinal específico (downgrade, queda de uso, escalonamento de suporte), oferece uma solução concreta, propõe um próximo passo com data. Sem culpa, sem escassez falsa.

Você nomeia o estágio em linguagem simples ("e-mail frio", "roteiro de ligação", "acompanhamento", "resposta", "nota de renovação", "e-mail de salvamento") → eu infiro. Se ambíguo, faço UMA pergunta nomeando as 6 opções.

## Quando usar

- Explícito: qualquer frase gatilho na descrição.
- Implícito: dentro de `check-my-sales subject=discovery-call` (a análise termina com um acompanhamento redigido), dentro de `score-my-pipeline subject=customer-health` (vermelho → churn-save), dentro de `manage-my-crm action=route` (inbound interessado → cold-email ou followup).

## Conexões de que preciso

Eu rodo trabalho externo pelo Composio. Antes desta skill rodar, verifico se as categorias abaixo estão conectadas. Faltando, nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Caixa de entrada** - amostrar seus e-mails enviados para aprender sua voz. Obrigatório para todo estágio no formato de e-mail.
- **CRM** - ler o contexto do negócio (responsável, estágio, último contato) para `followup`, `renewal`, `churn-save`. Obrigatório para esses estágios.
- **Calendário** - sugerir horários de reunião em `inbound-reply`. Opcional.
- **Scrape / Busca** - busca de sinal recente para `cold-email`. Obrigatório para esse estágio.
- **Reuniões** - puxar transcrições de call para fundamentar `followup`. Opcional.
- **Faturamento** - puxar sinal de downgrade ou cancelamento do Stripe para `churn-save`. Opcional.

Se nenhuma das categorias obrigatórias estiver conectada, paro e peço para você conectar sua caixa de entrada primeiro, já que a compatibilidade de voz fundamenta todo rascunho.

## Informações de que preciso

Leio seu contexto de vendas primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Seu playbook de vendas** - Obrigatório. Por que preciso: a postura de preços, o manual de objeções, o objetivo principal da primeira call e o perfil de cliente ideal fundamentam o rascunho. Se faltando, pergunto: "Eu ainda não tenho seu playbook, quer que eu redija ele agora?"
- **Amostras de voz** - Obrigatório para todo estágio no formato de e-mail. Por que preciso: os rascunhos soam como você, não como um modelo genérico. Se faltando, pergunto: "Conecte sua caixa de entrada para eu ler seus últimos 30 e-mails enviados, ou cole de 3 a 5 e-mails que você escreveu recentemente."
- **O lead, negócio ou cliente alvo** - Obrigatório. Por que preciso: todo rascunho é fundamentado em uma pessoa específica. Se faltando, pergunto: "Para quem é este rascunho, qual prospect, negócio ou cliente?"
- **CRM conectado** - Obrigatório para `followup`, `renewal`, `churn-save`. Por que preciso: puxo o estágio do negócio, o responsável e o último contato. Se faltando, pergunto: "Conecte seu CRM (HubSpot, Salesforce, Attio, Pipedrive ou Close), ou cole o contexto do negócio."
- **Faturamento conectado** - Opcional, útil para `churn-save`. Por que preciso: ancoro o salvamento no sinal real de downgrade ou cancelamento. Se você não tiver isso, sigo em frente com TBD e peço para você descrever o sinal.

## Passos

1. **Ler o registro + o playbook.** Reunir os campos obrigatórios que faltam conforme acima (uma pergunta cada, melhor modalidade primeiro). Escrever de forma atômica.

2. **Ramificar por estágio.**
   - `cold-email`: rodar busca de sinal recente (notícias recentes, vagas abertas, captação de investimento, lançamento de produto) via slugs de scrape / busca descobertos pelo Composio. Escolher o ÚNICO sinal mais forte. Abrir com a linha de sinal específica (não "espero que este e-mail te encontre bem"). Redigir 3 parágrafos curtos: sinal → dor específica (do playbook, fundamentada no perfil de cliente ideal) → um pedido em uma linha. Assunto cita o sinal. Máximo de 110 palavras no corpo. Salvar em `outreach/email-{lead-slug}-{YYYY-MM-DD}.md`.
   - `cold-script`: dossiê de `leads/{slug}/` (ou perguntar). Estrutura: **Abertura** (15s, motivo da ligação), **Quebra de padrão** (uma observação específica única deles), **Descoberta** (2 perguntas ligadas ao pilar de qualificação mais fraco para o segmento, conforme o playbook), **CTA suave** (link de agenda, 15 min na próxima semana), **Cilada a evitar** (uma coisa de `call-insights/` sinalizada como padrão de perda). Salvar em `outreach/script-{lead-slug}-{YYYY-MM-DD}.md`.
   - `followup`: ler o `calls/{deal-slug}/notes-*.md` e `analysis-*.md` mais recentes. Assunto: "Re: {a dor deles, nas palavras deles}". Corpo: confirmar que ouvimos eles → 2 a 3 tópicos respondendo a objeção declarada / pergunta em aberto → próximo passo com data específica. Compatível com a voz. Salvar em `deals/{deal-slug}/followup-{YYYY-MM-DD}.md` E espelhar em `outreach/email-{deal-slug}-{date}.md` para o índice de outreach.
   - `inbound-reply`: ler a resposta colada ou puxada pelo Composio. Classificar (interested / asking-question / objection / not-now / unsubscribe / spam). `interested` → redigir resposta de agendamento com 2 a 3 sugestões de horário (puxar do Google Calendar se conectado). `asking-question` → responder embutido se o playbook cobrir; senão, sinalizar para você. `objection` → encadear para `handle-an-objection`. `not-now` → redigir nota educada de "retomar em {N} semanas". `unsubscribe` / `spam` → enfileirar a ação certa no CRM via `manage-my-crm action=queue-followup` e parar. Salvar em `outreach/inbound-reply-{lead-slug}-{YYYY-MM-DD}.md`.
   - `renewal`: ler o histórico de `customers/{slug}/` (plano de onboarding, QBRs, pontuações de saúde). Estrutura: resultados entregues (números da definição de métrica de sucesso do playbook) → alavancas de expansão (padrões de pedido de recurso, sinal de crescimento da equipe) → raciocínio de preço (do playbook, nunca comprometer). Terminar com próximo passo datado. Salvar em `customers/{slug}/renewal-{YYYY-MM-DD}.md`.
   - `churn-save`: ler o sinal de downgrade / cancelamento / queda de uso (do Stripe via Composio, ou colado). Estrutura: nomear o sinal específico literalmente → uma solução concreta (pausa, downgrade adicional, ajuda personalizada, reembolso, opção genuína correspondente ao sinal, não as quatro juntas) → próximo passo proposto com data. Sem culpa, sem escassez falsa. Salvar em `customers/{slug}/save-{YYYY-MM-DD}.md`.

3. **Checagem de voz.** Antes de finalizar, comparar com `config/voice.md`: tamanho de frase, hábito de saudação, hábito de encerramento, frases proibidas. Reescrever linhas que destoarem.

4. **Checar contra o playbook.** Qualquer alegação sobre preço, cronograma, contas âncora precisa corresponder a `context/sales-context.md`. Nenhum compromisso fora da postura de preços. Nenhum nome de cliente inventado.

5. **Adicionar ao `outputs.json`** - leitura-mesclagem-escrita atômica: `{ id (uuid v4), type: "outreach", title: "{Stage} - {target}", summary: "<linha de assunto + próximo passo>", path, status: "draft", createdAt, updatedAt, domain: "<outbound | inbound | retention>"}`. Domínio: `cold-email` + `cold-script` → `outbound`; `inbound-reply` → `inbound`; `followup` → `meetings`; `renewal` + `churn-save` → `retention`.

6. **Resumir para você.** Linha de assunto + próximo passo embutidos. Caminho para o rascunho completo. Explícito: "Eu nunca envio, copie do arquivo ou abra sua caixa de entrada para enviar."

## O que eu nunca faço

- Enviar, postar, agendar. Todo rascunho fica em arquivo até você copiar.
- Inventar citação de cliente, métrica, alegação sobre concorrente. Fonte rasa → marcar `TBD - {o que trazer}` e perguntar.
- Comprometer preço fora da postura de preços do playbook, sinalizar exceção com `FLAG: precisa de aprovação`.
- Usar culpa, escassez falsa, padrões obscuros em `churn-save` / `renewal`.
- Fixar nomes de ferramentas no código, descoberta pelo Composio só em tempo de execução.

## Saídas

- `outreach/{channel}-{slug}-{YYYY-MM-DD}.md` onde `channel` = `email` (cold-email, followup, inbound-reply) / `script` (cold-script).
- `followup`: espelha em `deals/{slug}/followup-{date}.md`.
- `renewal` / `churn-save`: escreve em `customers/{slug}/`.
- Adiciona ao `outputs.json` com `type: "outreach"`.

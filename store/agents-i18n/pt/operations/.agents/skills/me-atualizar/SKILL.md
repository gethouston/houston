---
name: me-atualizar
title: "Me atualizar"
description: "Receba o resumo que você precisa para chegar preparado ao seu dia ou à sua reunião. Escolha o que você precisa: um resumo diário que reúne sua caixa de entrada, seu calendário, seu chat e seus documentos recentes no plano de hoje; uma leitura prévia detalhada para os participantes de uma próxima reunião com a pauta e os possíveis pedidos; ou notas pós-reunião que transformam uma transcrição em decisões, responsáveis e próximos passos."
version: 1
category: Operações
featured: yes
image: clipboard
integrations: [googledrive, googlecalendar, gmail, outlook, gong, fireflies, slack, linkedin]
---


# Me Atualizar

Um primitivo para resumos de ritmo diário que ancoram a semana. Você escolhe o `mode`; eu agrego, priorizo, escrevo.

## Quando usar

- `mode=daily` - "resumo da manhã" / "o que precisa de mim hoje" / "aqui está meu despejo de ideias" / "o resumo de hoje".
- `mode=meeting-pre` - "me prepare para minha reunião das 14h" / "resumo detalhado para minha reunião com {X}" / "monte uma leitura prévia para mim".
- `mode=meeting-post` - "notas pós-reunião da minha última gravação" / "resuma a chamada que acabei de ter com {X}".

## Conexões que preciso

Executo trabalho externo através do Composio. Antes de esta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar alguma, nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Caixa de entrada** (Gmail, Outlook) - Obrigatório. Puxa as conversas das últimas 24h para o resumo diário e conversas anteriores para a preparação de reuniões.
- **Agenda** (Google Calendar, Outlook) - Obrigatório. Lê as reuniões de hoje e resolve para qual delas se preparar.
- **Chat da equipe** (Slack) - Opcional. Adiciona o sinal do chat ao resumo diário; pulado se não estiver conectado.
- **Arquivos** (Google Drive) - Opcional. Mostra a atividade recente de documentos no resumo diário.
- **Gravador de reuniões** (Fireflies, Gong) - Obrigatório para `mode=meeting-post`. Se não estiver conectado, aceito uma transcrição colada em vez disso.
- **Pesquisa na web** (LinkedIn, Exa) - Opcional. Preenche as biografias dos participantes para a preparação de reuniões.

Se nem a caixa de entrada nem a agenda estiverem conectadas, paro e peço para você conectar sua agenda primeiro.

## Informações que preciso

Leio o seu contexto operacional primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Documento de contexto operacional** - Obrigatório. Por que preciso: ancora prioridades, VIPs e limites inegociáveis para que eu não invente nada. Se faltar, pergunto: "Quer que eu configure seu contexto operacional primeiro? Leva alguns minutos e cada resumo fica mais afiado depois."
- **Seu fuso horário** - Obrigatório. Por que preciso: mantém o resumo dentro do seu horário de trabalho. Se faltar, pergunto: "Em qual fuso horário você trabalha na maior parte do tempo?"
- **Quem são seus VIPs** - Obrigatório para a preparação de reuniões. Por que preciso: molda o quão a fundo eu pesquiso um participante. Se faltar, pergunto: "Quem são as pessoas cujas reuniões sempre merecem preparação extra, investidores, clientes-chave, alguém mais?"
- **Horário de entrega do resumo** - Opcional. Por que preciso: permite que o resumo se dispare automaticamente na hora certa. Se você não tiver isso, sigo em frente com TBD e rodo sob demanda.

## Parâmetro: `mode`

- `daily` - agrega as últimas 24h da caixa de entrada (Gmail / Outlook), agenda (Google Calendar / Outlook), chat da equipe (Slack), atividade recente do drive (Google Drive) no plano de hoje. Escreve `briefs/{YYYY-MM-DD}.md`.
- `meeting-pre` - inteligência aprofundada dos participantes para UMA próxima reunião: biografia, cargo, conversas de e-mail anteriores, atividade pública recente, histórico compartilhado, pauta sugerida, o que provavelmente vão querer. Escreve `meetings/{YYYY-MM-DD}-{slug}-pre.md`.
- `meeting-post` - transcrição (Fireflies / Gong) → decisões + responsáveis + próximos passos + citações literais que vale a pena guardar. Escreve `meetings/{YYYY-MM-DD}-{slug}-post.md`.

## Passos

1. Leio `config/context-ledger.json`. Campo obrigatório faltando para o modo escolhido → faço UMA pergunta direcionada com dica de modalidade, escrevo a resposta.

2. Leio `context/operations-context.md`. Se faltar ou estiver vazio → paro, peço para rodar `set-up-my-ops-info` primeiro, nunca invento prioridades, VIPs, limites inegociáveis.

3. Ramifico conforme `mode`:

   **Se `mode = daily`:**
   - Detecto o submodo de despejo de ideias: mais de 100 palavras coladas com conteúdo de tarefas → analiso o despejo como entrada principal; senão rodo a agregação padrão.
   - Puxo dados das últimas 24h via Composio: caixa de entrada (`composio search inbox` / `gmail`), agenda (`googlecalendar`), chat da equipe (`slack`), edições do drive (`googledrive`). Categoria não conectada → pulo a seção, nomeio explicitamente.
   - Produzo o resumo: Urgências (até 3, verbo + objeto), Reuniões de hoje (preparação em uma linha), O que mudou durante a noite, Pode esperar (adiamento padrão), O próximo movimento.
   - Submodo de despejo de ideias: agrupo em urgente / estratégico / operacional / ideias futuras / pessoal; verificação de realidade da agenda; 2-3 escolhas estratégicas fundamentadas nas prioridades ativas do contexto operacional; candidatos a delegação.

   **Se `mode = meeting-pre`:**
   - Resolvo a reunião alvo (por ID, ou pela melhor correspondência na agenda se você disse "minha reunião das 14h").
   - Para cada participante externo, puxo: conversas de e-mail recentes (busca na caixa de entrada), atividade pública (busca na web / LinkedIn via Composio), histórico compartilhado (reuniões e e-mails passados).
   - Redijo uma pauta sugerida refletindo o que provavelmente vão querer, com base no histórico de conversas + nas prioridades do meu `context/operations-context.md`.
   - Destaco UMA coisa para não esquecer.

   **Se `mode = meeting-post`:**
   - Puxo a transcrição do gravador de reuniões conectado (Fireflies / Gong). Se não estiver conectado, aceito uma transcrição colada.
   - Extraio decisões tomadas, responsáveis + datas por próximo passo, perguntas em aberto, de 2 a 4 citações literais que vale a pena guardar.
   - Sinalizo qualquer coisa que mereça rodar `log-a-decision` (não rodo diretamente, apenas mostro o candidato).

4. Escrevo de forma atômica (`.tmp` depois renomear). Se já existir um resumo hoje → adiciono `-v2`, `-v3` (reatualizações acontecem).

5. Adiciono a `outputs.json` com `{id, type, title, summary, path, status, createdAt, updatedAt, domain: "planning" ou "people"}`. Type `"brief"` para `daily`, `"meeting-prep"` para `meeting-pre`, `"meeting-notes"` para `meeting-post`.

6. Resumo para você no chat: a linha "próximo movimento" (diário), ou os 3 principais itens da pauta + a coisa para não esquecer (meeting-pre), ou decisões + responsáveis pendentes (meeting-post).

## Saídas

- `briefs/{YYYY-MM-DD}.md` (ou `briefs/{YYYY-MM-DD}-dump.md` para o submodo de despejo de ideias).
- `meetings/{YYYY-MM-DD}-{slug}-pre.md` ou `meetings/{YYYY-MM-DD}-{slug}-post.md`.
- Adiciona a `outputs.json`.

## O que eu nunca faço

- Enviar uma mensagem para fora durante o resumo, sinalizo a conversa que precisa de resposta → o rascunho é feito em `draft-a-message type=reply`.
- Inventar o cargo, histórico ou preferência de um participante, pesquisa insuficiente → marco como TBD.
- Mexer no estado da caixa de entrada (sem arquivar, sem etiquetar, sem marcar como lido), somente leitura.

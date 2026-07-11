---
name: organizar-minha-caixa-ou-agenda
title: "Organizar minha caixa ou agenda"
description: "Corte caminho na sua caixa de entrada ou na sua agenda para saber o que realmente precisa de você hoje. Escolha o que você precisa: uma triagem de caixa de entrada que organiza as últimas 24 horas em precisa-de-mim-hoje, pode-esperar e ignorar, com uma ação específica de verbo mais objeto para cada conversa; ou uma varredura de agenda que sinaliza compromissos sobrepostos, folgas faltando, conflitos com blocos de foco, horários VIP desprotegidos e reuniões sem preparo nos próximos 7 dias."
version: 1
category: Operações
featured: yes
image: clipboard
integrations: [googlecalendar, gmail, outlook]
---


# Organizar Minha Caixa ou Agenda

Classificar + ranquear duas superfícies toda semana: caixa de entrada, agenda. Nunca redigir respostas (isso é `draft-a-message`), nunca editar eventos (isso é `book-a-meeting`).

## Quando usar

- `surface=inbox`  -  "organize minha caixa de entrada" / "o que tem no meu email" / "resuma minha caixa de entrada" / "resumo da caixa de entrada".
- `surface=calendar`  -  "escaneie minha agenda" / "encontre conflitos" / "como está minha semana" / "reequilibre minha semana".

## Conexões que eu preciso

Eu executo trabalho externo através do Composio. Antes desta skill rodar eu verifico se as categorias abaixo estão conectadas. Faltando → eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Caixa de entrada** (Gmail, Outlook)  -  Obrigatório para `surface=inbox`. Puxa as conversas das últimas 24h para eu classificar e ranquear.
- **Agenda** (Google Calendar, Outlook)  -  Obrigatório para `surface=calendar`. Lê os próximos 7 dias em busca de conflitos e horários desprotegidos.

Se você pedir triagem de caixa de entrada e nenhuma caixa estiver conectada, eu paro e peço para você conectar sua caixa de entrada primeiro. O mesmo para agenda.

## Informações que eu preciso

Eu leio primeiro o seu contexto operacional. Para cada campo obrigatório que estiver faltando eu faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Documento de contexto operacional**  -  Obrigatório. Por que preciso: ancora prioridades, contatos chave, vetos, para que eu ranqueie o que realmente importa. Se faltando eu pergunto: "Quer que eu configure seu contexto operacional primeiro? A triagem fica mais precisa depois disso."
- **VIPs**  -  Obrigatório. Por que preciso: VIPs sobem ao topo da caixa de entrada e disparam alertas de horário desprotegido na agenda. Se faltando eu pergunto: "Quem são as pessoas cujas conversas sempre precisam de resposta no mesmo dia  -  investidores, clientes chave, mais alguém?"
- **Blocos de foco**  -  Obrigatório para `surface=calendar`. Por que preciso: sinalizo reuniões que invadem seu tempo de trabalho profundo. Se faltando eu pergunto: "Quando são seus blocos de foco protegidos  -  dias específicos, horários específicos?"
- **Máximo de reuniões por dia**  -  Obrigatório para `surface=calendar`. Por que preciso: define o alerta de sobrecarga. Se faltando eu pergunto: "O que é um dia normal-ocupado versus um dia sobrecarregado para você, em número de reuniões?"
- **Seu fuso horário**  -  Obrigatório. Por que preciso: leio as janelas no seu horário, não em UTC. Se faltando eu pergunto: "Em qual fuso horário você trabalha na maior parte do tempo?"

## Parâmetro: `surface`

- `inbox`  -  classifica as conversas das últimas 24h (ou janela customizada) em `needs-me-today` / `can-wait` / `ignore`, ranqueia o balde principal por urgência, indica a ação de verbo mais objeto por conversa. Escreve `triage/{YYYY-MM-DD}.md`.
- `calendar`  -  escaneia os próximos 7 dias em busca de compromissos sobrepostos, folgas faltando, conflitos com blocos de foco, horários VIP desprotegidos, reuniões sem preparo. Escreve `calendar-scans/{YYYY-MM-DD}.md` + atualiza `calendar-conflicts.json`.

## Passos

1. Ler `config/context-ledger.json`. Preencher lacunas com UMA pergunta objetiva.
2. Ler `context/operations-context.md`. Faltando: parar, pedir para eu rodar `set-up-my-ops-info` primeiro  -  não inventar prioridades.
3. Ramificar em `surface`:

   **Se `surface = inbox`:**
   - Puxar conversas pela caixa de entrada conectada (Gmail / Outlook via Composio). Janela padrão: últimas 24 horas. Incluir remetente, assunto, primeiros 200 caracteres da última mensagem, se é resposta a algo que eu enviei.
   - Classificar cada conversa:
     - `needs-me-today`  -  alguém esperando por mim, decisão vencendo até o fim do dia, ou remetente nos Contatos Chave.
     - `can-wait`  -  legítima mas não urgente. Anotar o adiamento padrão ("esperar o próximo retorno deles" / "agrupar na sexta" / "passar para `draft-a-message type=reply`").
     - `ignore`  -  newsletters, prospecção fria, recibos, notificações automáticas.
   - Ranquear o balde `needs-me-today`: irreversível-se-perdido > cliente-em-apuros > investidor-pendente > o resto.
   - Por conversa, escrever a ação de verbo + objeto ("responder com a página de preços", "encaminhar para Operações de Fornecedores para decisão de renovação", "recusar  -  não é o cliente ideal", "delegar para {contato}"). Nunca "revisar."

   **Se `surface = calendar`:**
   - Puxar os próximos 7 dias pela agenda conectada (`googlecalendar` / `outlook`). Incluir participantes, descrições, durações, início/fim no seu fuso horário.
   - Sinalizar cada classe de conflito: sobreposição (2 eventos no mesmo horário), sem-folga (compromissos consecutivos com menos de 5 min entre eles), conflito com bloco de foco (reunião dentro de um bloco de foco declarado), horário VIP desprotegido (tempo com VIP sem evento de preparo ou descrição vazia), reunião sem preparo (participantes externos + sem pauta na descrição + sem briefing prévio em `meetings/`).
   - Ranquear por severidade (sobreposição > VIP-desprotegido > conflito-de-foco > sem-folga > sem-preparo).

4. Escrever de forma atômica (`.tmp` depois renomear). Segunda passagem no mesmo dia vira `{date}-{HH}.md`.
5. Adicionar a `outputs.json` com `{id, type, title, summary, path, status, createdAt, updatedAt, domain: "people"}`. Type = `"triage"` (caixa de entrada) ou `"calendar-scan"` (agenda).
6. Resumir para você: contagem por balde + ação principal (caixa de entrada), ou pior conflito + correção (agenda).

## Saídas

- `triage/{YYYY-MM-DD}.md` (caixa de entrada)
- `calendar-scans/{YYYY-MM-DD}.md` + atualiza `calendar-conflicts.json` (agenda)
- Adiciona a `outputs.json`.

## O que eu nunca faço

- Redigir, enviar, arquivar, marcar, favoritar, marcar-como-lido qualquer coisa  -  somente leitura. Redigir = `draft-a-message`.
- Criar, mover, cancelar eventos da agenda  -  isso é `book-a-meeting`.
- Inventar urgência  -  se o estado de uma conversa não estiver claro, mostrar em `needs-me-today` com uma pergunta para você, sem fabricar prazo.

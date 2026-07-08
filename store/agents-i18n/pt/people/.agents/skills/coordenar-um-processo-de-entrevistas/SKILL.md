---
name: coordenar-um-processo-de-entrevistas
title: "Coordenar um processo de entrevistas"
description: "Agendo o processo de entrevistas de um candidato: encontro horários que funcionem para todo o painel, redijo um resumo para cada entrevistador e te entrego o cronograma para você confirmar. Eu nunca envio os convites, isso é você quem faz."
version: 1
category: Pessoas
featured: no
image: busts-in-silhouette
integrations: [googlecalendar, outlook, loops]
---


# Coordenar um processo de entrevistas

## Quando usar

- Explícito: "agende o processo de {candidate}", "coordene o painel para {candidate}", "organize as entrevistas de {candidate}", "marque o processo".
- Pré-requisito: registro do candidato existir + ter passado pela triagem.
- Uma chamada por processo de entrevistas de candidato.

## Conexões de que preciso

Executo trabalho externo através do Composio. Antes de esta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar alguma → eu nomeio a categoria, peço para você conectá-la na aba Integrações, e paro.

- **Calendário (Google Calendar, Outlook)** - ler disponibilidade e redigir convites. Obrigatório.
- **Caixa de entrada (Gmail, Outlook, Loops)** - redigir o contato com o candidato com o cronograma proposto. Opcional.

Se o seu calendário não estiver conectado, eu paro e peço para você conectá-lo na aba Integrações.

## Informações de que preciso

Leio primeiro o seu contexto de pessoas. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Registro do candidato** - Obrigatório. Por que preciso: não agendo um processo para um candidato que eu nunca vi. Se faltar, peço: "Faça primeiro uma triagem desse candidato, para eu saber que ele passou pela primeira etapa."
- **Painel** - Obrigatório. Por que preciso: preciso de nomes e e-mails para checar disponibilidade. Se faltar, pergunto: "Quem está no painel? Compartilhe nomes ou endereços de e-mail."
- **Janela alvo** - Obrigatório. Por que preciso: não consigo buscar disponibilidade sem isso. Se faltar, pergunto: "Qual é a janela que estamos mirando, por exemplo, terça a quinta à tarde da semana que vem?"
- **Duração por entrevista** - Obrigatório. Por que preciso: molda os horários que eu procuro. Se faltar, pergunto: "Quanto tempo dura cada entrevista, 30, 45 ou 60 minutos?"
- **Fuso horário** - Obrigatório quando o painel está em regiões diferentes. Por que preciso: evita surpresas de reunião às 6 da manhã. Se faltar, pergunto: "Qual fuso horário devo usar como referência para o processo?"

## Passos

1. **Ler o documento de contexto de pessoas** em `context/people-context.md`. Se estiver ausente/vazio, digo ao usuário: "Primeiro preciso do seu contexto de pessoas, rode a habilidade configurar-minhas-informacoes-de-pessoas." Paro.
2. **Ler o registro do candidato** em `candidates/{candidate-slug}.md`. Se estiver ausente, digo ao usuário para rodar `screen-resume` ou `score-candidate` primeiro. Paro.
3. **Pergunto painel + janela** se não foram dados, UMA pergunta: "Quem está no painel (e-mails ou nomes) e qual é a janela alvo (por exemplo, 'terça a quinta à tarde da semana que vem')? Também, qual a duração esperada por entrevista (30 / 45 / 60 min)?"
4. **Descubro a ferramenta de calendário via Composio.** Rodo `composio search calendar` para achar o slug do calendário (Google Calendar / Outlook). Nenhum calendário conectado → digo ao usuário qual categoria conectar em Integrações. Paro.
5. **Verifico disponibilidade.** Executo o slug da ferramenta para buscar a disponibilidade de cada integrante do painel + do candidato (se a disponibilidade for compartilhada). Encontro horários sem conflito dentro da janela alvo que caibam na duração. Destaco conflitos explicitamente.
6. **Proposta de cronograma.** Organizo o processo como um bloco de entrevistas consecutivas ou espaçadas, uma por integrante do painel, cada uma com início / fim / fuso horário propostos. Se o candidato precisar de pausas, eu as adiciono.
7. **Rascunho os convites (nunca envio).** Por horário, redijo o texto do convite: título, participantes, duração, local / link de vídeo (a preencher), descrição (1 a 2 frases ligando à vaga + ao foco do entrevistador). Salvo os rascunhos ali mesmo, sem nenhuma ação de `send` / `create_event` sem confirmação explícita do fundador.
8. **Rodo `prep-an-interviewer` para cada integrante do painel.** Chamo uma vez por entrevistador para que cada resumo seja anexado a `interview-loops/{candidate-slug}.md`.
9. **Escrevo o bloco do cronograma.** Anexo uma seção datada `## Processo agendado - {YYYY-MM-DD}` a `interview-loops/{candidate-slug}.md` com a tabela do cronograma proposto, os convites em rascunho, os conflitos sinalizados. Escrita atômica (`*.tmp` → renomear).
10. **Anexo em `outputs.json`** → `{ id, type: "loop-scheduled", title, summary, path: "interview-loops/{candidate-slug}.md", status: "draft", createdAt, updatedAt }`, escrita atômica.
11. **Resumo para o usuário** → um parágrafo: cronograma proposto, conflitos sinalizados, lembrete de que os convites são rascunhos, caminho do arquivo do processo. Termino com: "Responda `enviar convites` depois de revisar e eu executo a alteração no calendário."

## Nunca invento

- Nunca envio convite de calendário sem aprovação explícita do fundador. Só rascunhos.
- Nunca invento disponibilidade de um integrante do painel, se a disponibilidade estiver ilegível (calendário privado, sem conexão) → destaco e peço para o usuário confirmar manualmente.
- Nunca deduzo o fuso horário; pergunto se não estiver claro.

## Resultados

- `interview-loops/{candidate-slug}.md` - cronograma + convites anexados. Resumos por entrevistador anexados via `prep-an-interviewer`.
- Anexos em `outputs.json` com tipo `loop-scheduled`.

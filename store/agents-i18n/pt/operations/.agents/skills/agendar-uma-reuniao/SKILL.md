---
name: agendar-uma-reuniao
title: "Agendar uma reunião"
description: "Consiga marcar uma reunião sem que a troca de mensagens consuma sua semana. Eu proponho três horários que respeitam seus blocos de foco, seu limite diário de reuniões e suas folgas entre compromissos, redijo a mensagem para a outra parte na sua voz, ajusto conforme as respostas, e só crio o evento depois que você disser explicitamente para agendar."
version: 1
category: Operações
featured: no
image: clipboard
integrations: [googlecalendar, gmail, outlook]
---


# Agendar Uma Reunião

## Quando usar

- "agende uma reunião com {X}" / "encontre 30 min com {equipe}".
- "vamos marcar {Y}" / "proponha horários para {Z}".
- Repasse de `triage-a-surface` (surface=inbox) quando a conversa for classificada como `book-a-meeting` e você disser "agende."

## Conexões que preciso

Executo trabalho externo através do Composio. Antes de esta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar alguma, nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Agenda** (Google Calendar, Outlook) - Obrigatório. Lê sua disponibilidade e cria o evento depois que você aprovar.
- **Caixa de entrada** (Gmail, Outlook) - Opcional. Me permite salvar a proposta como rascunho para você enviar.

Se nenhuma agenda estiver conectada, paro e peço para você conectar sua agenda primeiro.

## Informações que preciso

Leio o seu contexto operacional primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > envio de arquivo > URL > colar) e espero.

- **Contraparte e propósito** - Obrigatório. Por que preciso: molda quem, quanto tempo e quão formal. Se faltar, pergunto: "Com quem você vai se reunir, e qual o propósito da reunião?"
- **Preferências de agenda** - Obrigatório. Por que preciso: protege blocos de foco, limite diário de reuniões, horário de trabalho. Se faltar, pergunto: "Quando você prefere ter reuniões, horário de trabalho, dias de foco profundo, máximo de reuniões por dia, folga entre compromissos consecutivos?"
- **Sua voz** - Obrigatório. Por que preciso: a mensagem para a contraparte precisa soar como você. Se faltar, pergunto: "O ideal é conectar sua caixa de entrada para eu analisar de 20 a 30 mensagens enviadas. Senão, cole de 3 a 5 respostas recentes que soem como você."
- **VIPs** - Opcional. Por que preciso: VIPs recebem horários pela manhã e folgas maiores. Se você não tiver isso, sigo em frente com TBD e trato todos igualmente.

## Passos

1. **Leio `context/operations-context.md`.** Se faltar/estiver vazio, paro. Peço para você rodar `set-up-my-ops-info` primeiro. Voz, prioridades, contatos-chave moldam o rascunho.

2. **Esclareço o pedido.** Extraio da mensagem: nome(s) da contraparte, duração (padrão 30 min), propósito, fuso horário (padrão do usuário). Se algo relevante faltar, faço UMA pergunta.

3. **Leio `config/schedule-preferences.json` e `config/vips.json`.** Se as preferências faltarem, faço UMA pergunta (o ideal: conectar a agenda para eu inferir) e continuo.

4. **Resolvo a agenda.** `composio search calendar` → slugs de disponibilidade + criação de evento. Nenhuma agenda conectada → digo ao usuário qual categoria conectar, paro.

5. **Busco a disponibilidade.** Puxo os blocos ocupados dos próximos 10 dias úteis. Calculo horários candidatos que:
   - caem dentro de `workingHours`,
   - NÃO se sobrepõem a nenhum `focusBlock`,
   - respeitam `minBufferMinutes` nos dois lados de um compromisso já existente,
   - mantêm o total de reuniões do dia ≤ `maxMeetingsPerDay`,
   - evitam `blackoutPeriods`.

   Limites vêm da configuração, nunca fixo no código.

6. **Escolho 3 opções.** Distribuídas entre os dias (ex. amanhã de manhã, depois de amanhã à tarde, fim de semana pela manhã). Prefiro meio da manhã (10h-11h30) e início da tarde (14h-16h). Evito segundas antes do meio-dia, sextas à tarde a não ser que nada mais encaixe. VIPs → prefiro horários pela manhã, folgas maiores.

7. **Redijo a mensagem.** Leio `config/voice.md` (ou o bloco de voz no contexto operacional). Se faltarem amostras de voz, faço UMA pergunta direcionada (o ideal: conectar a caixa de entrada via Composio para calibrar com 20-30 mensagens enviadas recentes) e continuo. Padrão: uma linha de confirmação → 3 horários propostos (em tópicos, com o fuso horário do usuário e da contraparte identificados se forem diferentes) → alternativa suave ("ou sugira um horário melhor para você"). Limite de ~80 palavras.

8. **Escrevo `scheduling/{slug}/proposal.md`** (slug = contraparte ou id da conversa em kebab-case, com prefixo `sched-` se for avulso). Sobrescrevo a cada iteração. Estrutura:

   ```markdown
   ## Contraparte
   {nome} <{email}>

   ## Horários propostos
   - {Dia Mês DD, HH:MMh horário de origem / HH:MMh horário de destino} - {duração}
   - ...

   ## Restrições respeitadas
   - blocos de foco respeitados: {lista}
   - limite diário de reuniões: {X}/{max}
   - folgas: {min} min

   ## Rascunho da mensagem
   {o corpo redigido}

   ## Status
   rascunho
   ```

9. **Apresento ao usuário.** "Aqui estão 3 opções + o rascunho da mensagem. Enviar? Ajustar? Adicionar uma 4ª opção?" Nunca envio.

10. **Ajusto conforme a resposta.** A contraparte responde escolhendo um horário ou propondo outro → atualizo `## Status` da proposta (rascunho → enviado → contraproposto). Confirmo ou volto aos passos 5-6 com uma janela mais restrita.

11. **Agendo com a aprovação.** Você diz "agende {horário} com {contraparte}" → chamo o slug de criação de evento do Composio. Adiciono a contraparte como convidado, incluo o link de vídeo se o provedor suportar, título conforme sua instrução ou propósito inferido. Atualizo o status da proposta para `confirmado`.

12. **Adiciono a `outputs.json`** com `type: "scheduling"`, status "rascunho" até a confirmação, muda para "ready" no agendamento.

13. **Repasse a preparação.** Depois de agendar, se o convidado for VIP ou a reunião for de alto risco, ofereço: "Quer que eu rode `brief-me mode=meeting-pre` para essa agora?"

## Saídas

- `scheduling/{slug}/proposal.md` (sobrescrito a cada iteração)
- Evento de agenda criado com aprovação
- Adiciona a `outputs.json` com `type: "scheduling"`.

## O que eu nunca faço

- **Agendar** um evento na agenda sem seu "agende" explícito para um horário específico.
- **Enviar** mensagem para a contraparte, apenas rascunho. O usuário envia da própria caixa de entrada, ou me aprova para enviar via Composio depois de revisar.
- **Sobrepor um bloco de foco ou o limite diário** sem que o usuário dispense explicitamente isso para essa reunião específica.
- **Propor horários sem ler as preferências** - se `schedule-preferences.json` faltar → pergunto uma vez, continuo.

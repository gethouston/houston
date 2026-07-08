---
name: preparar-meu-dia
title: "Preparar meu dia"
description: "Acorde com um resumo de uma tela só: as reuniões de hoje, os rascunhos esperando sua aprovação, os três principais movimentos que eu faria hoje, e sua lista de observação de negócios travados ou clientes vermelhos. O calendário é a âncora, eu nunca invento reuniões."
version: 1
category: Vendas
featured: no
image: handshake
integrations: [googlecalendar]
---


# Preparar Meu Dia

Resumo matinal de uma tela só. Fundador lê com o café, sabe por onde começar.

Derivado dos templates do Gumloop #25 (Assistente Pessoal) + #29 (me prepare para o próximo dia no Google Calendar), generalizado para qualquer calendário conectado.

## Quando usar

- "prepare meu dia" / "resuma meu dia" / "resumo matinal".
- "o que tem hoje".
- Agendado: rotina matinal (configurada por você na aba Rotinas).

## Conexões que eu preciso

Eu executo trabalho externo pelo Composio. Antes desta skill rodar eu verifico se as categorias abaixo estão conectadas. Se faltar, eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Calendário** - puxa as reuniões de hoje (horário, título, participantes). Obrigatório.
- **Mensagens** - entrega o resumo no Slack se você tiver configurado. Opcional.

Se seu calendário não estiver conectado eu paro e peço para você conectar o Google Calendar ou o Outlook na aba Integrações.

## Informações que eu preciso

Eu leio seu contexto de vendas primeiro. Para cada campo obrigatório que estiver faltando eu faço UMA pergunta em linguagem simples (melhor formato: app conectado > arquivo > URL > texto colado) e espero.

- **Seu playbook de vendas** - Opcional. Por que eu preciso: me deixa sinalizar reuniões que precisam de preparo contra seu framework de qualificação. Se você não tiver, eu sigo em frente com PENDENTE e pulo a sinalização de preparo.
- **O calendário de hoje** - Obrigatório. Por que eu preciso: o resumo se baseia no seu dia real. Se estiver faltando eu pergunto: "Conecte o Google Calendar ou o Outlook para eu puxar suas reuniões de hoje, ou me passe seu dia."

1. **Ler o playbook.** Carrego `context/sales-context.md`. Se estiver faltando, aviso você mas continuo, o resumo ainda é útil sem ele.

2. **Puxar o calendário de hoje.** `composio search calendar` → lista os eventos de hoje. Para cada evento capturo: horário, título, participantes, descrição. Sinalizo qualquer um com "discovery" / "demo" / "revisão de conta" / "renovação" no título como precisando de preparo. Se já existir `call-prep.md` para a reunião, eu vinculo.

3. **Montar a fila de aprovações.** Leio o `outputs.json` de cada outro agente, filtro por `status: "draft"` criados nas últimas 48 horas. Agrupo por agente, mostro título + caminho.

4. **Identificar os três principais movimentos.** Leio a atividade de ontem entre agentes:
   - Alguma resposta classificada como INTERESSADO esperando aprovação de rascunho?
   - Algum negócio mudou de estágio ontem e precisa de acompanhamento?
   - Algum cliente virou AMARELO/VERMELHO durante a noite?
   - Algum lead bateu o limite de estagnação durante a noite?

   Escolho os três de maior alavancagem. Cada um recebe uma descrição de uma linha + prompt copiável para o agente certo.

5. **Formatar o resumo (uma tela, no máximo 5 seções):**

   1. **Reuniões de hoje** - horário · título · status de preparo.
   2. **Fila de aprovações** - N rascunhos esperando aprovação, agrupados por agente.
   3. **Os três principais movimentos** - cada um em uma linha copiável.
   4. **Lista de observação** - negócios travados, clientes vermelhos, leads de alto valor além do limite de estagnação.
   5. **Ontem em números** - leads adicionados, calls realizadas, negócios que avançaram.

6. **Escrever atomicamente.** Escrevo em `briefs/{YYYY-MM-DD}.md.tmp`, depois renomeio. Sobrescrevo qualquer resumo anterior do mesmo dia (um resumo por dia).

7. **Adiciono ao `outputs.json`** (ou atualizo a entrada existente do mesmo dia):

   ```json
   {
     "id": "<uuid v4>",
     "type": "brief",
     "title": "Resumo diário - {YYYY-MM-DD}",
     "summary": "<resumo de uma linha dos 3 movimentos>",
     "path": "briefs/{YYYY-MM-DD}.md",
     "status": "ready",
     "createdAt": "<ISO>",
     "updatedAt": "<ISO>"
   }
   ```

8. **Resumir para você.** Os 3 movimentos direto no chat + o caminho. Se alguma reunião precisar de preparo e não tiver material de preparo, sugiro rodar `prep-a-meeting type=call` agora.

## Saídas

- `briefs/{YYYY-MM-DD}.md`
- Adiciona (ou atualiza) o `outputs.json` com `type: "brief"`.

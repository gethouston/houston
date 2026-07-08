---
name: acompanhar-minhas-promessas
title: "Acompanhar minhas promessas"
description: "Toda vez que você diz a um cliente que vai fazer algo até uma certa data, eu anoto isso com um prazo para não deixar passar. Extraio a promessa direto da sua resposta, interpreto a data limite, e vinculo à conversa. Isso aparece automaticamente no seu resumo matinal, para que nada escape."
version: 1
category: Suporte
featured: no
image: headphone
---


# Acompanhar minhas promessas

## Quando usar
- Você diz "pode enviar" / "aprovado" em um `draft.md` com linguagem que envolve prazo.
- Você escreve a própria resposta no chat com data, dia ou período.
- Você revisa uma conversa existente e comenta "ah, é verdade, eu disse que ia…".

Qualquer frase como: "vou fazer X até Y", "semana que vem", "amanhã", "até sexta", "até o fim do dia", "dentro de uma hora" ativa esta skill.

## Conexões que eu preciso

Eu executo trabalho externo através do Composio. Antes de rodar esta skill, verifico se as categorias abaixo estão conectadas. Se faltar alguma, eu digo qual é a categoria, peço para você conectá-la na aba de Integrações, e paro.

- **Caixa de entrada** (Gmail / Outlook), opcional, usada apenas para buscar a conversa de origem quando a promessa está em um email que eu ainda não processei.

Esta skill funciona principalmente com o seu índice local de conversas, então nenhuma conexão é estritamente obrigatória.

## Informações que eu preciso

Eu leio o seu contexto de suporte primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor forma: app conectado > envio de arquivo > URL > colar) e aguardo.

- **O texto da promessa**. Obrigatório. Por que preciso: eu registro o que foi realmente dito, não o que achei que ouvi. Se faltar, pergunto: "O que você se comprometeu a fazer, e para qual cliente ou conversa?"
- **A data limite ou o período**. Obrigatório. Por que preciso: prazos vagos escorregam em silêncio. Se faltar, pergunto: "Quando você disse que ia dar um retorno, um dia específico, o fim da semana, ou deixou em aberto?"
- **Link da conversa ou do cliente**. Opcional. Por que preciso: me permite registrar o acompanhamento na conversa certa. Se você não tiver, eu sigo em frente com TBD e peço para você me indicar a conversa depois.

## Passos
1. **Extrair o texto da promessa** literalmente da mensagem ou do rascunho (mantenho a formulação original, você pode querer ver o que foi dito).
2. **Interpretar a data limite.**
   - Data explícita ("sexta", "3 de março") → próxima ocorrência no fuso horário local → ISO-8601 UTC.
   - Relativa ("amanhã", "semana que vem") → aplico em relação a agora.
   - Vaga ("em breve", "assim que possível", sem data) → padrão `now + 48h`, anoto a ambiguidade no texto da promessa.
3. **Vincular à conversa.** Extraio `conversationId` e `customerSlug` da conversa.
4. **Adicionar atomicamente** ao `followups.json`:
   ```json
   { "id": "<uuid>", "conversationId": "...", "customerSlug": "...", "promise": "...", "dueAt": "...", "status": "open", "createdAt": "...", "updatedAt": "..." }
   ```
5. **Espelhar a promessa** como uma linha datada em `conversations/{id}/notes.md`.
6. Se um acompanhamento aberto na mesma conversa for contrariado pela nova promessa (por exemplo, data adiada), marco o antigo como `status: "cancelled"` e referencio o novo id.

## Saídas
- Adiciona ao `followups.json`
- Adiciona uma linha datada em `conversations/{id}/notes.md`
- Opcionalmente cancela o acompanhamento substituído

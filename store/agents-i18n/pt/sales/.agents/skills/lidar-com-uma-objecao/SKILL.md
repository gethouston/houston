---
name: lidar-com-uma-objecao
title: "Lidar com uma objeção"
description: "Redijo uma reformulação certeira de três frases para usar na call (reconhecer → exemplo concreto de uma conta âncora → próximo passo com data), mais um e-mail de acompanhamento curto no seu tom de voz. Busco a objeção no seu playbook e nos insights de calls recentes para que a resposta seja fundamentada, não improvisada."
version: 1
category: Vendas
featured: no
image: handshake
---


# Lidar Com Uma Objeção

Tratamento de uma única objeção. Duas saídas: reformulação para usar na call (curta, verbal) + e-mail de acompanhamento pós-call (curto, escrito).

## Quando usar

- "eles disseram '{objeção}' na call do {negócio}, redija minha reformulação".
- "como eu lido com '{objeção}'".
- Chamado por `check-my-sales subject=discovery-call` para qualquer OBJEÇÃO levantada na call.

## Conexões que eu preciso

Eu executo trabalho externo pelo Composio. Antes desta skill rodar eu verifico se as categorias abaixo estão conectadas. Se faltar, eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Caixa de entrada** - amostrar seus e-mails enviados para acertar o tom no acompanhamento pós-call. Opcional mas recomendado.

Eu consigo rodar esta skill só com seu playbook e notas de call, então nenhuma conexão é estritamente obrigatória.

## Informações que eu preciso

Eu leio seu contexto de vendas primeiro. Para cada campo obrigatório que estiver faltando eu faço UMA pergunta em linguagem simples (melhor formato: app conectado > arquivo > URL > texto colado) e espero.

- **Seu playbook de vendas** - Obrigatório. Por que eu preciso: o manual de objeções e as contas âncora fundamentam a reformulação. Se estiver faltando eu pergunto: "Ainda não tenho seu playbook, quer que eu redija um agora?"
- **A objeção nas palavras deles** - Obrigatório. Por que eu preciso: reformulo a frase real, não uma paráfrase. Se estiver faltando eu pergunto: "O que eles disseram, palavra por palavra?"
- **Em qual negócio isso surgiu** - Obrigatório. Por que eu preciso: salvo a reformulação sob esse negócio e puxo contexto da call. Se estiver faltando eu pergunto: "Qual prospect ou negócio levantou isso?"
- **Amostras de tom de voz** - Opcional. Por que eu preciso: deixa o e-mail pós-call soar como você. Se você não tiver, eu sigo em frente com PENDENTE e uso um tom neutro.

1. **Ler o playbook.** Carrego `context/sales-context.md`. Procuro a entrada correspondente no manual de objeções. Se o playbook estiver faltando, peço para você rodar `set-up-my-sales-info` primeiro, e paro.

2. **Ler o registro.** Carrego `config/context-ledger.json`. O campo `universal.idealCustomer` fundamenta a reformulação; capturas progressivas ali podem substituir a lista inicial de objeções do playbook.

3. **Verificar insights de calls recentes** - leio `call-insights/*.md` (os 3 mais recentes) em busca de um padrão relacionado a essa objeção. Prefiro reformulações bem-sucedidas literais de calls passadas.

4. **Redigir a reformulação para a call (3 frases):**

   1. **Reconhecer** - sem recuar, sem descartar.
   2. **Reformular** com um exemplo concreto de cliente ou um dado (uso as contas âncora de `context/sales-context.md`).
   3. **Propor o próximo passo** - específico, com prazo definido.

5. **Redigir o e-mail de acompanhamento pós-call** - 5 a 8 linhas:

   - Assunto: "Re: {dor deles, nas palavras deles}"
   - Abertura: confirmar que ouvi eles.
   - 2 a 3 tópicos: fatos/provas que respondem à objeção específica.
   - Fechamento: próximo passo concreto + data.

   Combinando o tom de `config/voice.md` (ou capturo amostras na primeira execução se estiver faltando).

6. **Escrever atomicamente** em `deals/{slug}/objections/{YYYY-MM-DD}-{slug}.md.tmp` → renomear. Estrutura: objeção (literal) · reformulação (3 linhas) · e-mail de acompanhamento (corpo) · fontes (playbook + calls referenciadas).

7. **Atualizar o registro** - se a objeção trouxe uma variante nova, adiciono a `universal.idealCustomer.pains` via leitura, mesclagem e escrita atômica de `config/context-ledger.json`.

8. **Adiciono ao `outputs.json`:**

   ```json
   {
     "id": "<uuid v4>",
     "type": "objection",
     "title": "Objeção - {objeção resumida}",
     "summary": "<primeira linha da reformulação + CTA do acompanhamento>",
     "path": "deals/{slug}/objections/{date}-{slug}.md",
     "status": "draft",
     "createdAt": "<ISO>",
     "updatedAt": "<ISO>"
   }
   ```

9. **Resumo.** Imprimo a reformulação de 3 frases direto no chat para você usar verbalmente no próximo contato. Caminho para o material completo.

## Saídas

- `deals/{slug}/objections/{YYYY-MM-DD}-{slug}.md`
- Possivelmente atualiza `config/context-ledger.json`.
- Adiciona ao `outputs.json` com `domain: "meetings"`, tipo `objection-reframe`.

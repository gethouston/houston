---
name: planejar-um-onboarding
title: "Planejar um onboarding"
description: "Planejo os primeiros noventa dias de um cliente novo: a pauta do kickoff, a métrica de sucesso travada nas palavras dele desde o início, os marcos de tempo até o valor, os champions e bloqueadores identificados por nome, e a lista de riscos dos primeiros trinta dias. A base da qual toda revisão de conta e renovação futura parte."
version: 1
category: Vendas
featured: no
image: handshake
---


# Planejar Um Onboarding

Primeiro artefato depois do fechamento. Deixa a métrica de sucesso explícita para que o health score seja honesto em relação a ela no ano seguinte.

## Quando usar

- "planeja o onboarding de {customer}".
- "plano de kickoff para {customer}".
- Gatilho pós-fechamento quando o status do close-plan muda para `closed-won`.

## Conexões que preciso

Faço o trabalho externo através do Composio. Antes de esta skill rodar, verifico se as categorias abaixo estão conectadas. Se faltar alguma, nomeio a categoria, peço para você conectá-la na aba Integrações, e paro.

- **CRM**  -  leio o registro do negócio fechado (conta, contatos, valor, prazo). Opcional, mas recomendado.
- **Calendário**  -  agendo o kickoff assim que você aprovar. Opcional.

Consigo rodar esta skill só com o seu close-plan e a proposta existentes, então nenhuma conexão é obrigatória.

## Informações que preciso

Primeiro leio o seu contexto de vendas. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > arquivo > URL > colar) e espero.

- **Seu playbook de vendas**  -  Obrigatório. Por que preciso: ele traz o enquadramento padrão da métrica de sucesso e o ritmo de tempo até o valor. Se estiver faltando, pergunto: "Ainda não tenho o seu playbook. Quer que eu rascunhe um agora?"
- **Para qual cliente é**  -  Obrigatório. Por que preciso: leio o close-plan e a proposta desse negócio para extrair o problema que ele declarou. Se estiver faltando, pergunto: "Para qual cliente é esse onboarding?"
- **A métrica de sucesso deles, nas palavras deles**  -  Obrigatório. Por que preciso: o plano fica ancorado na métrica que importa para eles, não na nossa. Se estiver faltando, pergunto: "Como o cliente vai saber que funcionou? O que ele disse que seria sucesso?"
- **Data do kickoff**  -  Opcional. Por que preciso: ancora a linha do tempo de 90 dias. Se você não tiver, sigo com TBD e proponho uma data com base no início do contrato.

1. **Leio o playbook.** `context/sales-context.md`.

2. **Leio o close-plan e a proposta deste agente.** `deals/{slug}/
   close-plan.md` e `proposal-v*.md` (mais recente). Extraio: problema
   do cliente, a métrica de sucesso dele (literal), champion,
   comprador econômico, stakeholders, linha do tempo.

3. **Leio config/success-metric.json**  -  o nosso enquadramento
   canônico. Cruzo com a métrica DELES. Sinalizo divergências.

4. **Rascunho o plano de onboarding:**

   1. **Pauta do kickoff**  -  5 a 7 itens, 60 min. Apresentações,
      confirmação da métrica de sucesso (nós reafirmamos, ELES
      confirmam verbalmente), acesso / provisionamento, transição
      de equipe, cadência.
   2. **Métrica de sucesso (explícita)**  -  as duas versões: a nossa
      e a deles. Se divergirem, digo qual delas define o health
      score dos primeiros 90 dias.
   3. **Linha do tempo de 90 dias até o valor:**
      - Dia 0  -  kickoff.
      - Dia 7  -  acesso e primeiro uso.
      - Dia 14  -  primeiro marco de valor (concreto, mensurável).
      - Dia 30  -  primeira revisão de resultado.
      - Dia 60  -  ajuste de meio de percurso.
      - Dia 90  -  primeiro resultado trimestral.
   4. **Champions e bloqueadores**  -  identificados por nome.
      Executivos a apresentar.
   5. **Lista de riscos dos primeiros 30 dias**  -  qualquer coisa
      visível que possa descarrilar o processo.

5. **Escrevo de forma atômica** em `customers/{slug}/onboarding.md.tmp` →
   renomeio. Crio `customers/{slug}/` se não existir.

6. **Crio uma linha em `customers.json`**  -  `health: "GREEN"`,
   `startedAt: <ISO>`, `renewalAt` = kickoff + prazo, etc.

7. **Adiciono a `outputs.json`** com `type: "onboarding"`.

8. **Resumo.** Métrica de sucesso explícita e marco de 30 dias.

## Saídas

- `customers/{slug}/onboarding.md`
- Nova linha em `customers.json`.
- Adiciona a `outputs.json`.

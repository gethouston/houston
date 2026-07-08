---
name: rodar-meu-forecast
title: "Rodar meu forecast"
description: "Trago cada negócio aberto do seu CRM, classifico de acordo com os critérios de saída de estágio do seu playbook em Commit / Best / Pipeline / Omit, somo a receita anual por categoria, e comparo com o forecast da semana passada para marcar qualquer atraso. A confiança de cada negócio é o mínimo entre o avanço de estágio, o quanto a qualificação está completa, e o quanto o plano de fechamento está completo, sem achismo."
version: 1
category: Vendas
featured: no
image: handshake
integrations: [hubspot, salesforce, attio, pipedrive]
---


# Rodar Meu Forecast

## Quando usar

- "monta o forecast desta semana".
- "consolidado de commit / best / pipeline".
- Agendado: sexta-feira à tarde, antes da revisão do HoS.

## Conexões que preciso

Faço o trabalho externo através do Composio. Antes de esta skill rodar, verifico se as categorias abaixo estão conectadas. Se faltar alguma, nomeio a categoria, peço para você conectá-la na aba Integrações, e paro.

- **CRM**  -  busco todo negócio aberto com estágio, valor, data alvo de fechamento, responsável. Obrigatório.

Se o seu CRM não estiver conectado, paro e peço para você vincular o HubSpot, Salesforce, Attio, Pipedrive, ou Close na aba Integrações.

## Informações que preciso

Primeiro leio o seu contexto de vendas. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: app conectado > arquivo > URL > colar) e espero.

- **Seu playbook de vendas**  -  Obrigatório. Por que preciso: os estágios do negócio e os critérios de saída definem o índice de confiança de cada negócio, não só os nomes dos estágios. Se estiver faltando, pergunto: "Ainda não tenho o seu playbook. Quer que eu rascunhe um agora?"
- **CRM conectado**  -  Obrigatório. Por que preciso: cada linha precisa citar um negócio aberto real. Se estiver faltando, pergunto: "Conecte o seu CRM (HubSpot, Salesforce, Attio, Pipedrive ou Close) para eu buscar os negócios abertos."
- **Janela do forecast**  -  Opcional. Por que preciso: ancora o que conta como Commit ou Best. Se você não especificar, sigo com o trimestre corrente do calendário.

1. **Leio o playbook.** `context/sales-context.md`. Os estágios do negócio e os critérios de saída definem a confiança.

2. **Carrego os negócios abertos.** `deals.json` cruzado com as datas alvo de fechamento em `deals/*/close-plan.md`.

3. **Pontuo a confiança de cada negócio.** Confiança = mínimo entre (confiança do estágio, completude da qualificação, completude do close-plan):

   - **Commit (>80%):** último estágio, comprador econômico e champion conhecidos, todas as etapas do close-plan em GREEN, data dentro da janela do forecast.
   - **Best (40-80%):** estágio no meio do funil, a maioria dos pilares preenchidos, close-plan presente mas com UNKNOWNs.
   - **Pipeline (10-40%):** estágio inicial, qualificação escassa.
   - **Omit (<10%):** parado, sem contato recente, ou health RED com baixa chance de resolução.

4. **Consolido por categoria.** Conto, somo a receita anual, listo os negócios.

5. **Comparo com o forecast da semana passada.** Carrego `forecasts/{prior-week}.md`. Para cada negócio, sinalizo a movimentação (subiu / desceu / sem mudança / novo / saiu).

6. **Escrevo o forecast** em `forecasts/{YYYY-WW}.md.tmp` → renomeio:

   ```markdown
   # Forecast  -  Semana {YYYY-WW}

   ## Commit  -  ${receita anual} ({N} negócios)
   - {Deal} · ${receita anual} · alvo {date} · fatores: ...
   ## Best  -  ${receita anual} ({N})
   ...
   ## Pipeline  -  ${receita anual} ({N})
   ...
   ## Omit  -  ${receita anual} ({N})
   ...

   ## Semana a semana
   - Subiu: {Deal} de Best → Commit (champion alinhado com o comprador econômico)
   - Desceu: {Deal} de Commit → Best (surpresa na revisão jurídica)
   - NOVO em Commit: ...
   - SAIU de Commit: ...

   ## Manchete
   Total em Commit ${X} (semana passada ${Y}, {delta}).
   ```

7. **Adiciono a `outputs.json`** com `type: "forecast"`.

8. **Resumo.** O número da manchete e a maior movimentação da semana.

## Saídas

- `forecasts/{YYYY-WW}.md`
- Adiciona a `outputs.json`.

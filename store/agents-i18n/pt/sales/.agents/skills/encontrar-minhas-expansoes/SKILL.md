---
name: encontrar-minhas-expansoes
title: "Encontrar minhas expansões"
description: "Reviso seus clientes VERDE em busca de sinais de expansão (picos de uso que passam dos limites do plano, crescimento do tamanho do time, padrões de pedidos de funcionalidades, adoção de novos produtos) e classifico as oportunidades de upsell, cross-sell, add-on e expansão de assentos pela receita anual potencial frente ao esforço de fechamento. Cada linha cita o sinal para você saber por que eu trouxe isso à tona."
version: 1
category: Vendas
featured: no
image: handshake
integrations: [linkedin]
---


# Encontrar Minhas Expansões

## Quando usar

- "tem alguma oportunidade de expansão na minha carteira agora".
- "quem está maduro para upsell / cross-sell".
- Agendado: varredura mensal de expansão.

## Conexões que eu preciso

Eu executo trabalho externo pelo Composio. Antes desta skill rodar eu verifico se as categorias abaixo estão conectadas. Se faltar, eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Cobrança** - puxar quantidade de assentos, plano e uso contra os limites do plano. Obrigatório.
- **CRM** - identificar clientes VERDE e padrões de pedidos de funcionalidades. Obrigatório.
- **Redes sociais** - ler o crescimento do tamanho do time no LinkedIn. Opcional.

Se a cobrança ou o CRM não estiverem conectados eu paro e peço para você conectar o Stripe e seu CRM primeiro, expansão só faz sentido fundamentada em uso real e no estado da conta.

## Informações que eu preciso

Eu leio seu contexto de vendas primeiro. Para cada campo obrigatório que estiver faltando eu faço UMA pergunta em linguagem simples (melhor formato: app conectado > arquivo > URL > texto colado) e espero.

- **Seu playbook de vendas** - Obrigatório. Por que eu preciso: a postura de preços e a lista de produtos determinam como é um upsell ou cross-sell. Se estiver faltando eu pergunto: "Ainda não tenho seu playbook, quer que eu redija um agora?"
- **Cobrança conectada** - Obrigatório. Por que eu preciso: os dados de assentos e uso fundamentam todo candidato a expansão. Se estiver faltando eu pergunto: "Conecte o Stripe para eu ler quantidade de assentos, planos e uso."
- **CRM conectado** - Obrigatório. Por que eu preciso: leio quais clientes estão VERDE e puxo os padrões recentes de pedidos de funcionalidades. Se estiver faltando eu pergunto: "Conecte seu CRM (HubSpot, Salesforce, Attio, Pipedrive ou Close) para eu ler sua carteira de clientes."
- **Fonte de dados de uso do produto** - Opcional. Por que eu preciso: picos de uso são o sinal de expansão mais forte. Se você não tiver, eu sigo em frente com PENDENTE nesse sinal e me apoio nos sinais de assentos e crescimento de time.

1. **Ler o playbook.** `context/sales-context.md` para postura de preços + lista de produtos.

2. **Ler `customers.json`.** Filtro apenas por `health: "GREEN"`.

3. **Para cada cliente VERDE, verifico sinais:**
   - **Picos de uso** - além do limite do plano atual (consulto product analytics).
   - **Crescimento do tamanho do time** - novos assentos, crescimento de headcount no LinkedIn (consulto CRM + LinkedIn se conectado).
   - **Pedidos de funcionalidades** - de tickets que mapeiam para um produto existente (consulto suporte).
   - **Adoção de novos produtos** - % usando a funcionalidade / produto mais recente.

4. **Pontuar o candidato.** Impacto na receita anual (baixo / médio / alto) × esforço de fechamento (baixo / médio / alto). Classifico pela proporção impacto/esforço.

5. **Para candidatos com sinal forte, escrevo um resumo por cliente:** `customers/{slug}/expansion-{YYYY-MM-DD}.md` - sinal citado, produto / assento / plano proposto, receita anual estimada, esforço de fechamento, um pitch de uma linha que o agente usaria.

6. **Adiciono ao `expansion.json`:**

   ```ts
   {
     id, slug, customerSlug,
     type: "upsell" | "cross-sell" | "add-on" | "seat-expansion",
     estAnnualRevenue, effort: "low"|"med"|"high",
     signal: "<sinal citado>",
     status: "surfaced",
     createdAt, updatedAt
   }
   ```

7. **Atualizo `customers.json`** - incremento `openExpansions`.

8. **Adiciono ao `outputs.json`** com `type: "expansion"`.

9. **Resumo.** Top 3 oportunidades (cliente · tipo · receita anual estimada). Sugiro encaminhar: "Rodar `write-a-proposal` na principal."

## Saídas

- `customers/{slug}/expansion-{YYYY-MM-DD}.md` por candidato.
- Adiciona ao `expansion.json`.
- Adiciona ao `outputs.json`.

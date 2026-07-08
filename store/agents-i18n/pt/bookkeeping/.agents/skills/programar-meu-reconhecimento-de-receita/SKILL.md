---
name: programar-meu-reconhecimento-de-receita
title: "Programar meu reconhecimento de receita"
description: "Distribuo um contrato de cliente em um cronograma de reconhecimento limpo sob ASC 606, um arquivo por contrato organizado por cliente. Cuido dos padrões comuns em startups (pagamento anual antecipado com reconhecimento mensal proporcional, baseado em uso com um piso, diferimento da taxa de implementação, modificações de contrato com ajuste prospectivo vs. cumulativo), e sinalizo as decisões de julgamento (contraprestação variável, financiamento significativo, itens não monetários) com opções e impacto em dólares. Eu elaboro e mostro, nunca decido por você e nunca lanço nada."
version: 1
category: Contabilidade
featured: no
image: ledger
integrations: [hubspot, stripe]
---

# Programar Meu Reconhecimento de Receita

Transformo um contrato assinado em um cronograma de reconhecimento mês a mês sob ASC 606. Um artefato JSON por contrato, agrupado por cliente. Os padrões comuns já vêm prontos; o que exige julgamento de verdade (contraprestação variável, financiamento significativo, itens não monetários) é sinalizado para que você decida. Eu resumo as opções, nunca decido, e nunca lanço nada.

## Quando usar

- "elabore o cronograma de reconhecimento de receita para {cliente}" / "distribua este contrato".
- "elabore o cronograma ASC 606" / "reconhecimento ASC 606 para este contrato" - mesmo fluxo, na forma como o fundador fala.
- "o cliente renovou / fez upgrade / adicionou um SKU - atualize o reconhecimento de receita".
- "faturamos isso anualmente; reconheça mensalmente".
- Chamada pela habilidade `close-my-month` como parte da etapa de reconhecimento de receita, uma vez por contrato ativo.

## Conexões que eu preciso

Eu executo trabalho externo através do Composio. Antes desta habilidade rodar, verifico se as categorias abaixo estão conectadas. Faltando → eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Stripe** (faturamento) - fonte preferida para contratos de assinatura, itens de linha, e periodicidade de faturamento. Obrigatório se o Stripe for a sua fonte de contratos.
- **HubSpot** (CRM) - fonte alternativa / complementar para contratos assinados e precificação por SKU. Opcional.

Se nenhum dos dois estiver conectado, eu recorro a um arquivo de contrato enviado (PDF, DOCX, CSV) ou a um resumo colado. Se você não tiver nada para compartilhar, eu paro e peço para você conectar o Stripe ou enviar o contrato.

## Informações que eu preciso

Eu leio o seu contexto contábil primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: aplicativo conectado > envio de arquivo > URL > colar) e espero.

- **O próprio contrato** - Obrigatório. Por quê: eu não consigo montar um cronograma de reconhecimento sem a data efetiva, a data final, os itens de linha, e a precificação. Se estiver faltando eu pergunto: "Você pode compartilhar o contrato assinado? Conectar o Stripe ou o HubSpot é o mais fácil, senão envie o PDF ou cole os itens de linha."
- **O seu modelo de receita e a postura sobre ASC 606** - Obrigatório. Por quê: assinatura versus uso versus serviços muda como cada obrigação de desempenho é reconhecida. Se estiver faltando eu pergunto: "Como o negócio ganha dinheiro, assinaturas, baseado em uso, serviços, ou uma combinação? E vocês estão tentando seguir o ASC 606 rigorosamente ou mantendo o regime de caixa?"
- **Um plano de contas com linhas de receita diferida e de receita** - Obrigatório. Por quê: eu elaboro os esboços de lançamento contábil contra códigos de conta reais, nunca inventados. Se estiver faltando eu pergunto: "Já temos um plano de contas com uma linha de receita diferida? Se não, vamos elaborar um primeiro."
- **Se isto é um contrato novo ou uma modificação** - Opcional. Por quê: muda se eu trato como um cronograma novo ou como uma modificação prospectiva / de ajuste cumulativo. Se estiver faltando eu pergunto: "Isto é um contrato novo de cliente ou um upsell ou mudança em um existente? Se você não souber, eu assumo que é novo e sinalizo para você confirmar."

## Passos

1. **Ler o contexto.** Carregar `context/bookkeeping-context.md`, `config/context-ledger.json` (precisa de `domains.revenue` - modelo + postura sobre ASC 606 + fonte de contratos), `config/chart-of-accounts.json` (precisa dos códigos de conta de receita diferida + receita). Se `domains.revenue` estiver faltando, fazer UMA pergunta direcionada com dica de modalidade (aplicativo conectado > arquivo > URL > colar), persistir, continuar.

2. **Carregar o contrato.** Ordem de fonte: aplicativo conectado (Stripe / HubSpot via Composio - descobrir os slugs em tempo real com `composio search billing` / `composio search crm`) > arquivo enviado (CSV / PDF / DOCX) > URL > colar. Extrair:
   - `customer` - nome + id interno se disponível.
   - `contractId` - id do lado do fornecedor se disponível, senão um slug.
   - `effectiveDate`, `endDate`.
   - Itens de linha (SKU, descrição, quantidade, preço unitário, periodicidade de faturamento, datas de início/fim, sinalizador de baseado em uso, piso se houver).
   - Termos de pagamento (antecipado / mensal / net-30).
   - Linguagem de contraprestação não monetária ou variável.

3. **Identificar as obrigações de desempenho.** Por item de linha, decidir se é uma obrigação distinta ou combinada:
   - Assinatura de SaaS avulsa → uma obrigação de desempenho por prazo de assinatura.
   - Taxa de implementação / onboarding → obrigação de desempenho distinta apenas se o serviço for útil separadamente; senão combinar com a assinatura, amortizar ao longo da vida do contrato. Sinalizar de qualquer forma.
   - Excedente baseado em uso → contraprestação variável na mesma obrigação de desempenho da assinatura subjacente.
   - Serviços profissionais com entregáveis definidos → uma obrigação de desempenho por entregável.

   Gerar o array `performanceObligations[]`:
   `{id, description, standaloneSellingPrice, recognitionPattern:
   "ratable" | "point-in-time" | "usage" | "milestone",
   startDate, endDate}`.

4. **Calcular o preço da transação.** Somar a contraprestação fixa em todas as obrigações de desempenho. Adicionar o piso (se houver) para itens baseados em uso. Sinalizar - NÃO incluir automaticamente - qualquer:
   - **Contraprestação variável** (faixas de volume, bônus de performance, descontos retroativos). Resumir as opções (valor esperado versus valor mais provável), parar para confirmação do usuário.
   - **Componente de financiamento significativo** (pagamento com mais de 12 meses após a transferência de controle). Resumir, parar.
   - **Contraprestação não monetária** (participação acionária, tokens, permuta). Resumir, parar.

   Nunca inventar o tratamento. Itens sinalizados vão para o array `judgmentCalls[]` com opções + recomendação.

5. **Alocar o preço da transação entre as obrigações de desempenho.** Usar o preço de venda avulso (SSP) como base de alocação padrão. Se o SSP da taxa de implementação não for observável, usar a abordagem residual + sinalizar. Produzir `allocation[]` - `{poId, allocatedAmount, method}`.

6. **Construir o cronograma de reconhecimento mensal.** Por obrigação de desempenho, aplicar o padrão de reconhecimento:
   - **Proporcional** (anual antecipado, mensal proporcional): `allocatedAmount /
     months_in_term`, cada mês de `startDate` a `endDate`.
   - **Baseado em uso com piso**: reconhecer o piso proporcionalmente ao longo do prazo; reconhecer o uso acima do piso no mês em que for auferido (deixar linhas de espaço reservado - o usuário insere os valores reais durante o fechamento).
   - **Diferimento da taxa de implementação**: amortizar `allocatedAmount /
     months_in_contract_life`, linearmente ao longo do prazo total.
   - **Pontual / marco**: uma única linha na data de reconhecimento.

   Gerar `schedule[]`: `{period, poId, amount, cumulativeRecognized,
   method}`. `cumulativeRecognized` acumulado por obrigação de desempenho + total.

7. **Tratar modificações de contrato.** Se o usuário sinalizar como modificação de um contrato anterior (upsell, downsell, extensão de prazo):
   - **Prospectiva** (adiciona bens/serviços distintos ao SSP): tratar como contrato novo; iniciar um novo cronograma a partir da data da modificação.
   - **Ajuste cumulativo** (muda o preço de obrigações de desempenho existentes, sem bens/serviços distintos novos): recalcular o total revisado, realocar, lançar o ajuste de acerto no período da modificação.

   A decisão de tratamento é uma decisão de julgamento - resumir as duas opções com o impacto em dólares, parar para confirmação do usuário.

8. **Elaborar os esboços de lançamento contábil de apoio.** Por linha em `schedule[]`, gerar o esboço de lançamento contábil (Débito receita diferida / Crédito receita, ou Débito ativo de contrato / Crédito receita, conforme apropriado). NÃO escrever em `journal-entries.json` aqui - o usuário roda `draft-a-journal-entry type=revrec` para persistir. Incluir no JSON de saída para que a habilidade de lançamento contábil a jusante tenha a entrada pronta.

9. **Escrever o artefato.** Transformar `customer` + `contractId` em slug. Caminho: `revrec/{customer-slug}/{contract-slug}.json`. Escrita atômica: `.tmp` → renomear. Esquema completo:
   ```jsonc
   {
     "id": "<uuid>",
     "createdAt": "...",
     "updatedAt": "...",
     "customer": { "name": "...", "slug": "..." },
     "contract": { "id": "...", "slug": "...", "effectiveDate": "...", "endDate": "..." },
     "performanceObligations": [ /* passo 3 */ ],
     "transactionPrice": 120000.00,
     "allocation": [ /* passo 5 */ ],
     "schedule": [ /* passo 6 */ ],
     "judgmentCalls": [ /* passo 4 + passo 7 */ ],
     "jeStubs": [ /* passo 8 */ ],
     "status": "draft"
   }
   ```

10. **Anexar a `outputs.json`.** Ler-mesclar-escrever. Uma linha por artefato de contrato: `{id, type: "revrec-schedule", title: "Reconhecimento de Receita
     - {cliente} / {contrato}", summary: "<2 a 3 frases sobre o
    preço da transação, o prazo, e quaisquer decisões de julgamento>", path,
    status: "draft", domain: "close"}`.

11. **Resumir para o usuário.** Um parágrafo: preço da transação, prazo, valor de reconhecimento mensal, e - mais importante - quaisquer `judgmentCalls` bloqueando a finalização. Por decisão de julgamento, listar as opções + o tratamento recomendado + o impacto em dólares, esperar a confirmação antes de mudar para `status: "ready"`.

## Saídas

- `revrec/{customer-slug}/{contract-slug}.json` (cronograma por contrato)
- Linha em `outputs.json`: `type: "revrec-schedule"`, `domain: "close"`, `status: "draft"` até o usuário aprovar cada decisão de julgamento.

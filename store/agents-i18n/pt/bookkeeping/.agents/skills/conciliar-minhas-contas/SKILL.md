---
name: conciliar-minhas-contas
title: "Conciliar minhas contas"
description: "Concilio uma única conta (banco, cartão de crédito, processador de pagamentos, ou subconta auxiliar) para o período que você escolher. Bato o razão geral de um lado, o extrato externo do outro, mostro os itens não conciliados agrupados em faixas de 0 a 30 / 31 a 60 / 61 a 90 / mais de 90 dias, e gero uma prova de três vias com os números reais. O submodo `mode=transfer-detect` encontra pares de débito/crédito entre todas as suas contas dentro de uma janela de ±2 dias e os marca como Transferências Internas para que fiquem fora da DRE. Eu nunca insiro uma diferença silenciosamente e nunca forço uma correspondência no QuickBooks Online ou Xero."
version: 1
category: Contabilidade
featured: no
image: ledger
integrations: [stripe, quickbooks, xero]
---


# Conciliar Minhas Contas

Uma conciliação de três vias em uma conta para um período. Saldo do razão geral de um lado, extrato ou feed externo do outro, itens não conciliados agrupados por idade no meio. Cada diferença é explicada por um item de tempo, mostrada como um item não conciliado, ou escalada como uma divergência nomeada. Eu nunca insiro silenciosamente.

Somente rascunhos: eu nunca ajusto o seu razão geral, nunca forço uma correspondência no QuickBooks Online ou Xero. Eu escrevo o documento de conciliação e mostro as divergências.

## Quando usar

- "concilie a conta corrente Chase de janeiro" / "concilie o Amex 9041 de
  março" / "concilie o Stripe do Q1".
- "por que o razão geral está fora do banco em $X" / "o que está na lista
  de cheques pendentes".
- Chamada pela habilidade `close-my-month` para cada conta em
  `context-ledger.domains.banks.accounts[]` no período do fechamento.
- `mode=transfer-detect` - "encontre as transferências entre contas de
  março" / "marque os pares de transferência interna para que fiquem fora
  da DRE". Roda em todas as contas de uma vez, não em uma única conta.

## Conexões que eu preciso

Eu executo trabalho externo através do Composio. Antes desta habilidade rodar, verifico se as categorias abaixo estão conectadas. Faltando → eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **QuickBooks Online ou Xero** (contabilidade) - fonte preferida para o registro do razão geral desta conta. Obrigatório se você quiser que eu extraia a movimentação do razão geral diretamente.
- **Feed bancário** (bancário via Plaid) - fonte preferida para o lado bancário da comparação. Opcional, você também pode enviar o PDF do extrato.
- **Stripe** (faturamento) - obrigatório apenas se estiver conciliando o Stripe; extrai as transações de saldo do período.

Se nem contabilidade nem bancário estiverem conectados, eu recorro a um CSV / PDF enviado. Se você não tiver nada para compartilhar, eu paro e peço para você conectar um ou enviar o extrato do período.

## Informações que eu preciso

Eu leio o seu contexto contábil primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: aplicativo conectado > envio de arquivo > URL > colar) e espero.

- **A conta a conciliar e o período** - Obrigatório. Por quê: me diz quais últimos 4 dígitos procurar e qual intervalo de datas extrair. Se estiver faltando eu pergunto: "Qual conta você quer conciliada, e para qual mês ou trimestre?"
- **Uma lista registrada de contas bancárias e cartões de crédito** - Obrigatório. Por quê: eu procuro o banco, o tipo, e o código de conta pelos últimos 4 dígitos. Se estiver faltando eu pergunto: "Quais contas bancárias e cartões de crédito o negócio usa? Conectar o seu feed bancário é o mais fácil."
- **Um plano de contas** - Obrigatório. Por quê: eu mapeio o código de conta para a linha correta de caixa ou passivo. Se estiver faltando eu pergunto: "Já temos um plano de contas? Se não, vamos elaborar um primeiro."
- **O lado do banco ou do processador para o período** - Obrigatório. Por quê: preciso dos dois lados para a prova de três vias. Se estiver faltando eu pergunto: "Você pode conectar o feed bancário ou o QuickBooks, ou enviar o PDF ou CSV do extrato deste período?"

## Passos

1. **Analisar entradas.** Obrigatório: `account_last4` (ou `all` para
   `mode=transfer-detect`) e `period` (`YYYY-MM` ou `YYYY-QN`).
   Resolver `{periodStart, periodEnd}` a partir do slug do período.

2. **Ler o contexto.** Carregar `context/bookkeeping-context.md` (parar se
   estiver faltando - pedir ao usuário para rodar `set-up-my-books`
   primeiro), `config/context-ledger.json`, e
   `config/chart-of-accounts.json`.

3. **Identificar a conta.** Procurar `account_last4` em
   `context-ledger.domains.banks.accounts[]`. Capturar `{bank, type,
   glCode, glName}` (código de conta e nome de conta). Se a conta não estiver registrada, fazer UMA
   pergunta direcionada para registrar - nunca adivinhar.

4. **Ramificação `mode=transfer-detect`.** Se acionado:
   - Extrair todas as transações de todas as contas registradas para o período.
     Ordem de fonte: aplicativo conectado (QuickBooks Online / Xero / feed bancário
     via Composio - descobrir o slug com `composio search accounting`
     / `composio search banking`) > `runs/{period}/run.json` se
     presente > CSV enviado.
   - Detecção de pares: para cada débito na conta A na data D, buscar
     em todas as outras contas por um crédito com o mesmo valor absoluto
     na data `D ± 2 dias`. Tolerância de valor: 1 centavo.
   - Marcar as duas pontas com `glCode = "9000"`, `glName = "Transferência
     Interna"`, `source = "transfer"`. Excluídas da
     DRE nas fórmulas SUMIFS adiante.
   - Escrever a lista de pares em
     `reconciliations/_transfers/{period}.md` com cada `{date_a, account_a,
     date_b, account_b, amount, confidence}` do par.
   - Anexar uma nota de uma linha no documento de conciliação de cada conta
     afetada, se já existir.
   - Pular para o Passo 10.

5. **Extrair os dois lados.**
   - **Lado do razão geral** - preferencialmente via aplicativo conectado: `composio search
     accounting`, escolher o slug do QuickBooks Online / Xero, extrair o registro do razão geral
     para `{glCode, periodStart, periodEnd}`. Descobrir o esquema com
     `--get-schema`; nunca fixar no código. Recorrer a CSV / colagem
     se não conectado.
   - **Lado externo** - banco / cartão de crédito / Stripe:
     - Banco / cartão de crédito: `composio search banking` (via Plaid) ou
       `statements/{account_last4}/{YYYY-MM}.pdf` se já
       enviado durante uma execução de `process-my-statements`.
     - Stripe: `composio search billing`, extrair as transações de saldo
       do período.
     - Subconta auxiliar: aceitar CSV com `{date, description, amount}`
       mais os saldos de abertura e fechamento.

6. **Combinar itens.** Correspondência exata em `(date, amount)` primeiro; depois
   tolerância de `(amount, date ± 2 dias)`. A similaridade de descrição
   (razão de conjunto de tokens ≥ 0,75) desempata quando vários candidatos
   empatam no valor. Limiares de confiança:
   - `≥ 0,95` - correspondência automática (exata).
   - `0,80-0,94` - correspondência tentativa, mostrada em um bucket de revisão.
   - `< 0,80` - não conciliado.

7. **Classificar os itens não conciliados.**
   - **No razão geral, não no extrato** - candidatos a cheques
     pendentes (se a conta for corrente e o valor negativo),
     depósitos em trânsito (positivo), ou lançamento errôneo no razão geral. Calcular a idade
     de cada um: `daysOld = runDate - transactionDate`.
   - **No extrato, não no razão geral** - candidatos a taxas não
     registradas / juros / cobranças de assinatura não registradas. Geralmente viram
     sugestão de lançamento contábil para `draft-a-journal-entry type=adjustment`.
   - **Diferenças de valor** - mesma contraparte + mesma data, valor
     diferente. Sinalizar cada uma com a diferença.

8. **Calcular a prova de três vias.**
   ```
   saldo_final_razao_geral
     + (no extrato, não no razão geral)
     - (no razão geral, não no extrato)
     ± diferencas_de_valor
     = saldo_final_extrato    (dentro de 1 centavo)
   ```
   Se a prova não bater dentro de 1 centavo, **NÃO ajustar**. Sinalizar
   a divergência nomeada no relatório e inserir/atualizar em `recon-breaks.json` com
   `status: "unresolved"`.

9. **Calcular a idade dos itens não conciliados.** Agrupar cada um em `0-30d`, `31-60d`,
   `61-90d`, `>90d`. Itens com `> 90d` de idade são escalados - sinalizados
   no cabeçalho do relatório.

10. **Escrever o documento de conciliação** em
    `reconciliations/{account_last4}/{YYYY-MM}.md`. Estrutura:
    - Cabeçalho: conta (banco / tipo / últimos 4 dígitos), período, saldo do razão geral,
      saldo do extrato, diferença calculada, status
      (`clean` / `has-items` / `unresolved-break`).
    - **Prova de três vias** - a equação acima renderizada com números
      reais.
    - **Itens pendentes** - tabela agrupada por direção (lado do razão geral
      versus lado do extrato), com `{date, description, amount,
      daysOld, ageBucket}`.
    - **Diferenças de valor** - tabela com `{date, party, glAmount,
      statementAmount, delta}`.
    - **Correspondências tentativas** - tabela para revisão humana
      (confiança 0,80-0,94).
    - **Ajustes sugeridos** - lista de lançamentos contábeis candidatos para
      `draft-a-journal-entry type=adjustment` (taxas não registradas,
      juros, arredondamento cambial).
    - **Divergências nomeadas** - somente se a prova de três vias falhou. Uma
      linha por divergência com o valor em dólares e a melhor suposição da causa.

11. **Atualizar os índices.**
    - `recon-breaks.json` (arquivo plano na raiz do agente) - ler-mesclar-escrever.
      Para cada item não resolvido, inserir ou atualizar
      `{id, accountLast4, period, date, description, amount,
      direction, daysOld, status, addedAt, updatedAt}`. Atualizar a idade das
      entradas existentes em vez de duplicar.
    - `outputs.json` - anexar
      `{type: "reconciliation", title: "Conciliação {bank} {last4}
      {YYYY-MM}", summary, path, status: "draft", domain: "close"}`.

12. **Resumir para o usuário.** Recapitulação de duas linhas: resultado
    da prova de três vias, e contagem + total em dólares de itens não conciliados por
    faixa de idade. Incluir o caminho para o documento completo.

## Saídas

- `reconciliations/{account_last4}/{YYYY-MM}.md` - conciliação completa.
- `reconciliations/_transfers/{period}.md` - somente no
  `mode=transfer-detect`.
- `recon-breaks.json` - ler-mesclar-escrever, itens não resolvidos com idade.
- `outputs.json` - uma linha anexada, `type: "reconciliation"`.

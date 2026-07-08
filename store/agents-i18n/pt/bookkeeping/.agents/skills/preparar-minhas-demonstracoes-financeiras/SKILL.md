---
name: preparar-minhas-demonstracoes-financeiras
title: "Preparar minhas demonstrações financeiras"
description: "Elaboro uma demonstração financeira para o período que você escolher, uma demonstração por chamada: `statement=pnl | balance-sheet | cash-flow | trial-balance`. Produzo a demonstração a partir dos seus lançamentos contábeis, saldos de abertura, e plano de contas, com comparações do período e ano anteriores, e de 3 a 5 notas geradas automaticamente que citam lançamentos contábeis específicos, sem fatores inventados. As visões de caixa e de competência são calculadas ambas sobre livros em regime de competência; os alertas de descasamento e saldos incomuns aparecem no topo. Somente rascunhos, você assina, você declara."
version: 1
category: Contabilidade
featured: yes
image: ledger
---


# Preparar Minhas Demonstrações Financeiras

Quatro demonstrações, uma habilidade, um argumento. Cada ramificação baseia os números nos seus lançamentos contábeis, no balancete de abertura e no plano de contas. Tanto a visão de caixa quanto a de competência rodam sobre livros em regime de competência; livros só de caixa recebem uma única visão. Cada comparação cita uma fonte, eu nunca invento um fator só para deixar a página organizada.

## Quando usar

- `pnl` - "me dê a DRE" / "demonstração de resultados de {período}".
- `balance-sheet` - "elabore o balanço patrimonial em {data}".
- `cash-flow` - "demonstração de fluxo de caixa de {período}".
- `trial-balance` - "traga o balancete" / "balancete em {data}".
- Chamada pela habilidade `close-my-month` uma vez por demonstração depois que as provisões e o reconhecimento de receita são lançados.

## Conexões que eu preciso

Eu executo trabalho externo através do Composio. Antes desta habilidade rodar, verifico se as categorias abaixo estão conectadas. Faltando → eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Nenhuma conexão externa necessária.** Eu gero as demonstrações inteiramente a partir dos lançamentos contábeis, saldos de abertura, e plano de contas já registrados.

Esta habilidade nunca trava por causa de uma conexão faltante.

## Informações que eu preciso

Eu leio o seu contexto contábil primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: aplicativo conectado > envio de arquivo > URL > colar) e espero.

- **Contabilidade em regime de caixa ou de competência** - Obrigatório. Por quê: regime de competência recebe visões de DRE em caixa e em competência; regime de caixa recebe apenas uma. Se estiver faltando eu pergunto: "Estamos mantendo os livros no regime de caixa ou de competência?"
- **Um plano de contas** - Obrigatório. Por quê: cada demonstração depende das seções da demonstração definidas no plano de contas. Se estiver faltando eu pergunto: "Já temos um plano de contas? Se não, vamos elaborar um primeiro."
- **Um balancete de abertura** - Obrigatório para o balanço patrimonial, fluxo de caixa, e balancete. Por quê: cada saldo de conta começa a partir desta âncora. Se estiver faltando eu pergunto: "Você tem um balancete de fechamento dos seus livros anteriores? Envie como planilha ou CSV."
- **Um histórico atual de lançamentos contábeis** - Obrigatório. Por quê: cada linha em cada demonstração remonta a um lançamento contábil lançado. Se estiver faltando eu pergunto: "Já processamos e fechamos o período? Se não, vamos rodar o fechamento primeiro para que os lançamentos contábeis estejam prontos."
- **O período ou a data de referência** - Obrigatório. Por quê: me diz quais lançamentos contábeis incluir. Se estiver faltando eu pergunto: "Qual período você quer, por exemplo, março de 2025 para uma DRE, ou em 31 de março de 2025 para um balanço patrimonial?"

## Passos

1. **Ler o contexto.** Carregar `context/bookkeeping-context.md`, `config/context-ledger.json` (para `universal.accountingMethod` + `universal.openingBalances`), `config/chart-of-accounts.json` (TRAVADO - as demonstrações dependem de `statementSection`), e `config/opening-trial-balance.json`. Analisar argumentos: `statement` (uma das quatro) + `period` (`YYYY-MM` para DRE / fluxo de caixa / variação; data de referência para balanço patrimonial / balancete).

2. **Carregar o razão-fonte.** Ler `journal-entries.json` na raiz do agente. Filtrar para `status in {"ready","posted"}` (excluir `"draft"` a menos que o usuário tenha pedido uma demonstração em rascunho). Para o período solicitado, dividir:
   - Lançamentos contábeis do período (`date` dentro do período) - orientam a DRE + o fluxo de caixa.
   - Lançamentos contábeis acumulados até o fim do período - orientam o balanço patrimonial + o balancete.

3. **Ramificar em `statement`.**

   ### `statement=pnl`
   - Agrupar as linhas dos lançamentos contábeis por `statementSection` do plano de contas em receita / custo dos produtos vendidos / despesa. Somar `credit - debit` para receita/custo dos produtos vendidos/despesa (receita com créditos positivos; custo dos produtos vendidos/despesa com débitos positivos).
   - Subtotais: Receita → Lucro Bruto → Resultado Operacional → Outras Receitas/Despesas → Lucro Líquido.
   - **Ambas as visões de caixa e de competência** se `accountingMethod == "accrual"` (a visão de caixa exclui lançamentos contábeis de provisão/despesa antecipada/reconhecimento de receita/receita diferida por `type`). Somente caixa se `accountingMethod == "cash"`.
   - **Comparação período-sobre-período**: mês a mês (versus a DRE final do mês anterior de `financials/{prior-YYYY-MM}/pnl.md` se existir, senão recalcula na hora) E versus o mesmo período do ano anterior.
   - **Notas (3 a 5)** - geradas automaticamente sobre os maiores fatores de variação. Cada nota DEVE citar ids de lançamentos contábeis ou o conjunto de transações do artefato de execução. Nenhuma causa inventada.

   ### `statement=balance-sheet`
   - Classificado: ativo circulante, ativo não circulante, passivo circulante, passivo não circulante, patrimônio líquido. Agrupamento orientado pela `statementSection` do plano de contas.
   - Saldo na data de referência por conta = saldo de abertura (de `config/opening-trial-balance.json`) + soma de todas as linhas de lançamentos contábeis que atingem essa conta até a data de referência.
   - **Conferência do patrimônio líquido**: patrimônio líquido de abertura + lucro líquido acumulado no ano (da DRE em execução) + movimentações de capital integralizado + concessões de participação acionária deve ser igual à seção de patrimônio líquido calculada. Diferença > $0,01 = alerta.
   - **Comparação período-sobre-período**: versus o fim do mês anterior E o fim do ano anterior.
   - **Sinalizar saldos incomuns**: contas a receber com saldo credor, contas a pagar com saldo devedor, caixa negativo, estoque negativo, receita diferida negativa. Cada alerta nomeia a conta + saldo + ação recomendada.

   ### `statement=cash-flow`
   - **Método indireto.** Começar do Lucro Líquido (DRE do período).
   - Adicionar de volta itens não caixa: depreciação, amortização, remuneração em ações (lançamentos contábeis com `type: "depreciation"` ou `type: "stock-comp"`).
   - Movimentação de capital de giro + receita diferida: `delta(contas a receber)`, `delta(contas a pagar)`, `delta(despesas antecipadas)`, `delta(receita diferida)`, `delta(passivos provisionados)` entre o fim do período anterior e o fim deste período.
   - Divisão: operacional / investimento / financiamento. Investimento = compras e baixas de ativo imobilizado. Financiamento = captações de capital + dívida + distribuições.
   - **Conciliação do caixa final**: o caixa final segundo o fluxo de caixa deve ser igual à soma das contas de caixa do balanço patrimonial dentro de $0,01. Diferença = alerta no topo; NÃO ajustar silenciosamente.

   ### `statement=trial-balance`
   - Cada conta com saldo devedor ou credor final na data solicitada. Agrupar por `statementSection`.
   - **Débitos = créditos dentro de $0,01** - se estiver fora do equilíbrio, sinalizar com destaque no topo com a diferença + uma lista curta dos lançamentos contábeis mais recentes possivelmente desequilibrados.
   - **Conferência cruzada**: o lucro líquido implícito no balancete deve ser igual ao lucro líquido da DRE da ramificação `pnl`. A seção de patrimônio líquido deve conferir com o patrimônio líquido do balanço patrimonial. Divergência = alerta.

4. **Escrever a demonstração.** Caminho: `financials/{YYYY-MM}/{statement}.md` (usar o `YYYY-MM` do fim do período para `balance-sheet` / `trial-balance` também). Escrita atômica: `.tmp` → renomear. Estrutura:
   - Cabeçalho: nome da demonstração, entidade, período / data de referência, método contábil.
   - Tabela(s) de números.
   - Bloco de comparação período-sobre-período (quando aplicável).
   - Bloco de alertas (saldos incomuns, desequilíbrio, lacunas de conciliação).
   - Bloco de notas (3 a 5 para a DRE e o fluxo de caixa, cada uma citando ids de lançamentos contábeis ou conjuntos de transações).
   - Rodapé: fontes (hash de journal-entries.json, data do balancete de abertura, versão do plano de contas).

5. **Anexar a `outputs.json`.** Ler-mesclar-escrever. Linha: `{id, type: "financial-statement", title: "{Demonstração} - {período}", summary: "<2 a 3 frases com o número principal + maior fator>", path: "financials/{YYYY-MM}/{statement}.md", status: "draft", domain: "reporting"}`.

6. **Nunca inventar.** Cada número remonta a um id de lançamento contábil ou saldo de abertura de conta. Cada nota cita evidência. Os códigos de conta permanecem em texto. Se o usuário pedir um período antes da data do saldo de abertura, recusar e explicar.

7. **Resumir para o usuário.** Um parágrafo curto:
   - `pnl`: receita, margem bruta, lucro líquido, maior variação mensal.
   - `balance-sheet`: ativo total, caixa, alertas incomuns.
   - `cash-flow`: fluxo de caixa operacional, investimento, financiamento, caixa final (com status da conciliação).
   - `trial-balance`: em equilíbrio Sim/Não, total de débitos = total de créditos, diferença de desequilíbrio se houver.
   Apontar o usuário para o arquivo escrito. Destacar quaisquer alertas.

## Saídas

- `financials/{YYYY-MM}/pnl.md`
- `financials/{YYYY-MM}/balance-sheet.md`
- `financials/{YYYY-MM}/cash-flow.md`
- `financials/{YYYY-MM}/trial-balance.md`
- Linha em `outputs.json`: `type: "financial-statement"`, `domain: "reporting"`, `status: "draft"` até o usuário mudar para `ready`.

---
name: explicar-minha-variacao
title: "Explicar minha variação"
description: "Me diga por que uma linha da DRE se moveu. Comparo os valores realizados com o orçamento (se você tiver um), o período anterior, e o mesmo período do ano anterior, decomponho cada variação relevante em fatores de preço / volume / mix / eventos pontuais vinculados a lançamentos contábeis e fornecedores específicos, e escrevo uma narrativa de 3 a 5 parágrafos sobre as maiores movimentações. O limite de materialidade é de 5% e $1.000 por padrão, e pode ser configurado a cada execução. Os resíduos não explicados são mostrados, nunca absorvidos silenciosamente. Somente rascunhos, eu nunca reclassifico nem lanço nada para 'limpar' uma variação."
version: 1
category: Contabilidade
featured: no
image: ledger
---


# Explicar Minha Variação

Realizado versus orçamento versus período anterior versus mesmo período do ano anterior. Decomponho toda linha relevante em fatores de preço / volume / mix / eventos pontuais, cada um vinculado a ids de lançamentos contábeis ou conjuntos de transações específicos. A narrativa foca nas 3 a 5 maiores movimentações para que você leia uma história, não uma planilha. O que eu não conseguir explicar, eu rotulo como resíduo em vez de inventar uma causa.

## Quando usar

- "por que as despesas operacionais subiram em março" / "o que causou a queda na receita".
- "compare o realizado com o orçamento de {período}".
- "rode a análise de variação de {período}".
- Chamado por `close-my-month` depois que `prepare-my-financials statement=pnl` gravar a DRE do período atual.

## Conexões que preciso

Executo trabalho externo pelo Composio. Antes desta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar, eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Nenhuma conexão externa necessária.** Eu trabalho inteiramente a partir dos seus lançamentos contábeis existentes, das DREs e do arquivo de orçamento.

Esta habilidade nunca bloqueia por falta de conexão.

## Informações que preciso

Eu leio o seu contexto contábil primeiro. Para todo campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: aplicativo conectado > envio de arquivo > URL > colar) e espero.

- **O período a analisar**, obrigatório. Motivo: define a janela do realizado e quais períodos anteriores usar na comparação. Se faltar, pergunto: "Em qual período vamos rodar a variação, por exemplo março de 2025 ou Q1 de 2025?"
- **Uma DRE finalizada para o período**, obrigatório. Motivo: a variação compara as linhas da DRE deste período contra as bases. Se faltar, pergunto: "Já fechamos e geramos a DRE desse período? Se não, vamos rodar isso primeiro."
- **Um plano de contas**, obrigatório. Motivo: agrupo as variações por linha de código de conta e seção da demonstração a partir do seu plano de contas. Se faltar, pergunto: "Já temos um plano de contas? Se não, vamos elaborar um primeiro."
- **Um orçamento atual**, opcional. Motivo: permite rodar realizado versus orçamento junto com realizado versus período anterior. Se você não tiver um, eu continuo e anoto "sem orçamento registrado" no relatório.
- **Pelo menos uma DRE anterior (mês passado ou mesmo mês do ano passado)**, opcional mas fortemente preferível. Motivo: me dá uma base de comparação. Se você não tiver uma, eu reporto apenas o realizado e sinalizo que ainda não há nada para comparar.

## Passos

1. **Ler o contexto.** Carregar `context/bookkeeping-context.md`, `config/context-ledger.json` (para `domains.budget`, cadência mais caminho), `config/chart-of-accounts.json`. Ler `config/budget.json` se existir (`[{period, glCode, amount, note?}]`).

2. **Escolher as bases de comparação.** Para o `period` solicitado (`YYYY-MM` ou `YYYY-QN`), montar até três bases:
   - **Orçamento**, linhas de `config/budget.json` para o período. Se ausente, pular mais anotar "sem orçamento registrado".
   - **Período anterior**, `financials/{prior-YYYY-MM}/pnl.md` se presente; senão recalcular na hora a partir de `journal-entries.json`.
   - **Mesmo período do ano anterior**, `financials/{prior-YYYY-MM-12}/pnl.md` se presente; senão recalcular.

3. **Carregar o realizado do período.** Ler a DRE do período de `financials/{YYYY-MM}/pnl.md` (gerada por `prepare-my-financials`). Se ausente, recalcular a partir de `journal-entries.json` na hora mais anotar que a DRE canônica ainda não foi gravada.

4. **Calcular as variações por linha de código de conta.** Para cada linha de código de conta em qualquer um de: realizado, orçamento, período anterior, ano anterior, calcular:
   - `actual_minus_budget`, `pct_vs_budget`
   - `actual_minus_prior_period`, `pct_vs_prior_period`
   - `actual_minus_prior_year`, `pct_vs_prior_year`

5. **Aplicar o limite de materialidade.** Padrão: `abs(variance) > 5% AND abs(variance) > $1000`. Configurável por execução via argumento. Só as variações relevantes recebem decomposição de fatores. As não relevantes são resumidas em uma única tabela no final.

6. **Decompor cada variação relevante em fatores.** Fundamentar cada fator em lançamentos contábeis ou transações específicas:
   - **Preço**, custo unitário mudou com a mesma quantidade (por exemplo, aumento de preço de um fornecedor de SaaS). Citar os ids de lançamentos contábeis onde o novo preço aparece pela primeira vez.
   - **Volume**, mais ou menos unidades ao mesmo preço unitário (por exemplo, mais gasto com hospedagem porque o uso dobrou). Citar a contagem de transações versus a base mais ids de lançamentos contábeis representativos.
   - **Mix**, combinação diferente de SKUs / fornecedores / categorias. Citar lançamentos contábeis que entraram mais fornecedores que saíram.
   - **Evento pontual**, não recorrente (acerto de conta, reembolso avulso, renovação anual lançada no mês). Citar o id do lançamento contábil mais o memorando.

   Cada fator tem: `{driver, amount, jeRefs: [id…], transactionRefs?: [ids…], narrative}`. `amount` precisa somar até o total da variação com margem de $1,00. O resíduo não explicado é registrado explicitamente, nunca absorvido silenciosamente.

7. **Escrever uma narrativa em português simples sobre as 3 a 5 maiores movimentações.** A narrativa nomeia cada movimentação, o impacto em dólares, o fator principal, e a evidência específica (id de lançamento contábil ou fornecedor ou conjunto de transações). Sem causas inventadas. Se a evidência for fraca, diga isso. "sem fator óbvio, recomendo que o usuário revise" é aceitável. Enchimento especulativo não é.

8. **Gravar o artefato de variação.** Caminho: `variance-analyses/{YYYY-MM}.md`. Gravação atômica: `.tmp` → renomear. Estrutura:
   - Cabeçalho: período, bases usadas, limite de materialidade, método contábil.
   - **Manchete**, resumo de 1 a 2 frases (por exemplo, "Despesas operacionais +$45 mil (+12%) versus orçamento, impulsionadas pela hospedagem que dobrou e um acerto jurídico pontual").
   - **Narrativa**, 3 a 5 parágrafos sobre as maiores movimentações, cada um citando ids de lançamentos contábeis / fornecedores / contagens de transações.
   - **Tabela de variações relevantes**, uma linha por linha de código de conta relevante com realizado, cada base, variação, decomposição de fatores.
   - **Variações não relevantes**, tabela resumida compacta.
   - **Resíduos não explicados**, qualquer decomposição de fator não conciliada dentro de $1,00.
   - Rodapé: fontes (caminho do arquivo da DRE, caminho do arquivo de orçamento, caminhos das DREs de períodos anteriores, hash de journal-entries.json).

9. **Anexar a `outputs.json`.** Leitura-mesclagem-gravação. Linha: `{id, type: "variance-analysis", title: "Variação, {YYYY-MM}", summary: "<a manchete>", path: "variance-analyses/{YYYY-MM}.md", status: "draft", domain: "reporting"}`.

10. **Resumir para o usuário.** Um parágrafo: manchete mais as 3 a 5 maiores movimentações com impacto em dólares mais o fator principal, além dos resíduos não explicados que precisam de revisão. Apontar para o arquivo gravado.

## Saídas

- `variance-analyses/{YYYY-MM}.md`
- Linha em `outputs.json`: `type: "variance-analysis"`, `domain: "reporting"`, `status: "draft"` até você aprovar.

---
name: fechar-meu-mes
title: "Fechar meu mês"
description: "Executo um fechamento mensal completo de ponta a ponta: concilio cada conta registrada, atualizo o registro de provisões, elaboro cada lançamento contábil padrão pendente (reversão, provisão, despesa antecipada, folha de pagamento, reconhecimento de receita, depreciação, remuneração em ações, ajuste), faço uma verificação de corte para transações lançadas no período errado, gero a DRE, o balanço patrimonial e o fluxo de caixa, faço uma análise de variações, e monto um pacote de fechamento com os quatro alertas de pendências (diferenças de conciliação > $100, sem categorizar > 10%, provisões vencidas > 90 dias, lançamentos ainda em rascunho) no topo. A subinvocação `step=cutoff-check` executa a etapa de corte de forma independente. Somente rascunhos, eu nunca lanço lançamentos contábeis, nunca apresento nada, nunca movimento dinheiro."
version: 1
category: Contabilidade
featured: yes
image: ledger
integrations: [quickbooks, xero]
---


# Fechar meu mês

O orquestrador do fim de mês. Seu mês fecha quando toda conta concilia, todo lançamento contábil pendente está elaborado, o corte foi verificado, as demonstrações financeiras batem, a variação foi explicada, e o pacote está aprovado. Eu encadeio as habilidades responsáveis por cada etapa; nunca faço o trabalho delas diretamente.

Invariantes que preservo em toda execução: todo código de conta existe no seu plano de contas travado, todo lançamento contábil bate até o centavo, as diferenças de conciliação nunca são plugadas silenciosamente, o pacote permanece em `status: "draft"` até você aprovar. Eu nunca lanço lançamentos contábeis, nunca movimento dinheiro, nunca declaro.

## Quando usar

- "feche os livros de março" / "rode o fim de mês" / "feche o último mês do primeiro trimestre".
- "podemos entregar o fechamento de {YYYY-MM}", roda a cadeia inteira.
- "verificação de corte" / "algo foi lançado no período errado" / "o que foi lançado no período errado", invocar com `step=cutoff-check` para a subetapa independente.
- `step=cutoff-check`, subetapa de corte independente, sem repetir o resto da orquestração. Útil quando as outras etapas já rodaram e só precisa atualizar o corte.

## Conexões que preciso

Eu executo trabalho externo através do Composio. Antes desta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar, nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **QuickBooks Online ou Xero** (contabilidade), preferido para os registros do razão geral e verificações de corte de vencimento de contas a pagar. Obrigatório se você quiser que eu extraia a atividade do razão geral diretamente.
- **Feed bancário** (bancário com suporte da Plaid), fonte preferida para conciliar cada conta de caixa. Opcional, você também pode enviar PDFs de extrato.
- **Provedor de folha de pagamento** (Gusto, Rippling, Justworks), necessário só quando há um lançamento contábil de folha de pagamento pendente para o período. Opcional, cole um resumo como alternativa.
- **Stripe** (cobrança), necessário só ao conciliar o Stripe ou extrair a receita mensal atual para reconhecimento de receita. Opcional.

Eu oriento as habilidades filhas (conciliação, provisões, lançamentos contábeis, demonstrações, variação) e cada uma faz sua própria verificação de conexão; se qualquer uma delas parar, eu apresento esse bloqueio de volta para você.

## Informações que preciso

Eu leio primeiro o seu contexto contábil. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: aplicativo conectado > envio de arquivo > URL > colar) e espero.

- **O período a fechar** - Obrigatório. Por quê: me diz o intervalo de datas para conciliações, provisões e demonstrações. Se estiver faltando, pergunto: "Qual mês estamos fechando?"
- **Um contexto contábil finalizado** - Obrigatório. Por quê: preciso do seu método contábil, código de suspenso e contas registradas antes de orquestrar o fechamento. Se estiver faltando, pergunto: "Já configuramos os livros? Se não, rode a configuração primeiro."
- **Um plano de contas** - Obrigatório. Por quê: todo lançamento contábil e demonstração depende dele. Se estiver faltando, pergunto: "Já temos um plano de contas? Se não, vamos elaborar um primeiro."
- **Um balancete de abertura** - Obrigatório se este for seu primeiro fechamento neste sistema. Por quê: todo número do balanço patrimonial se ancora aqui. Se estiver faltando, pergunto: "Você tem um balancete de fechamento dos seus livros anteriores? Envie a planilha para que eu carregue os saldos de abertura."
- **Um orçamento atual** - Opcional. Por quê: a análise de variação roda contra o orçamento se disponível, senão contra o período anterior. Se você não tiver um, eu continuo e rodo só a variação de período anterior.

## Passos

1. **Analisar as entradas e ler o contexto.**
   - Obrigatório: `period` (`YYYY-MM`). Analisar para `{periodStart, periodEnd}`.
   - Carregar `context/bookkeeping-context.md`, parar se estiver faltando, pedir ao usuário para rodar `set-up-my-books` primeiro.
   - Carregar `config/context-ledger.json`, `config/chart-of-accounts.json` (**travado** para a execução, parar se estiver ausente, pedir `build-my-chart-of-accounts`), `config/prior-categorizations.json`, `config/opening-trial-balance.json` (se presente), `config/budget.json` (se presente).
   - Criar a pasta de fechamento: `mkdir -p closes/{YYYY-MM}/`.

2. **Registrar um instantâneo do estado do período anterior.** Antes de qualquer escrita, copiar as linhas relevantes de `outputs.json` do período para `closes/{YYYY-MM}/_snapshot.json` para que o fechamento seja reproduzível se o usuário rodar de novo.

3. **Ramo `step=cutoff-check`.** Se acionado, pular para o Passo 7.

4. **Conciliar cada conta (repetir `reconcile-my-accounts`).** Para cada conta em `context-ledger.domains.banks.accounts[]`, invocar a habilidade `reconcile-my-accounts` para `{accountLast4, period}`. Coletar o caminho da saída mais o status da diferença. Depois rodar `reconcile-my-accounts mode=transfer-detect` uma vez em todas as contas do período, marcar as transferências entre contas com o código de conta 9000 para que fiquem fora da DRE nas fórmulas SUMIFS a jusante. NÃO avançar para o Passo 5 se qualquer conta retornar `status: "unresolved-break"` E a diferença for `> $100`, apresentar essas primeiro, esperar a decisão do usuário ("plugar com um lançamento de ajuste" versus "pesquisar mais").

5. **Atualizar o registro de provisões (`review-my-accruals`).** Invocar `review-my-accruals` para o período. Reescreve `accruals/register.md`, faz leitura, mescla, escrita em `accruals.json` com o conjunto atual de provisões ativas. Capturar a lista de provisões sinalizadas com `reversing=true` que precisam reverter na abertura do período, viram entradas para o Passo 6 do lançamento de reversão.

6. **Elaborar cada lançamento contábil padrão pendente (repetir `draft-a-journal-entry`).** Nesta ordem, invocar `draft-a-journal-entry` uma vez por lançamento pendente; cada chamada anexa um lançamento contábil balanceado a `journal-entries.json`. Coletar os caminhos mais os ids para o pacote.

   1. **Lançamentos de reversão**, `type=accrual mode=reversing`, reverte automaticamente toda provisão ativa sinalizada com `reversing=true`.
   2. **Novas provisões**, `type=accrual`, conforme a saída de `review-my-accruals` (receita não faturada, folha de pagamento provisionada, juros provisionados).
   3. **Despesas antecipadas**, `type=prepaid`, amortiza aluguel / SaaS / seguro.
   4. **Folha de pagamento**, `type=payroll`, extrai do Gusto / Rippling / Justworks via `composio search payroll`; recorre a colar se não houver.
   5. **Reconhecimento de receita**, `type=revrec`, receita reconhecida conforme os cronogramas de ASC 606 em `revrec/`.
   6. **Depreciação**, `type=depreciation`, a partir de `config/fixed-assets.json`.
   7. **Remuneração em ações**, `type=stock-comp`, remuneração em ações conforme o cronograma de vesting.
   8. **Ajustes**, lançamentos `type=adjustment` sugeridos pelas conciliações (taxas não registradas, arredondamento cambial).

   Todo lançamento contábil fica em `status: "draft"`. Nunca virar `posted` aqui, precisa de confirmação explícita do usuário.

7. **Subetapa de verificação de corte.** Construir `closes/{YYYY-MM}/cutoff-check.md` com estas verificações:
   - **Despesas datadas no período anterior, lançadas no atual**, varrer os lançamentos contábeis do período por datas de recibo / origem no período anterior. Sugerir "provisionar no período anterior, reverter neste período".
   - **Despesas datadas no período atual, ainda não lançadas**, extrair o vencimento de contas a pagar via `composio search accounting`. Qualquer conta em aberto datada `≤ periodEnd` ausente dos lançamentos contábeis deste período é candidata a passivo não registrado.
   - **Corte de receita**, faturas datadas depois de `periodEnd` com datas de entrega antes de `periodEnd` (verificação cruzada com ASC 606).
   - **Sanidade do regime de caixa**, pagamentos `> 1%` das despesas operacionais do período dentro de ±3 dias de `periodEnd`.
   - **Levantamento de suspenso**, saldo atual de `suspense.json`; sinalizar itens com mais de 90 dias.

   Layout do documento: cabeçalho de resumo com contagens mais totais em dólares por grupo, uma tabela por verificação com `{date, description, amount, suggestedAction}`. Anexar uma linha em `outputs.json` com `type: "books-audit", domain: "close"`. Se invocado como `step=cutoff-check`, parar aqui; pular os Passos 8 em diante.

8. **Gerar as três demonstrações financeiras (`prepare-my-financials` × 3).** Em sequência, para que as demonstrações seguintes possam ler as anteriores:
   1. `statement=pnl`, escreve `financials/{YYYY-MM}/pnl.md`.
   2. `statement=balance-sheet`, escreve `financials/{YYYY-MM}/balance-sheet.md`. Faz verificação cruzada dos Lucros Acumulados com o Lucro Líquido da DRE calculado no passo 8.1.
   3. `statement=cash-flow`, escreve `financials/{YYYY-MM}/cash-flow.md`. Concilia a linha final de caixa com a soma dos saldos finais de `context-ledger.domains.banks` (das conciliações no Passo 4).

   Se qualquer demonstração falhar na verificação cruzada interna, apresentar a diferença e NÃO avançar para a variação. O usuário decide.

9. **Rodar a análise de variação (`explain-my-variance`).** Invocar uma vez para o período. Se `config/budget.json` existir, a habilidade roda realizado versus orçado; senão, roda contra o período anterior. Captura a decomposição de fatores mais a narrativa em linguagem simples. Escreve `variance-analyses/{YYYY-MM}.md`.

10. **Calcular as sinalizações de pendências para o cabeçalho do pacote.**
    - **Diferenças de conciliação > $100**, contagem em `recon-breaks.json` com `abs(amount) > 100` E `status: "unresolved"`.
    - **Sem categorizar > 10% do volume**, dólares absolutos em Suspenso divididos pelo volume absoluto total do período. Sinalizar se `> 0.10`.
    - **Provisões vencidas > 90 dias**, entradas em `accruals.json` com `active=true` E `now - createdAt > 90 days`.
    - **Lançamentos contábeis ainda em rascunho**, contagem de `journal-entries.json` do período com `status: "draft"` (não zero na primeira execução é esperado, sinaliza a ação "lançar estes N lançamentos contábeis no QuickBooks Online / Xero").

11. **Montar `closes/{YYYY-MM}/package.md`.** Seções:
    - **Cabeçalho**, período, status (`draft`), carimbo de data e hora, as quatro sinalizações do Passo 10 renderizadas em destaque como as pendências do usuário.
    - **Conciliações**, resumo de uma linha por conta com o resultado da prova de três vias e link para a conciliação completa; pares de transferência interna destacados.
    - **Lançamentos contábeis**, tabela `{id, date, type, memo, totalDebits, status}` ordenada por tipo e depois por data; cada linha aponta para `journal-entries/{YYYY-MM}/{slug}.md`.
    - **Verificação de corte**, contagens por grupo mais link para `cutoff-check.md`.
    - **Demonstrações financeiras**, links da DRE, balanço patrimonial, fluxo de caixa com os números principais embutidos (Lucro Líquido, Caixa Final, Ativos Totais).
    - **Análise de variação**, link mais narrativa de 3 pontos retirada literalmente de `variance-analyses/{YYYY-MM}.md`.
    - **Instantâneo de provisões**, contagens (ativas / revertidas / vencidas) mais link para `accruals/register.md`.
    - **Perguntas em aberto para o fundador**, qualquer coisa que as habilidades filhas tenham apresentado precisando de decisão humana antes de virar `ready`.

12. **Atualizar os índices** (`.tmp` atômico mais renomear, ler, mesclar, escrever):
    - `outputs.json`, `{type: "close-package", title: "Close {YYYY-MM}", summary, path, status: "draft", domain: "close"}`. As habilidades filhas já anexaram suas próprias linhas.
    - `run-index.json`, `{id, period, status: "draft", accountsIncluded[], suspenseTotal, pnlNetIncome}`. `pnlNetIncome` lido literalmente da DRE.

13. **Resumir para o usuário.** Status do fechamento mais caminho do pacote (clicável), as quatro sinalizações do Passo 10 com itens de ação ("lançar {N} lançamentos contábeis em rascunho", "resolver {M} diferenças de conciliação"), números principais (Lucro Líquido, Caixa Final, Runway), próximo passo ("aprove os lançamentos contábeis em rascunho e eu viro o pacote para `ready`").

## Contrato de invocação de subhabilidade

Cada habilidade filha (`reconcile-account`, `review-accruals`, `prep-journal-entry`, `generate-financial-statements`, `run-variance-analysis`) é invocada com `period`, é dona do próprio artefato mais as linhas de índice, nunca refeita diretamente. Se a filha parar em um bloqueio (configuração / conexão ausente), apresentar literalmente e pausar.

## Saídas

- `closes/{YYYY-MM}/package.md`, narrativa de fechamento de alto nível com as quatro sinalizações de pendências no topo.
- `closes/{YYYY-MM}/cutoff-check.md`, problemas de corte mais passivos não registrados.
- `closes/{YYYY-MM}/_snapshot.json`, instantâneo do estado do período anterior para reprodutibilidade.
- Todos os artefatos das habilidades filhas, `reconciliations/{account_last4}/{YYYY-MM}.md` × N, `journal-entries/{YYYY-MM}/*.md` × M, `financials/{YYYY-MM}/*.md` × 3, `variance-analyses/{YYYY-MM}.md`, `accruals/register.md` (reescrito).
- `outputs.json`, uma linha para o pacote de fechamento mais as linhas de cada habilidade filha.
- `run-index.json`, uma linha anexada, `status: "draft"`.

---
name: elaborar-um-lancamento-contabil
title: "Elaborar um lançamento contábil"
description: "Use quando disser 'lance o lançamento da provisão' / 'elabore o lançamento de depreciação do Q1' / 'contabilize a amortização da despesa antecipada' / 'reconhecimento de receita deste período' / 'lançamento de remuneração em ações' / 'reclassifique esta despesa'. Eu elaboro um lançamento contábil de partida dobrada balanceado que se ramifica conforme `type`: `accrual` | `prepaid` | `payroll` | `revrec` | `depreciation` | `stock-comp` | `adjustment` | `reclass`. Cada lançamento é validado para bater até o centavo, cada código de conta é validado contra `config/chart-of-accounts.json`, e o lançamento é gravado com `status: \"draft\"`. O submodo `type=accrual mode=reversing` reverte automaticamente cada provisão ativa marcada `reversing=true`. Somente rascunho, eu nunca lanço no QuickBooks Online nem no Xero."
version: 1
category: Contabilidade
featured: no
image: ledger
integrations: [quickbooks, xero, linear]
---


# Elaborar Lançamento Contábil

Um lançamento contábil balanceado a partir de um modelo específico do tipo. Invariantes aplicados a cada gravação: débitos iguais a créditos até 1 centavo, todo `glCode` existe no plano de contas travado, `status: "draft"` (nunca `posted` sem confirmação explícita do usuário), `reversing: true` exige `reversesEntryId` mais convenção de sinal oposta.

Somente rascunho: escrevo o markdown mais a linha de índice; você ou seu contador lançam no QuickBooks Online / Xero.

## Quando usar

- "lance o lançamento da provisão" / "elabore o lançamento de depreciação do Q1" / "contabilize a amortização da despesa antecipada".
- "lançamento de reconhecimento de receita de março" / "lançamento de remuneração em ações do período".
- "reclassifique este $X de Gerais e Administrativas para P&D" / "lance este ajuste".
- "lance o lançamento da folha de pagamento do Gusto / Rippling / Justworks", use `type=payroll` com o resumo do período de pagamento.
- "lance os lançamentos de reversão deste período" / "elabore as reversões deste período", use `type=accrual mode=reversing` para reverter automaticamente cada provisão ativa marcada `reversing=true`.
- Chamado por `run-monthly-close` para cada lançamento contábil padrão pendente no ciclo de fechamento.

## Conexões que preciso

Executo trabalho externo pelo Composio. Antes desta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar, eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Provedor de folha de pagamento** (Gusto, Rippling, Justworks, Deel, ADP), necessário para `type=payroll` se você quiser que eu puxe o resumo do período de pagamento diretamente. Caso contrário, você cola o resumo.
- **QuickBooks Online ou Xero** (contabilidade), opcional, usado para verificar cruzadamente códigos de conta em `type=adjustment` ou `type=reclass`.
- **Linear**, opcional, usado apenas para consultar o contexto do projeto se você quiser um memorando fundamentado em um chamado.

Se `type=payroll` e não houver conexão de folha de pagamento, eu paro e peço para você conectar Gusto / Rippling / Justworks, ou colar o resumo do período de pagamento.

## Informações que preciso

Eu leio o seu contexto contábil primeiro. Para todo campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: aplicativo conectado > envio de arquivo > URL > colar) e espero.

- **Um plano de contas**, obrigatório. Motivo: toda linha do lançamento contábil precisa referenciar um código de conta real. Se faltar, pergunto: "Já temos um plano de contas? Se não, vamos elaborar um primeiro."
- **O tipo de lançamento e o período**, obrigatório. Motivo: define qual modelo usar (provisão, despesa antecipada, folha de pagamento, reconhecimento de receita, depreciação, remuneração em ações, ajuste, reclassificação) e em qual mês ele entra. Se faltar, pergunto: "Que tipo de lançamento estamos fazendo, e para qual mês?"
- **Uma lista de ativos fixos, para `type=depreciation`**, obrigatório para esse tipo. Motivo: calculo a depreciação mensal a partir do custo, valor residual e vida útil de cada ativo. Se faltar, pergunto: "Você tem uma lista de ativos fixos capitalizados com custo, data de entrada em serviço e vida útil? Envie a planilha ou cole aqui."
- **Um laudo 409A e cronograma de vesting, para `type=stock-comp`**, obrigatório para esse tipo. Motivo: direciona a despesa linear conforme ASC 718 após o cliff. Se faltar, pergunto: "Você tem um laudo 409A atual e o cronograma de vesting das outorgas em aberto? Envie ou compartilhe o que tiver."
- **Um resumo do período de pagamento, para `type=payroll`**, obrigatório para esse tipo. Motivo: divido os salários por P&D / Vendas e Marketing / Gerais e Administrativas a partir disso. Se faltar, pergunto: "Você pode conectar o Gusto, Rippling ou Justworks, ou colar o resumo do período de pagamento com bruto, impostos, benefícios e pagamento líquido por departamento?"

## Passos

1. **Analisar as entradas.** Obrigatório: `type` (um de `accrual` | `prepaid` | `payroll` | `revrec` | `depreciation` | `stock-comp` | `adjustment` | `reclass`) e `period` (`YYYY-MM`). Opcional: `mode` (só faz sentido quando `type=accrual`, valor `reversing`), `slug` curto para o nome do arquivo.

2. **Ler o contexto.** Carregar `context/bookkeeping-context.md` (parar se estiver ausente), `config/context-ledger.json`, `config/chart-of-accounts.json` (**travado** para a execução, parar se estiver ausente), `accruals.json` (array vazio se ausente). Para folha de pagamento / depreciação / remuneração em ações, ler também a configuração específica do tipo (abaixo).

3. **Ramificar conforme `type`.** Cada ramo constrói o array `lines[]`; o Passo 4 valida antes de gravar.

   ### `accrual`
   Provisão de fim de período (receita não faturada, folha de pagamento provisionada, juros provisionados). Debita a linha de despesa / receita, credita `Passivos Provisionados` (ou debita `Receita Provisionada` mais credita a receita). `reversing: true` por padrão. Anexar a `accruals.json`: `{id, type, active: true, reversing: true, period, amount, glCode, counterGlCode, memo, createdAt, updatedAt}`.

   **Submodo `mode=reversing`.** Ler `accruals.json`, encontrar todo registro com `active=true AND reversing=true AND period < current`. Para cada um, produzir um lançamento contábil de reversão com `reversesEntryId` apontando para o original e a convenção de sinal invertida. Marcar o original como `active: false` e definir `reversedOn`. Gravar cada reversão como um lançamento contábil separado.

   ### `prepaid`
   Amortizar despesa antecipada (aluguel, SaaS, seguro). Debita a conta de despesa, credita a conta de ativo de despesa antecipada. `reversing: false`. Memorando: `"Amortizar {ativo}, {período}"`.

   ### `payroll`
   Resumo do período de pagamento. Ordem de origem: aplicativo conectado (`composio search payroll` → Gusto / Rippling / Justworks / Deel / ADP, esquema via `--get-schema`) > resumo colado `{gross, taxes, benefits, netPay, byDepartment: {rd, sm, ga}}`. Linhas: debita `Salários, P&D / Vendas e Marketing / Gerais e Administrativas` conforme o plano de contas, debita `Impostos sobre a Folha`, debita `Benefícios de Funcionários`; credita `Salários a Pagar` (ou `Caixa` se pago no período, perguntar uma vez), `Impostos sobre a Folha a Pagar`, `Benefícios a Pagar`. Memorando: `"Folha de pagamento, {período}, {provedor}"`.

   ### `revrec`
   Ler todo `revrec/**/*.json`, escolher as linhas com `period = current`. Debita `Receita Diferida`, credita a conta de receita. Multimoeda → agregar na moeda local (já no cronograma). Memorando: `"Reconhecimento de receita, {período}, {N} contratos"`.

   ### `depreciation`
   Ler `config/fixed-assets.json` (formato: `[{id, description, class, cost, salvage, usefulLifeMonths, inServiceOn, method: "straight-line"}]`). Se ausente, perguntar UMA vez pelo cronograma (arquivo > colar), NUNCA inventar. Calcular `(cost - salvage) / usefulLifeMonths` por ativo, agrupar por classe. Debita `Despesa de Depreciação, {classe}`, credita `Depreciação Acumulada, {classe}`. Memorando: `"Depreciação, {período}, {N} ativos"`.

   ### `stock-comp`
   Ler `config/stock-comp.json` (formato: `{valuation: {fmv, asOf}, grants: [{employeeId?, grantDate, shares, strike, vestingMonths, cliff}]}`). Se ausente, perguntar UMA vez pelo laudo 409A e cronograma de vesting. Despesa linear após o cliff conforme ASC 718. Debita `Despesa de Remuneração em Ações` (dividida por P&D / Vendas e Marketing / Gerais e Administrativas se o plano de contas suportar), credita `Capital Adicional Integralizado`. Memorando: `"Remuneração em ações, {período}, {N} outorgas"`. Se `context/bookkeeping-context.md` marcar remuneração em ações como recusa firme sem aprovação, parar e apresentar o rascunho para aprovação.

   ### `adjustment`
   Ajuste manual geral. O usuário dita `{glCode, debit, credit, memo}` por linha (2 ou mais linhas). Origens comuns: taxas não registradas de conciliações, arredondamento de câmbio, correções de categorização anteriores.

   ### `reclass`
   Entradas `{fromGlCode, toGlCode, amount, memo}`. Debita `toGlCode`, credita `fromGlCode`. Ambas devem ser linhas de despesa ou ativo; troca de seção (despesa → passivo) exige `type=adjustment` em vez disso.

4. **Validar antes de gravar.** Guardas rígidas, a falha interrompe a gravação e apresenta o erro:
   - `sum(debits) === sum(credits)` até 1 centavo.
   - Todo `glCode` existe em `config/chart-of-accounts.json` (não só o pai, o código exato).
   - `lines[].length >= 2`.
   - `type = reversing` implica `reversesEntryId` definido E o lançamento contábil referenciado tem `reversing: true` E a convenção de sinal invertida.
   - Nenhum `status: "posted"` (só `draft` é permitido a partir desta habilidade).

5. **Gravar o markdown do lançamento contábil** em `journal-entries/{YYYY-MM}/{type}-{slug}.md`. Estrutura:
   - Cabeçalho: `id`, `type`, `period`, `date`, memorando, status, reversing, reversesEntryId (se houver).
   - **Linhas**, tabela markdown `{glCode | glName | debit | credit | memo}`.
   - Linha de totais: total de débitos, total de créditos, diferença (deve ser 0).
   - Documentos de suporte: caminhos referenciados (resumo do período de pagamento, cronograma de reconhecimento de receita, arquivo de ativos fixos, recibos).
   - Notas: perguntas em aberto apresentadas inline.

6. **Anexar a `journal-entries.json`** na raiz do agente. Leitura-mesclagem-gravação atômica. Esquema completo de `data-schema.md`: `{id, createdAt, updatedAt, date, type, memo, reversing, reversesEntryId?, period, lines[], status: "draft", supportingDocs?}`.

7. **Efeitos colaterais específicos do tipo.**
   - `accrual` (não no submodo reversing) → anexar a `accruals.json` com `active: true`.
   - `accrual mode=reversing` → atualizar a linha da provisão original com `active: false, reversedOn, reversedByEntryId`.
   - `revrec` → marcar as linhas correspondentes em `revrec/{customer-slug}/{contract-slug}.json` como `recognized: true, recognizedBy: {id}` para aquele período.
   - `depreciation` → marcar as linhas correspondentes em `config/fixed-assets.json` com `lastDepreciatedPeriod: "{period}", accumulated += monthly`.

8. **Anexar uma linha a `outputs.json`**: `{type: "journal-entry", title: "lançamento contábil {type}, {período}, {slug}", summary, path, status: "draft", domain: "close"}`. Leitura-mesclagem-gravação; nunca sobrescrever.

9. **Resumir para o usuário.** Um bloco compacto: id do lançamento contábil, valor total, tipo, caminho, lembrete de que é `draft` até você lançar no QuickBooks Online / Xero e confirmar. Oferecer mudar `status: "posted"` só mediante confirmação explícita.

## Saídas

- `journal-entries/{YYYY-MM}/{type}-{slug}.md`, lançamento contábil legível com tabela de linhas balanceada.
- `journal-entries.json`, leitura-mesclagem-gravação, lançamento contábil anexado com `status: "draft"`.
- `accruals.json`, apenas em `type=accrual` (anexar) ou `type=accrual mode=reversing` (atualizar a linha original).
- `revrec/{customer-slug}/{contract-slug}.json`, apenas em `type=revrec` (marcar período reconhecido).
- `config/fixed-assets.json`, apenas em `type=depreciation` (marcar último período depreciado mais acumulado).
- `outputs.json`, uma linha anexada, `type: "journal-entry"`.

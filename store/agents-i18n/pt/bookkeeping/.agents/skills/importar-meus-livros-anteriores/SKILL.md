---
name: importar-meus-livros-anteriores
title: "Importar meus livros anteriores"
description: "Recupero a memória do seu sistema anterior: uma exportação do QuickBooks Online ou Xero, um CSV, ou uma planilha do seu contador anterior. Inicializo seu plano de contas (somente se você ainda não tiver um), construo um balanço de abertura a partir dos saldos de fechamento do período anterior, e aprendo regras de fornecedor para código de conta a partir do histórico de transações com um limite de maioria de 80% de confiança para que fornecedores ruidosos não contaminem a categorização futura. É estritamente leitura em um único sentido, eu nunca envio nada de volta para o QuickBooks Online ou Xero, nunca reescrevo os livros anteriores."
version: 1
category: Contabilidade
featured: no
image: ledger
integrations: [quickbooks, xero]
---


# Importar Meus Livros Anteriores

Traz a contabilidade do seu ano anterior para a memória para que este ano não comece do zero. Eu leio uma exportação do QuickBooks Online, uma exportação do Xero, ou um CSV / xlsx genérico; inicializo seu plano de contas se você ainda não tiver um; construo o balanço de abertura a partir dos saldos de fechamento anteriores; e aprendo regras de fornecedor para código de conta a partir do histórico de transações. Toda habilidade seguinte, `process-my-statements`, `categorize-my-transactions`, `close-my-month`, começa com o conhecimento de fornecedores já carregado.

Somente leitura: eu nunca conecto de volta para enviar, nunca reescrevo seus livros anteriores. Eu aprendo com eles.

## Quando usar

- "carregue os livros do ano anterior" / "importe do QuickBooks" / "faça o backfill a partir desta planilha" / "traga nosso histórico do Xero".
- "inicialize a memória de fornecedores a partir da lista de transações do ano passado".
- Chamado implicitamente por `set-up-my-books mode=opening-balances` quando você envia uma exportação completa de período anterior em vez de um arquivo só com o balancete.

## Conexões que preciso

Executo trabalho externo pelo Composio. Antes desta habilidade rodar, verifico se as categorias abaixo estão conectadas. Se faltar, eu nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **QuickBooks Online ou Xero** (contabilidade), opcional, usado apenas se você quiser que eu puxe o razão geral ou a Lista de Transações diretamente em vez de enviar um arquivo. O envio de arquivo é o caminho preferido.

Esta habilidade funciona totalmente a partir de um arquivo enviado (exportação em xlsx ou CSV). Nenhuma conexão bloqueia a execução.

## Informações que preciso

Eu leio o seu contexto contábil primeiro. Para todo campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor modalidade: aplicativo conectado > envio de arquivo > URL > colar) e espero.

- **O fim do seu ano fiscal**, obrigatório. Motivo: define a fronteira entre os saldos de fechamento anteriores e nossos saldos de abertura. Se faltar, pergunto: "Qual é o fim do ano fiscal da empresa, por exemplo 31 de dezembro ou outra data?"
- **Regime de caixa versus competência**, obrigatório. Motivo: muda como interpreto os saldos nas linhas provisionadas e diferidas. Se faltar, pergunto: "Estamos mantendo os livros em caixa ou em competência?"
- **O histórico de transações do período anterior**, obrigatório. Motivo: não consigo inicializar a memória de fornecedores nem os saldos de abertura sem isso. Se faltar, pergunto: "Você pode exportar o razão geral ou a Lista de Transações do ano anterior do QuickBooks Online ou Xero, ou compartilhar a planilha do contador anterior? Envie como xlsx ou CSV."
- **Confirmação de quais saldos de fechamento usar como abertura**, opcional. Motivo: se a sua importação cobrir vários períodos, preciso saber qual fim de período vira nosso balancete de abertura. Se você não tiver um corte específico em mente, uso por padrão o fim do seu ano fiscal e confirmo antes de gravar.

## Passos

1. **Ler a configuração.** Carregar `config/context-ledger.json`, obrigatório: `universal.company.fiscalYearEnd` (determina o limite do período de importação), `universal.accountingMethod` (caixa versus competência afeta a interpretação do saldo de abertura). Se faltar, fazer UMA pergunta direcionada (dica de modalidade: aplicativo conectado > arquivo > URL > colar) e continuar.

2. **Identificar o formato de origem.** O usuário envia um destes:
   - **Exportação do razão geral do QuickBooks Online**, xlsx/csv, colunas aproximadamente `{Date, Transaction Type, Num, Name, Memo/Description, Account, Split, Amount, Balance}`.
   - **Lista de Transações do QuickBooks Online**, xlsx/csv com `{Date, Transaction Type, Num, Posting, Name, Memo/Description, Account, Split, Amount}`.
   - **Exportação do Xero** (Detalhe do Razão Geral ou Transações por Conta), csv com `{Date, Source, Description, Reference, Debit, Credit, Running Balance, Account Code, Account Name}`.
   - **CSV / xlsx genérico**, o usuário precisa especificar o mapa de colunas, ou eu pergunto: `{date, party|vendor, amount|debit+credit, gl_code, gl_name, memo?}`.

   Detectar o formato pelos cabeçalhos das colunas. Se for ambíguo, confirmar inline com uma pergunta. Para xlsx usar `openpyxl`; para CSV usar o módulo `csv` da biblioteca padrão.

3. **Descobrir a conexão Composio apenas se necessário.** Se o usuário pedir para puxar diretamente do QuickBooks Online / Xero em vez de enviar um arquivo, descobrir o slug em tempo de execução:

   ```bash
   composio search accounting
   ```

   Nunca fixar nomes de ferramentas no código. Se não existir conexão, imprimir o comando de link e parar, nunca inventar dados. O envio de arquivo é sempre o caminho preferido; puxar de um aplicativo conectado é opcional, não o padrão.

4. **Analisar em um fluxo de linhas normalizado.** Toda linha de origem vira:

   ```ts
   {
     date: string;          // YYYY-MM-DD
     party: string;         // nome bruto do fornecedor/cliente da origem
     amount: number;        // com sinal: dinheiro saindo da empresa = negativo
     glCode: string;        // texto, validado depois contra o plano de contas
     glName: string;
     memo?: string;
     docType?: string;      // "Bill", "Check", "Invoice", etc.
   }
   ```

   Débitos/créditos do QuickBooks Online: a coluna `Amount` já vem com sinal na exportação do razão geral. Na Lista de Transações, `Amount` reflete o saldo natural da conta, verificar a coluna `Account` para normalizar conforme a convenção de sinal do agente (dinheiro saindo da empresa = negativo).

   Xero: calcular `amount = debit - credit`, depois aplicar a mesma convenção de sinal por tipo de conta (ativo/despesa com débitos = positivo = dinheiro saindo ⇒ inverter para negativo; receita/passivo com créditos = dinheiro entrando ⇒ manter positivo).

5. **Inicializar o plano de contas (somente se o nosso estiver ausente).** Se `config/chart-of-accounts.json` NÃO existir E a exportação incluir um plano de contas (as exportações do QuickBooks Online e do Xero incluem, um conjunto único de tuplas `{gl_code, gl_name, account_type}`), construir o plano de contas inicial a partir da exportação. Normalizar:
   - Forçar todo `code` para string.
   - Mapear o vocabulário de tipo de conta da origem para o nosso enum: `Bank / Accounts Receivable / Other Current Asset / Fixed Asset` → `asset`; `Accounts Payable / Credit Card / Other Current Liability / Long Term Liability` → `liability`; `Equity` → `equity`; `Income / Other Income` → `revenue`; `Cost of Goods Sold` → `cogs`; `Expense / Other Expense` → `expense`.
   - Atribuir `statementSection` conforme as regras de validação do Passo 5 de `build-my-chart-of-accounts`, jogar por padrão as linhas de despesa operacional para `operating-expenses.ga` e sinalizar no resumo para que o usuário possa reclassificar para `.rd` / `.sm`.
   - Gravar via o esquema e os validadores de `build-my-chart-of-accounts`. **Não sobrescrever o plano de contas existente**, se já existir, deixar como está e reportar quaisquer códigos novos na exportação como candidatos para revisão futura.

6. **Construir o balancete de abertura.** A partir dos saldos de FECHAMENTO do período anterior (última linha por código de conta na exportação do razão geral, ou a coluna `Running Balance` no fim do período no Xero):

   - Agrupar por `glCode`; pegar o saldo final.
   - Saldos positivos para tipos `asset` + `expense` + `cogs` vão para `debit`; negativos para `credit`. Positivos para tipos `liability` + `equity` + `revenue` vão para `credit`; negativos para `debit`.
   - Somar débitos e créditos em todo o balancete. Se não bater até 1 centavo, apresentar a diferença e parar, sem forçar.
   - Gravar `config/opening-trial-balance.json` de forma atômica como `[{glCode, debit, credit}]`.
   - Atualizar `config/context-ledger.json → universal.openingBalances` com `{asOf, source: "qbo-import" | "xero-import" | "prior-books", trialBalancePath: "config/opening-trial-balance.json", capturedAt}` (leitura-mesclagem-gravação).

7. **Inicializar categorizações anteriores.** A partir do histórico de transações:

   - Canonicalizar cada `party` usando as mesmas regras do Estágio 4 de `process-my-statements` (remover prefixos de ruído, números de referência no final, sufixos de cidade/estado; Iniciais Maiúsculas).
   - Agrupar transações por `canonical_party`. Para cada fornecedor, contar as ocorrências por `glCode`.
   - Usar o `glCode` majoritário SOMENTE se representar ≥ 80% das transações do fornecedor E o fornecedor tiver ≥ 3 transações. Caso contrário, pular (fornecedores ambíguos contaminam a próxima execução, mesma regra do Passo 7 em `process-my-statements`).
   - Validar o `glCode` vencedor contra o plano de contas. Descartar qualquer um que não resolver.
   - Gravar `config/prior-categorizations.json` de forma atômica como `{canonical_party: gl_code}`. Se o arquivo já existir, ler-mesclar-gravar, preservando as entradas existentes a menos que a maioria da importação discorde com confiança ≥ 0,95, caso em que registrar o conflito e manter a entrada existente (o agente vem aprendendo com execuções reais; a importação é histórica).

8. **Marcar o período como importado em `run-index.json`.** Ler o `run-index.json` existente (criar um array vazio se ausente), anexar:

   ```json
   {
     "id": "{uuid4}",
     "period": "2023",
     "periodStart": "2023-01-01",
     "periodEnd": "2023-12-31",
     "status": "imported",
     "source": "qbo-import" | "xero-import" | "csv-import",
     "accountsIncluded": ["..."],
     "transactionCount": 0,
     "createdAt": "{now}",
     "updatedAt": "{now}"
   }
   ```

   Gravar de forma atômica (leitura-mesclagem-gravação, nunca sobrescrever).

9. **NÃO gravar as transações detalhadas.** Esta habilidade não produz `runs/{period}/run.json`, o período importado não é uma execução nossa, é o razão do sistema anterior. Se o usuário quiser um workbook revisado para o período importado, enviar os extratos para `statements/_inbox/` e invocar `process-my-statements`, que se beneficia das categorizações anteriores já inicializadas.

10. **NÃO anexar a `outputs.json`.** O plano de contas, o balancete de abertura, as categorizações anteriores são todos configuração. A linha em `run-index.json` já é a entrada de índice, por si só.

11. **Resumir para o usuário.** Contagens: transações analisadas, fornecedores únicos canonicalizados, categorizações anteriores inicializadas (com o limite de ≥ 80% / ≥ 3 transações explicado), linhas do plano de contas adotadas (ou puladas porque o nosso já existia), resultado da verificação de fechamento do balancete de abertura. Sinalizar fornecedores ambíguos que ficaram abaixo do limite, o fundador pode promovê-los manualmente via `categorize-my-transactions mode=rule-add`. Próximo passo: "processar os extratos deste ano e a categorização vai acertar a maioria das linhas a partir da memória anterior".

## Saídas

- `config/chart-of-accounts.json`, apenas se não tínhamos um.
- `config/opening-trial-balance.json`, balancete de fechamento do período anterior, agora balancete de abertura dos nossos livros.
- `config/prior-categorizations.json`, memória de fornecedores inicializada (leitura-mesclagem-gravação).
- `config/context-ledger.json`, `universal.openingBalances` atualizado (leitura-mesclagem-gravação).
- `run-index.json`, uma nova linha com `status: "imported"` (leitura-mesclagem-gravação).

Nenhuma entrada em `outputs.json`.

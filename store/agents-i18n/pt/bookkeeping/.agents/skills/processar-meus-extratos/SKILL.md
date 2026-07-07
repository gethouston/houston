---
name: processar-meus-extratos
title: "Processar meus extratos"
description: "Processo um lote de extratos bancários e de cartão de crédito em PDF ou CSV de ponta a ponta: extraio cada transação (subagentes Haiku em paralelo), normalizo os nomes das contrapartes, categorizo contra o seu plano de contas travado (subagentes Sonnet em paralelo), detecto transferências entre contas, e monto uma planilha do Google Sheets revisada com uma DRE baseada em fórmulas. As divergências de conciliação aparecem como avisos, as categorizações de baixa confiança vão para Suspenso, eu nunca invento um código de conta, nunca insiro um número silenciosamente, nunca lanço no seu sistema contábil."
version: 1
category: Contabilidade
featured: no
image: ledger
integrations: [googlesheets, stripe]
---


# Processar Meus Extratos

Envie um lote de extratos bancários e de cartão de crédito em PDF ou CSV e eu produzo uma planilha revisada do Google Sheets com uma DRE baseada em fórmulas. Pipeline completo: extraio cada transação em paralelo, normalizo as contrapartes, categorizo contra o seu plano de contas travado, marco as transferências entre contas, e escrevo uma planilha que você pode entregar ao seu contador. O grupo de Suspenso e os avisos de conciliação ficam no topo, eu nunca insiro um número, nunca invento um código de conta, nunca lanço nada.

## Alvo de Saída: Google Sheets via Composio

Uso a CLI do Composio disponível no PATH. Todas as gravações no Google Sheets passam por ela.

**Antes de qualquer execução**, verifico se o toolkit `googlesheets` está conectado:

```bash
composio execute GOOGLESHEETS_SEARCH_SPREADSHEETS -d '{"query": "", "max_results": 1}'
```

Se retornar `"No active connection found for toolkit \"googlesheets\""`, PARO e peço para você conectar:

```bash
composio link googlesheets --no-wait
```

Pego o `redirect_url` da resposta, apresento a você como um link em markdown com `#houston_toolkit=googlesheets` anexado (para o Houston renderizar o cartão de conexão). Espero a aprovação antes de continuar.

## Conexões que eu preciso

Eu executo trabalho externo pelo Composio. Antes desta skill rodar, verifico se as categorias abaixo estão vinculadas. Se faltar, nomeio a categoria, peço para você conectar na aba Integrações, e paro.

- **Google Sheets** (planilhas), obrigatório. Todo o pipeline termina em uma planilha do Google Sheets com uma DRE baseada em fórmulas, sem ela não há saída. Veja o bloco "Alvo de Saída: Google Sheets via Composio" acima para o comando de verificação e o link de conexão.
- **Stripe** (cobrança), opcional. Traz repasses e taxas de processamento para que categorizem corretamente quando aparecerem no seu feed bancário.

Se o Google Sheets não estiver conectado, eu paro e peço para você conectá-lo antes de fazer qualquer trabalho.

## Informações que eu preciso

Eu leio o seu contexto contábil primeiro. Para cada campo obrigatório que estiver faltando, faço UMA pergunta em linguagem simples (melhor formato: app conectado > arquivo enviado > URL > texto colado) e espero.

- **Um contexto contábil finalizado**, obrigatório. Por quê: preciso do seu método contábil, do código de Suspenso e das contas registradas antes de categorizar. Se estiver faltando, pergunto: "Já configuramos os livros? Se não, rode a configuração uma vez para eu saber seu ano fiscal, método contábil e contas registradas."
- **Um plano de contas**, obrigatório. Por quê: eu o travo durante a execução; toda categoria que atribuo precisa vir do seu plano de contas. Se estiver faltando, pergunto: "Já temos um plano de contas? Se não, vamos elaborar um primeiro."
- **Suas contas bancárias e cartões de crédito**, obrigatório. Por quê: agrupo as transações pelos últimos 4 dígitos e preciso do código de conta de cada conta. Se estiver faltando, pergunto: "Quais contas bancárias e cartões de crédito a empresa usa? Registro automaticamente quaisquer novas quando os extratos chegarem, mas é mais rápido se você me disser antes."
- **Os extratos a processar**, obrigatório. Por quê: o pipeline começa a partir dos PDFs ou CSVs que você envia. Se estiver faltando, pergunto: "Você pode enviar os extratos bancários e de cartão de crédito em PDF, ou anexá-los no chat?"
- **Regras de fornecedores de um período anterior**, opcional. Por quê: me permite associar novas cobranças a fornecedores conhecidos e manter as perguntas ao mínimo. Se você não tiver, eu sigo em frente e aprendo com esta execução.

## Layout de Armazenamento

Agente de empresa única. O plano de contas e a memória ficam na raiz do agente (estrutura plana). Cada execução recebe sua própria pasta em `runs/{period}/`.

```
context/
└── bookkeeping-context.md                  # resumo vivo (entidade, ano fiscal, método contábil)

config/
├── context-ledger.json                     # metadados: empresa, método contábil, bancos, etc.
├── chart-of-accounts.json                  # plano de contas oficial (travado durante uma execução)
├── prior-categorizations.json              # {canonical_party: gl_code}, histórico de fornecedores
└── party-rules.json                        # regras exatas confirmadas pelo usuário

statements/                                  # PDFs de origem + arquivos auxiliares (lista de fornecedores, etc.)
└── _inbox/                                 # zona de entrada para PDFs antes deste pipeline rodar

runs/
└── {period}/                               # ex.: 2024, 2024-Q1, 2024-01
    ├── run.json                            # artefato completo da execução (a fonte de recuperação)
    ├── _extractions/{pdf_stem}.json        # transitório, saídas do Extrator Haiku (uma por PDF)
    ├── _work/{account_last4}.json          # transitório, pacotes entregues a cada Categorizador
    ├── _categorizations/{account_last4}.json  # transitório, saídas do Categorizador Sonnet
    └── _sheet_state/{period}.json          # transitório, saída do Redator de Planilhas Sonnet
```

Se o diretório não existir, crio com `mkdir -p` no primeiro uso.

**As contas bancárias** ficam no registro de contexto (context ledger), não em um `client.json` separado:

```jsonc
// config/context-ledger.json (trecho)
{
  "domains": {
    "banks": {
      "accounts": [
        {"last4": "9041", "type": "credit-card", "bank": "Chase",
         "glCode": "20000", "glName": "Chase CC #9041"}
      ]
    }
  },
  "universal": {
    "suspenseCode": { "code": "99999", "name": "Suspenso" }
  }
}
```

## Entradas

O usuário fornece um ou mais destes:
1. Caminhos de PDF explícitos na mensagem (o mais comum, anexos enviados no chat).
2. PDFs em `statements/_inbox/`, listados com `ls statements/_inbox/*.pdf`.
3. Identificador de período (ano / trimestre / mês), usado no nome da pasta `runs/{period}/`.
4. (Opcional) arquivo de plano de contas personalizado (xlsx / csv / texto colado), lista de fornecedores, ou Detalhamento de Transações anterior.

## Procedimento

### Etapa 1, Inicializar o contexto e travar o plano de contas

1. **Carrego o estado existente:**
   - `context/bookkeeping-context.md`, o resumo. Se estiver faltando, paro e peço para você rodar `set-up-my-books` primeiro (ou peço para fazer isso na hora).
   - `config/context-ledger.json`, contas, código de Suspenso.
   - `config/chart-of-accounts.json`, plano de contas oficial. Se existir, **TRAVO para esta execução.**
   - `config/prior-categorizations.json`, memória de fornecedor → código de conta.
   - `config/party-rules.json`, regras de correspondência exata.

2. **Inicialização na primeira execução (somente se `config/chart-of-accounts.json` não existir):**
   - Se o usuário forneceu um arquivo de plano de contas (xlsx/csv), faço o parse (openpyxl para xlsx) em `config/chart-of-accounts.json` como `[{code, name, type, statementSection}]`.
   - Se o usuário descreveu o plano de contas no texto, estruturo dessa forma.
   - Caso contrário, uso o padrão empacotado em `CHART_OF_ACCOUNTS.md`, mas copio para `config/chart-of-accounts.json` para que as próximas execuções compartilhem os códigos.
   - Copio os PDFs de origem + arquivos auxiliares para `statements/` (mantendo os nomes dos arquivos; subpastas por conta são aceitáveis, ex.: `statements/9041/2024-01.pdf`).
   - Se um Detalhamento de Transações anterior for fornecido, extraio `{vendor_name: [gl_codes]}` e inicializo `config/prior-categorizations.json` com o código majoritário por fornecedor (somente se consistente em ≥ 80% dos registros anteriores).

3. **Travo o plano de contas para o resto da execução.** Trato `config/chart-of-accounts.json` como imutável até a Etapa 7. Se uma transação não puder ser categorizada, envio para Suspenso, NUNCA invento um código de conta novo.

4. **Determino o período.** Padrão: min(period_start) até max(period_end) entre todos os extratos. Identificador de período: `YYYY` para ano completo, `YYYY-QN` para trimestre, `YYYY-MM` para um único mês. Crio `runs/{period}/_extractions/`, `runs/{period}/_work/`, `runs/{period}/_categorizations/`, `runs/{period}/_sheet_state/`.

### Etapa 2, Extrair transações (subagentes Haiku em paralelo)

**Não leio os PDFs no orquestrador, despacho subagentes Haiku em paralelo.** Muito mais rápido, e mantém o contexto do orquestrador limpo para a categorização e a montagem da planilha.

**Padrão de despacho:**

Para cada PDF (ou pequeno lote ≤ 3 PDFs de um único mês da mesma conta), lanço uma chamada `Agent` em paralelo com:
- `subagent_type: "general-purpose"`
- `model: "haiku"`
- `description: "Extrai {bank} {account_last4} {YYYY-MM}"` (ou similar, 3 a 5 palavras)

**Envio todos os despachos em uma única mensagem para que rodem simultaneamente.** Doze extratos mensais → doze agentes em paralelo, terminam em aproximadamente o tempo de um só.

Cada subagente grava o resultado em disco em `runs/{period}/_extractions/{source_pdf_stem}.json` e retorna uma confirmação curta ("gravei N transações, concilia: sim/não"). O orquestrador lê os arquivos JSON de volta depois que todos os agentes terminam.

**Modelo de prompt do subagente** (cole, preencha `{...}` a cada despacho):

```
Você está extraindo transações de um único extrato bancário ou de cartão de crédito em PDF.

Caminho do PDF: {absolute_pdf_path}
account_last4 esperado (se conhecido): {last4 or "unknown"}
Tipo de conta esperado: {"credit_card" | "checking" | "savings" | "unknown"}

TAREFA
Leia o PDF com a ferramenta Read (ela é multimodal, enxerga as páginas). Se o PDF tiver
mais de 10 páginas, use o parâmetro `pages` para lê-lo em fatias. Extraia TODAS as
transações e os saldos de abertura/fechamento do extrato. Grave o resultado como JSON em:

  {output_path}

ESQUEMA JSON DE SAÍDA
{
  "source_pdf": "{nome do arquivo do PDF, não o caminho}",
  "bank_name": "Chase" | "Wells Fargo" | etc.,
  "account_last4": "9041",
  "account_type": "credit_card" | "checking" | "savings",
  "statements": [                            // geralmente um, mas PDFs multi-período podem ter vários
    {
      "statement_date": "2023-01-12",
      "period_start": "2022-12-13",
      "period_end": "2023-01-12",
      "opening_balance": 1090.96,
      "closing_balance": 1085.63,
      "transactions": [
        {"date":"2022-12-15","description":"...","amount":-45.00,"source_page":3}
      ]
    }
  ]
}

CONVENÇÃO DE SINAL, INEGOCIÁVEL
Normalize para "dinheiro saindo do negócio = negativo, dinheiro entrando = positivo":
- Conta corrente / poupança: depósitos +, saques / débitos / tarifas -.
- Cartão de crédito: compras / juros / tarifas -, pagamentos / créditos / estornos +.
  (Isto é o OPOSTO de como muitos extratos de cartão de crédito imprimem; inverta se necessário.)

DISCIPLINA DE EXTRAÇÃO
- O VALOR da transação é a variação, não a coluna de saldo corrente.
- Pule as linhas marcadoras de "Beginning Balance" e "Ending Balance".
- Inclua tarifas bancárias e juros como transações.
- Linhas que continuam na página seguinte: inclua uma única vez.
- PDFs multi-período: emita uma entrada por extrato em `statements[]`.
- Formato de data: ISO YYYY-MM-DD. Se a data de uma transação for ambígua (12/15 sem ano)
  use o ano consistente com o período do extrato.

AUTOVERIFICAÇÃO DE CONCILIAÇÃO
Antes de gravar o arquivo, verifique para cada extrato:
   computed_close = opening_balance + sum(transaction.amount)   (para conta corrente/poupança)
   computed_close = opening_balance - sum(transaction.amount)   (para cartão de crédito, usando a convenção de sinal acima)
Se |computed_close - closing_balance| > 0.02, inclua um campo "reconciliation_note"
naquele extrato descrevendo a diferença, NÃO force uma correspondência silenciosamente.

Grave o arquivo JSON. Retorne um resumo de uma linha:
"gravei {N} transações em {M} extrato(s), conciliação: {ok|diferença=$X.XX}"
```

**Depois de despachar, o orquestrador:**

1. Espera todos os subagentes terminarem (rodam em paralelo automaticamente).
2. Lê cada `runs/{period}/_extractions/*.json`.
3. Mescla em uma única lista em memória por account_last4.
4. Remove duplicatas por `(account_last4, date, amount, description)` se dois extratos se sobrepõem.
5. Aplica a mesma autoverificação de conciliação no orquestrador (confia, mas verifica).

**Quando NÃO despachar subagentes:**
- Apenas um PDF pequeno, dados necessários imediatamente, leio direto.
- PDF é imagem escaneada, qualidade muito baixa, faço eu mesmo para poder inspecionar os artefatos de OCR visualmente.
- Subagente retornou diferença de conciliação > $0.02, releio aquele extrato específico eu mesmo no orquestrador e corrijo a extração.

Veja `EXTRACTION.md` para padrões de layout nomeados (tabelas simples, colunas de saldo corrente, layout em espanhol do Wells Fargo, etc.), inclua a dica de padrão relevante no prompt do subagente quando o banco for conhecido de antemão.

### Etapa 3, Verificação de conciliação (apenas aviso, nunca bloqueia)

Para cada extrato:
```
computed_closing = opening_balance + sum(transaction.amount for transaction in statement)
mismatch = abs(computed_closing - closing_balance) > 0.02   # tolerância de 2 centavos
```
Se houver divergência, adiciono um aviso à planilha de conciliação e continuo. Não paro o pipeline.

### Etapa 3b, Mesclar extrações e gravar os pacotes de trabalho do Categorizador

Depois que todos os Extratores Haiku terminam, o orquestrador lê e mescla a saída antes de despachar os Categorizadores:

1. **Leio todos os `runs/{period}/_extractions/*.json`.**

2. **Agrupo as transações por `account_last4`.** Para cada último-4 único entre todos os arquivos de extração, coleto todas as transações de todos os extratos daquela conta.

3. **Registro contas novas.** Qualquer `account_last4` ainda não presente em `context-ledger.json → domains.banks.accounts[]`, adiciono com o nome do banco e o tipo de conta do arquivo de extração, deixando `gl_code` em branco por enquanto.

4. **Removo duplicatas.** Dentro de cada conta, removo transações duplicadas em `(date, amount, description)`, que aparecem quando extratos se sobrepõem (ex.: dois meses compartilham uma data de fronteira).

5. **Gravo um pacote de trabalho por conta** em `runs/{period}/_work/{account_last4}.json`:

```json
{
  "account_last4": "9041",
  "account_type": "credit_card",
  "bank": "Chase",
  "gl_code": "20000",
  "suspense_code": "99999",
  "transactions": [
    { "date": "2023-01-15", "description": "AMAZON.COM*AB12C NJ", "amount": -45.00, "statement_date": "2023-01-20" }
  ],
  "chart_of_accounts": [
    { "code": "6090", "name": "Despesas de Escritório", "type": "expense" }
  ],
  "prior_categorizations": { "Amazon": "6090" },
  "party_rules": { "PG&E": "6150" }
}
```

Campos:
- `account_last4`, `account_type`, `bank`, `gl_code`, vêm de `context-ledger.json → domains.banks.accounts[]` (gl_code pode estar em branco para contas novas)
- `suspense_code`, vem de `context-ledger.json → universal.suspenseCode.code`
- `transactions`, lista mesclada e sem duplicatas para esta conta apenas; inclua `statement_date` se presente no JSON de extração
- `chart_of_accounts`, conteúdo completo de `config/chart-of-accounts.json`
- `prior_categorizations`, conteúdo completo de `config/prior-categorizations.json` (`{}` vazio se ausente)
- `party_rules`, conteúdo completo de `config/party-rules.json` (`{}` vazio se ausente)

6. **Crio os subdiretórios de saída se ausentes:**
```bash
mkdir -p runs/{period}/_work
mkdir -p runs/{period}/_categorizations
mkdir -p runs/{period}/_sheet_state
```

### Etapas 4+5, Despachar subagentes Categorizadores (Sonnet, em paralelo)

**Não normalizo nem categorizo direto no orquestrador.** Despacho um Categorizador Sonnet por `account_last4` em uma única mensagem para rodarem simultaneamente. Para contas com mais de 500 transações, divido em blocos de até 500 linhas e despacho vários agentes para a mesma conta (as saídas se concatenam em ordem).

**Padrão de despacho:**

Para cada conta (uma chamada `Agent` por conta em uma única mensagem):
- `subagent_type: "general-purpose"`
- `model: "sonnet"`
- `description: "Categoriza {bank} {account_last4}"` (3 a 5 palavras)

**Cada Categorizador retorna um status de uma linha:**
`"conta {last4}: {N} transações, {R} prontas / {V} revisão / {U} suspenso ($ {S})"`

---

**Modelo de prompt do subagente Categorizador** (preencha `{...}` para cada conta):

```
Você está categorizando transações bancárias e de cartão de crédito para a contabilidade.

Caminho do pacote de trabalho: {absolute_work_packet_path}
Caminho de saída: {absolute_output_path}

TAREFA
1. Leia o JSON do pacote de trabalho no caminho acima.
2. Para cada transação, normalize o nome da contraparte (Estágio 4 abaixo) e depois categorize (Estágio 5 abaixo).
3. Grave o resultado JSON no caminho de saída.
4. Retorne exatamente uma linha: "conta {last4}: {N} transações, {R} prontas / {V} revisão / {U} suspenso ($ {S})"

---

ESTÁGIO 4, NORMALIZAR OS NOMES DAS CONTRAPARTES

Para o campo description de cada transação, derive um nome canônico de contraparte:
1. Remova prefixos de ruído: "POS DEBIT", "CHECKCARD", "DEBIT CARD PURCHASE", "ACH", "ONLINE PMT", "SQ *", "TST*", "PREAUTHORIZED DEBIT"
2. Remova números de referência à direita (sequências de 6+ dígitos), códigos de local (#12345), sufixos de cidade+estado (ex. "SEATTLE WA", "NEW YORK NY")
3. Colapse espaços em branco, aplique Title Case
4. Se o nome limpo corresponder por semelhança (fuzzy match) a uma entrada em prior_categorizations ou party_rules do pacote de trabalho (token set ratio ≥ 0.85), use a forma canônica armazenada ali (a chave), não a sua versão limpa

Exemplos:
- "POS DEBIT AMAZON.COM*AB12C NJ" → "Amazon" (se "Amazon" estiver em prior_categorizations)
- "SQ *JOE'S COFFEE SHOP SEATTLE WA" → "Joe's Coffee Shop"
- "ACH DEBIT PG&E UTILITY PMT" → "PG&E"
- "CHECKCARD 0115 SHELL OIL 12345678" → "Shell Oil"
- "ONLINE PMT CHASE CREDIT CRD AUTOPAY" → "Chase Autopay" (vai para Suspenso, veja abaixo)

---

ESTÁGIO 5, CATEGORIZAR CADA TRANSAÇÃO

Use esta ordem de prioridade para cada transação. Pare no primeiro acerto:

**1. Correspondência exata em party_rules**
Se a contraparte canônica corresponder exatamente a uma chave em party_rules do pacote de trabalho, atribua aquele código de conta.
- confidence: 1.00
- source: "rule"

**2. Correspondência por semelhança em prior_categorizations**
Se a contraparte canônica corresponder por semelhança (fuzzy match) a uma chave em prior_categorizations (token set ratio ≥ 0.85) E o código de conta armazenado estiver em chart_of_accounts, use-o.
- confidence: 0.95
- source: "prior_year"

**3. Seu raciocínio contra o chart_of_accounts**
Observe a description, a contraparte canônica, o valor, e o tipo de conta. Escolha o melhor código de conta em chart_of_accounts.
Atribua uma confiança calibrada:
- 0.95+: óbvio e inequívoco (ex.: "PG&E" → Utilidades; "Stripe Transfer" → Receita de Vendas)
- 0.90 a 0.94: um candidato razoável, mas não certo
- < 0.90: múltiplas categorias plausíveis, ou fornecedor incerto → envie para Suspenso (veja abaixo)
- source: "ai"

**4. Suspenso**
Se nenhum acerto acima OU confiança < 0.90, atribua o suspense_code do pacote de trabalho.
- gl_name: "Suspenso"
- confidence: 0.50
- source: "ai"
- category_status: "uncategorized"

**Regras de category_status:**
- "ready_for_approval" se confidence ≥ 0.90 E source ∈ {rule, prior_year}
- "review_categorization" se confidence ≥ 0.90 E source = "ai"
- "uncategorized" se confidence < 0.90

**CONVENÇÃO DE SINAL:** O pacote de trabalho já tem os sinais corretos, NÃO inverta os valores. Para cartões de crédito: compras são negativas, pagamentos/créditos são positivos.

**NÃO atribua o código de conta 9000 (Transferência Interna).** Você não vê as transações de outras contas. Se uma transação parecer uma transferência entre contas (ex.: "Chase Autopay", "Transfer to Checking"), envie para Suspenso a menos que corresponda exatamente a uma party_rule.

**NÃO invente códigos de conta** que não estejam presentes em chart_of_accounts.

---

JSON DE SAÍDA, grave isto no caminho de saída:

{
  "account_last4": "9041",
  "transactions": [
    {
      "date": "2023-01-15",
      "description": "AMAZON.COM*AB12C NJ",
      "amount": -45.00,
      "statement_date": "2023-01-20",
      "party": "Amazon",
      "gl_code": "6090",
      "gl_name": "Despesas de Escritório",
      "confidence": 0.95,
      "source": "prior_year",
      "category_status": "ready_for_approval"
    }
  ],
  "summary": {
    "total_count": 412,
    "ready_for_approval": 380,
    "review_categorization": 20,
    "uncategorized": 12,
    "suspense_dollar_amount": 1250.44,
    "confidence_histogram": {"0.95-1.00": 380, "0.90-0.94": 20, "<0.90": 12},
    "new_parties": ["Foo Supplier", "Bar Vendor"]
  }
}

"new_parties": nomes canônicos de contraparte não encontrados como chaves em prior_categorizations ou party_rules.
"statement_date": repasse a partir da transação de origem no pacote de trabalho, se presente.
"suspense_dollar_amount": soma dos valores absolutos dos valores das transações não categorizadas.

Grave o arquivo. Retorne o resumo de uma linha.
```

---

**Depois que todos os Categorizadores terminam, o orquestrador:**

1. Lê `_categorizations/{account_last4}.json` de cada conta.
2. Aplica a detecção de transferência entre contas:
   - Para cada débito na conta A na data D: procura em todas as outras contas um crédito na data D±2 com o mesmo valor absoluto.
   - Ambas as pernas correspondentes: define `gl_code = "9000"`, `gl_name = "Transferência Interna"`, `source = "transfer"`, `category_status = "ready_for_approval"`.
   - Pares de transferência sinalizados no artefato da execução, excluídos das fórmulas SUMIFS da DRE.
3. Monta `runs/{period}/run.json` mesclando os arrays de transações categorizadas de todas as contas mais os metadados.

Esquema do `run.json`:
```json
{
  "companyName": "Acme Startup, Inc.",
  "period": "2023",
  "period_start": "2023-01-01",
  "period_end": "2023-12-31",
  "generated_at": "2026-04-16",
  "accounts": [
    { "last4": "9041", "type": "credit_card", "bank": "Chase", "gl_code": "20000", "transaction_count": 412 }
  ],
  "transactions": [
    {
      "account_last4": "9041",
      "date": "2023-01-15",
      "description": "AMAZON.COM*AB12C NJ",
      "amount": -45.00,
      "statement_date": "2023-01-20",
      "party": "Amazon",
      "gl_code": "6090",
      "gl_name": "Despesas de Escritório",
      "confidence": 0.95,
      "source": "prior_year",
      "category_status": "ready_for_approval"
    }
  ],
  "reconciliation_warnings": []
}
```

### Verificação 1, Revisão pós-categorização (nunca bloqueia)

O orquestrador lê apenas o bloco `summary` de cada `_categorizations/*.json` (não os arrays completos de transações). Verifica:

| Verificação | Limite | Ação |
|---|---|---|
| Taxa de Suspenso | > 25% das transações em qualquer conta | Adiciona aviso nomeado ao relatório final |
| Valor em Suspenso | > 30% do volume total absoluto de transações em todas as contas | Adiciona aviso nomeado ao relatório final |
| Contraparte não categorizada repetida | Qualquer contraparte canônica aparece ≥ 10x com `confidence < 0.90` | Adiciona sinalização nomeada: "'{party}' aparece {N}x não categorizada, considere adicionar uma regra de fornecedor" |
| Divergências de conciliação | Qualquer `reconciliation_note` em qualquer `_extractions/*.json` | Aparece no relatório (já coletado na Etapa 3) |
| Transferências entre contas encontradas | Contagem e valor absoluto total | Registra: "Encontrado(s) {N} par(es) de transferência totalizando $ {X}, marcado(s) com o código de conta 9000" |

A Verificação 1 nunca bloqueia. Acumulo os achados na lista `gate1_warnings`, levo para o relatório da Etapa 8.

### Etapa 6, Despachar o subagente Redator de Planilhas (Sonnet, único)

**Não chamo o Composio direto no orquestrador.** Despacho um único Redator de Planilhas Sonnet que lê o `run.json` montado e é responsável pela criação completa da planilha.

**Despacho:**
- `subagent_type: "general-purpose"`
- `model: "sonnet"`
- `description: "Escreve a planilha do Google {period}"`

**O Redator retorna uma linha:**
`"planilha pronta: {url}, LL $ {pnl_net_income}, LL Ajustado $ {pnl_adjusted_net_income}, 0 erros"`
ou
`"planilha FALHOU: error_cells=[P&L!B44, ...]"`

---

**Modelo de prompt do subagente Redator de Planilhas:**

```
Você está criando uma planilha contábil no Google Sheets a partir de dados de transações categorizadas.

Arquivos de entrada, leia todos estes:
- Dados da execução:      {absolute_run_json_path}
- Registro de contexto:   {absolute_context_ledger_path}
- Plano de contas:        {absolute_coa_json_path}
- Especificação da planilha: {absolute_sheets_spec_path}

Caminho de saída: {absolute_sheet_state_path}

TAREFA
1. Leia SHEETS_SPEC.md no caminho acima, é o seu manual de instruções completo para criar a planilha via Composio. Siga-o à risca.
2. Leia run.json, context-ledger.json, e chart-of-accounts.json.
3. Crie a planilha do Google Sheets seguindo a especificação.
4. Grave o estado da planilha em JSON no caminho de saída.
5. Retorne exatamente uma linha (formato abaixo).

A CLI do Composio está em composio (não está no PATH, use o caminho completo).

REGRAS CRÍTICAS, estas sobrepõem qualquer outra coisa:
1. Defina o locale para "en_US" IMEDIATAMENTE após criar a planilha, antes de gravar qualquer dado.
   Use UPDATE_SPREADSHEET_PROPERTIES com: {"properties": {"locale": "en_US"}, "fields": "locale"}
   Se você pular esta etapa, as fórmulas vão falhar silenciosamente em contas do Google não inglesas (#ERROR).
2. Sempre passe "value_input_option": "USER_ENTERED" em toda gravação em lote. RAW transforma fórmulas em literais de texto.
3. Prefixe todos os códigos de conta com um apóstrofo ao gravar valores de célula (ex., "'6090") para que o Sheets os armazene como texto, não como números. A correspondência de string do SUMIFS vai falhar silenciosamente se você pular isso.
4. A capitalização dos parâmetros das ferramentas é inconsistente, sempre rode --get-schema antes de usar uma ferramenta nova:
   - DELETE_SHEET, UPDATE_SPREADSHEET_PROPERTIES, UPDATE_SHEET_PROPERTIES → camelCase (spreadsheetId, sheetId)
   - APPEND_DIMENSION, ADD_SHEET, UPDATE_VALUES_BATCH, BATCH_GET → snake_case (spreadsheet_id, sheet_id)
5. Os totais da DRE precisam ser fórmulas SUMIFS, nunca valores fixos.
6. Nomes de abas com espaços ou & precisam de aspas simples nas fórmulas: 'Chart of Accounts'!A:B, 'P&L'!B44.

VERIFICAÇÃO (depois de gravar todas as abas):
- Releia a célula de Lucro Líquido da DRE e a célula de Lucro Líquido Ajustado usando GOOGLESHEETS_BATCH_GET
  com valueRenderOption: "UNFORMATTED_VALUE" (note o camelCase) para obter os números computados.
- Percorra as abas de DRE e Transações procurando células com "#ERROR" ou "#REF".
- Inclua os resultados no JSON de saída.

JSON DE SAÍDA, grave no caminho de saída:
{
  "spreadsheet_id": "1abc...",
  "url": "https://docs.google.com/spreadsheets/d/1abc.../",
  "tabs_created": ["Chart of Accounts", "Transactions", "P&L", "Recon 9041"],
  "verification": {
    "locale_ok": true,
    "formulas_parsed": true,
    "pnl_net_income": 24512.30,
    "pnl_adjusted_net_income": 23261.86,
    "suspense_total": 1250.44,
    "error_cells": []
  }
}

Retorne exatamente uma linha:
"planilha pronta: {url}, LL $ {pnl_net_income}, LL Ajustado $ {pnl_adjusted_net_income}, {N} erros"
ou se verification.error_cells não estiver vazio ou algum valor for nulo:
"planilha FALHOU: error_cells=[{lista separada por vírgulas}]"
```

---

### Verificação 2, Revisão pós-planilha (no máximo uma nova tentativa)

Depois que o Redator de Planilhas retorna, o orquestrador lê `_sheet_state/{period}.json` e verifica:

| Verificação | Limite | Ação |
|---|---|---|
| `error_cells` não vazio | Qualquer | Redespacha o Redator de Planilhas com as mesmas entradas + nota: "Corrija estas células: {list}". Máximo 1 nova tentativa. |
| `pnl_adjusted_net_income` vs. soma local de run.json | Diferença > $ 0.02 | Redespacha com nota: "Lucro Líquido Ajustado não bate, esperado $ {X}, obtido $ {Y}. Verifique o SUMIFS de Suspenso e a exclusão de transferências." |
| `formulas_parsed: false` | , | Redespacha com nota: "Fórmulas foram interpretadas como texto. Garanta que o locale esteja definido para en_US ANTES de qualquer gravação em lote." |
| `verification.suspense_total` vs. total de Suspenso da Verificação 1 | Diferença > $ 0.02 | Redespacha com nota: "Total de Suspenso não bate, esperado $ {X}, obtido $ {Y}. Verifique a contagem de linhas da aba Transactions." |

Se a nova tentativa única também falhar: pulo a Etapa 7, apresento uma mensagem de sucesso parcial, preservo o caminho de `run.json` para recuperação manual.

Se a Verificação 2 passar: anexo a referência da planilha em `config/context-ledger.json` em `domains.banks.sheets[]` (criando o array se ausente):
```json
{
  "period": "2023",
  "spreadsheet_id": "1abc...",
  "url": "https://docs.google.com/...",
  "accounts_included": ["9041", "1234"],
  "period_start": "2023-01-01",
  "period_end": "2023-12-31"
}
```
e atualizo `updatedAt` para hoje. Também anexo a `run-index.json` na raiz do agente: `{id, period, status: "ready", sheetUrl, accountsIncluded[], suspenseTotal, pnlNetIncome}`.

---

### Etapa 7, Persistir aprendizados

Depois de uma saída bem-sucedida:
1. Abro `config/prior-categorizations.json` (crio se ausente).
2. Para cada transação com `source ∈ {rule, prior_year, transfer}` OU `confidence ≥ 0.95`, faço upsert de `{canonical_party: gl_code}`.
3. NÃO persisto categorizações ambíguas (confidence < 0.90), envenenam a próxima execução.
4. Se o plano de contas mudou no meio do projeto (códigos adicionados/renomeados via `build-my-chart-of-accounts`), reescrevo `config/chart-of-accounts.json` E reinicio `config/prior-categorizations.json` apenas com as entradas de alta confiança desta execução, códigos obsoletos do plano de contas antigo direcionam mal transações futuras.

### Etapa 8, Relatar ao usuário

Imprimo um resumo conciso:
- **URL da planilha do Google** (link clicável em markdown), em destaque no topo
- Caminho da pasta da execução (`runs/{period}/`) e a raiz do agente (para você ver onde ficam a memória/saídas)
- Extratos processados (contagem, por conta)
- Transações extraídas (contagem, volume absoluto total)
- Avisos de conciliação (se houver, lista)
- Detalhamento da categorização: X prontas, Y precisam de revisão, Z em Suspenso (com valor em $)
- Lucro Líquido e Lucro Líquido Ajustado, lido de `runs/{period}/_sheet_state/{period}.json` nos campos `verification.pnl_net_income` e `verification.pnl_adjusted_net_income` (já calculados pelo Redator de Planilhas)
- Avisos da Verificação 1 (se houver), incluo cada aviso nomeado literalmente
- Caminho do artefato JSON local (`runs/{period}/run.json`)
- Número de novas contrapartes canônicas persistidas em `config/prior-categorizations.json`

Sinalizo o **valor em Suspenso** em destaque, é o "custo de não terminar a revisão".

## Invariantes Críticos, Não Violar

1. **Contas bancárias agrupadas apenas por `account_last4`.** Nunca pelo nome do banco. Os nomes variam entre extratos.
2. **Convenção de sinal do cartão de crédito**: dinheiro que sai (compras) = negativo.
3. **Divergências de conciliação são avisos, não erros.** O pipeline nunca para por causa delas.
4. **A DRE é feita de fórmulas, não de valores.** `=SUMIFS(...)`, sempre.
5. **Plano de contas travado no início da categorização.** Não adiciono códigos de conta no meio da execução.
6. **A normalização da contraparte roda antes da categorização**, usa a mesma função em todo ponto de gravação.
7. **Suspenso é visível.** O Lucro Líquido Ajustado precisa aparecer na DRE.
8. **Não persisto categorizações de baixa confiança** em prior_categorizations.json.
9. **Sempre passo `"value_input_option": "USER_ENTERED"`** nas gravações do Composio Sheets. `RAW` destrói fórmulas silenciosamente.
10. **Armazeno códigos de conta como texto no Sheets** prefixando com `'` (ex. `"'6090"`). Senão o SUMIFS perde todas as linhas.
11. **Subagentes Extratores sempre despachados com `model: "haiku"`**, nunca uso o modelo padrão do orquestrador.
12. **Subagentes Categorizador e Redator de Planilhas sempre despachados com `model: "sonnet"`**, nunca uso o modelo padrão do orquestrador.

## Arquivos de Referência

Carrego sob demanda durante a execução:

- `CHART_OF_ACCOUNTS.md`, plano de contas padrão (receita, custo das mercadorias vendidas, despesa, patrimônio líquido, contas de transferência)
- `EXTRACTION.md`, padrões de layout nomeados, peculiaridades de cartão de crédito, tratamento multi-período
- `SHEETS_SPEC.md`, estrutura da planilha do Google Sheets, uso das ferramentas do Composio, modelos de fórmula, sequência de chamadas

## Modos de Falha a Observar

- **PDFs de imagem escaneada sem camada de texto**, a leitura visual ainda funciona (multimodal) mas erros de OCR se infiltram. Faço eu mesmo (sem subagente Haiku) para poder inspecionar os artefatos visualmente. Sinalizo extrações de baixa confiança, exponho-as.
- **PDF com mais de 10 páginas**, o Read exige o parâmetro `pages`. O prompt do subagente Haiku já instrui a fatiar; para PDFs muito longos (mais de 30 páginas) considero dividir por extrato, despachando um agente por mês.
- **Subagente Haiku retornou divergência de conciliação**, não aceito silenciosamente. Releio aquele PDF eu mesmo no orquestrador para corrigir a extração.
- **Subagente Haiku errou o sinal do extrato de cartão de crédito**, o erro mais comum: compras deixadas positivas. Faço uma checagem pontual em pelo menos o primeiro JSON retornado antes de despachar o resto. Se estiver errado, aperto o bloco de convenção de sinal no prompt.
- **Conciliação de cartão de crédito entre períodos**: uma transação lançada no extrato N+1 pode ter `date` dentro da janela do extrato N. Ancoro a conciliação na coluna `Statement Date` (veja EXTRACTION.md), não em SUMIFS por intervalo de data em Transactions!A:A.
- **Transações duplicadas entre extratos sobrepostos**, removo duplicatas pela tupla (account_last4, date, amount, description).
- **Transações em moeda estrangeira**, mantenho o valor na moeda local (como liquidado), anoto o detalhe de câmbio na coluna description.
- **Estornos / reversões**, são transações reais, incluo as duas pernas com sinais opostos.
- **Deriva do plano de contas no meio do projeto**, se códigos de conta forem adicionados ou renomeados no meio do projeto, reescrevo `chart_of_accounts.json` E reinicio `prior_categorizations.json` apenas com esta execução. Códigos obsoletos VÃO direcionar mal transações futuras.

---
name: procesar-mis-estados-de-cuenta
title: "Procesar mis estados de cuenta"
description: "Proceso un lote de estados de cuenta bancarios y de tarjeta de crédito en PDF o CSV de principio a fin: extraigo cada transacción (subagentes Haiku en paralelo), normalizo los nombres de las contrapartes, categorizo contra tu plan de cuentas bloqueado (subagentes Sonnet en paralelo), detecto transferencias entre cuentas, y armo un libro de Google Sheets revisado con un estado de resultados basado en fórmulas. Las discrepancias de conciliación aparecen como advertencias, las categorizaciones de baja confianza van a Suspenso, nunca invento un código de cuenta, nunca inserto un número en silencio, nunca publico en tu sistema contable."
version: 1
category: Contabilidad
featured: no
image: ledger
integrations: [googlesheets, stripe]
---


# Procesar mis estados de cuenta

Suelta un lote de estados de cuenta bancarios y de tarjeta de crédito en PDF o CSV y produzco un libro de Google Sheets revisado con un estado de resultados basado en fórmulas. Pipeline completo: extraigo cada transacción en paralelo, normalizo las contrapartes, categorizo contra tu plan de cuentas bloqueado, etiqueto las transferencias entre cuentas, y escribo un libro que puedes entregarle a tu contador. El bucket de Suspenso y las advertencias de conciliación quedan arriba de todo, nunca cuadro forzando un número, nunca invento un código de cuenta, nunca publico.

## Destino de la salida: Google Sheets vía Composio

Uso el CLI de Composio disponible en el PATH. Todas las escrituras a Google Sheets pasan por ahí.

**Antes de cualquier ejecución**, verifico que el conjunto de herramientas `googlesheets` esté conectado:

```bash
composio execute GOOGLESHEETS_SEARCH_SPREADSHEETS -d '{"query": "", "max_results": 1}'
```

Si devuelve `"No active connection found for toolkit \"googlesheets\""`, ME DETENGO y te pido que conectes:

```bash
composio link googlesheets --no-wait
```

Tomo `redirect_url` de la respuesta, te la presento como un enlace markdown con `#houston_toolkit=googlesheets` agregado al final (para que Houston muestre la tarjeta de conexión). Espero tu aprobación antes de continuar.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta skill, reviso que las categorías de abajo estén vinculadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Google Sheets** (spreadsheets) - obligatorio. Todo el pipeline termina en un libro de Google Sheets con un estado de resultados basado en fórmulas; sin esto no hay resultado. Consulta el bloque "Destino de la salida: Google Sheets vía Composio" más arriba para el comando de verificación y el enlace de conexión.
- **Stripe** (facturación) - opcional. Extrae los depósitos y las comisiones del procesador para que se categoricen limpiamente cuando aparezcan en tu feed bancario.

Si Google Sheets no está conectado, me detengo y te pido que lo conectes antes de hacer cualquier trabajo.

## Información que necesito

Primero leo tu contexto contable. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Un contexto contable terminado** - Obligatorio. Por qué: necesito tu método contable, tu código de suspenso, y tus cuentas registradas antes de categorizar. Si falta, pregunto: "¿Ya configuramos los libros? Si no, corre la configuración una vez para que yo conozca tu año fiscal, tu método contable, y tus cuentas registradas."
- **Un plan de cuentas** - Obligatorio. Por qué: lo bloqueo durante la ejecución; cada categoría que asigno tiene que venir de tu plan de cuentas. Si falta, pregunto: "¿Ya tenemos un plan de cuentas? Si no, redactemos uno primero."
- **Tus cuentas bancarias y tarjetas de crédito** - Obligatorio. Por qué: agrupo las transacciones por los últimos 4 dígitos y necesito el código de cuenta de cada una. Si falta, pregunto: "¿Qué cuentas bancarias y tarjetas de crédito usa el negocio? Registro automáticamente las nuevas cuando lleguen los estados de cuenta, pero es más rápido si me lo dices de antemano."
- **Los estados de cuenta a procesar** - Obligatorio. Por qué: el pipeline arranca a partir de los PDF o CSV que sueltes. Si falta, pregunto: "¿Puedes soltar los estados de cuenta bancarios y de tarjeta de crédito en PDF, o adjuntarlos en el chat?"
- **Reglas de proveedor de un período anterior** - Opcional. Por qué: me permite emparejar cargos nuevos con proveedores conocidos y mantener al mínimo las preguntas. Si no las tienes, sigo adelante y aprendo de esta ejecución.

## Estructura de almacenamiento

Agente de una sola empresa. El plan de cuentas y la memoria viven en la raíz del agente (plano). Cada ejecución obtiene su propia carpeta bajo `runs/{period}/`.

```
context/
└── bookkeeping-context.md                  # brief en vivo (entidad, año fiscal, método contable)

config/
├── context-ledger.json                     # metadatos: empresa, método contable, bancos, etc.
├── chart-of-accounts.json                  # plan de cuentas autoritativo (bloqueado durante una ejecución)
├── prior-categorizations.json              # {canonical_party: gl_code} - historial de proveedores
└── party-rules.json                        # reglas exactas confirmadas por el usuario

statements/                                  # PDFs fuente + archivos auxiliares (lista de proveedores, etc.)
└── _inbox/                                 # zona de entrega para PDFs antes de correr este pipeline

runs/
└── {period}/                               # ej., 2024, 2024-Q1, 2024-01
    ├── run.json                            # artefacto completo de la ejecución (la fuente de recuperación)
    ├── _extractions/{pdf_stem}.json        # transitorio - resultados del extractor Haiku (uno por PDF)
    ├── _work/{account_last4}.json          # transitorio - paquetes entregados a cada Categorizador
    ├── _categorizations/{account_last4}.json  # transitorio - resultados del categorizador Sonnet
    └── _sheet_state/{period}.json          # transitorio - resultado del Escritor de Sheets Sonnet
```

Si falta el directorio, lo creo con `mkdir -p` en el primer uso.

**Las cuentas bancarias** viven en el libro de contexto, no en un `client.json` separado:

```jsonc
// config/context-ledger.json (extracto)
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
    "suspenseCode": { "code": "99999", "name": "Suspense" }
  }
}
```

## Entradas

Tú me das uno o más de estos:
1. Rutas explícitas de PDF en el mensaje (lo más común, adjuntos soltados en el chat).
2. PDFs en `statements/_inbox/`, los listo con `ls statements/_inbox/*.pdf`.
3. Identificador de período (año / trimestre / mes), usado para el nombre de la carpeta `runs/{period}/`.
4. (Opcional) archivo de plan de cuentas personalizado (xlsx / csv / texto en línea), lista de proveedores, o Detalle de Transacciones anterior.

## Procedimiento

### Paso 1 - Arranco el contexto y bloqueo el plan de cuentas

1. **Cargo el estado existente:**
   - `context/bookkeeping-context.md`, el brief. Si falta, me detengo y pido que corras `set-up-my-books` primero (o que lo hagas en línea).
   - `config/context-ledger.json`, cuentas, código de suspenso.
   - `config/chart-of-accounts.json`, el plan de cuentas autoritativo. Si existe, lo **BLOQUEO para esta ejecución.**
   - `config/prior-categorizations.json`, memoria de proveedor → código de cuenta.
   - `config/party-rules.json`, reglas de coincidencia exacta.

2. **Arranque de primera ejecución (solo si `config/chart-of-accounts.json` no existe):**
   - Si me diste un archivo de plan de cuentas (xlsx/csv), lo interpreto (openpyxl para xlsx) hacia `config/chart-of-accounts.json` como `[{code, name, type, statementSection}]`.
   - Si describiste el plan de cuentas en línea, lo estructuro de esa forma.
   - Si no, recurro al que viene por defecto en `CHART_OF_ACCOUNTS.md`, pero lo copio a `config/chart-of-accounts.json` para que las siguientes ejecuciones compartan los mismos códigos.
   - Copio los PDFs fuente + archivos auxiliares a `statements/` (mantengo los nombres de archivo; subcarpetas por cuenta está bien, ej. `statements/9041/2024-01.pdf`).
   - Si me diste un Detalle de Transacciones anterior, extraigo `{vendor_name: [gl_codes]}` y siembro `config/prior-categorizations.json` con el código mayoritario por proveedor (solo si es consistente en ≥ 80% de los registros anteriores).

3. **Bloqueo el plan de cuentas para el resto de la ejecución.** Trato `config/chart-of-accounts.json` como inmutable hasta el Paso 7. Si una transacción no se puede categorizar, la mando a Suspenso, NUNCA invento un código de cuenta nuevo.

4. **Determino el período.** Por defecto: desde el mínimo (period_start) hasta el máximo (period_end) entre todos los estados de cuenta. Slug de período: `YYYY` para año completo, `YYYY-QN` para trimestre, `YYYY-MM` para un solo mes. Creo `runs/{period}/_extractions/`, `runs/{period}/_work/`, `runs/{period}/_categorizations/`, `runs/{period}/_sheet_state/`.

### Paso 2 - Extraigo las transacciones (subagentes Haiku en paralelo)

**No leo los PDFs en el orquestador, despacho subagentes Haiku en paralelo.** Es mucho más rápido, y mantiene limpio el contexto del orquestador para la categorización y el armado de la hoja de cálculo.

**Patrón de despacho:**

Por cada PDF (o lote pequeño de ≤ 3 PDFs de un solo mes de la misma cuenta), lanzo una llamada `Agent` en paralelo con:
- `subagent_type: "general-purpose"`
- `model: "haiku"`
- `description: "Extract {bank} {account_last4} {YYYY-MM}"` (o similar, de 3 a 5 palabras)

**Envío todos los despachos en un solo mensaje para que corran de forma concurrente.** Doce estados de cuenta mensuales → doce agentes en paralelo, terminan en aproximadamente el tiempo de uno solo.

Cada subagente escribe su resultado en disco en `runs/{period}/_extractions/{source_pdf_stem}.json` y devuelve una confirmación corta ("wrote N transactions, reconciles: yes/no"). El orquestador lee de vuelta los archivos JSON después de que todos los agentes terminan.

**Plantilla del prompt del subagente** (pega, completa `{...}` por cada despacho):

```
You are extracting transactions from a single bank or credit card statement PDF.

PDF path: {absolute_pdf_path}
Expected account_last4 (if known): {last4 or "unknown"}
Expected account type: {"credit_card" | "checking" | "savings" | "unknown"}

TASK
Read the PDF with the Read tool (it is multimodal  -  it sees the pages). If the PDF has
more than 10 pages, use the `pages` parameter to read it in slices. Extract EVERY
transaction and the statement's opening/closing balances. Write the result as JSON to:

  {output_path}

OUTPUT JSON SCHEMA
{
  "source_pdf": "{pdf filename, not path}",
  "bank_name": "Chase" | "Wells Fargo" | etc.,
  "account_last4": "9041",
  "account_type": "credit_card" | "checking" | "savings",
  "statements": [                            // generalmente uno, pero los PDF multiperíodo pueden tener varios
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

SIGN CONVENTION  -  NON-NEGOTIABLE
Normalize to "money out of the business = negative, money in = positive":
- Checking / savings: deposits +, withdrawals / debits / fees -.
- Credit card: purchases / interest / fees -, payments / credits / returns +.
  (This is the OPPOSITE of how many CC statements print; flip if needed.)

EXTRACTION DISCIPLINE
- The transaction AMOUNT is the change, not the running balance column.
- Skip "Beginning Balance" and "Ending Balance" marker rows.
- Include bank fees and interest as transactions.
- Continued-on-next-page rows: include once.
- Multi-period PDFs: emit one entry per statement under `statements[]`.
- Date format: ISO YYYY-MM-DD. If a txn date is ambiguous (12/15 with no year) use the
  year consistent with the statement period.

RECONCILIATION SELF-CHECK
Before writing the file, verify for each statement:
   computed_close = opening_balance + sum(transaction.amount)   (for checking/savings)
   computed_close = opening_balance - sum(transaction.amount)   (for credit_card, using the sign convention above)
If |computed_close - closing_balance| > 0.02, include a "reconciliation_note" field
on that statement describing the diff  -  do NOT silently force a match.

Write the JSON file. Return a one-line summary:
"wrote {N} txns across {M} statement(s), recon: {ok|diff=$X.XX}"
```

**Después de despachar, el orquestador:**

1. Espero a que todos los subagentes terminen (corren en paralelo automáticamente).
2. Leo cada `runs/{period}/_extractions/*.json`.
3. Combino en una sola lista en memoria por account_last4.
4. Elimino duplicados en `(account_last4, date, amount, description)` si dos estados de cuenta se traslapan.
5. Aplico la misma autoverificación de conciliación en el orquestador (confío, pero verifico).

**Cuándo NO despachar subagentes:**
- Solo un PDF pequeño, necesito los datos de inmediato, lo leo en línea.
- PDF escaneado como imagen, de muy baja calidad, lo hago yo mismo para poder inspeccionar visualmente los artefactos del OCR.
- El subagente devolvió una diferencia de conciliación > $0.02, releo yo mismo ese estado de cuenta específico en el orquestador y corrijo la extracción.

Consulta `EXTRACTION.md` para los patrones de formato nombrados (tablas simples, columnas de saldo corrido, el formato en español de Wells Fargo, etc.), incluyo la pista de patrón relevante en el prompt del subagente cuando conozco el banco de antemano.

### Paso 3 - Verificación de conciliación (solo advertencia, nunca bloquea)

Por cada estado de cuenta:
```
computed_closing = opening_balance + sum(transaction.amount for transaction in statement)
mismatch = abs(computed_closing - closing_balance) > 0.02   # tolerancia de 2 centavos
```
Si hay descuadre, agrego una advertencia a la hoja de conciliación y continúo. No detengo el pipeline.

### Paso 3b - Combino las extracciones y escribo los paquetes de trabajo para el Categorizador

Después de que todos los Extractores Haiku terminan, el orquestador lee y combina el resultado antes de despachar a los Categorizadores:

1. **Leo todos los `runs/{period}/_extractions/*.json`.**

2. **Agrupo las transacciones por `account_last4`.** Por cada last4 único entre todos los archivos de extracción, recolecto todas las transacciones de todos los estados de cuenta de esa cuenta.

3. **Registro cuentas nuevas.** Cualquier `account_last4` que aún no esté en `context-ledger.json → domains.banks.accounts[]`, la agrego con el nombre del banco y el tipo de cuenta del archivo de extracción, dejo `gl_code` en blanco por ahora.

4. **Elimino duplicados.** Dentro de cada cuenta, quito las transacciones duplicadas en `(date, amount, description)`, aparecen cuando los estados de cuenta se traslapan (ej., dos meses comparten una fecha límite).

5. **Escribo un paquete de trabajo por cuenta** en `runs/{period}/_work/{account_last4}.json`:

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
    { "code": "6090", "name": "Office Expenses", "type": "expense" }
  ],
  "prior_categorizations": { "Amazon": "6090" },
  "party_rules": { "PG&E": "6150" }
}
```

Campos:
- `account_last4`, `account_type`, `bank`, `gl_code`, de `context-ledger.json → domains.banks.accounts[]` (`gl_code` puede quedar en blanco para cuentas nuevas)
- `suspense_code`, de `context-ledger.json → universal.suspenseCode.code`
- `transactions`, lista combinada y sin duplicados solo de esta cuenta; incluye `statement_date` si está presente en el JSON de extracción
- `chart_of_accounts`, el contenido completo de `config/chart-of-accounts.json`
- `prior_categorizations`, el contenido completo de `config/prior-categorizations.json` (`{}` vacío si está ausente)
- `party_rules`, el contenido completo de `config/party-rules.json` (`{}` vacío si está ausente)

6. **Creo los subdirectorios de salida si no existen:**
```bash
mkdir -p runs/{period}/_work
mkdir -p runs/{period}/_categorizations
mkdir -p runs/{period}/_sheet_state
```

### Paso 4+5 - Despacho a los subagentes Categorizadores (Sonnet, en paralelo)

**No canonicalizo ni categorizo en línea en el orquestador.** Despacho un Categorizador Sonnet por cada `account_last4` en un solo mensaje para que corran de forma concurrente. Para cuentas con más de 500 transacciones, divido en bloques de ≤500 filas y despacho varios agentes para la misma cuenta (los resultados se concatenan en orden).

**Patrón de despacho:**

Por cada cuenta (una llamada `Agent` por cuenta en un solo mensaje):
- `subagent_type: "general-purpose"`
- `model: "sonnet"`
- `description: "Categorize {bank} {account_last4}"` (de 3 a 5 palabras)

**Cada Categorizador devuelve un estado de una línea:**
`"account {last4}: {N} txns, {R} ready / {V} review / {U} suspense (${S})"`

---

**Plantilla del prompt del subagente Categorizador** (completa `{...}` por cada cuenta):

```
You are categorizing bank/credit card transactions for bookkeeping.

Work packet path: {absolute_work_packet_path}
Output path: {absolute_output_path}

TASK
1. Read the work packet JSON at the work packet path above.
2. For each transaction, canonicalize the party name (Stage 4 below) then categorize it (Stage 5 below).
3. Write the result JSON to the output path.
4. Return exactly one line: "account {last4}: {N} txns, {R} ready / {V} review / {U} suspense (${S})"

---

STAGE 4  -  CANONICALIZE PARTY NAMES

For each transaction's description field, derive a canonical party name:
1. Strip noise prefixes: "POS DEBIT", "CHECKCARD", "DEBIT CARD PURCHASE", "ACH", "ONLINE PMT", "SQ *", "TST*", "PREAUTHORIZED DEBIT"
2. Strip trailing reference numbers (runs of 6+ digits), location codes (#12345), city+state suffixes (e.g. "SEATTLE WA", "NEW YORK NY")
3. Collapse whitespace, apply Title Case
4. If the cleaned name fuzzy-matches an entry in the work packet's prior_categorizations or party_rules (token set ratio ≥ 0.85), use the canonical form stored there (the key), not your cleaned version

Examples:
- "POS DEBIT AMAZON.COM*AB12C NJ" → "Amazon" (if "Amazon" is in prior_categorizations)
- "SQ *JOE'S COFFEE SHOP SEATTLE WA" → "Joe's Coffee Shop"
- "ACH DEBIT PG&E UTILITY PMT" → "PG&E"
- "CHECKCARD 0115 SHELL OIL 12345678" → "Shell Oil"
- "ONLINE PMT CHASE CREDIT CRD AUTOPAY" → "Chase Autopay" (will go to Suspense  -  see below)

---

STAGE 5  -  CATEGORIZE EACH TRANSACTION

Use this priority order for every transaction. Stop at the first hit:

**1. party_rules exact match**
If the canonical party exactly matches a key in the work packet's party_rules, assign that account code.
- confidence: 1.00
- source: "rule"

**2. prior_categorizations fuzzy match**
If the canonical party fuzzy-matches a key in prior_categorizations (token set ratio ≥ 0.85) AND the stored account code is in the chart_of_accounts, use it.
- confidence: 0.95
- source: "prior_year"

**3. Your reasoning against the chart_of_accounts**
Look at description, canonical party, amount, and the account type. Pick the best account code from the chart_of_accounts.
Assign a calibrated confidence:
- 0.95+: obvious and unambiguous (e.g., "PG&E" → Utilities; "Stripe Transfer" → Sales Revenue)
- 0.90–0.94: one reasonable candidate, but not certain
- < 0.90: multiple plausible categories, or unclear vendor → send to Suspense (see below)
- source: "ai"

**4. Suspense**
If no hit above OR confidence < 0.90, assign the suspense_code from the work packet.
- gl_name: "Suspense"
- confidence: 0.50
- source: "ai"
- category_status: "uncategorized"

**category_status rules:**
- "ready_for_approval" if confidence ≥ 0.90 AND source ∈ {rule, prior_year}
- "review_categorization" if confidence ≥ 0.90 AND source = "ai"
- "uncategorized" if confidence < 0.90

**SIGN CONVENTION:** The work packet already has correct signs  -  do NOT flip amounts. For credit cards: purchases are negative, payments/credits are positive.

**DO NOT assign account code 9000 (Internal Transfer).** You cannot see other accounts' transactions. If a transaction looks like an inter-account transfer (e.g., "Chase Autopay", "Transfer to Checking"), send it to Suspense unless it exactly matches a party_rule.

**DO NOT invent account codes** not present in the chart_of_accounts.

---

OUTPUT JSON  -  write this to the output path:

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
      "gl_name": "Office Expenses",
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

"new_parties": canonical party names not found as keys in prior_categorizations or party_rules.
"statement_date": pass through from the source transaction in the work packet if present.
"suspense_dollar_amount": sum of absolute values of amounts for uncategorized transactions.

Write the file. Return the one-line summary.
```

---

**Después de que todos los Categorizadores terminan, el orquestador:**

1. Lee `_categorizations/{account_last4}.json` de cada cuenta.
2. Aplica la detección de transferencias entre cuentas:
   - Por cada débito en la cuenta A en la fecha D: busca en todas las demás cuentas un crédito en la fecha D±2 con el mismo monto absoluto.
   - En ambas partes que coinciden: fija `gl_code = "9000"`, `gl_name = "Internal Transfer"`, `source = "transfer"`, `category_status = "ready_for_approval"`.
   - Los pares de transferencia se marcan en el artefacto de la ejecución, excluidos de las fórmulas SUMIFS del estado de resultados.
3. Armo `runs/{period}/run.json` combinando los arreglos de transacciones categorizadas de todas las cuentas más los metadatos.

`run.json` esquema:
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
      "gl_name": "Office Expenses",
      "confidence": 0.95,
      "source": "prior_year",
      "category_status": "ready_for_approval"
    }
  ],
  "reconciliation_warnings": []
}
```

### Compuerta 1 - Revisión posterior a la categorización (nunca bloquea)

El orquestador lee solo el bloque `summary` de cada `_categorizations/*.json` (no los arreglos completos de transacciones). Reviso:

| Verificación | Umbral | Acción |
|---|---|---|
| Tasa de Suspenso | > 25% de las transacciones en cualquier cuenta | Agrego una advertencia nombrada al reporte final |
| Monto en Suspenso | > 30% del volumen absoluto total de transacciones entre todas las cuentas | Agrego una advertencia nombrada al reporte final |
| Contraparte sin categorizar repetida | Cualquier contraparte canónica aparece ≥ 10 veces con `confidence < 0.90` | Agrego una alerta nombrada: "'{party}' appears {N}x uncategorized - consider adding a party rule" |
| Descuadres de conciliación | Cualquier `reconciliation_note` en algún `_extractions/*.json` | Lo muestro en el reporte (ya recolectado en el Paso 3) |
| Transferencias entre cuentas encontradas | Conteo y monto absoluto total | Registro: "Found {N} transfer pair(s) totaling ${X} - tagged account code 9000" |

La Compuerta 1 nunca bloquea. Acumulo los hallazgos en la lista `gate1_warnings`, y los llevo al reporte del Paso 8.

### Paso 6 - Despacho al subagente Escritor de Sheets (Sonnet, único)

**No llamo a Composio en línea en el orquestador.** Despacho un único Escritor de Sheets Sonnet que lee el `run.json` ya armado y se encarga de crear el libro completo.

**Despacho:**
- `subagent_type: "general-purpose"`
- `model: "sonnet"`
- `description: "Write Google Sheet {period}"`

**El Escritor devuelve una línea:**
`"sheet ready: {url}  -  NI ${pnl_net_income}, Adj NI ${pnl_adjusted_net_income}, 0 errors"`
o
`"sheet FAILED: error_cells=[P&L!B44, ...]"`

---

**Plantilla del prompt del subagente Escritor de Sheets:**

```
You are creating a Google Sheets bookkeeping workbook from categorized transaction data.

Input files  -  read all of these:
- Run data:            {absolute_run_json_path}
- Context ledger:      {absolute_context_ledger_path}
- Chart of accounts:   {absolute_coa_json_path}
- Sheets spec:         {absolute_sheets_spec_path}

Output path: {absolute_sheet_state_path}

TASK
1. Read SHEETS_SPEC.md at the sheets spec path above  -  it is your complete instruction manual for creating the workbook via Composio. Follow it exactly.
2. Read run.json, context-ledger.json, and chart-of-accounts.json.
3. Create the Google Sheet workbook following the spec.
4. Write the sheet state JSON to the output path.
5. Return exactly one line (format below).

The Composio CLI is at composio (not on PATH  -  use full path).

CRITICAL RULES  -  these override anything else:
1. Set locale to "en_US" IMMEDIATELY after creating the spreadsheet, before writing any data.
   Use UPDATE_SPREADSHEET_PROPERTIES with: {"properties": {"locale": "en_US"}, "fields": "locale"}
   If you skip this step, formulas will silently fail on non-English Google accounts (#ERROR).
2. Always pass "value_input_option": "USER_ENTERED" on every batch write. RAW turns formulas into string literals.
3. Prefix all account codes with a single quote when writing cell values (e.g., "'6090") so Sheets stores them as text, not numbers. SUMIFS string-matching will break silently if you skip this.
4. Tool parameter casing is inconsistent  -  always run --get-schema before using a new tool:
   - DELETE_SHEET, UPDATE_SPREADSHEET_PROPERTIES, UPDATE_SHEET_PROPERTIES → camelCase (spreadsheetId, sheetId)
   - APPEND_DIMENSION, ADD_SHEET, UPDATE_VALUES_BATCH, BATCH_GET → snake_case (spreadsheet_id, sheet_id)
5. P&L totals must be SUMIFS formulas, never hardcoded values.
6. Sheet names with spaces or & need single quotes in formulas: 'Chart of Accounts'!A:B, 'P&L'!B44.

VERIFICATION (after writing all tabs):
- Read back the P&L Net Income cell and Adjusted Net Income cell using GOOGLESHEETS_BATCH_GET
  with valueRenderOption: "UNFORMATTED_VALUE" (note camelCase) to get computed numbers.
- Scan the P&L and Transactions tabs for cells containing "#ERROR" or "#REF".
- Include the results in the output JSON.

OUTPUT JSON  -  write to the output path:
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

Return exactly one line:
"sheet ready: {url}  -  NI ${pnl_net_income}, Adj NI ${pnl_adjusted_net_income}, {N} errors"
or if verification.error_cells is non-empty or any value is null:
"sheet FAILED: error_cells=[{comma-separated list}]"
```

---

### Compuerta 2 - Revisión posterior a Sheets (máximo un reintento)

Después de que el Escritor de Sheets devuelve su resultado, el orquestador lee `_sheet_state/{period}.json` y revisa:

| Verificación | Umbral | Acción |
|---|---|---|
| `error_cells` no vacío | Cualquiera | Redespacho al Escritor de Sheets con los mismos insumos + nota: "Fix these cells: {list}". Máximo 1 reintento. |
| `pnl_adjusted_net_income` vs. la suma local de run.json | Diferencia > $0.02 | Redespacho con nota: "Adjusted Net Income mismatch, expected ${X}, got ${Y}. Check Suspense SUMIFS and transfer exclusion." |
| `formulas_parsed: false` | - | Redespacho con nota: "Formulas parsed as text. Ensure locale is set to en_US BEFORE any batch write." |
| `verification.suspense_total` vs. el total de Suspenso de la Compuerta 1 | Diferencia > $0.02 | Redespacho con nota: "Suspense total mismatch, expected ${X}, got ${Y}. Check Transactions tab row count." |

Si el único reintento también falla: salto el Paso 7, muestro un mensaje de éxito parcial, conservo la ruta de `run.json` para recuperación manual.

Si la Compuerta 2 pasa: agrego la referencia de la hoja a `config/context-ledger.json` bajo `domains.banks.sheets[]` (creo el arreglo si no existe):
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
y actualizo `updatedAt` a hoy. También agrego a `run-index.json` en la raíz del agente: `{id, period, status: "ready", sheetUrl, accountsIncluded[], suspenseTotal, pnlNetIncome}`.

---

### Paso 7 - Guardo los aprendizajes

Después de un resultado exitoso:
1. Abro `config/prior-categorizations.json` (lo creo si no existe).
2. Por cada transacción con `source ∈ {rule, prior_year, transfer}` O `confidence ≥ 0.95`, hago upsert de `{canonical_party: gl_code}`.
3. NO persisto categorizaciones ambiguas (`confidence < 0.90`), envenenan la siguiente ejecución.
4. Si el plan de cuentas cambió a mitad de proyecto (códigos agregados/renombrados vía `build-my-chart-of-accounts`), reescribo `config/chart-of-accounts.json` Y reinicio `config/prior-categorizations.json` solo con las entradas de alta confianza de esta ejecución, los códigos obsoletos del plan de cuentas anterior desvían mal las transacciones futuras.

### Paso 8 - Te reporto

Imprimo un resumen conciso:
- **URL de la Google Sheet** (enlace markdown en el que se puede hacer clic), destacado arriba de todo
- Ruta de la carpeta de la ejecución (`runs/{period}/`) y la raíz del agente (para que veas dónde vive la memoria/los resultados)
- Estados de cuenta procesados (conteo, por cuenta)
- Transacciones extraídas (conteo, volumen absoluto total)
- Advertencias de conciliación (si las hay, en lista)
- Desglose de categorización: X listas, Y necesitan revisión, Z en Suspenso (con el monto en $)
- Utilidad Neta y Utilidad Neta Ajustada, leídas de los campos `verification.pnl_net_income` y `verification.pnl_adjusted_net_income` de `runs/{period}/_sheet_state/{period}.json` (ya calculadas por el Escritor de Sheets)
- Advertencias de la Compuerta 1 (si las hay), incluyo cada advertencia nombrada tal cual
- Ruta del artefacto JSON local (`runs/{period}/run.json`)
- Cantidad de contrapartes canónicas nuevas guardadas en `config/prior-categorizations.json`

Destaco el **monto en dólares de Suspenso** de forma prominente, ese es el "costo de no terminar la revisión".

## Invariantes críticas, no se pueden violar

1. **Las cuentas bancarias se agrupan solo por `account_last4`.** Nunca por el nombre del banco. Los nombres varían entre estados de cuenta.
2. **Convención de signo para tarjetas de crédito**: dinero que sale (compras) = negativo.
3. **Los descuadres de conciliación son advertencias, no errores.** El pipeline nunca se detiene por ellos.
4. **El estado de resultados son fórmulas, no valores.** `=SUMIFS(...)`, siempre.
5. **El plan de cuentas queda bloqueado al inicio de la categorización.** No agrego códigos de cuenta a mitad de la ejecución.
6. **La canonicalización de contrapartes corre antes de la categorización**, usa la misma función en cada punto de escritura.
7. **Suspenso visible.** La Utilidad Neta Ajustada debe aparecer en el estado de resultados.
8. **No persisto categorizaciones de baja confianza** en prior_categorizations.json.
9. **Siempre paso `"value_input_option": "USER_ENTERED"`** en las escrituras a Sheets vía Composio. `RAW` destruye las fórmulas en silencio.
10. **Guardo los códigos de cuenta como texto en Sheets** con el prefijo `'` (ej. `"'6090"`). Si no, SUMIFS se pierde cada fila.
11. **Los subagentes Extractores siempre se despachan con `model: "haiku"`**, nunca por defecto al modelo del orquestador.
12. **Los subagentes Categorizador y Escritor de Sheets siempre se despachan con `model: "sonnet"`**, nunca por defecto al modelo del orquestador.

## Archivos de referencia

Los cargo bajo demanda durante la ejecución:

- `CHART_OF_ACCOUNTS.md`, plan de cuentas por defecto (ingresos, costo de ventas, gasto, patrimonio, cuentas de transferencia)
- `EXTRACTION.md`, patrones de formato nombrados, particularidades de tarjetas de crédito, manejo de multiperíodo
- `SHEETS_SPEC.md`, estructura del libro de Google Sheets, uso de herramientas de Composio, plantillas de fórmulas, secuencia de llamadas

## Modos de falla a vigilar

- **PDFs de imagen escaneada sin capa de texto**: el Read visual sigue funcionando (multimodal) pero se cuelan errores de OCR. Lo hago yo mismo (sin subagente Haiku) para poder inspeccionar los artefactos visualmente. Marco las extracciones de baja confianza, las muestro.
- **PDF de más de 10 páginas**: el Read requiere el parámetro `pages`. El prompt del subagente Haiku ya instruye dividir en rebanadas; para PDFs muy largos (más de 30 páginas) considero dividir por estado de cuenta, despachando un agente por mes.
- **El subagente Haiku devolvió una diferencia de conciliación**: no la acepto en silencio. Releo ese PDF yo mismo en el orquestador para corregir la extracción.
- **El subagente Haiku firmó mal un estado de cuenta de tarjeta de crédito**: el error más común, las compras quedan en positivo. Reviso al menos el primer JSON devuelto antes de despachar el resto. Si está mal, ajusto el bloque de convención de signo en el prompt.
- **Conciliación de tarjeta de crédito entre períodos**: una transacción registrada en el estado de cuenta N+1 puede tener una `date` dentro de la ventana del estado N. Ancla la conciliación en la columna `Statement Date` (ver EXTRACTION.md), no en un SUMIFS de rango de fechas sobre Transactions!A:A.
- **Transacciones duplicadas entre estados de cuenta traslapados**: elimino duplicados por la tupla (account_last4, date, amount, description).
- **Transacciones en moneda extranjera**: mantengo el monto en la moneda local (según se liquidó), anoto el detalle de tipo de cambio en la columna de descripción.
- **Contracargos / reversos**: son transacciones reales, incluyo ambas partes con signos opuestos.
- **Desviación del plan de cuentas a mitad de proyecto**: si agrego o renombro códigos de cuenta a mitad de proyecto, reescribo `chart_of_accounts.json` Y reinicio `prior_categorizations.json` solo con esta ejecución. Los códigos obsoletos SÍ van a desviar mal las transacciones futuras.

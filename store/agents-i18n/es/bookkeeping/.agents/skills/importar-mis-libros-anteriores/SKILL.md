---
name: importar-mis-libros-anteriores
title: "Importar mis libros anteriores"
description: "Recupero la memoria de tu sistema anterior: una exportación de QuickBooks Online o Xero, un CSV, o una hoja de cálculo de tu contador anterior. Inicializo tu plan de cuentas (solo si no tienes uno), construyo un balance de apertura a partir de los saldos de cierre del período anterior, y aprendo reglas de proveedor a código de cuenta a partir del historial de transacciones con un umbral de mayoría del 80% de confianza para que los proveedores ruidosos no contaminen la categorización futura. Es estrictamente de lectura en un solo sentido, nunca envío nada de vuelta a QuickBooks Online ni a Xero, nunca reescribo los libros anteriores."
version: 1
category: Contabilidad
featured: no
image: ledger
integrations: [quickbooks, xero]
---


# Importar Mis Libros Anteriores

Trae la contabilidad de tu año anterior a la memoria para que este año no empiece en frío. Leo una exportación de QuickBooks Online, una exportación de Xero, o un CSV / xlsx genérico; inicializo tu plan de cuentas si no tienes uno; construyo el balance de comprobación de apertura a partir de los saldos de cierre anteriores; y aprendo reglas de proveedor a código de cuenta a partir del historial de transacciones. Cada skill posterior, `process-my-statements`, `categorize-my-transactions`, `close-my-month`, arranca con el conocimiento de proveedores ya cargado.

Solo lectura: nunca me conecto de vuelta para enviar, nunca reescribo tus libros anteriores. Aprendo de ellos.

## Cuándo usarlo

- "carga los libros del año anterior" / "importa desde QuickBooks" / "recupera de esta hoja de cálculo" / "trae nuestro historial de Xero".
- "inicializa la memoria de proveedores desde la lista de transacciones del año pasado".
- Invocado implícitamente por `set-up-my-books mode=opening-balances` cuando sueltas una exportación completa del período anterior en lugar de un archivo con solo el balance de comprobación.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr este skill verifico que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **QuickBooks Online o Xero** (contabilidad), opcional, solo se usa si quieres que traiga el libro mayor o la lista de transacciones directamente en lugar de soltar un archivo. Soltar un archivo es la vía preferida.

Este skill funciona completamente a partir de un archivo soltado (exportación en xlsx o CSV). Ninguna conexión bloquea la ejecución.

## Información que necesito

Primero leo tu contexto de contabilidad. Por cada campo requerido que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > pegar) y espero.

- **El fin de tu año fiscal**, requerido. Por qué: define el límite entre los saldos de cierre anteriores y nuestros saldos de apertura. Si falta, pregunto: "¿Cuál es el fin del año fiscal de la empresa, por ejemplo el 31 de diciembre u otra fecha?"
- **Contabilidad de efectivo vs. devengo**, requerido. Por qué: cambia cómo interpreto los saldos en las líneas devengadas y diferidas. Si falta, pregunto: "¿Llevamos los libros en efectivo o en devengo?"
- **El historial de transacciones del período anterior**, requerido. Por qué: no puedo inicializar la memoria de proveedores ni los saldos de apertura sin él. Si falta, pregunto: "¿Puedes exportar el libro mayor o la lista de transacciones del año anterior desde QuickBooks Online o Xero, o compartir la hoja de cálculo del contador anterior? Suéltala como xlsx o CSV."
- **Confirmación de qué saldos de cierre usar como apertura**, opcional. Por qué: si tu importación cubre varios períodos necesito saber qué fin de período se convierte en nuestro balance de comprobación de apertura. Si no tienes un corte específico en mente, uso por defecto el fin de tu año fiscal y confirmo antes de escribir.

## Pasos

1. **Leer la configuración.** Cargar `config/context-ledger.json`, requerido: `universal.company.fiscalYearEnd` (determina el límite del período de importación), `universal.accountingMethod` (efectivo vs. devengo afecta la interpretación del saldo de apertura). Si falta, hacer UNA pregunta puntual (sugerencia de modalidad: app conectada > archivo > URL > pegar) y continuar.

2. **Identificar el formato de origen.** Sueltas uno de:
   - **Exportación del libro mayor de QuickBooks Online**, xlsx/csv, columnas aproximadamente `{Date, Transaction Type, Num, Name, Memo/Description, Account, Split, Amount, Balance}`.
   - **Lista de transacciones de QuickBooks Online**, xlsx/csv con `{Date, Transaction Type, Num, Posting, Name, Memo/Description, Account, Split, Amount}`.
   - **Exportación de Xero** (Detalle del Libro Mayor o Transacciones por Cuenta), csv con `{Date, Source, Description, Reference, Debit, Credit, Running Balance, Account Code, Account Name}`.
   - **CSV / xlsx genérico**, tienes que especificar el mapa de columnas, o te pregunto: `{date, party|vendor, amount|debit+credit, gl_code, gl_name, memo?}`.

   Detecto el formato por los encabezados de columna. Si es ambiguo, confirmo en línea con una pregunta. Para xlsx uso `openpyxl`; para CSV uso el módulo estándar `csv`.

3. **Descubrir la conexión de Composio solo si hace falta.** Si me pides traer directamente de QuickBooks Online / Xero en lugar de soltar un archivo, descubro el slug en tiempo de ejecución:

   ```bash
   composio search accounting
   ```

   Nunca fijo nombres de herramientas de antemano. Si no existe conexión, muestro el comando de enlace y me detengo, sin inventar datos. Soltar un archivo siempre es la vía preferida; traer de la app conectada es una opción, no la opción por defecto.

4. **Analizar en un flujo de filas normalizado.** Cada fila de origen se convierte en:

   ```ts
   {
     date: string;          // YYYY-MM-DD
     party: string;         // raw vendor/customer name from the source
     amount: number;        // signed: money out of the business = negative
     glCode: string;        // text, validated later against chart of accounts
     glName: string;
     memo?: string;
     docType?: string;      // "Bill", "Check", "Invoice", etc.
   }
   ```

   Débitos/créditos de QuickBooks Online: la columna `Amount` ya viene con signo en la exportación del libro mayor. En la lista de transacciones, `Amount` refleja el saldo natural de la cuenta, hay que revisar la columna `Account` para normalizar a la convención de signo del agente (dinero que sale de la empresa = negativo).

   Xero: calcular `amount = debit - credit`, luego aplicar la misma convención de signo según el tipo de cuenta (débitos de activo/gasto = positivo = dinero que sale ⇒ invertir a negativo; créditos de ingreso/pasivo = dinero que entra ⇒ dejar en positivo).

5. **Inicializar el plan de cuentas (solo si el nuestro falta).** Si `config/chart-of-accounts.json` NO existe Y la exportación incluye un plan de cuentas (las exportaciones de QuickBooks Online y de Xero lo incluyen, un conjunto único de tuplas `{gl_code, gl_name, account_type}`), construir el plan de cuentas inicial a partir de la exportación. Normalizar:
   - Convertir cada `code` a texto.
   - Mapear el vocabulario de tipo de cuenta del origen a nuestro enum: `Bank / Accounts Receivable / Other Current Asset / Fixed Asset` → `asset`; `Accounts Payable / Credit Card / Other Current Liability / Long Term Liability` → `liability`; `Equity` → `equity`; `Income / Other Income` → `revenue`; `Cost of Goods Sold` → `cogs`; `Expense / Other Expense` → `expense`.
   - Asignar `statementSection` según las reglas de validación del Paso 5 de `build-my-chart-of-accounts`, por defecto las líneas de gasto operativo van a `operating-expenses.ga` y se marcan en el resumen para que las reclasifiques a `.rd` / `.sm`.
   - Escribir mediante el esquema y los validadores de `build-my-chart-of-accounts`. **No sobrescribir un plan de cuentas existente**, si ya existe, dejarlo en paz y reportar cualquier código nuevo de la exportación como candidato para una revisión posterior.

6. **Construir el balance de comprobación de apertura.** A partir de los saldos de CIERRE del período anterior (última fila por código de cuenta en la exportación del libro mayor, o la columna `Running Balance` al final del período en Xero):

   - Agrupar por `glCode`; tomar el saldo final.
   - Los saldos positivos para tipos `asset` + `expense` + `cogs` van a `debit`; los negativos a `credit`. Los positivos para tipos `liability` + `equity` + `revenue` van a `credit`; los negativos a `debit`.
   - Sumar débitos y créditos en todo el balance de comprobación. Si no cuadra con una diferencia de hasta 1 centavo, mostrar la diferencia y detenerse, sin ajustar a la fuerza.
   - Escribir `config/opening-trial-balance.json` de forma atómica como `[{glCode, debit, credit}]`.
   - Actualizar `config/context-ledger.json → universal.openingBalances` con `{asOf, source: "qbo-import" | "xero-import" | "prior-books", trialBalancePath: "config/opening-trial-balance.json", capturedAt}` (lectura-fusión-escritura).

7. **Inicializar categorizaciones anteriores.** A partir del historial de transacciones:

   - Canonizar cada `party` con las mismas reglas del Paso 4 de `process-my-statements` (quitar prefijos de ruido, números de referencia finales, sufijos de ciudad/estado; Title Case).
   - Agrupar transacciones por `canonical_party`. Para cada proveedor, contar ocurrencias por `glCode`.
   - Tomar el `glCode` mayoritario SOLO si representa el ≥ 80% de las transacciones del proveedor Y el proveedor tiene ≥ 3 transacciones. De lo contrario, omitir (los proveedores ambiguos contaminan la próxima ejecución, misma regla que el Paso 7 en `process-my-statements`).
   - Validar el `glCode` ganador contra el plan de cuentas. Descartar cualquiera que no resuelva.
   - Escribir `config/prior-categorizations.json` de forma atómica como `{canonical_party: gl_code}`. Si el archivo existe, lectura-fusión-escritura, preservar las entradas existentes a menos que la mayoría de la importación discrepe con una confianza ≥ 0.95, en cuyo caso registrar el conflicto y mantener la entrada existente (el agente ha estado aprendiendo de ejecuciones reales; la importación es histórica).

8. **Marcar el período como importado en `run-index.json`.** Leer el `run-index.json` existente (crear un arreglo vacío si no existe), anexar:

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

   Escribir de forma atómica (lectura-fusión-escritura, nunca sobrescribir).

9. **NO escribir transacciones detalladas.** Este skill no produce `runs/{period}/run.json`, el período importado no es una ejecución nuestra, es el libro mayor del sistema anterior. Si quieres un libro de trabajo revisado para el período importado, suelta los estados de cuenta en `statements/_inbox/` e invoca `process-my-statements`, que se beneficia de las categorizaciones anteriores ya inicializadas.

10. **NO anexar a `outputs.json`.** El plan de cuentas, el balance de comprobación de apertura y las categorizaciones anteriores son todo configuración. La fila de `run-index.json` es la única entrada de índice, ahí queda.

11. **Resumirte.** Conteos: transacciones analizadas, proveedores únicos canonizados, categorizaciones anteriores inicializadas (con el umbral de ≥ 80% / ≥ 3 transacciones explicado), filas del plan de cuentas adoptadas (u omitidas porque ya tenías uno), resultado del cuadre del balance de comprobación de apertura. Señalar los proveedores ambiguos que no alcanzaron el umbral, tú puedes promoverlos manualmente vía `categorize-my-transactions mode=rule-add`. Próximo paso: "procesa los estados de cuenta de este año y la categorización acertará en la mayoría de las filas gracias a la memoria anterior".

## Salidas

- `config/chart-of-accounts.json`, solo si no teníamos uno.
- `config/opening-trial-balance.json`, balance de comprobación de cierre del período anterior, ahora balance de comprobación de apertura de nuestros libros.
- `config/prior-categorizations.json`, memoria de proveedores inicializada (lectura-fusión-escritura).
- `config/context-ledger.json`, `universal.openingBalances` actualizado (lectura-fusión-escritura).
- `run-index.json`, una fila nueva con `status: "imported"` (lectura-fusión-escritura).

Sin entrada en `outputs.json`.

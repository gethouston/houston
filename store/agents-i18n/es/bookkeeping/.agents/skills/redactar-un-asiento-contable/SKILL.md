---
name: redactar-un-asiento-contable
title: "Redactar un asiento contable"
description: "Úsalo cuando digas 'registra el asiento del devengo' / 'redacta el asiento de depreciación del Q1' / 'contabiliza la amortización del prepago' / 'reconocimiento de ingresos de este período' / 'asiento de compensación en acciones' / 'reclasifica este gasto'. Redacto un asiento contable de partida doble balanceado que se ramifica según `type`: `accrual` | `prepaid` | `payroll` | `revrec` | `depreciation` | `stock-comp` | `adjustment` | `reclass`. Cada asiento se valida para que cuadre hasta el centavo, cada código de cuenta se valida contra `config/chart-of-accounts.json`, y el asiento se escribe con `status: \"draft\"`. El submodo `type=accrual mode=reversing` revierte automáticamente cada devengo activo marcado `reversing=true`. Solo borrador, nunca publico en QuickBooks Online ni en Xero."
version: 1
category: Contabilidad
featured: no
image: ledger
integrations: [quickbooks, xero, linear]
---


# Redactar un Asiento Contable

Un asiento contable balanceado a partir de una plantilla específica del tipo. Invariantes que se hacen cumplir en cada escritura: los débitos igualan a los créditos con una diferencia de hasta 1 centavo, cada `glCode` existe en el plan de cuentas bloqueado, `status: "draft"` (nunca `posted` sin confirmación explícita tuya), `reversing: true` requiere `reversesEntryId` más la convención de signo opuesta.

Solo borrador: escribo markdown más una fila de índice; tú o tu contador publican en QuickBooks Online / Xero.

## Cuándo usarlo

- "registra el asiento del devengo" / "redacta el asiento de depreciación del Q1" / "contabiliza la amortización del prepago".
- "asiento de reconocimiento de ingresos para marzo" / "asiento de compensación en acciones para el período".
- "reclasifica este $X de Administración General a I+D" / "registra este ajuste".
- "registra el asiento de nómina de Gusto / Rippling / Justworks", usa `type=payroll` con el resumen del período de pago.
- "publica los asientos de reversión de este período" / "redacta las reversiones de este período", usa `type=accrual mode=reversing` para revertir automáticamente cada devengo activo marcado `reversing=true`.
- Invocado por `run-monthly-close` para cada asiento contable estándar que venza en el ciclo de cierre.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr este skill verifico que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Proveedor de nómina** (Gusto, Rippling, Justworks, Deel, ADP), requerido para `type=payroll` si quieres que traiga el resumen del período de pago directamente. De lo contrario, pegas tú el resumen.
- **QuickBooks Online o Xero** (contabilidad), opcional, se usa para cruzar los códigos de cuenta en `type=adjustment` o `type=reclass`.
- **Linear**, opcional, solo se usa para consultar contexto de proyecto si quieres un memo respaldado en un ticket.

Si `type=payroll` y no existe conexión de nómina, me detengo y te pido conectar Gusto / Rippling / Justworks, o que pegues el resumen del período de pago.

## Información que necesito

Primero leo tu contexto de contabilidad. Por cada campo requerido que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > pegar) y espero.

- **Un plan de cuentas**, requerido. Por qué: cada línea del asiento contable tiene que referenciar un código de cuenta real. Si falta, pregunto: "¿Ya tenemos un plan de cuentas? Si no, redactemos uno primero."
- **El tipo de asiento y el período**, requerido. Por qué: me dice qué plantilla usar (devengo, prepago, nómina, reconocimiento de ingresos, depreciación, compensación en acciones, ajuste, reclasificación) y en qué mes cae. Si falta, pregunto: "¿Qué tipo de asiento estamos registrando, y para qué mes?"
- **Una lista de activos fijos, para `type=depreciation`**, requerido para ese tipo. Por qué: calculo la depreciación mensual a partir del costo, el valor de rescate y la vida útil de cada activo. Si falta, pregunto: "¿Tienes una lista de activos fijos capitalizados con costo, fecha de puesta en servicio y vida útil? Suelta la hoja de cálculo o pégala."
- **Una valuación 409A y un cronograma de vesting, para `type=stock-comp`**, requerido para ese tipo. Por qué: impulsa el gasto lineal ASC 718 después del cliff. Si falta, pregunto: "¿Tienes una valuación 409A vigente y el cronograma de vesting de las concesiones vigentes? Suéltalos o comparte lo que tengas."
- **Un resumen del período de pago, para `type=payroll`**, requerido para ese tipo. Por qué: divido los salarios entre I+D / Ventas y Marketing / Administración General a partir de esto. Si falta, pregunto: "¿Puedes conectar Gusto, Rippling o Justworks, o pegar el resumen del período de pago con bruto, impuestos, beneficios y pago neto por departamento?"

## Pasos

1. **Analizar las entradas.** Requerido: `type` (uno de `accrual` | `prepaid` | `payroll` | `revrec` | `depreciation` | `stock-comp` | `adjustment` | `reclass`) y `period` (`YYYY-MM`). Opcional: `mode` (solo tiene sentido cuando `type=accrual`, `reversing`), un `slug` corto para el nombre del archivo.

2. **Leer el contexto.** Cargar `context/bookkeeping-context.md` (detenerse si falta), `config/context-ledger.json`, `config/chart-of-accounts.json` (**bloqueado** para la ejecución, detenerse si no existe), `accruals.json` (arreglo vacío si no existe). Para nómina / depreciación / compensación en acciones, también leer la configuración específica del tipo (abajo).

3. **Ramificar según `type`.** Cada rama construye un arreglo `lines[]`; el Paso 4 valida antes de escribir.

   ### `accrual`
   Devengo de fin de período (ingresos no facturados, nómina devengada, interés devengado). Debitar la línea de gasto / ingreso, acreditar `Accrued Liabilities` (o debitar `Accrued Revenue` más acreditar ingreso). `reversing: true` por defecto. Anexar a `accruals.json`: `{id, type, active: true, reversing: true, period, amount, glCode, counterGlCode, memo, createdAt, updatedAt}`.

   **Submodo `mode=reversing`.** Leer `accruals.json`, encontrar cada entrada con `active=true AND reversing=true AND period < current`. Para cada una, producir un asiento de reversión con `reversesEntryId` apuntando al original y la convención de signo invertida. Marcar el original `active: false` y establecer `reversedOn`. Escribir cada reversión como un asiento contable separado.

   ### `prepaid`
   Amortizar prepagos (renta, SaaS, seguro). Debitar la cuenta de gasto, acreditar la cuenta de activo prepagado. `reversing: false`. Memo: `"Amortize {asset} - {period}"`.

   ### `payroll`
   Resumen del período de pago. Orden de origen: app conectada (`composio search payroll` → Gusto / Rippling / Justworks / Deel / ADP, esquema vía `--get-schema`) > resumen pegado `{gross, taxes, benefits, netPay, byDepartment: {rd, sm, ga}}`. Líneas: debitar `Wages - R&D / Sales & Marketing / General & Admin` según el plan de cuentas, debitar `Payroll Taxes`, debitar `Employee Benefits`; acreditar `Wages Payable` (o `Cash` si se pagó dentro del período, preguntar una vez), `Payroll Tax Liabilities`, `Benefits Payable`. Memo: `"Payroll - {period} - {provider}"`.

   ### `revrec`
   Leer cada `revrec/**/*.json`, elegir las filas con `period = current`. Debitar `Deferred Revenue`, acreditar cuenta de ingresos. Multi-moneda: consolidar en la moneda local (ya está en el cronograma). Memo: `"Revenue recognition - {period} - {N} contracts"`.

   ### `depreciation`
   Leer `config/fixed-assets.json` (forma: `[{id, description, class, cost, salvage, usefulLifeMonths, inServiceOn, method: "straight-line"}]`). Si no existe, pedir UNA vez el cronograma (archivo > pegar), NUNCA inventar. Calcular `(cost - salvage) / usefulLifeMonths` por activo, agrupar por clase. Debitar `Depreciation Expense - {class}`, acreditar `Accumulated Depreciation - {class}`. Memo: `"Depreciation - {period} - {N} assets"`.

   ### `stock-comp`
   Leer `config/stock-comp.json` (forma: `{valuation: {fmv, asOf}, grants: [{employeeId?, grantDate, shares, strike, vestingMonths, cliff}]}`). Si no existe, pedir UNA vez la 409A más el cronograma de vesting. Gasto lineal después del cliff según ASC 718. Debitar `Stock-Based Compensation Expense` (dividido por I+D / Ventas y Marketing / Administración General si el plan de cuentas lo permite), acreditar `Additional Paid-in Capital`. Memo: `"Stock-based compensation - {period} - {N} grants"`. Si `context/bookkeeping-context.md` marca la compensación en acciones como un no rotundo sin aprobación previa, detenerse y presentar el borrador para aprobación.

   ### `adjustment`
   Ajuste manual general. Tú dictas `{glCode, debit, credit, memo}` por línea (2 o más líneas). Fuentes comunes: comisiones no registradas de las conciliaciones, redondeo cambiario, correcciones de codificación previas.

   ### `reclass`
   Entradas `{fromGlCode, toGlCode, amount, memo}`. Debitar `toGlCode`, acreditar `fromGlCode`. Ambas deben ser líneas de gasto o activo; una sección cruzada (gasto → pasivo) requiere `type=adjustment` en su lugar.

4. **Validar antes de escribir.** Guardas estrictas, si fallan se detiene la escritura y se muestra el error:
   - `sum(debits) === sum(credits)` con una diferencia de hasta 1 centavo.
   - Cada `glCode` existe en `config/chart-of-accounts.json` (no solo el padre, el código exacto).
   - `lines[].length >= 2`.
   - `type = reversing` implica que `reversesEntryId` está definido Y el asiento contable referenciado tiene `reversing: true` Y la convención de signo está invertida.
   - Nada de `status: "posted"` (solo se permite `draft` desde este skill).

5. **Escribir el asiento contable en markdown** en `journal-entries/{YYYY-MM}/{type}-{slug}.md`. Estructura:
   - Encabezado: `id`, `type`, `period`, `date`, memo, status, reversing, reversesEntryId (si aplica).
   - **Líneas**, tabla en markdown `{glCode | glName | debit | credit | memo}`.
   - Fila de totales: total de débitos, total de créditos, diferencia (debería ser 0).
   - Documentos de soporte: rutas referenciadas (resumen del período de pago, cronograma de reconocimiento de ingresos, archivo de activos fijos, recibos).
   - Notas: preguntas abiertas presentadas en línea.

6. **Anexar a `journal-entries.json`** en la raíz del agente. Lectura-fusión-escritura atómica. Esquema completo desde `data-schema.md`: `{id, createdAt, updatedAt, date, type, memo, reversing, reversesEntryId?, period, lines[], status: "draft", supportingDocs?}`.

7. **Efectos secundarios específicos del tipo.**
   - `accrual` (no en submodo de reversión) → anexar a `accruals.json` con `active: true`.
   - `accrual mode=reversing` → actualizar la fila del devengo original a `active: false, reversedOn, reversedByEntryId`.
   - `revrec` → marcar las filas correspondientes en `revrec/{customer-slug}/{contract-slug}.json` como `recognized: true, recognizedBy: {id}` para ese período.
   - `depreciation` → marcar las filas correspondientes en `config/fixed-assets.json` con `lastDepreciatedPeriod: "{period}", accumulated += monthly`.

8. **Anexar una fila a `outputs.json`**: `{type: "journal-entry", title: "{type} journal entry - {period} - {slug}", summary, path, status: "draft", domain: "close"}`. Lectura-fusión-escritura; nunca sobrescribir.

9. **Resumirte.** Un bloque compacto: id del asiento, monto total, tipo, ruta, recordatorio de que sigue en `draft` hasta que tú lo publiques en QuickBooks Online / Xero y lo confirmes. Ofrecer cambiar `status` a `"posted"` solo con confirmación explícita.

## Salidas

- `journal-entries/{YYYY-MM}/{type}-{slug}.md`, asiento contable legible con la tabla de líneas balanceada.
- `journal-entries.json`, lectura-fusión-escritura, asiento contable anexado con `status: "draft"`.
- `accruals.json`, solo en `type=accrual` (anexar) o `type=accrual mode=reversing` (actualizar la fila original).
- `revrec/{customer-slug}/{contract-slug}.json`, solo en `type=revrec` (marcar el período reconocido).
- `config/fixed-assets.json`, solo en `type=depreciation` (marcar el último período depreciado más el acumulado).
- `outputs.json`, una fila anexada, `type: "journal-entry"`.

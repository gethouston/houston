---
name: conciliar-mis-cuentas
title: "Conciliar mis cuentas"
description: "Concilio una sola cuenta (banco, tarjeta de crédito, procesador de pagos, o subcuenta auxiliar) para el período que elijas. Cuadro el libro mayor por un lado, el estado de cuenta externo por el otro, muestro las partidas no conciliadas agrupadas en rangos de 0 a 30 / 31 a 60 / 61 a 90 / más de 90 días, y genero una prueba de tres vías con los números reales. El submodo `mode=transfer-detect` encuentra pares de débito/crédito entre todas tus cuentas dentro de un rango de ±2 días y los etiqueta como Transferencias Internas para que queden fuera del estado de resultados. Nunca inserto una diferencia en silencio y nunca fuerzo una coincidencia en QuickBooks Online ni en Xero."
version: 1
category: Contabilidad
featured: no
image: ledger
integrations: [stripe, quickbooks, xero]
---


# Conciliar mis cuentas

Una conciliación de tres vías sobre una sola cuenta para un solo período. El saldo del libro mayor por un lado, el estado de cuenta o feed externo por el otro, las partidas no conciliadas en el medio con su antigüedad. Cada diferencia queda o explicada por una partida de tiempo, o mostrada como una partida no conciliada, o escalada como una brecha nombrada. Nunca cuadro un número en silencio.

Solo borradores: nunca ajusto tu libro mayor, nunca fuerzo una coincidencia en QuickBooks Online ni en Xero. Escribo el documento de conciliación y muestro las brechas.

## Cuándo usarlo

- "concilia la cuenta corriente de Chase de enero" / "concilia el Amex 9041 de marzo" / "concilia Stripe del trimestre 1".
- "¿por qué el libro mayor está desfasado del banco por $X?" / "¿qué hay en la lista de cheques pendientes de cobro?".
- Llamado por `close-my-month` para cada cuenta en `context-ledger.domains.banks.accounts[]` del período de cierre.
- `mode=transfer-detect` - "encuentra las transferencias entre cuentas de marzo" / "etiqueta los pares de transferencia interna para que queden fuera del estado de resultados". Corre sobre todas las cuentas a la vez, no una sola cuenta.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta skill, reviso que las categorías de abajo estén vinculadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **QuickBooks Online o Xero** (contabilidad) - fuente preferida para el registro del libro mayor de esta cuenta. Obligatorio si quieres que extraiga la actividad del libro mayor directamente.
- **Feed bancario** (banca respaldada por Plaid) - fuente preferida para la actividad del lado del banco con la que comparar. Opcional, también puedes soltar el PDF del estado de cuenta.
- **Stripe** (facturación) - obligatorio solo si estás conciliando Stripe; extrae las transacciones de saldo del período.

Si no hay ni contabilidad ni banca conectadas, recurro a un CSV / PDF que sueltes. Si no tienes nada para compartir, me detengo y te pido que conectes uno o sueltes el estado de cuenta del período.

## Información que necesito

Primero leo tu contexto contable. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **La cuenta a conciliar y el período** - Obligatorio. Por qué: me indica qué últimos 4 dígitos buscar y qué rango de fechas extraer. Si falta, pregunto: "¿Qué cuenta quieres que concilie, y para qué mes o trimestre?"
- **Una lista registrada de cuentas bancarias y tarjetas de crédito** - Obligatorio. Por qué: busco banco, tipo, y código de cuenta por los últimos 4 dígitos. Si falta, pregunto: "¿Qué cuentas bancarias y tarjetas de crédito usa el negocio? Conectar tu feed bancario es lo más fácil."
- **Un plan de cuentas** - Obligatorio. Por qué: mapeo el código de cuenta hacia la línea correcta de efectivo o pasivo. Si falta, pregunto: "¿Ya tenemos un plan de cuentas? Si no, redactemos uno primero."
- **El lado del banco o procesador para el período** - Obligatorio. Por qué: necesito ambos lados para la prueba de tres vías. Si falta, pregunto: "¿Puedes conectar el feed bancario o QuickBooks, o soltar el PDF o CSV del estado de cuenta de este período?"

## Pasos

1. **Interpreto los argumentos.** Obligatorio: `account_last4` (o `all` para `mode=transfer-detect`) y `period` (`YYYY-MM` o `YYYY-QN`). Resuelvo `{periodStart, periodEnd}` a partir del slug del período.

2. **Leo el contexto.** Cargo `context/bookkeeping-context.md` (me detengo si falta, pido que corras `set-up-my-books` primero), `config/context-ledger.json`, y `config/chart-of-accounts.json`.

3. **Identifico la cuenta.** Busco `account_last4` en `context-ledger.domains.banks.accounts[]`. Capturo `{bank, type, glCode, glName}` (código de cuenta y nombre de cuenta). Si la cuenta no está registrada, hago UNA pregunta puntual para registrarla, nunca adivino.

4. **Rama `mode=transfer-detect`.** Si se activa:
   - Extraigo todas las transacciones de todas las cuentas registradas para el período. Orden de fuente: app conectada (QuickBooks Online / Xero / feed bancario vía Composio, descubro el slug con `composio search accounting` / `composio search banking`) > `runs/{period}/run.json` si existe > CSV soltado.
   - Detección de pares: por cada débito en la cuenta A en la fecha D, busco en todas las demás cuentas un crédito con el mismo monto absoluto en la fecha `D ± 2 días`. Tolerancia de monto: 1 centavo.
   - Etiqueto ambas partes con `glCode = "9000"`, `glName = "Internal Transfer"`, `source = "transfer"`. Excluidas de las fórmulas SUMIFS del estado de resultados más adelante.
   - Escribo la lista de pares en `reconciliations/_transfers/{period}.md` con cada par `{date_a, account_a, date_b, account_b, amount, confidence}`.
   - Agrego una nota de una línea al documento de conciliación de cada cuenta afectada, si ya existe.
   - Salto al Paso 10.

5. **Extraigo los dos lados.**
   - **Lado del libro mayor** - preferido vía app conectada: `composio search accounting`, elijo el slug de QuickBooks Online / Xero, extraigo el registro del libro mayor para `{glCode, periodStart, periodEnd}`. Descubro el esquema con `--get-schema`; nunca lo fijo de antemano. Recurro a CSV / texto pegado si no hay conexión.
   - **Lado externo** - banco / tarjeta de crédito / Stripe:
     - Banco / tarjeta de crédito: `composio search banking` (respaldado por Plaid) o `statements/{account_last4}/{YYYY-MM}.pdf` si ya se soltó durante una ejecución de `process-my-statements`.
     - Stripe: `composio search billing`, extraigo las transacciones de saldo del período.
     - Subcuenta auxiliar: acepto un CSV con `{date, description, amount}` más saldos de apertura y cierre.

6. **Emparejo las partidas.** Coincidencia exacta en `(date, amount)` primero; después `(amount, date ± 2 días)` con tolerancia. La similitud de descripción (proporción token-set ≥ 0.75) rompe empates cuando varios candidatos coinciden en monto. Umbrales de confianza:
   - `≥ 0.95` - coincidencia automática (exacta).
   - `0.80–0.94` - coincidencia tentativa, la muestro en el bucket de revisión.
   - `< 0.80` - no conciliada.

7. **Clasifico las partidas no conciliadas.**
   - **En el libro mayor, no en el estado de cuenta** - candidatas a cheques pendientes de cobro (si la cuenta es corriente y el monto es negativo), depósitos en tránsito (positivo), o un asiento contable erróneo. Calculo la antigüedad de cada una: `daysOld = runDate - transactionDate`.
   - **En el estado de cuenta, no en el libro mayor** - candidatas a comisiones / intereses / cargos de suscripción no registrados. Normalmente se convierten en una sugerencia de asiento contable para `draft-a-journal-entry type=adjustment`.
   - **Diferencias de monto** - misma contraparte + misma fecha, monto diferente. Marco cada una con el delta.

8. **Calculo la prueba de tres vías.**
   ```
   gl_ending_balance
     + (en el estado de cuenta, no en el libro mayor)
     - (en el libro mayor, no en el estado de cuenta)
     ± diferencias_de_monto
     = statement_ending_balance    (dentro de 1 centavo)
   ```
   Si la prueba no cuadra dentro de 1 centavo, **NO la cuadro en silencio**. Marco una brecha nombrada en el reporte y hago upsert en `recon-breaks.json` con `status: "unresolved"`.

9. **Calculo la antigüedad de las partidas no conciliadas.** Agrupo cada una en `0-30d`, `31-60d`, `61-90d`, `>90d`. Las partidas de más de 90 días escalan, las marco en el encabezado del reporte.

10. **Escribo el documento de conciliación** en `reconciliations/{account_last4}/{YYYY-MM}.md`. Estructura:
    - Encabezado: cuenta (banco / tipo / últimos 4 dígitos), período, saldo del libro mayor, saldo del estado de cuenta, diferencia calculada, estado (`clean` / `has-items` / `unresolved-break`).
    - **Prueba de tres vías** - la ecuación de arriba con los números reales.
    - **Partidas pendientes** - tabla agrupada por dirección (lado del libro mayor vs. lado del estado de cuenta), con `{date, description, amount, daysOld, ageBucket}`.
    - **Diferencias de monto** - tabla con `{date, party, glAmount, statementAmount, delta}`.
    - **Coincidencias tentativas** - tabla para revisión humana (confianza 0.80–0.94).
    - **Ajustes sugeridos** - lista de asientos contables candidatos para `draft-a-journal-entry type=adjustment` (comisiones no registradas, intereses, redondeo de tipo de cambio).
    - **Brechas nombradas** - solo si la prueba de tres vías falló. Una línea por brecha con el monto en dólares y la mejor hipótesis de causa.

11. **Actualizo los índices.**
    - `recon-breaks.json` (plano en la raíz del agente) - leo, combino, y escribo. Por cada partida sin resolver, hago upsert de `{id, accountLast4, period, date, description, amount, direction, daysOld, status, addedAt, updatedAt}`. Actualizo la antigüedad de las entradas existentes en lugar de duplicarlas.
    - `outputs.json` - agrego `{type: "reconciliation", title: "Recon {bank} {last4} {YYYY-MM}", summary, path, status: "draft", domain: "close"}`.

12. **Te resumo.** Un recap de dos líneas: el resultado de la prueba de tres vías, y el conteo + monto total en dólares de partidas no conciliadas por rango de antigüedad. Incluyo la ruta al documento completo.

## Resultados

- `reconciliations/{account_last4}/{YYYY-MM}.md` - conciliación completa.
- `reconciliations/_transfers/{period}.md` - solo en `mode=transfer-detect`.
- `recon-breaks.json` - leído, combinado y escrito, partidas sin resolver con su antigüedad.
- `outputs.json` - una fila agregada, `type: "reconciliation"`.

---
name: revisar-mis-devengos
title: "Revisar mis devengos"
description: "Úsalo cuando digas 'lista nuestros devengos activos' / 'actualiza el registro de devengos' / '¿hay devengos vencidos?' / '¿qué asientos de reversión están pendientes?'. Recalculo los saldos actuales de cada devengo activo (renta prepagada, SaaS prepagado, ingresos diferidos, PTO, nómina devengada, intereses devengados), marco las partidas vencidas, y muestro los candidatos a asientos de reversión. Leo `accruals.json` + `journal-entries.json` + el plan de cuentas; reescribo `accruals/register.md` y actualizo o creo `accruals.json`."
version: 1
category: Contabilidad
featured: no
image: ledger
---


# Revisar mis devengos

Un registro vivo de cada devengo que llevan los libros. Cada ejecución recalcula los saldos a partir de los asientos contables subyacentes, clasifica cada fila (`active` / `reversed` / `stale` / `written-off`), y muestra los candidatos a asientos de reversión del período actual. El registro es un documento vivo, se reescribe en el mismo lugar, NO se indexa en `outputs.json`.

## Cuándo usarlo

- "lista nuestros devengos activos" / "actualiza el registro de devengos".
- "¿hay devengos vencidos?" / "¿algo que deba reversar?".
- "¿qué asientos contables de reversión están pendientes este mes?".
- Llamado por `run-monthly-close` después de las conciliaciones, antes de que `prep-journal-entry` despache el lote de reversión.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta skill, reviso que las categorías de abajo estén vinculadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **No se requieren conexiones externas.** Trabajo por completo a partir de tus asientos contables existentes, tu registro de devengos, y tu plan de cuentas.

Esta skill nunca se bloquea por una conexión faltante.

## Información que necesito

Primero leo tu contexto contable. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Un plan de cuentas con secciones de prepagos, diferidos, devengos, y PTO** - Obligatorio. Por qué: descubro automáticamente los devengos nuevos escaneando estas secciones en el plan de cuentas. Si falta, pregunto: "¿Ya tenemos un plan de cuentas? Si no, redactemos uno primero para que las líneas de devengo tengan un lugar."
- **Un contexto contable terminado** - Obligatorio. Por qué: necesito tu método contable y el período actual para calcular saldos y reversiones. Si falta, pregunto: "¿Ya configuramos los libros? Si no, corre la configuración primero."
- **Un historial de asientos contables actualizado** - Obligatorio. Por qué: recalculo el saldo de cada devengo a partir de los asientos contables que afectan su código de cuenta. Si falta, pregunto: "¿Ya procesamos algún período? Si no, hagamos primero un cierre para que existan asientos contables sobre los cuales calcular."

## Pasos

1. **Leo el contexto.** Cargo `context/bookkeeping-context.md`, `config/context-ledger.json`, `config/chart-of-accounts.json`. Si falta el plan de cuentas, me detengo y pido que corras `build-chart-of-accounts` primero. Anoto la fecha de hoy + el período contable actual (`YYYY-MM`).

2. **Leo el índice actual de devengos.** Cargo `accruals.json` en la raíz del agente (arreglo vacío si no existe). Esquema de fila: `{id, accrualName, glCode, currentBalance, reversing, lastActivity, status: "active" | "reversed" | "stale" | "written-off", notes, createdAt, updatedAt}`. Lo mantengo en memoria como lista indexada por `id`.

3. **Leo los asientos contables de soporte.** Cargo `journal-entries.json`, filtro por las entradas cuyas `lines[].glCode` coincidan con el `glCode` de algún devengo, ordenadas por `date` ascendente. Uso este historial de actividad para recalcular los saldos.

4. **Recalculo los saldos actuales.** Por cada devengo activo:
   - Sumo todos los débitos y créditos de líneas de asientos contables contra su `glCode` desde la `createdAt` de la fila.
   - Aplico la convención de signo según el saldo natural del tipo de cuenta (activo: positivo en débito; pasivo/ingresos diferidos: positivo en crédito).
   - Actualizo `currentBalance`. Actualizo `lastActivity` a la fecha máxima de asiento contable que afecte este código de cuenta. Si no hay asientos contables, dejo `lastActivity` sin cambios.

5. **Descubro devengos nuevos.** Cualquier `glCode` que aparezca en `chart-of-accounts.json` bajo un `statementSection` que contenga `"prepaid"`, `"deferred"`, `"accrued"`, o `"pto"` pero sin fila en `accruals.json`, creo una fila nueva. Infiero el `accrualName` a partir del nombre de la cuenta + el memo del primer asiento contable. `status: "active"`. Por defecto `reversing: false` salvo que el asiento contable de origen tuviera `reversing: true`.

6. **Clasifico el estado.**
   - `active` - `abs(currentBalance) > 0.00` Y `lastActivity` dentro de los últimos 90 días.
   - `stale` - `abs(currentBalance) > 0.00` Y `lastActivity` con más de 90 días. Lo marco como candidato a baja o reclasificación. Anoto la acción recomendada en `notes` ("consider reclass to {X}" o "candidate for write-off journal entry").
   - `reversed` - `abs(currentBalance) <= 0.01` Y existe un asiento contable de reversión que referencia el devengo original.
   - `written-off` - solo tú puedes fijar este estado. Nunca lo cambio de forma automática.

7. **Identifico los candidatos a asiento de reversión del período actual.** Una fila es candidata a reversión si:
   - `reversing: true` (el devengo original se registró como reversible), Y
   - su estado es `active`, Y
   - el período actual es estrictamente posterior al período de origen del devengo, Y
   - todavía no existe un asiento contable de reversión para este `id`.

   Los recolecto en la lista `reversing_candidates` con el monto de reversión sugerido (el negativo de `currentBalance`) + el id del asiento contable de origen.

8. **Reescribo `accruals/register.md`.** Documento vivo, lo sobrescribo en el mismo lugar. Estructura:
   - **Resumen** - conteos por estado, saldo total de prepagos, saldo total de ingresos diferidos, saldo total de pasivos devengados.
   - **Devengos activos** - una fila por devengo activo con `accrualName`, `glCode`, `currentBalance`, `lastActivity`, y el indicador `reversing`.
   - **Candidatos a asiento de reversión de este período** - lista numerada con el memo de asiento contable sugerido + monto; tú corres `prep-journal-entry type=accrual` para redactar cada uno.
   - **Devengos vencidos (más de 90 días sin actividad)** - tabla con la acción recomendada por fila.
   - **Reversados recientemente** - las reversiones del período anterior, para trazabilidad.
   - **Dados de baja** - cola histórica; mantengo los últimos 6 meses.

   Escritura atómica: `accruals/register.md.tmp` → renombrar.

9. **Actualizo `accruals.json`.** Leo, combino y escribo:
   - Leo el archivo actual.
   - Cada fila de la lista recalculada: si el `id` coincide, actualizo los campos mutables (`currentBalance`, `lastActivity`, `status`, `notes`, `updatedAt`). Un `id` nuevo, lo agrego.
   - Preservo `createdAt`, nunca lo toco.
   - Nunca elimino filas que ya no aparecen en el recálculo; solo marco `written-off` si tú lo confirmas explícitamente.
   - Escritura atómica: `accruals.json.tmp` → renombrar.

10. **NO agrego a `outputs.json`.** El registro es un documento vivo. `accruals.json` es un índice plano en la raíz, no una entrega.

11. **Te resumo.** Un párrafo: cuántos activos / vencidos / candidatos a reversión hay este período, el saldo total en libros, y el siguiente paso exacto (ej., "hay 2 asientos contables de reversión pendientes, corre `prep-journal-entry type=accrual` en cada uno"). Nunca propongo publicar, solo borradores.

## Resultados

- `accruals/register.md` (documento vivo, NO indexado en outputs.json)
- `accruals.json` (índice plano en la raíz, actualizado, nunca sobrescrito por completo)

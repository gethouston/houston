---
name: preparar-mis-estados-financieros
title: "Preparar mis estados financieros"
description: "Redacto un estado financiero para el período que elijas, un estado por llamada: `statement=pnl | balance-sheet | cash-flow | trial-balance`. Produzco el estado a partir de tus asientos contables, saldos de apertura, y plan de cuentas, con comparaciones del período y año anteriores, y de 3 a 5 notas generadas automáticamente que citan asientos contables específicos, sin factores inventados. Las vistas de efectivo y devengado se calculan ambas sobre libros de base devengado; las alertas de descuadre y saldos inusuales se muestran en la parte superior. Solo borradores, tú firmas, tú presentas."
version: 1
category: Contabilidad
featured: yes
image: ledger
---


# Preparar mis estados financieros

Cuatro estados, una sola skill, un solo argumento. Cada rama respalda los números en tus asientos contables, el balance de comprobación de apertura y el plan de cuentas. Las vistas de efectivo y devengado corren ambas sobre libros de base devengado; los libros solo de efectivo obtienen una sola vista. Cada comparación cita una fuente, nunca invento un factor solo para que la página se vea prolija.

## Cuándo usarlo

- `pnl` - "dame el estado de resultados" / "estado de resultados para {period}".
- `balance-sheet` - "redacta el balance general al {date}".
- `cash-flow` - "estado de flujo de efectivo para {period}".
- `trial-balance` - "trae el balance de comprobación" / "balance de comprobación al {date}".
- Lo llama `close-my-month` una vez por estado, después de que se registran los devengos y el reconocimiento de ingresos.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta skill, reviso que las categorías de abajo estén vinculadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **No se requieren conexiones externas.** Genero los estados únicamente a partir de los asientos contables, los saldos de apertura y el plan de cuentas que ya tienes registrados.

Esta skill nunca se bloquea por una conexión faltante.

## Información que necesito

Primero leo tu contexto contable. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Contabilidad de caja vs. devengado** - Obligatorio. Por qué: el método devengado obtiene vistas de estado de resultados de caja y devengado; el de caja obtiene solo una. Si falta, pregunto: "¿Llevamos los libros en base de caja o en base devengado?"
- **Un plan de cuentas** - Obligatorio. Por qué: cada estado se organiza según las secciones definidas en el plan de cuentas. Si falta, pregunto: "¿Ya tenemos un plan de cuentas? Si no, redactemos uno primero."
- **Un balance de comprobación de apertura** - Obligatorio para el balance general, el flujo de efectivo y el balance de comprobación. Por qué: cada saldo de cuenta parte de este punto de referencia. Si falta, pregunto: "¿Tienes un balance de comprobación de cierre de tus libros anteriores? Compártelo como hoja de cálculo o CSV."
- **Un historial de asientos contables actualizado** - Obligatorio. Por qué: cada línea de cada estado se remonta a un asiento contable registrado. Si falta, pregunto: "¿Ya procesamos y cerramos el período? Si no, hagamos primero el cierre para que los asientos contables queden listos."
- **El período o la fecha de corte** - Obligatorio. Por qué: me indica qué asientos contables incluir. Si falta, pregunto: "¿Qué período quieres, por ejemplo marzo de 2025 para un estado de resultados, o al 31 de marzo de 2025 para un balance general?"

## Pasos

1. **Leo el contexto.** Cargo `context/bookkeeping-context.md`, `config/context-ledger.json` (para `universal.accountingMethod` + `universal.openingBalances`), `config/chart-of-accounts.json` (BLOQUEADO, los estados se organizan según `statementSection`), y `config/opening-trial-balance.json`. Interpreto los argumentos: `statement` (uno de los cuatro) + `period` (`YYYY-MM` para estado de resultados / flujo de efectivo / variación; fecha de corte para balance general / balance de comprobación).

2. **Cargo el libro mayor fuente.** Leo `journal-entries.json` en la raíz del agente. Filtro por `status in {"ready","posted"}` (excluyo `"draft"` salvo que pidas un estado en borrador). Para el período solicitado, divido:
   - Asientos contables del período (`date` dentro del período), que alimentan el estado de resultados y el flujo de efectivo.
   - Asientos contables acumulados hasta el fin del período, que alimentan el balance general y el balance de comprobación.

3. **Me ramifico según `statement`.**

   ### `statement=pnl`
   - Agrupo las líneas de los asientos contables por `statementSection` del plan de cuentas, bajo ingresos / costo de ventas / gasto. Sumo `credit - debit` para ingresos/costo de ventas/gasto (los ingresos suman en crédito; el costo de ventas/gasto suma en débito).
   - Subtotales: Ingresos → Utilidad Bruta → Utilidad Operativa → Otros Ingresos/Gastos → Utilidad Neta.
   - **Ambas vistas, de efectivo y devengado**, si `accountingMethod == "accrual"` (la vista de efectivo excluye los asientos contables de devengo/prepago/reconocimiento de ingresos/ingresos diferidos según su `type`). Solo vista de efectivo si `accountingMethod == "cash"`.
   - **Comparación período contra período**: mes contra mes (vs. el estado de resultados finalizado del mes anterior en `financials/{prior-YYYY-MM}/pnl.md` si existe, si no lo recalculo al vuelo) y vs. el mismo período del año anterior.
   - **Notas (de 3 a 5)**, generadas automáticamente sobre los mayores factores de variación. Cada nota DEBE citar ids de asientos contables o el conjunto de transacciones del artefacto de la corrida. Sin causas inventadas.

   ### `statement=balance-sheet`
   - Clasificado: activos corrientes, activos no corrientes, pasivos corrientes, pasivos no corrientes, patrimonio. El agrupamiento se guía por el `statementSection` del plan de cuentas.
   - El saldo a la fecha de corte por cuenta = saldo de apertura (de `config/opening-trial-balance.json`) + la suma de todas las líneas de asientos contables que afectan esa cuenta hasta la fecha de corte.
   - **Cuadre de patrimonio**: el patrimonio de apertura + la utilidad neta acumulada del año (del estado de resultados corriente) + los movimientos de capital pagado + las concesiones de capital deben igualar la sección de patrimonio calculada. Una brecha mayor a $0.01 se marca como alerta.
   - **Comparación período contra período**: vs. el cierre del mes anterior y vs. el cierre del año anterior.
   - **Marco saldos inusuales**: cuentas por cobrar en crédito, cuentas por pagar en débito, efectivo negativo, inventario negativo, ingresos diferidos negativos. Cada alerta nombra la cuenta, el saldo y la acción recomendada.

   ### `statement=cash-flow`
   - **Método indirecto.** Parto de la Utilidad Neta (estado de resultados del período).
   - Sumo de vuelta las partidas sin efecto en efectivo: depreciación, amortización, compensación basada en acciones (asientos contables con `type: "depreciation"` o `type: "stock-comp"`).
   - Movimiento de capital de trabajo + ingresos diferidos: `delta(accounts receivable)`, `delta(accounts payable)`, `delta(prepaid)`, `delta(deferred-revenue)`, `delta(accrued-liabilities)` entre el fin del período anterior y el fin de este período.
   - Divido en: operación / inversión / financiamiento. Inversión = compras de activos fijos + bajas. Financiamiento = levantamientos de capital + deuda + distribuciones.
   - **Conciliación del efectivo final**: el efectivo final según el flujo de efectivo debe igualar la suma de las cuentas de efectivo del balance general dentro de $0.01. Si hay brecha, la marco arriba; NUNCA la cuadro en silencio.

   ### `statement=trial-balance`
   - Cada cuenta con saldo deudor o acreedor final a la fecha solicitada. Agrupado por `statementSection`.
   - **Los débitos deben igualar a los créditos dentro de $0.01**, si está descuadrado, lo marco de forma destacada arriba con el delta y una lista breve de los asientos contables más recientes que podrían estar descuadrados.
   - **Cuadre cruzado**: la utilidad neta implícita en el balance de comprobación debe igualar la utilidad neta del estado de resultados de la rama `pnl`. La sección de patrimonio debe cuadrar con el patrimonio del balance general. Si no cuadra, lo marco.

4. **Escribo el estado.** Ruta: `financials/{YYYY-MM}/{statement}.md` (uso el `YYYY-MM` de fin de período también para `balance-sheet` / `trial-balance`). Escritura atómica: `.tmp` → renombrar. Estructura:
   - Encabezado: nombre del estado, entidad, período / fecha de corte, método contable.
   - Tabla(s) de números.
   - Bloque de comparación período contra período (cuando aplique).
   - Bloque de alertas (saldos inusuales, descuadres, brechas de conciliación).
   - Bloque de notas (de 3 a 5 para estado de resultados y flujo de efectivo, cada una citando ids de asientos contables o conjuntos de transacciones).
   - Pie de página: fuentes (hash de journal-entries.json, fecha del balance de comprobación de apertura, versión del plan de cuentas).

5. **Agrego a `outputs.json`.** Leo, combino y escribo. Fila: `{id, type: "financial-statement", title: "{Statement} - {period}", summary: "<2-3 oraciones con el número principal + el mayor factor>", path: "financials/{YYYY-MM}/{statement}.md", status: "draft", domain: "reporting"}`.

6. **Nunca invento.** Cada número se remonta a un id de asiento contable o a un saldo de apertura de cuenta. Cada nota cita evidencia. Los códigos de cuenta se mantienen como texto. Si me piden un período anterior a la fecha del saldo de apertura, me niego y lo explico.

7. **Te resumo.** Un párrafo corto:
   - `pnl`: ingresos, margen bruto, utilidad neta, mayor movimiento mes contra mes.
   - `balance-sheet`: activos totales, efectivo, alertas inusuales.
   - `cash-flow`: flujo de efectivo operativo, de inversión, de financiamiento, efectivo final (con estado de la conciliación).
   - `trial-balance`: si cuadra o no, total de débitos = total de créditos, delta de descuadre si lo hay.
   Te señalo el archivo escrito. Te aviso de cualquier alerta.

## Resultados

- `financials/{YYYY-MM}/pnl.md`
- `financials/{YYYY-MM}/balance-sheet.md`
- `financials/{YYYY-MM}/cash-flow.md`
- `financials/{YYYY-MM}/trial-balance.md`
- Fila en `outputs.json`: `type: "financial-statement"`, `domain: "reporting"`, `status: "draft"` hasta que tú lo cambies a `ready`.

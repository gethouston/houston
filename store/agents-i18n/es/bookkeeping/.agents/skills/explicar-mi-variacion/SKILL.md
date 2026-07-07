---
name: explicar-mi-variacion
title: "Explicar mi variación"
description: "Dime por qué se movió una línea del estado de resultados. Comparo los reales contra el presupuesto (si tienes uno), el período anterior, y el mismo período del año anterior, descompongo cada variación material en factores de precio / volumen / mezcla / eventos únicos vinculados a asientos contables y proveedores específicos, y escribo una narrativa de 3 a 5 párrafos sobre los movimientos más grandes. El umbral de materialidad es de 5% y $1,000 por defecto, y se puede configurar en cada ejecución. Los residuos sin explicar se muestran, nunca se absorben en silencio. Solo borradores, nunca reclasifico ni publico nada para 'limpiar' una variación."
version: 1
category: Contabilidad
featured: no
image: ledger
---


# Explicar Mi Variación

Reales vs. presupuesto vs. período anterior vs. mismo período del año anterior. Descompongo cada línea material en factores de precio / volumen / mezcla / eventos únicos, cada uno vinculado a ids de asientos contables o conjuntos de transacciones específicos. La narrativa se enfoca en los 3 a 5 movimientos más grandes para que leas una historia, no una hoja de cálculo. Todo lo que no puedo explicar lo etiqueto como residuo en lugar de inventar una causa.

## Cuándo usarlo

- "por qué subieron los gastos operativos en marzo" / "qué causó que no llegáramos a la meta de ingresos".
- "compara los reales contra el presupuesto para {period}".
- "corre el análisis de variación para {period}".
- Invocado por `close-my-month` después de que `prepare-my-financials statement=pnl` escribió el estado de resultados del período actual.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr este skill verifico que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **No se requieren conexiones externas.** Trabajo completamente a partir de tus asientos contables existentes, tus estados de resultados y tu archivo de presupuesto.

Este skill nunca se bloquea por una conexión faltante.

## Información que necesito

Primero leo tu contexto de contabilidad. Por cada campo requerido que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > pegar) y espero.

- **El período a analizar**, requerido. Por qué: define la ventana de los reales y contra qué períodos anteriores comparar. Si falta, pregunto: "¿Qué período estamos analizando, por ejemplo marzo de 2025 o Q1 2025?"
- **Un estado de resultados terminado para el período**, requerido. Por qué: la variación compara las líneas del estado de resultados de este período contra las líneas base. Si falta, pregunto: "¿Ya cerramos y generamos el estado de resultados de ese período? Si no, corramos eso primero."
- **Un plan de cuentas**, requerido. Por qué: agrupo las variaciones por línea de código de cuenta y sección del estado según tu plan de cuentas. Si falta, pregunto: "¿Ya tenemos un plan de cuentas? Si no, redactemos uno primero."
- **Un presupuesto vigente**, opcional. Por qué: me permite correr reales contra presupuesto junto con reales contra período anterior. Si no tienes uno, sigo adelante y anoto "sin presupuesto registrado" en el informe.
- **Al menos un estado de resultados anterior (el mes pasado o el mismo mes del año pasado)**, opcional pero muy recomendable. Por qué: me da una línea base contra la cual comparar. Si no tienes uno, reporto solo los reales y señalo que todavía no hay nada contra qué comparar.

## Pasos

1. **Leer el contexto.** Cargar `context/bookkeeping-context.md`, `config/context-ledger.json` (para `domains.budget`, cadencia más ruta), `config/chart-of-accounts.json`. Leer `config/budget.json` si existe (`[{period, glCode, amount, note?}]`).

2. **Elegir las líneas base de comparación.** Para el `period` solicitado (`YYYY-MM` o `YYYY-QN`), reunir hasta tres líneas base:
   - **Presupuesto**, filas de `config/budget.json` para el período. Si no existe, se omite y se anota "sin presupuesto registrado".
   - **Período anterior**, `financials/{prior-YYYY-MM}/pnl.md` si existe; de lo contrario recalcular sobre la marcha desde `journal-entries.json`.
   - **Mismo período del año anterior**, `financials/{prior-YYYY-MM-12}/pnl.md` si existe; de lo contrario recalcular.

3. **Cargar los reales del período.** Leer el estado de resultados del período desde `financials/{YYYY-MM}/pnl.md` (generado por `prepare-my-financials`). Si falta, recalcular desde `journal-entries.json` sobre la marcha y anotar que el estado de resultados oficial aún no se ha escrito.

4. **Calcular las variaciones por línea de código de cuenta.** Para cada línea de código de cuenta en cualquiera de: reales, presupuesto, período anterior, año anterior, calcular:
   - `actual_minus_budget`, `pct_vs_budget`
   - `actual_minus_prior_period`, `pct_vs_prior_period`
   - `actual_minus_prior_year`, `pct_vs_prior_year`

5. **Aplicar el umbral de materialidad.** Por defecto: `abs(variance) > 5% AND abs(variance) > $1000`. Configurable por ejecución mediante argumento. Solo las variaciones materiales reciben descomposición de factores. Las no materiales se resumen en una sola tabla al final.

6. **Descomponer cada variación material en factores.** Fundamentar cada factor en asientos contables o transacciones específicas:
   - **Precio**, el costo unitario cambió a la misma cantidad (por ejemplo, aumento de precio de un proveedor de SaaS). Citar los ids de asientos contables donde aparece el nuevo precio por primera vez.
   - **Volumen**, más o menos unidades al mismo precio unitario (por ejemplo, más gasto de hosting porque el uso se duplicó). Citar el conteo de transacciones contra la línea base más ids de asientos contables representativos.
   - **Mezcla**, una combinación distinta de SKUs / proveedores / categorías. Citar los asientos contables entrantes más los proveedores que salieron.
   - **Evento único**, no recurrente (ajuste puntual, reembolso único, renovación anual registrada en el mes). Citar el id del asiento contable más el memo.

   Cada factor tiene: `{driver, amount, jeRefs: [id…], transactionRefs?: [ids…], narrative}`. El `amount` debe sumar el total de la variación con una diferencia de hasta $1.00. El residuo sin explicar se registra explícitamente, nunca se absorbe en silencio.

7. **Escribir la narrativa en español sencillo sobre los 3 a 5 movimientos más grandes.** La narrativa nombra cada movimiento, el impacto en dólares, el factor principal, la evidencia específica (id de asiento contable o proveedor o conjunto de transacciones). Nada de causas inventadas. Si la evidencia es débil, decirlo. "sin factor obvio, se recomienda que lo revises" es aceptable. El relleno especulativo no lo es.

8. **Escribir el artefacto de variación.** Ruta: `variance-analyses/{YYYY-MM}.md`. Escritura atómica: `.tmp` → renombrar. Estructura:
   - Encabezado: período, líneas base usadas, umbral de materialidad, método contable.
   - **Titular**, resumen de 1 a 2 oraciones (por ejemplo, "Los gastos operativos subieron $45k (+12%) contra presupuesto, impulsados por la duplicación del hosting y un ajuste legal puntual").
   - **Narrativa**, 3 a 5 párrafos sobre los movimientos más grandes, cada uno citando ids de asientos contables / proveedores / conteos de transacciones.
   - **Tabla de variaciones materiales**, una fila por línea de código de cuenta material con reales, cada línea base, variación, descomposición de factores.
   - **Variaciones no materiales**, tabla resumen compacta.
   - **Residuos sin explicar**, cualquier descomposición de factores que no cuadre dentro de $1.00.
   - Pie de página: fuentes (ruta del archivo del estado de resultados, ruta del archivo de presupuesto, rutas de estados de resultados de períodos anteriores, hash de journal-entries.json).

9. **Anexar a `outputs.json`.** Lectura-fusión-escritura. Fila: `{id, type: "variance-analysis", title: "Variance - {YYYY-MM}", summary: "<the headline>", path: "variance-analyses/{YYYY-MM}.md", status: "draft", domain: "reporting"}`.

10. **Resumirte.** Un párrafo: titular más los 3 a 5 movimientos más grandes con impacto en dólares más factor principal, más los residuos sin explicar que necesitan revisión. Señalar el archivo escrito.

## Salidas

- `variance-analyses/{YYYY-MM}.md`
- Fila en `outputs.json`: `type: "variance-analysis"`, `domain: "reporting"`, `status: "draft"` hasta que tú lo apruebes.

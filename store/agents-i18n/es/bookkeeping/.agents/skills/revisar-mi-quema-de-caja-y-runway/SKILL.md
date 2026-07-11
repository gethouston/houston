---
name: revisar-mi-quema-de-caja-y-runway
title: Revisar mi quema de caja y runway
description: "Obtén el resumen de una página para fundadores: efectivo disponible, quema neta de los últimos 3 y 6 meses, meses de runway, una tabla de sensibilidad de ±20%, y los 3 principales factores de costo detrás de la quema. Los saldos de efectivo provienen de QuickBooks / Xero / tu feed bancario cuando está conectado, o del estado de cuenta más reciente en caso contrario. Cada número cita su fuente: saldo bancario con marca de tiempo, línea del estado de resultados con la ruta del archivo, ids de asientos contables en los factores de costo. Yo muestro los números y tú decides dónde recortar."
version: 1
category: Contabilidad
featured: yes
image: ledger
integrations: [quickbooks, xero]
---


# Revisar Mi Quema de Caja y Runway

Resumen de una página para el fundador. Efectivo, quema (promedio a 3 y 6 meses), meses de runway, sensibilidad de ±20%, y los tres factores de costo más grandes detrás de la quema. Cada número se ata a una fuente específica de saldo de efectivo o a una línea específica del estado de resultados, nada inventado, ningún consejo sobre dónde recortar.

## Cuándo usarlo

- "¿cuál es nuestro runway?" / "¿cuántos meses de efectivo?".
- "actualiza el reporte de quema" / "reconstruye la hoja de runway".
- "si aumentáramos la quema un 20%, ¿cómo cambia el runway?".
- Llamado por `close-my-month` después de que el estado de resultados esté listo; también llamado por `prepare-my-investor-pack` para actualizar el bloque de runway.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de que esta habilidad se ejecute, verifico que las categorías siguientes estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, me detengo.

- **QuickBooks Online o Xero** (contabilidad) - fuente preferida para saldos de efectivo en vivo por cuenta. Opcional, pero el reporte está mucho más al día si esto está conectado.
- **Feed bancario** (banca respaldada por Plaid) - respaldo / complemento cuando la contabilidad no está al día. Opcional.

Si ninguna está conectada, recurro al estado de cuenta más reciente en archivo y luego te pido que pegues los saldos actuales. Nunca me bloqueo, pero los números más frescos vienen de una conexión en vivo.

## Información que necesito

Leo primero tu contexto contable. Por cada campo requerido que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: aplicación conectada > archivo > URL > texto pegado) y espero.

- **Tus cuentas bancarias y tarjetas de crédito** - Requerido. Por qué: necesito la lista de cuentas de efectivo para sumar en un número de efectivo actual. Si falta, pregunto: "¿Qué cuentas bancarias y tarjetas de crédito usa el negocio? Conectar QuickBooks o tu feed bancario es la forma más fácil."
- **Saldos de efectivo actuales por cuenta** - Requerido. Por qué: efectivo dividido entre quema es igual a runway. Si falta, pregunto: "¿Cuál es el saldo actual en cada cuenta? Si puedes conectar QuickBooks o el banco lo extraigo; de lo contrario, suelta el estado de cuenta más reciente o pega los saldos."
- **Estados de resultados mensuales recientes (últimos 6 meses)** - Requerido. Por qué: define la quema neta a 3 y 6 meses. Si falta, pregunto: "¿Ya cerramos los últimos meses? Si no, ejecutemos primero el cierre mensual para tener números reales de quema; de lo contrario, recalculo desde los asientos contables."
- **Un plan de cuentas con marcas de efectivo y de único uso** - Requerido. Por qué: me dice qué cuentas tratar como efectivo y qué gastos son únicos frente a continuos. Si falta, pregunto: "¿Tenemos un plan de cuentas configurado? Si no, redactemos uno primero, solo toma unos minutos."

## Pasos

1. **Leer el contexto.** Cargar `context/bookkeeping-context.md`, `config/context-ledger.json` (necesito `domains.banks.accounts[]` para saber qué cuentas de efectivo existen), `config/chart-of-accounts.json` (identificar qué cuentas son efectivo / equivalentes de efectivo). Anotar la fecha de hoy, define el nombre del archivo.

2. **Extraer los saldos de efectivo actuales.** Para cada cuenta en `context-ledger.domains.banks.accounts[]`, obtener el saldo con este orden de prioridad:
   - **Aplicación conectada**, QuickBooks Online / Xero / feed bancario vía Composio. Descubrir la herramienta correcta en tiempo de ejecución (`composio search accounting` / `composio search banking`). Ejecutar por slug; nunca fijar nombres de antemano. Sin conexión en vivo, decirle al usuario qué categoría vincular, pasar a la siguiente fuente.
   - **Último estado de cuenta**, la fila más reciente en `statements/{last4}/` o el saldo de cierre del último `runs/{period}/run.json` que incluyó esta cuenta.
   - **Pegado del usuario**, hacer una pregunta puntual.

   Sumar para obtener `currentCash`. Registrar la fuente + marca de tiempo por cuenta para que el reporte sea auditable.

3. **Calcular la quema neta arrastrada.** Leer los últimos 6 meses de estados de resultados desde `financials/{YYYY-MM}/pnl.md` (o recalcular al vuelo desde `journal-entries.json` si falta el mes):
   - **Quema neta** = negativo del Ingreso Neto, excluyendo partidas únicas marcadas en `journal-entries.json` por `type in {"adjustment"}` y memo que contenga `"one-time"` / `"true-up"`. Si existe un estado de flujo de efectivo para el período, preferir su flujo operativo + de inversión como medida de quema.
   - **Arrastre de 3 meses**, promedio de los últimos 3 meses.
   - **Arrastre de 6 meses**, promedio de los últimos 6 meses.
   Registrar ambos; el reporte muestra ambos para que el usuario vea la diferencia de suavizado.

4. **Construir el historial de efectivo de 12 meses.** Para cada uno de los últimos 12 fines de mes, calcular el efectivo total (suma de los saldos de las cuentas de efectivo en esa fecha desde `journal-entries.json` + saldo de apertura). Datos del gráfico de runway: `cashHistory[]` = `[{monthEnd, totalCash}]`.

5. **Calcular el runway.**
   - `runway_3mo = currentCash / trailing_3mo_net_burn`
   - `runway_6mo = currentCash / trailing_6mo_net_burn`
   Quema neta cero o negativa (rentable), mostrar "infinito" para esa columna y anotarlo. Mostrar ambos para que el usuario vea la sensibilidad a la ventana de suavizado.

6. **Construir la tabla de sensibilidad.** En cada uno de `-20%`, `-10%`, `0%`, `+10%`, `+20%` de la quema actual, calcular el runway usando la base de 3 meses arrastrados. Columnas: `burn_change_pct`, `implied_monthly_burn`, `runway_months`.

7. **Identificar los 3 principales factores de costo.** Del desglose del último estado de resultados, agrupar las líneas de gasto por `statementSection` (por ejemplo, `operating-expenses.headcount`, `operating-expenses.hosting`, `operating-expenses.marketing`) y elegir las tres más grandes por dólar absoluto del mes arrastrado. Citar cada una con la ruta específica del archivo del estado de resultados + ids de asientos contables si el usuario quiere profundizar.

8. **Marcar el cambio de runway semana a semana.** Leer los `runway/*.md` anteriores (el más reciente por fecha del nombre de archivo). Si el runway se movió más de 10% frente al reporte anterior, anteponer una marca prominente al nuevo reporte con la diferencia y la causa probable (cambio de quema frente a cambio de saldo de efectivo).

9. **Escribir el reporte.** Ruta: `runway/{YYYY-MM-DD}.md` (fecha de hoy). Escritura atómica: `.tmp` → renombrar. Estructura:
   - **Titular**, 1 a 2 oraciones: `$X de efectivo, $Y/mes de quema (3 meses), {runway} meses de runway`.
   - **Saldos de efectivo**, tabla por cuenta con saldo + fuente + fecha de corte.
   - **Quema neta**, arrastre de 3 y 6 meses, partidas únicas excluidas (listarlas).
   - **Runway**, ambas vistas (3 y 6 meses).
   - **Historial de efectivo (12 meses)**, `cashHistory[]` en tabla; la interfaz posterior puede graficarlo.
   - **Tabla de sensibilidad**, cinco filas de ±20%.
   - **3 principales factores de costo**, cada uno con dólar, % de gastos operativos, cita de fuente.
   - **Cambio semana a semana**, si aplica, diferencia marcada.
   - Pie de página: fuentes (rutas de estado de resultados, ruta de contexto contable, fuentes de saldo bancario + marcas de tiempo).

10. **Añadir a `outputs.json`.** Leer-fusionar-escribir. Fila:
    `{id, type: "burn-runway", title: "Quema y Runway -
    {YYYY-MM-DD}", summary: "<el titular>", path:
    "runway/{YYYY-MM-DD}.md", status: "draft", domain:
    "reporting"}`.

11. **Resumir al usuario.** Un párrafo: efectivo, quema (ambas ventanas arrastradas), runway (ambos), el factor de costo más grande, cualquier marca semana a semana. Señalar el archivo escrito. Nunca dar "consejos" sobre recortes, mostrar las matemáticas, dejar que el fundador decida.

## Resultados

- `runway/{YYYY-MM-DD}.md`
- Fila en `outputs.json`: `type: "burn-runway"`, `domain: "reporting"`, `status: "draft"` hasta que el usuario dé el visto bueno.

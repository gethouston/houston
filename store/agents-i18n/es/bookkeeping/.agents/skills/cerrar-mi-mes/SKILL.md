---
name: cerrar-mi-mes
title: Cerrar mi mes
description: "Ejecuto un cierre mensual completo de principio a fin: concilio cada cuenta registrada, actualizo el registro de devengos, redacto cada asiento contable estándar pendiente (reversión, devengo, prepago, nómina, reconocimiento de ingresos, depreciación, compensación en acciones, ajuste), realizo una verificación de corte para transacciones registradas en el período equivocado, genero el estado de resultados, el balance general y el flujo de efectivo, realizo un análisis de variaciones, y armo un paquete de cierre con las cuatro alertas de pendientes (diferencias de conciliación > $100, sin categorizar > 10%, devengos vencidos > 90 días, asientos contables aún en borrador) en la parte superior. La subinvocación `step=cutoff-check` ejecuta el paso de corte de forma independiente. Solo borradores, nunca publico asientos contables, nunca presento nada, nunca muevo dinero."
version: 1
category: Contabilidad
featured: yes
image: ledger
integrations: [quickbooks, xero]
---


# Cerrar Mi Mes

El orquestador del cierre de fin de mes. Tu mes cierra cuando cada cuenta concilia, cada asiento contable pendiente está redactado, el corte está verificado, los estados financieros cuadran, la variación está explicada, y el paquete tiene el visto bueno. Encadeno las habilidades dueñas de cada paso; nunca hago su trabajo en línea.

Invariantes que preservo en cada ejecución: cada código de cuenta existe en tu plan de cuentas bloqueado, cada asiento contable cuadra dentro de 1 centavo, las diferencias de conciliación nunca se tapan en silencio, el paquete permanece en `status: "draft"` hasta que tú das el visto bueno. Nunca publico asientos contables, nunca muevo dinero, nunca presento nada.

## Cuándo usarlo

- "cierra los libros de marzo" / "ejecuta el cierre de fin de mes" / "cierra el último mes del Q1".
- "¿podemos entregar el cierre de {YYYY-MM}?", ejecuta la cadena completa.
- "verificación de corte" / "¿algo registrado en el período equivocado?" / "¿qué se registró en el período equivocado?", invocar con `step=cutoff-check` para el subpaso independiente.
- `step=cutoff-check`, subpaso de corte independiente, sin recorrer el resto de la orquestación. Útil cuando ya se ejecutaron otros pasos y solo se necesita actualizar el corte.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de que esta habilidad se ejecute, verifico que las categorías siguientes estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, me detengo.

- **QuickBooks Online o Xero** (contabilidad) - preferido para los registros del libro mayor y las verificaciones de corte de antigüedad de cuentas por pagar. Requerido si quieres que extraiga la actividad del libro mayor directamente.
- **Feed bancario** (banca respaldada por Plaid) - fuente preferida para conciliar cada cuenta de efectivo. Opcional, también puedes soltar los PDF de los estados de cuenta.
- **Proveedor de nómina** (Gusto, Rippling, Justworks) - necesario solo cuando hay un asiento contable de nómina pendiente para el período. Opcional, pega un resumen como respaldo.
- **Stripe** (facturación) - necesario solo al conciliar Stripe o al extraer el ingreso mensual actual para el reconocimiento de ingresos. Opcional.

Orquesto habilidades hijas (conciliación, devengos, asientos contables, estados de cuenta, variación) y cada una aplica su propia verificación de conexión; si alguna se detiene, te muestro ese bloqueo.

## Información que necesito

Leo primero tu contexto contable. Por cada campo requerido que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: aplicación conectada > archivo > URL > texto pegado) y espero.

- **El período a cerrar** - Requerido. Por qué: me dice el rango de fechas para las conciliaciones, devengos y estados financieros. Si falta, pregunto: "¿Qué mes estamos cerrando?"
- **Un contexto contable terminado** - Requerido. Por qué: necesito tu método contable, código de suspenso y cuentas registradas antes de orquestar el cierre. Si falta, pregunto: "¿Ya configuramos los libros? Si no, ejecuta la configuración primero."
- **Un plan de cuentas** - Requerido. Por qué: cada asiento contable y estado financiero depende de él. Si falta, pregunto: "¿Ya tenemos un plan de cuentas? Si no, redactemos uno primero."
- **Un balance de comprobación de apertura** - Requerido si este es tu primer cierre en este sistema. Por qué: cada número del balance general se ancla aquí. Si falta, pregunto: "¿Tienes un balance de comprobación de cierre de tus libros anteriores? Suelta la hoja de cálculo para que cargue los saldos de apertura."
- **Un presupuesto actual** - Opcional. Por qué: el análisis de variación corre contra el presupuesto si está disponible, si no, contra el período anterior. Si no tienes uno, sigo adelante y solo ejecuto la variación contra el período anterior.

## Pasos

1. **Analizar las entradas y leer el contexto.**
   - Requerido: `period` (`YYYY-MM`). Analizar a `{periodStart, periodEnd}`.
   - Cargar `context/bookkeeping-context.md`, detenerme si falta, pedir al usuario que ejecute `set-up-my-books` primero.
   - Cargar `config/context-ledger.json`, `config/chart-of-accounts.json` (**bloqueado** durante la ejecución, detenerme si está ausente, pedir `build-my-chart-of-accounts`), `config/prior-categorizations.json`, `config/opening-trial-balance.json` (si existe), `config/budget.json` (si existe).
   - Crear la carpeta de cierre: `mkdir -p closes/{YYYY-MM}/`.

2. **Capturar una instantánea del estado del período anterior.** Antes de cualquier escritura, copiar las filas relevantes de `outputs.json` del período en `closes/{YYYY-MM}/_snapshot.json` para que el cierre sea reproducible si el usuario vuelve a ejecutarlo.

3. **Rama `step=cutoff-check`.** Si se activa, saltar al Paso 7.

4. **Conciliar cada cuenta (recorrer `reconcile-my-accounts`).** Para cada cuenta en `context-ledger.domains.banks.accounts[]`, invocar la habilidad `reconcile-my-accounts` para `{accountLast4, period}`. Recopilar la ruta del resultado + el estado de la diferencia. Luego ejecutar `reconcile-my-accounts mode=transfer-detect` una vez a través de todas las cuentas para el período, etiquetar las transferencias entre cuentas con el código de cuenta 9000 para que queden fuera de las fórmulas SUMIFS del estado de resultados. NO avanzar al Paso 5 si alguna cuenta devolvió `status: "unresolved-break"` Y la diferencia es `> $100`, mostrar esas primero, esperar la decisión del usuario ("tapar con un asiento de ajuste" frente a "investigar más").

5. **Actualizar el registro de devengos (`review-my-accruals`).** Invocar `review-my-accruals` para el período. Reescribe `accruals/register.md`, hace leer-fusionar-escribir en `accruals.json` con el conjunto actual de devengos activos. Capturar la lista de devengos marcados `reversing=true` que deben revertirse al abrir el período, se vuelven entradas del Paso 6 para el asiento de reversión.

6. **Redactar cada asiento contable estándar pendiente (recorrer `draft-a-journal-entry`).** En este orden, invocar `draft-a-journal-entry` una vez por cada entrada pendiente; cada llamada añade un asiento contable balanceado a `journal-entries.json`. Recopilar rutas + ids para el paquete.

   1. **Asientos de reversión**, `type=accrual mode=reversing`, revierte automáticamente cada devengo activo marcado `reversing=true`.
   2. **Devengos nuevos**, `type=accrual`, según el resultado de `review-my-accruals` (ingresos no facturados, nómina devengada, intereses devengados).
   3. **Prepagos**, `type=prepaid`, amortiza renta / SaaS / seguro.
   4. **Nómina**, `type=payroll`, extraer de Gusto / Rippling / Justworks vía `composio search payroll`; recurrir a texto pegado si es necesario.
   5. **Reconocimiento de ingresos**, `type=revrec`, ingresos reconocidos según los calendarios ASC 606 en `revrec/`.
   6. **Depreciación**, `type=depreciation`, desde `config/fixed-assets.json`.
   7. **Compensación en acciones**, `type=stock-comp`, compensación en acciones según el calendario de adquisición de derechos.
   8. **Ajustes**, asientos contables `type=adjustment` sugeridos por las conciliaciones (comisiones no registradas, redondeo cambiario).

   Cada asiento contable queda en `status: "draft"`. Nunca cambiar a `posted` aquí, requiere confirmación explícita del usuario.

7. **Subpaso de verificación de corte.** Construir `closes/{YYYY-MM}/cutoff-check.md` con estas verificaciones:
   - **Gastos con fecha anterior, registrados en el actual**, escanear los asientos contables del período en busca de fechas de recibo / origen en el período anterior. Sugerir "devengar en el período anterior, revertir en este período".
   - **Gastos con fecha actual, aún no registrados**, extraer la antigüedad de cuentas por pagar vía `composio search accounting`. Cualquier factura abierta con fecha `≤ periodEnd` ausente de los asientos contables de este período es candidata a pasivo no registrado.
   - **Corte de ingresos**, facturas con fecha posterior a `periodEnd` con fechas de entrega anteriores a `periodEnd` (verificación cruzada ASC 606).
   - **Sensatez en base de efectivo**, pagos `> 1%` de los gastos operativos del período dentro de ±3 días de `periodEnd`.
   - **Encuesta de suspenso**, saldo actual de `suspense.json`; marcar partidas con antigüedad `> 90 días`.

   Estructura del documento: encabezado de resumen con conteos + totales en dólares por categoría, una tabla por verificación con `{fecha, descripción, monto, acciónSugerida}`. Añadir una fila en `outputs.json` con `type: "books-audit", domain: "close"`. Si se invoca como `step=cutoff-check`, detenerse aquí; omitir el Paso 8 en adelante.

8. **Generar los tres estados financieros (`prepare-my-financials` × 3).** En secuencia para que los estados posteriores puedan leer los anteriores:
   1. `statement=pnl`, escribe `financials/{YYYY-MM}/pnl.md`.
   2. `statement=balance-sheet`, escribe `financials/{YYYY-MM}/balance-sheet.md`. Verifica cruzadamente las Utilidades Retenidas contra el Ingreso Neto del estado de resultados calculado en el paso 8.1.
   3. `statement=cash-flow`, escribe `financials/{YYYY-MM}/cash-flow.md`. Concilia la línea de efectivo final con la suma de los saldos finales de `context-ledger.domains.banks` (de las conciliaciones del Paso 4).

   Si algún estado falla su verificación cruzada interna, mostrar la diferencia y NO avanzar a la variación. El usuario decide.

9. **Ejecutar el análisis de variación (`explain-my-variance`).** Invocar una vez por período. Si `config/budget.json` existe, la habilidad ejecuta reales contra presupuesto; si no, ejecuta contra el período anterior. Captura la descomposición de factores + la narrativa en lenguaje sencillo. Escribe `variance-analyses/{YYYY-MM}.md`.

10. **Calcular las alertas de pendientes para el encabezado del paquete.**
    - **Diferencias de conciliación > $100**, conteo en `recon-breaks.json` con `abs(amount) > 100` Y `status: "unresolved"`.
    - **Sin categorizar > 10% del volumen**, dólares absolutos de Suspenso ÷ volumen absoluto total del período. Marcar si `> 0.10`.
    - **Devengos vencidos > 90 días**, entradas en `accruals.json` con `active=true` Y `now - createdAt > 90 días`.
    - **Asientos contables aún en borrador**, conteo de `journal-entries.json` para el período con `status: "draft"` (se espera un valor distinto de cero en la primera ejecución, marca la acción "publicar estos N asientos contables en QuickBooks Online / Xero").

11. **Armar `closes/{YYYY-MM}/package.md`.** Secciones:
    - **Encabezado**, período, estado (`draft`), marca de tiempo, las cuatro alertas del Paso 10 presentadas de forma prominente como pendientes del usuario.
    - **Conciliaciones**, resumen de una línea por cuenta con el resultado de la prueba de tres vías y enlace a la conciliación completa; los pares de transferencia interna señalados.
    - **Asientos contables**, tabla `{id, fecha, tipo, memo, totalDébitos, estado}` ordenada por tipo y luego por fecha; cada fila enlaza a `journal-entries/{YYYY-MM}/{slug}.md`.
    - **Verificación de corte**, conteos por categoría + enlace a `cutoff-check.md`.
    - **Estados financieros**, enlaces al estado de resultados, balance general, flujo de efectivo con números titulares en línea (Ingreso Neto, Efectivo Final, Activos Totales).
    - **Análisis de variación**, enlace + narrativa de 3 puntos tomada textualmente de `variance-analyses/{YYYY-MM}.md`.
    - **Instantánea de devengos**, conteos (activos / revertidos / vencidos) + enlace a `accruals/register.md`.
    - **Preguntas abiertas para el fundador**, cualquier cosa que las habilidades hijas hayan señalado y que necesite intervención humana antes de cambiar a `ready`.

12. **Actualizar los índices** (atómico `.tmp` + renombrar, leer-fusionar-escribir):
    - `outputs.json`, `{type: "close-package", title: "Cierre {YYYY-MM}", summary, path, status: "draft", domain: "close"}`. Las habilidades hijas ya añadieron sus propias filas.
    - `run-index.json`, `{id, period, status: "draft", accountsIncluded[], suspenseTotal, pnlNetIncome}`. `pnlNetIncome` leído textualmente del estado de resultados.

13. **Resumir al usuario.** Estado del cierre + ruta del paquete (con enlace), las cuatro alertas del Paso 10 con elementos de acción ("publicar {N} asientos contables en borrador", "resolver {M} diferencias de conciliación"), números titulares (Ingreso Neto, Efectivo Final, Runway), siguiente paso ("aprueba los asientos contables en borrador y cambio el paquete a `ready`").

## Contrato de invocación de subhabilidades

Cada habilidad hija (`reconcile-account`, `review-accruals`, `prep-journal-entry`, `generate-financial-statements`, `run-variance-analysis`) se invoca con `period`, es dueña de su propio artefacto + filas de índice, nunca se rehace en línea. Si una habilidad hija se detiene por un bloqueo (configuración / conexión faltante), mostrarlo textualmente y pausar.

## Resultados

- `closes/{YYYY-MM}/package.md`, narrativa principal del cierre con las cuatro alertas de pendientes en la parte superior.
- `closes/{YYYY-MM}/cutoff-check.md`, problemas de corte + pasivos no registrados.
- `closes/{YYYY-MM}/_snapshot.json`, instantánea del estado del período anterior para reproducibilidad.
- Todos los artefactos de las habilidades hijas, `reconciliations/{account_last4}/{YYYY-MM}.md` × N, `journal-entries/{YYYY-MM}/*.md` × M, `financials/{YYYY-MM}/*.md` × 3, `variance-analyses/{YYYY-MM}.md`, `accruals/register.md` (reescrito).
- `outputs.json`, una fila para el paquete de cierre + filas de cada habilidad hija.
- `run-index.json`, una fila añadida, `status: "draft"`.

---
name: configurar-mis-libros
title: "Configurar mis libros"
description: "Configuro tus libros desde cero con una sola entrevista al fundador que captura la entidad, el año fiscal, el método contable, las cuentas registradas, la postura de nómina, el modelo de ingresos, la frecuencia de reporte a inversionistas, y el preparador de impuestos, y luego escribe el resumen contable vivo que todas las demás habilidades leen primero. El submodo `mode=opening-balances` captura tu balance de apertura a partir de una hoja de cálculo, un CSV, o una exportación de tu contador anterior. Nunca conecto un banco, nunca publico en un libro mayor, ni muevo dinero desde esta habilidad, solo hechos y un resumen, punto."
version: 1
category: Contabilidad
featured: yes
image: ledger
integrations: [stripe]
---


# Configurar mis libros

La entrevista única al fundador que ancla todo lo demás que hago. Escribo tu resumen contable, tipo de entidad, año fiscal, efectivo vs. devengo, cuentas bancarias, nómina, modelo de ingresos, frecuencia de reporte a inversionistas, preparador de impuestos, y capturo un balance de apertura si ya tienes uno. Todas las demás habilidades leen el resumen primero y se niegan a hacer trabajo sustantivo sin él.

Solo borradores y hechos: nunca presento, publico en tu libro mayor, ni me conecto a un banco desde esta habilidad.

## Cuándo usarla

- "configura los libros" / "danos de alta" / "redacta el resumen contable".
- "actualiza el contexto contable" / "cambió nuestro año fiscal" / "pasamos a devengo en junio".
- `mode=opening-balances`  -  "captura nuestro balance de apertura" / "carga nuestros saldos iniciales desde esta hoja de cálculo" / "registra el balance de apertura de nuestro contador anterior".
- Llamada implícitamente por otra habilidad que necesita el resumen y lo encuentra faltante  -  solo después de confirmar contigo en el chat.

## Conexiones que necesito

Ejecuto trabajo externo a través de Composio. Antes de que esta habilidad corra, verifico que las categorías de abajo estén vinculadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Stripe** (facturación), opcional, me permite confirmar tu modelo de ingresos y el origen de tus contratos automáticamente.
- **Feed bancario** (banca respaldada por Plaid), opcional, la forma más rápida de registrar tus cuentas bancarias y tarjetas de crédito.

Esta habilidad es principalmente una entrevista, así que ninguna conexión bloquea la ejecución. Las conexiones solo te ahorran tener que escribir las cosas.

## Información que necesito

Primero leo tu contexto contable. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Datos básicos de la empresa: razón social, tipo de entidad, estado, EIN, cierre de año fiscal, etapa, industria**, Obligatorio. Por qué: define la sección de patrimonio, el calendario fiscal, y la huella tributaria. Si falta, pregunto cada uno por turno, por ejemplo: "¿Cuál es la razón social de la empresa según los documentos de constitución?"
- **Contabilidad en efectivo vs. devengo**, Obligatorio. Por qué: determina si incluyo devengos, ingresos diferidos, y amortización de prepagos. Si falta, pregunto: "¿Llevamos los libros en efectivo o en devengo? Si cambiaron a mitad de año, ¿cuándo ocurrió el cambio?"
- **Cuentas bancarias, tarjetas de crédito, y procesadores de pago**, Obligatorio. Por qué: cada cuenta que rastreo necesita un nombre, los últimos 4 dígitos, y el banco. Si falta, pregunto: "¿Qué cuentas bancarias y tarjetas de crédito usa la empresa? Conectar tu feed bancario es lo más fácil."
- **Proveedor de nómina y tamaño del equipo**, Obligatorio si tienes empleados. Por qué: define las líneas de nómina devengada y compensación en acciones. Si falta, pregunto: "¿Quién maneja la nómina, Gusto, Rippling, Justworks, otro, o aún no tienen empleados? Y aproximadamente, ¿cuántas personas hay en el equipo?"
- **Modelo de ingresos**, Obligatorio. Por qué: suscripción, uso, servicios, o una mezcla cambia qué líneas de ingresos existen. Si falta, pregunto: "¿Cómo genera ingresos la empresa, suscripciones recurrentes, basado en uso, servicios, o una mezcla?"
- **Nombre y correo del preparador de impuestos**, Opcional. Por qué: se incluye automáticamente en las entregas de fin de año al preparador de impuestos. Si aún no tienes uno, continúo y pregunto después.
- **Un balance de apertura, en `mode=opening-balances`**, Obligatorio para ese modo. Por qué: ancla cada cifra del balance general de aquí en adelante. Si falta, pregunto: "¿Tienes un balance de cierre de tus libros anteriores o de tu contador? Compártelo como hoja de cálculo o CSV con código de cuenta, nombre, débito, y crédito."

## Pasos

1. **Leer el estado existente.** Cargo `config/context-ledger.json` (creo un esqueleto vacío `{"universal":{},"domains":{}}` si no existe) y `context/bookkeeping-context.md` si existe  -  esta ejecución es actualización, no reescritura. Preservo todo lo que el fundador afinó; toco solo lo obsoleto o nuevo.

2. **Determinar el modo.** Por defecto = resumen completo. Si el usuario activó `mode=opening-balances`, salto al paso 6.

3. **Recolectar lo faltante (una pregunta específica por vacío).** Por cada campo obligatorio del registro que no esté definido, hago UNA pregunta con pista de modalidad (app conectada > archivo > URL > texto pegado) y escribo la respuesta de forma atómica antes de continuar. Campos obligatorios para el resumen completo:

   - `universal.company`  -  razón social, nombre comercial, tipo de entidad (c-corp / s-corp / llc / sociedad / propietario único), EIN, estado de constitución, cierre de año fiscal (`MM-DD`), fecha de fundación, etapa (pre-seed / seed / series-a / series-b / growth), industria.
   - `universal.accountingMethod`  -  `cash` o `accrual`; si cambiaron a mitad de año, capturo `switchedOn` (YYYY-MM-DD).
   - `universal.suspenseCode`  -  por defecto `{"code":"99999","name":"Suspense"}` a menos que el catálogo de cuentas anterior del fundador use un código diferente.
   - `domains.banks.accounts[]`  -  por cada cuenta bancaria, tarjeta de crédito, Stripe, procesador de pago: `last4`, `type`, `bank`, `glCode` (puede quedar en blanco si aún no existe catálogo de cuentas), `glName`. Prefiero la conexión de Composio (Plaid / categoría bancaria) sobre la lista manual.
   - `domains.payroll`  -  proveedor (gusto / rippling / justworks / deel / adp / none), frecuencia, `teamSize`, `stockCompPosture` (iso / nso / rsu / mix / none).
   - `domains.revenue`  -  `model` (saas-subscription / usage / services / marketplace / mix), postura ASC 606, `contractSource`.
   - `domains.investors`  -  frecuencia, `anchorKpis[]` (ej., ingreso anual, margen bruto, quema de caja, runway), `format`.
   - `domains.tax`  -  `preparerName`, `preparerEmail`, `lastYearFiled`, `rdCreditEligible` (yes / no / tbd), `stateFilingFootprint[]`.

   Por cada campo escrito, sello `capturedAt` (ISO-8601 UTC) y `source` donde el esquema lo pida. Si el fundador dice "TBD" o "todavía no", registro `null` y anoto en el resumen para volver a preguntar después  -  pero NUNCA pregunto el mismo campo dos veces en una ejecución.

4. **Capturar los "nunca" específicos del fundador.** Una pregunta abierta: "¿hay algo que nunca deba tocar sin tu autorización explícita?" Comunes: compensación basada en acciones (sin insumo de valuación 409A), reconocimiento de ingresos en contratos no estándar, transacciones con partes relacionadas, cripto. Registro textualmente.

5. **Redactar el resumen (~400-700 palabras, con criterio, directo).** Estructura, en orden:

   1. **Panorama de la empresa**  -  un párrafo: razón social, tipo de entidad, estado, EIN, año fiscal, etapa, industria.
   2. **Postura contable**  -  método (efectivo / devengo), marco (GAAP-startup / IFRS / base fiscal), cambios a mitad de año con fecha.
   3. **Cuentas bancarias y tarjetas**  -  agrupadas por `last4`; cada una con banco, tipo, código de cuenta, nombre de cuenta. Marco las cuentas sin código de cuenta como `TBD  -  definir cuando exista el catálogo de cuentas`.
   4. **Modelo de ingresos**  -  postura de suscripción / uso / servicios; tratamiento ASC 606; ubicación de los contratos.
   5. **Postura de nómina**  -  proveedor, frecuencia, tamaño del equipo, tipo de plan de compensación en acciones.
   6. **Huella de cumplimiento**  -  lista de estados con obligación de presentar, postura del crédito de I+D, notas de exposición a impuesto sobre ventas.
   7. **Frecuencia con inversionistas**  -  mensual / trimestral / ninguna; KPIs de referencia; formato preferido.
   8. **Preparador de impuestos**  -  nombre, correo, último año presentado.
   9. **Los "nunca"**  -  a nivel del espacio de trabajo ("nunca publicar en el libro mayor, nunca mover dinero, nunca presentar nada") más los específicos del fundador.

   Secciones delgadas: márcalas como `TBD  -  {qué traer después}` y sigue adelante. Nunca inventes.

6. **Rama `mode=opening-balances`.** Si se activa:

   - El usuario soltó un archivo: analizo xlsx con `openpyxl`, CSV con el módulo estándar `csv`. Mapa de columnas: acepto `{code|account_code, name|account_name, debit, credit}` o `{code, name, balance}` donde positivo = débito y negativo = crédito (confirmo la convención de signo en el chat si es ambigua).
   - El usuario escribe directamente: acepto filas `{glCode, debit, credit}`.
   - Valido que cada `glCode` exista en `config/chart-of-accounts.json`. Si no existe el catálogo de cuentas, me detengo y pido al usuario que ejecute primero `build-my-chart-of-accounts` (o lo corro en línea). NUNCA invento un código de cuenta aquí.
   - Valido que `sum(debit) === sum(credit)` con un margen de 1 centavo. Si no cuadra, muestro la diferencia y me detengo  -  NO la fuerzo.
   - Escribo `config/opening-trial-balance.json` de forma atómica como `[{glCode, debit, credit}]`.
   - Actualizo `config/context-ledger.json → universal.openingBalances` con `{asOf, source, trialBalancePath, capturedAt}`.

7. **Escribir de forma atómica.** Cada escritura: destino `{path}.tmp`, luego `rename`. Archivos que toco en esta ejecución:
   - `context/bookkeeping-context.md` (siempre)
   - `config/context-ledger.json` (leer-combinar-escribir  -  nunca sobrescribir)
   - `config/opening-trial-balance.json` (solo en modo opening-balances)

8. **NO agregar a `outputs.json`.** El resumen es un documento vivo, no un entregable. El balance de apertura es configuración, no un resultado. Ninguno de los dos se indexa.

9. **Resumir para el usuario.** Un párrafo corto: qué se capturó, qué sigue como TBD, el próximo paso exacto (usualmente: "ejecuta `build-my-chart-of-accounts` después, y luego suelta los estados de cuenta bancarios en `statements/_inbox/`").

## Resultados

- `context/bookkeeping-context.md`  -  resumen contable vivo (en la raíz del agente; nunca bajo `.agents/` ni `.houston/`).
- `config/context-ledger.json`  -  combinado con los campos recién capturados.
- `config/opening-trial-balance.json`  -  solo cuando se activa `mode=opening-balances`.

No hay entradas en `outputs.json` por diseño.

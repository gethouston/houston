---
name: revisar-mi-nexo-de-impuesto-sobre-ventas
title: Revisar mi nexo de impuesto sobre ventas
description: "Descubre dónde debes impuesto sobre ventas. Sumo los ingresos y el número de transacciones por estado de EE. UU. desde Stripe (o QuickBooks / Xero / facturas como respaldo), comparo los totales de cada estado contra su umbral de nexo económico para el trimestre y los últimos 12 meses, identifico el mes exacto en que cada estado cruzado se activó, y marco los estados con nexo físico (empleados W-2, oficinas, inventario / FBA). Clasifico la exposición de mayor a menor monto en dólares y señalo los estados más cercanos a cruzar el umbral como alertas tempranas. Yo preparo, tú te registras y remites a través de Avalara, TaxJar, o directamente en el portal del estado."
version: 1
category: Contabilidad
featured: no
image: ledger
integrations: [stripe, quickbooks, xero]
---


# Revisar Mi Nexo de Impuesto sobre Ventas

Revisión de nexo económico estado por estado. Sumo los ingresos y las transacciones por estado de EE. UU. para el período, comparo contra el umbral de cada estado, identifico el mes en que se cruzó, y marco los disparadores de nexo físico (empleados, oficinas, inventario) sin importar los ingresos. La exposición se clasifica de mayor a menor monto en dólares; los tres estados más cercanos a cruzar aparecen como alertas tempranas. Nunca me registro y nunca remito.

## Cuándo usarlo

- "¿dónde debemos impuesto sobre ventas?" / "revisión de nexo" / "exposición de impuesto sobre ventas por estado".
- Trimestralmente, al final del trimestre fiscal.
- La empresa cruza una marca redonda de ingresos ($500K, $1M, $5M) o agrega empleados en un nuevo estado.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de que esta habilidad se ejecute, verifico que las categorías siguientes estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, me detengo.

- **Stripe** (facturación) - requerido para extraer cargos con el estado de facturación / envío para la agregación de ingresos por estado. Requerido si Stripe es tu fuente principal de contratos.
- **QuickBooks Online o Xero** (contabilidad) - extrae las etiquetas de estado de facturas / clientes como respaldo o complemento de Stripe. Opcional.

Si ninguna de las categorías requeridas está conectada, me detengo y te pido que conectes Stripe primero, ya que la mayoría de las startups facturan a través de él.

## Información que necesito

Leo primero tu contexto contable. Por cada campo requerido que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: aplicación conectada > archivo > URL > texto pegado) y espero.

- **El estado sede de tu empresa** - Requerido. Por qué: es la base de nexo físico; debes impuesto sobre ventas ahí sin importar los ingresos. Si falta, pregunto: "¿En qué estado tiene su sede o está incorporada la empresa?"
- **Cómo facturas a los clientes y dónde viven los contratos** - Requerido. Por qué: define la fuente que uso para los ingresos por estado. Si falta, pregunto: "¿Cómo facturas a los clientes, mayormente a través de Stripe, a través de QuickBooks o Xero, o de otra forma?"
- **Estados donde ya recaudas o presentas impuesto sobre ventas** - Opcional. Por qué: me permite marcar los estados ya registrados como "sin acción" en lugar de "nueva exposición". Si falta, pregunto: "¿Ya estás registrado para recaudar impuesto sobre ventas en algún lugar? Si no tienes eso, sigo adelante y marco cada cruce como nuevo."
- **Dónde trabajan físicamente tus empleados** - Opcional. Por qué: cualquier empleado W-2 en un estado crea nexo físico sin importar los ingresos. Si falta, pregunto: "¿Tienes empleados trabajando en estados además del de la sede? Si no tienes eso, lo anoto como pendiente y señalo verificaciones de nexo físico para que el usuario confirme."

## Pasos

1. **Leer el contexto.** Cargar `context/bookkeeping-context.md`, `config/context-ledger.json`, `config/chart-of-accounts.json`. Contexto contable requerido: `universal.company.state`, `domains.revenue.contractSource`, `domains.tax.stateFilingFootprint`. La imponibilidad de SaaS varía por estado, calcular la exposición sin importar la postura de imponibilidad.

2. **Determinar el período.** Usar `{YYYY-QN}` del usuario si se indica; si no, el trimestre fiscal completado más reciente. Reportar también la vista continua de 12 meses arrastrados (la mayoría de los umbrales estatales se miden así).

3. **Extraer ingresos por estado de destino.** Orden de fuentes:
   a. **Stripe vía Composio.** `composio search billing` → descubrir el slug de Stripe → extraer cargos del período con el estado de facturación / envío del cliente. SaaS usa la dirección de facturación; los bienes enviados usan el estado de destino. Recurrir al país de la tarjeta + código postal si falta la dirección.
   b. **Facturas (CSV / texto pegado).** El usuario provee datos a nivel de factura con estado, monto, fecha, id de cliente.
   c. **Sistema contable vía Composio.** Lista de clientes de QuickBooks Online / Xero con etiquetas de estado.
   Ninguna disponible, detenerme, pedir una fuente. Nunca inventar atribuciones de estado.

4. **Agregar por estado.** Sumar ingresos; contar transacciones distintas (los umbrales usan "transacciones separadas", una factura de varias líneas cuenta como una; una suscripción mensual cuenta como 12 al año por cliente).

5. **Comparar contra los umbrales de nexo económico.** Usar la tabla de referencia (revisar de nuevo la guía actual del departamento de ingresos si la fecha en caché del contexto contable tiene más de 12 meses):

   | Estado | Umbral (O, salvo que se indique) |
   |---|---|
   | CA | $500K de ingresos (sin conteo de transacciones) |
   | NY | $500K de ingresos Y 100 transacciones (ambos) |
   | TX | $500K de ingresos (sin conteo de transacciones) |
   | FL | $100K de ingresos (sin conteo de transacciones) |
   | IL | $100K O 200 transacciones |
   | MA | $100K (sin conteo de transacciones) |
   | WA | $100K (sin conteo de transacciones) |
   | CO | $100K (sin conteo de transacciones) |
   | GA | $100K O 200 transacciones |
   | NC | $100K O 200 transacciones |
   | PA | $100K (sin conteo de transacciones) |
   | OH | $100K O 200 transacciones |
   | VA | $100K O 200 transacciones |
   | MI | $100K O 200 transacciones |
   | NJ | $100K O 200 transacciones |
   | Por defecto (todos los demás) | $100K O 200 transacciones |

   Estados "O": cruzar cualquiera de los dos genera nexo. Estados "Y" (NY): deben cruzarse ambos. La mayoría se mide en los 12 meses arrastrados o el año calendario anterior, anotar cuál aplica por fila.

6. **Fecha de cruce.** Para cada estado cruzado, recorrer los ingresos y transacciones acumuladas mes a mes. Identificar el mes de cruce. La mayoría de los estados dan un período de gracia de 30 a 60 días para registrarse.

7. **Marcas de nexo físico.** Sin importar el umbral económico:
   - Empleados trabajando en el estado (según `domains.payroll` / sistema de RR. HH., preguntar si no está capturado). Cualquier empleado W-2 es nexo físico.
   - Oficinas / espacio arrendado.
   - Inventario (incluyendo bodegas FBA).
   - Contratistas: generalmente NO crean nexo (los 1099 no cuentan), pero algunos estados (por ejemplo, TX) toman posturas agresivas, marcar, no concluir automáticamente.
   El nexo físico requiere registro sin importar los ingresos.

8. **Clasificar por exposición.** Ordenar los estados cruzados por ingresos acumulados (descendente). Cada fila: estado; ingresos en el período + 12 meses arrastrados; transacciones en el período + 12 meses arrastrados; umbral aplicado; fecha de cruce; marca de nexo físico; exposición acumulada; siguiente acción ("Registrarse vía Avalara / TaxJar / portal directo del departamento de ingresos" / "Contratar a un asesor de SALT" / "Ya registrado según `stateFilingFootprint`" / "Monitorear, por debajo").

9. **Escribir `compliance/sales-tax/{YYYY-QN}.md`.** Escritura atómica. Estructura:
   - **Resumen**, estados cruzados, conteo de nexo físico, ingresos totales expuestos, ya registrados frente a nuevos cruces.
   - **Estados cruzados**, tabla clasificada por exposición.
   - **Solo nexo físico**, estados con presencia física pero por debajo del umbral económico.
   - **No cruzados**, una línea que muestre los 3 más cercanos al umbral (alerta temprana).
   - **Nota de imponibilidad**, recordar al usuario que la imponibilidad de SaaS varía por estado; cruzar el umbral no significa que cada venta sea imponible. Se necesita la guía del departamento de ingresos sobre el producto específico, decisión de criterio para un asesor de SALT.
   - **Nota de presentación**, "Solo preparación. Registro vía Avalara / TaxJar / portales directos del estado. La remisión / presentación depende de ti."

10. **Añadir a `outputs.json`.** Fila: `{type: "sales-tax-nexus", title: "Nexo de impuesto sobre ventas {YYYY-QN}", summary, path, status: "draft", domain: "compliance"}`. Leer-fusionar-escribir.

11. **Resumir al usuario.** Un párrafo: número de estados recién cruzados, exposición total, los 3 principales por riesgo, marcas de nexo físico, siguiente paso por estado cruzado. Nunca registrarse, nunca remitir.

## Resultados

- `compliance/sales-tax/{YYYY-QN}.md` (indexado como `sales-tax-nexus`)

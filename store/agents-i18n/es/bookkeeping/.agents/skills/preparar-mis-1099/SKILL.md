---
name: preparar-mis-1099
title: "Preparar mis 1099"
description: "Preparo tu lista de 1099-NEC y 1099-MISC para el año fiscal. Sumo los pagos acumulados del año por proveedor a partir de tu historial de pagos, marco los proveedores elegibles (no corporativos, ≥ $600), separo NEC de MISC, cruzo el estado del W-9 contra los W-9 que tienes archivados, y redacto correos de seguimiento para los W-9 faltantes como borradores de Gmail / Outlook (o como archivos `.md` simples si no tienes una bandeja de entrada conectada). Yo preparo, tú presentas a través de IRS FIRE, Track1099, o Tax1099. Nunca presento nada y nunca envío nada."
version: 1
category: Contabilidad
featured: no
image: ledger
integrations: [gmail, outlook]
---


# Preparar Mis 1099

Preparación de 1099-NEC y 1099-MISC para el año fiscal. Sumo los pagos por proveedor a partir de tus transacciones registradas, marco quién es elegible, separo NEC de MISC, cruzo el estado del W-9, y redacto correos de seguimiento para los W-9 faltantes. Los correos de seguimiento quedan en tus borradores de Gmail u Outlook (nunca enviados) para que los revises y hagas clic en enviar. Yo preparo, tú presentas ante el IRS.

## Cuándo usarlo

- "quiénes son nuestros proveedores 1099" / "prepara la lista de 1099 para {year}".
- "redacta correos de seguimiento para los W-9 faltantes".
- Invocado por `hand-off-to-my-tax-preparer` como parte del paquete de fin de año.
- Invocado en enero para el año fiscal anterior (fecha límite del IRS: 31 de enero para NEC).

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr este skill verifico que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Gmail u Outlook** (bandeja de entrada), opcional, me permite crear correos borrador de seguimiento directamente a los proveedores con W-9 faltantes. Nunca los envío. Si no está conectado, escribo el texto del correo en un archivo borrador que puedes copiar.

Este skill funciona completamente sin conexión, a partir de tu historial de transacciones registradas. Ninguna conexión bloquea la ejecución; la conexión de bandeja de entrada solo facilita los correos de seguimiento.

## Información que necesito

Primero leo tu contexto de contabilidad. Por cada campo requerido que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > pegar) y espero.

- **El año fiscal**, requerido. Por qué: define el rango de fechas para sumar los pagos acumulados del año. Si falta, pregunto: "¿Para qué año fiscal estamos preparando la lista de 1099? En enero uso por defecto el año que acaba de terminar."
- **El nombre legal y el EIN de tu empresa**, requerido. Por qué: se coloca en el bloque de pagador de cada formulario 1099. Si falta, pregunto: "¿Cuál es el nombre legal de la empresa y el EIN registrado ante el IRS?"
- **Un historial de transacciones registradas que cubra el año fiscal**, requerido. Por qué: sumo los pagos a proveedores a partir de tus transacciones procesadas. Si falta, pregunto: "¿Ya procesamos los estados de cuenta del año fiscal? Si no, suelta los estados de cuenta bancarios y de tarjeta de crédito para que los categorice primero."
- **Los W-9 archivados de tus contratistas**, opcional. Por qué: me permite marcar cada proveedor 1099 como "tiene-w9" y omitir el correo de seguimiento. Si no los tienes en un solo lugar, pregunto: "¿Tienes los W-9 recopilados en algún lugar? Si no, marcaré cada proveedor elegible como faltante y redactaré correos de seguimiento para cada uno."
- **Una lista de correos de proveedores**, opcional. Por qué: me permite dirigir los correos de seguimiento a cada proveedor directamente. Si no la tienes, dejo el destinatario en blanco en cada borrador y te pido que lo completes.

## Pasos

1. **Leer el contexto.** Cargar `context/bookkeeping-context.md`, `config/context-ledger.json`, `config/chart-of-accounts.json`. Registro requerido: `universal.company` (nombre legal más EIN para el bloque de pagador 1099), `domains.tax` (nombre / correo del preparador para la nota de portada).

2. **Determinar el año fiscal.** Si tú lo especificas, se usa; si se invoca en enero sin año, por defecto se usa el año calendario anterior (`today.year - 1`), ese es el ciclo de 1099. Si se invoca a mitad de año, se usa el año actual como borrador en curso.

3. **Sumar los pagos acumulados del año por proveedor.** Leer cada `runs/*/run.json` cuyo período se superponga con el año fiscal. Filtrar transacciones a `amount < 0` (dinero que sale), agrupar por `party` (nombre canónico). Sumar los montos absolutos por proveedor dentro del rango de fechas del año fiscal. Citar cada transacción por `(run period, date, amount)`, sin pagos inventados.

4. **Excluir pagos que no son reportables en 1099.**
   - Transferencias (`gl_code == "9000"` / `source == "transfer"`).
   - Pagos a corporaciones (S-corp / C-corp exentas salvo categorías específicas como honorarios de abogados). Se asume por defecto que es corporación si el nombre canónico del proveedor termina en `Inc`, `Corp`, `LLC` (el W-9 lo confirma), `Corporation`, `Ltd`. Marcar para que tú confirmes, exclusión por defecto.
   - Pagos de nómina (van en el W-2, no en el 1099).
   - Pagos con tarjeta de crédito al proveedor. Si el proveedor se pagó exclusivamente con tarjeta de crédito, el emisor de la tarjeta emite el 1099-K, se excluye de la lista. Marcar cualquier proveedor pagado únicamente con tarjeta de crédito.
   - Reembolsos etiquetados como transferencia intermediaria.

5. **Aplicar los umbrales de elegibilidad de 1099.**
   - **1099-NEC**, contratistas / servicios (categorías de cuenta: servicios profesionales, mano de obra contratada, consultoría, contratistas de ingeniería). Umbral: ≥ $600 acumulado del año.
   - **1099-MISC**, renta, honorarios de abogados (incluso si están constituidos), premios, pagos médicos, otros. Umbral: ≥ $600 acumulado del año.
   - Marcar los proveedores que abarcan varias categorías (por ejemplo, un bufete pagado tanto por servicios como por un acuerdo), tú decides la división.

6. **Cruzar el estado del W-9.** Revisar `files/` (o la carpeta de W-9 de proveedores que proporciones) en busca de un PDF que coincida con cada proveedor elegible por nombre canónico (coincidencia difusa, token-set-ratio ≥ 0.85). Registrar el estado del W-9 por proveedor: `have-w9` / `missing-w9` / `pending`. Si me das en tiempo de ejecución una lista de proveedores con indicadores de W-9, la fusiono.

7. **Redactar correos de seguimiento para los W-9 faltantes.** Para cada proveedor marcado `missing-w9`:
   - Escribir `drafts/1099-chase-{vendor-slug}.md`, línea de asunto, cuerpo, firma. El cuerpo hace referencia al año fiscal, el umbral en dólares, el enlace al Formulario W-9 (`https://www.irs.gov/pub/irs-pdf/fw9.pdf`), y pide que se devuelva antes de la fecha indicada (por defecto: 15 de enero para presentación del año anterior).
   - Si `composio search inbox` devuelve un slug de Gmail / Outlook conectado, crear un borrador en la bandeja de entrada (nunca enviar) usando el correo del proveedor si se conoce por correspondencia previa; incluir la URL / id del borrador en el `.md`. Sin conexión, omitir el paso de bandeja de entrada en silencio.
   - Citar el proveedor canónico, lo pagado acumulado del año, y los períodos de ejecución de origen en el cuerpo del borrador para que puedas verificar antes de enviar.

8. **Escribir `compliance/1099s/{year}.md`.** Escritura atómica. Estructura:
   - **Bloque de pagador**, nombre legal, EIN, estado.
   - **Resumen**, conteo de NEC, total en $ de NEC, conteo de MISC, total en $ de MISC, conteo de W-9 faltantes.
   - **Destinatarios NEC**, tabla: proveedor canónico, pagado acumulado del año, desglose por categoría de cuenta, estado del W-9, dirección (del W-9 si está presente; si no, `TBD`).
   - **Destinatarios MISC**, misma forma de tabla.
   - **Excluidos**, exclusiones corporativas, solo tarjeta de crédito, nómina, transferencias, una razón por línea por fila (para que puedas auditar las exclusiones).
   - **Casos mixtos**, proveedores donde la división NEC/MISC necesita una decisión de criterio, con opciones.
   - **Nota de presentación**, "Solo preparación. Presenta vía IRS FIRE, Track1099, o Tax1099. Fecha límite: 31 de enero (NEC al destinatario más al IRS), 28 de febrero en papel / 31 de marzo electrónico (MISC al IRS)."

9. **Anexar a `outputs.json`.** Fila: `{type: "vendor-1099-list", title: "1099 list {year}", summary, path: "compliance/1099s/{year}.md", status: "draft", domain: "compliance"}`. Lectura-fusión-escritura.

10. **Resumirte.** Un párrafo: conteo de NEC más $, conteo de MISC más $, conteo de W-9 faltantes con las rutas de los correos de seguimiento, cualquier caso mixto que necesite tu decisión, recordatorio de presentación ("yo preparo, tú presentas vía FIRE / Track1099 / Tax1099"). Nunca presento. Nunca envío.

## Salidas

- `compliance/1099s/{year}.md` (indexado en `outputs.json` como `vendor-1099-list`)
- `drafts/1099-chase-{vendor-slug}.md` (uno por W-9 faltante, no indexado; borradores)
- Borradores opcionales en la bandeja de entrada de Gmail / Outlook vía Composio (nunca enviados)

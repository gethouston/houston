---
name: cargar-leads-en-airtable
title: "Cargar leads en Airtable"
description: "Creo una tabla nueva en Airtable con el esquema completo de seguimiento de leads (campos del lead + campos de enriquecimiento + estado de la prospección) y cargo los registros por lotes desde un archivo de scraping. Uso 4 agentes en paralelo para cargar 4 veces más rápido, evitando el límite de Airtable de un registro por llamada. Es la fase 2 de ambos pipelines, y también se puede ejecutar de forma independiente si tienes una lista de leads en JSON."
version: 1
category: Prospección
featured: no
image: card-index-dividers
integrations: [airtable]
---


# Cargador de leads en Airtable

Creo una tabla nueva en Airtable para una lista de leads, con todas las columnas que el resto del pipeline necesita ya listas, y luego cargo por lotes cada registro. Uso agentes en paralelo porque Airtable exige un límite de un registro por llamada de creación, la carga en serie de 500 registros tomaría 8 a 10 minutos; con 4 agentes en paralelo eso baja a 2 o 3 minutos.

## Cuándo usarme

- "Carga estos leads en Airtable: <ruta del archivo>".
- "Crea una tabla nueva en Airtable para este scraping".
- Fase 2 de cualquiera de los dos pipelines de LinkedIn (invocada por el orquestador).
- Tienes una lista de leads en JSON de cualquier origen y quieres tenerlos en Airtable con el esquema estándar del pipeline.

## Conexiones que necesito

- **Airtable** (base de datos), obligatoria. Listo las bases, creo la tabla y cargo los registros usando la API REST de Airtable a través de Composio.

Si Airtable no está conectado, me detengo y te pido que la conectes desde la pestaña de Integraciones.

## Información que necesito

- **El archivo de origen con los leads**, obligatorio. Array JSON de objetos. Como mínimo cada fila necesita `profileUrl` y `fullName`. Opcionales: `headline`, `commentText`, `reactionCount`, `location`, `connectionsCount`, `experience`, `education`, `skills`. Si falta, pregunto: "¿Dónde está la lista de leads? Pásame una ruta a un archivo JSON o pega el array."
- **La base de Airtable**, obligatoria. Si tienes una sola base, la uso. Si tienes varias, te las listo y te pregunto cuál. Si falta, pregunto: "¿En qué base de Airtable creo la tabla nueva?"
- **Un nombre para la tabla**, opcional. Por defecto es `LinkedIn {sourceType} - {author} - {YYYY-MM-DD}` donde `sourceType` es "Commenters" o "Reactors". Puedes indicar otro por llamada si tienes una convención de nombres propia.

## El esquema de la tabla

Creo la tabla con estos campos. Los tipos de campo siguen las convenciones de la API REST de Airtable.

**Identificación del lead (siempre poblados por la carga):**
- `Full Name` (singleLineText)
- `Profile URL` (url)
- `Headline` (singleLineText)
- `Source Type` (singleSelect: "comment", "reaction")
- `Source Post URL` (url)
- `Source Author` (singleLineText)
- `Scraped At` (dateTime)

**Extras de origen comentario (poblados solo para scrapings de comentarios):**
- `Comment Text` (multilineText)
- `Reaction Count` (number)

**Extras de origen reacción (poblados solo para scrapings de reacciones):**
- `Location` (singleLineText)
- `Connections Count` (number)
- `Reaction Type` (singleSelect: "LIKE", "CELEBRATE", "LOVE", "INSIGHTFUL", "FUNNY", "SUPPORT")
- `Top Role` (singleLineText), el `experience[0]` más reciente, con formato "{role} at {company}"
- `Top School` (singleLineText), el `education[0].school` más reciente
- `Top Skills` (multipleSelects), las primeras 5 de `skills`

**Enriquecimiento (poblado por `apollo-enrichment`):**
- `Email` (email)
- `Email Confidence` (singleSelect: "verified", "guessed", "no-match")
- `Company` (singleLineText)
- `Title` (singleLineText)
- `Apollo Contact URL` (url)
- `Enriched At` (dateTime)

**Estado de la prospección (poblado por `instantly-campaign`):**
- `Loaded To Campaign` (singleLineText), nombre de la campaña en Instantly
- `Loaded At` (dateTime)
- `Reply Status` (singleSelect: "no-reply", "interested", "not-now", "not-relevant", "unsubscribed", "bounced"), lo actualizas tú manualmente, no yo

## Pasos

1. **Listar bases.** Llamo a "list bases" de Airtable vía Composio. Si hay una sola, la uso. Si hay varias y no me indicaste ninguna, te pregunto cuál.

2. **Crear la tabla.** Envío (POST) una tabla nueva a la base elegida con el esquema de arriba. El esquema varía un poco según el tipo de origen, si cada fila del archivo de origen tiene `commentText`, la trato como origen comentario; si cada fila tiene `experience`, la trato como origen reacción; en cualquier otro caso la trato como origen comentario (esquema más pequeño, opción más segura). Guardo el `baseId` y el `tableId` nuevos para el paso de carga.

3. **Dividir en lotes.** Divido la lista de origen en lotes de `ceil(N / 4)`. Cuatro lotes de tamaño aproximadamente igual.

4. **Carga en paralelo.** Despliego 4 agentes en paralelo, uno por lote. Cada agente recorre su lote y llama al endpoint `create record` de Airtable por cada fila (Airtable exige un registro por llamada sin importar cómo lo documente la API). Cada agente reporta su conteo de éxitos/fallos al terminar. Espero a que los 4 terminen.

5. **Verificar el número de registros cargados.** Vuelvo a consultar el conteo de filas en la tabla nueva. Si `loaded != expected`, registro la diferencia en `runs/{runId}/notes.md` (los `profileUrl` faltantes) para que sepas qué filas no entraron. Continúo, las cargas parciales siguen siendo útiles, la diferencia solo debe quedar visible.

6. **Escribir `airtable.md` en la carpeta del run.** Ruta: `runs/{runId}/airtable.md`. Contenido: enlace a la tabla nueva en la interfaz de Airtable, ID de la base, ID de la tabla, conteo esperado versus real de filas, lista de cualquier `profileUrl` que haya fallado.

7. **Agregar a `outputs.json`.** Una fila: `{type: "airtable-load", title: "{tableName}", summary: "{N} records loaded into Airtable. Base {baseId}.", path: "runs/{runId}/airtable.md", status: "ready", domain: "sources"}`.

8. **Resumir para ti.** Una línea: "Cargué {N} registros en la tabla de Airtable '{tableName}'. Ábrela en Airtable: <url>."

## Resultados

- Tabla nueva en Airtable en la base elegida, con el esquema completo del pipeline.
- `runs/{runId}/airtable.md`, enlace + IDs + diferencia de carga (si la hubo).
- `outputs.json`, una fila, `type: "airtable-load"`.

## Fallos comunes

| Fallo | Por qué | Solución |
|---|---|---|
| Error de límite de tokens en `list_records` | Airtable limita la tasa del endpoint de lectura | No uses la lista de registros para verificar el conteo, usa el campo `record_count` de la tabla, o pagina en lotes de 100 |
| Límite de lote excedido | Se intentaron crear 10 registros en una sola llamada | Airtable exige 1 registro por llamada de creación; el diseño de agentes en paralelo evita esto sin cambiar la forma de cada llamada |
| Discrepancia de tipo de campo al crear | La fila de origen tenía un valor para un singleSelect que no estaba en la lista de opciones | Recolecta de antemano los valores únicos del origen y agrégalos todos como opciones de singleSelect al crear la tabla, antes de la carga |
| Algunas filas se descartaron en silencio | Airtable las rechazó por un error de validación de campo | El paso de verificación del conteo en el paso 5 muestra la diferencia; actúa sobre los `profileUrl` faltantes manualmente |

## Lo que nunca hago

- **Fijar el ID de la base de Airtable de forma rígida.** Siempre lo descubro vía Composio en tiempo de ejecución.
- **Usar una carga en serie.** 500 registros en serie toman 8 a 10 minutos; el diseño de 4 agentes en paralelo es el estándar.
- **Modificar una tabla existente.** Cada ejecución del pipeline obtiene una tabla nueva. Si quieres fusionar en una tabla existente, eso es otra habilidad (no disponible por ahora).
- **Tocar el campo `Reply Status`.** Ese es tuyo (o de una integración Instantly → Airtable que hayas configurado por separado). Nunca lo escribo.

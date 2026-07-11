---
name: enriquecer-leads-con-apollo
title: "Enriquecer leads con Apollo"
description: "Busco emails verificados para una lista de leads usando el bulk match de Apollo (en lotes de 10), actualizo las filas de Airtable con email, empresa, cargo y ubicación, y creo contactos en Apollo bajo una etiqueta con nombre para que los leads aparezcan en tus flujos de trabajo del CRM de Apollo. Es la fase 3 de ambos pipelines, y se puede ejecutar de forma independiente si tienes una tabla de Airtable ya cargada por el cargador de leads."
version: 1
category: Prospección
featured: no
image: magnifying-glass-tilted-left
integrations: [airtable, apollo]
---


# Enriquecimiento con Apollo

Tomo una lista de leads en una tabla de Airtable y busco emails verificados para la mayor cantidad posible usando el endpoint de bulk match de Apollo. Actualizo las filas de Airtable directamente con email, empresa, cargo y ubicación, y creo contactos en Apollo bajo una etiqueta con nombre para que los leads lleguen a tus flujos de trabajo del CRM de Apollo. La tasa de coincidencia depende mucho de la audiencia, espera entre 50% y 70% en audiencias de fundadores/operadores en Estados Unidos, y menos en audiencias de consumo o fuera de Estados Unidos.

## Cuándo usarme

- "Enriquece estos leads con Apollo: <tabla de Airtable>".
- "Busca emails para las filas de esta tabla".
- Fase 3 de cualquiera de los dos pipelines de LinkedIn (invocada por el orquestador).
- Tienes una tabla de Airtable con `Profile URL`s cargados y quieres agregarles emails.

## Cuándo NO usarme

- Los leads todavía no están en Airtable, cárgalos primero con `airtable-lead-loader`.
- Solo quieres **leer** datos de Apollo, no modificar Airtable, esta habilidad escribe de vuelta en Airtable como parte de su contrato; si solo necesitas una búsqueda puntual en Apollo, hazla manualmente.

## Conexiones que necesito

- **Airtable** (base de datos), obligatoria. Leo las filas y luego escribo de vuelta los campos de enriquecimiento.
- **Apollo** (enriquecimiento), obligatoria. Uso el endpoint `apollo_people_bulk_match` y el endpoint `apollo_contacts_create` a través de Composio.

Si falta cualquiera de las dos, me detengo y te pido que la conectes.

## Información que necesito

- **El ID de la base de Airtable + el ID de la tabla**, obligatorio. Si se invoca desde un orquestador, ambos se pasan directamente. Si se invoca de forma independiente, listo las bases y tablas y pregunto cuál si hay alguna ambigüedad.
- **Una etiqueta de contacto de Apollo**, opcional. Por defecto es `LinkedIn {sourceType} - {sourceAuthor} Post`, derivada de los campos `Source Type` y `Source Author` de la tabla (toda fila de una tabla dada tiene el mismo origen). Puedes indicar otra por llamada.

## Pasos

1. **Extraer todos los registros.** Recorro la tabla de Airtable de 100 registros a la vez hasta terminar. Recolecto las filas donde `Email` está vacío (no vuelvo a enriquecer filas que ya tienen email). Guardo el `Profile URL`, `Full Name`, `Headline` de origen y el `record_id` de Airtable de cada fila.

2. **Dividir en grupos de 10.** El `apollo_people_bulk_match` de Apollo acepta hasta 10 búsquedas por llamada. Divido las filas aún no enriquecidas en lotes de 10.

3. **Bulk match en paralelo.** Despliego agentes en paralelo (4 a la vez, igual que el cargador) y llamo a `apollo_people_bulk_match` con cada lote. Por fila en la solicitud, envío `linkedin_url: profileUrl` como clave principal, más `name: fullName` como respaldo para el matcher de Apollo. Espero a que todas las llamadas terminen.

4. **Mapear resultados de vuelta a las filas de Airtable.** Apollo devuelve un array por llamada en el mismo orden de la solicitud. Por cada resultado:
   - **Se devolvió un email verificado**: fijo `Email`, `Email Confidence: "verified"`, `Company`, `Title`, `Location`, `Apollo Contact URL`, `Enriched At`.
   - **Se devolvió un email adivinado** (Apollo marca coincidencias de menor confianza): mismos campos, pero `Email Confidence: "guessed"`. La habilidad `instantly-campaign` descarta estos por defecto.
   - **Sin coincidencia**: solo fijo `Email Confidence: "no-match"`. Dejo `Email`, `Company`, `Title` vacíos.

5. **Actualizar Airtable por lotes.** Actualizo 10 registros por llamada de `update records` (el límite real de lote de Airtable para actualización, a diferencia de la creación). Despliego agentes de actualización en paralelo.

6. **Crear contactos en Apollo bajo la etiqueta.** Para toda fila que haya vuelto con un email verificado o adivinado, llamo a `apollo_contacts_create` con el ID de persona de Apollo del contacto y la etiqueta elegida. Apollo deduplica contactos por email, así que volver a ejecutar este paso sobre los mismos datos es idempotente.

7. **Volver a extraer las filas enriquecidas.** Recorro la tabla de nuevo, recolecto las filas donde `Email Confidence: "verified"`. Las guardo en `runs/{runId}/contacts.json` con la forma que espera `instantly-campaign`:

   ```jsonc
   {
     "firstName": "Jane",
     "fullName": "Jane Doe",
     "email": "jane@northwind.example",
     "company": "Northwind",
     "title": "VP Operations",
     "linkedinUrl": "https://www.linkedin.com/in/janedoe",
     "personalizationFields": {
       "topRole": "VP Operations at Northwind",
       "topSchool": "Stanford",
       "topSkills": ["Operations", "Process Design"]
     }
   }
   ```

   `personalizationFields` solo se puebla para tablas de origen reacción (donde el cargador escribió `Top Role`, `Top School`, `Top Skills`). Para tablas de origen comentario este objeto queda vacío.

8. **Actualizar `leads.json`.** Para cada fila enriquecida, busco el `profileUrl` correspondiente en `leads.json` y fijo `email`, `emailConfidence`, `company`, `title`, `location`, `enrichedAt`. Lectura, fusión y escritura de forma atómica.

9. **Agregar a `outputs.json`.** Una fila: `{type: "enrichment", title: "Apollo enrichment - {tableName}", summary: "Matched {M} of {N} ({M/N}% match rate). {V} verified emails ready for outreach.", path: "runs/{runId}/contacts.json", status: "ready", domain: "enrichment"}`.

10. **Resumir para ti.** Un bloque:
    - Total de filas procesadas.
    - Emails verificados encontrados (cantidad + porcentaje).
    - Emails adivinados encontrados (cantidad + porcentaje).
    - Cantidad sin coincidencia.
    - "Los emails verificados quedaron guardados para la siguiente fase. Los adivinados se quedan en Airtable para que los revises."

## Resultados

- Filas de Airtable actualizadas con email + empresa + cargo + ubicación + URL de Apollo + nivel de confianza.
- Contactos nuevos en Apollo bajo la etiqueta `LinkedIn {sourceType} - {sourceAuthor} Post`.
- `runs/{runId}/contacts.json`, contactos con email verificado listos para `instantly-campaign`.
- `leads.json`, campos de enriquecimiento actualizados en los `profileUrl` correspondientes.
- `outputs.json`, una fila, `type: "enrichment"`, `domain: "enrichment"`.

## Fallos comunes

| Fallo | Por qué | Solución |
|---|---|---|
| Tasa de coincidencia por debajo del 40% | La audiencia es mayormente de consumo, fuera de Estados Unidos, o de cargos junior (la base de datos de Apollo está sesgada hacia empresas) | Es normal para algunas audiencias; sigue adelante con lo que tienes |
| Faltan emails en la relectura de datos en caché | La lectura de Airtable devolvió una caché desactualizada | Espera 30 segundos y vuelve a paginar; si sigue faltando, las escrituras de actualización fallaron en silencio, revisa si hay errores de límite de tasa en las notas del run |
| Límite de tasa de Apollo en el bulk match | Demasiados agentes en paralelo para un plan pequeño de Apollo | Baja a 2 agentes en paralelo en vez de 4 |
| Apollo devuelve un 422 en `linkedin_url` | El formato de la URL no coincide con lo que espera Apollo (barra final, `/in/` versus `/pub/`) | Normaliza a `https://www.linkedin.com/in/<slug>` antes de enviar; quita las barras finales |

## Lo que nunca hago

- **Volver a enriquecer filas que ya tienen email.** Verifico que `Email` esté vacío antes de incluir una fila en los lotes de bulk match. Ahorra créditos de Apollo y evita sobrescribir datos buenos.
- **Cargar emails adivinados en la campaña de Instantly.** Los emails adivinados se quedan en Airtable para tu revisión. Solo los verificados llegan a `runs/{runId}/contacts.json`.
- **Enviar emails directamente a través de Apollo.** Los endpoints de envío de Apollo existen, pero las campañas en frío pertenecen a un remitente dedicado (Instantly) para el seguimiento de entregabilidad.
- **Fijar de forma rígida el formato de la etiqueta de Apollo o el nombre del endpoint de bulk match.** Todo se descubre vía Composio en tiempo de ejecución.

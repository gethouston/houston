---
name: extraer-comentarios-de-linkedin
title: "Extraer comentarios de LinkedIn"
description: "Extraigo a todas las personas que comentaron en una publicación de LinkedIn usando Apify. Obtengo nombres, titulares, URLs de perfil, el texto del comentario y el número de reacciones, elimino duplicados por URL de perfil, descarto los perfiles nulos, y guardo la lista en un archivo por cada ejecución. Es la fase 1 del pipeline de comentarios a prospección, pero también se puede ejecutar de forma independiente si solo necesitas la lista."
version: 1
category: Prospección
featured: no
image: chains
integrations: [apify, linkedin]
---


# Extractor de comentarios de LinkedIn

Extraigo a todas las personas que comentaron en una publicación de LinkedIn en una lista limpia y sin duplicados. Fase 1 del pipeline de comentarios a prospección, pero puedes ejecutarla de forma independiente si solo necesitas la lista (por ejemplo, como entrada para otra herramienta distinta más adelante).

## Cuándo usarme

- "Extrae a quienes comentaron en esta publicación de LinkedIn: <URL>".
- "Dame una lista de quién comentó en esta publicación".
- Quieres una lista limpia y sin duplicados de comentaristas para cualquier uso posterior, no necesariamente para prospección en frío.

## Cuándo NO usarme

- Quieres a quienes **reaccionaron** a una publicación (no comentaron), usa `linkedin-reaction-scraper`.
- Quieres el pipeline completo de principio a fin hasta Instantly, usa `linkedin-comment-to-outreach`.

## Conexiones que necesito

- **Apify** (scraping), obligatoria. Uso el actor `harvestapi/linkedin-post-comments`.

Si Apify no está conectado, me detengo y te pido que la conectes desde la pestaña de Integraciones.

## Información que necesito

- **La URL de la publicación de LinkedIn**, obligatoria. Si falta, pregunto: "¿Qué publicación de LinkedIn extraigo?"
- **Una cantidad objetivo de elementos**, opcional. Por defecto usa `defaultMaxItems` de tu contexto de prospección (500). Puedes indicar otra por llamada si solo quieres una prueba rápida.

## Pasos

1. **Validar la URL.** Confirmo que la URL sea de una publicación de LinkedIn (`linkedin.com/posts/...` o `linkedin.com/feed/update/...`). Rechazo URLs de perfil, de artículo, de empresa. Si la entrada es un enlace corto o una redirección, la sigo una vez para resolver la URL canónica de la publicación antes de extraer.

2. **Extracción de prueba.** Primera llamada al actor con `maxItems: 20` para confirmar que la publicación es accesible y que el actor devuelve la forma esperada. Si la extracción de prueba devuelve 0 elementos, me detengo y explico por qué (publicación eliminada, comentarios deshabilitados, bloqueo geográfico, inicio en frío del actor).

3. **Extracción completa.** Llamo al actor con `maxItems: {target}` (por defecto 500). Espero a que la ejecución termine. Apify suele tardar entre 2 y 5 minutos para la extracción completa.

4. **Deduplicar.** Agrupo los elementos crudos por `profileUrl`. Para duplicados dentro de una misma extracción (la misma persona comentó varias veces), me quedo con la fila que tenga el texto de `comment` más largo. Descarto filas donde `profileUrl` es nulo o donde `fullName` es nulo, esas son fallos de extracción, no leads reales.

5. **Guardar en archivo.** Escribo en `runs/{runId}/scrape.json` si se invoca desde un orquestador (el orquestador pasa el `runId`). Si se invoca de forma independiente, escribo en `runs/{YYYY-MM-DD}-{post-slug}/scrape.json`. Esquema por fila:

   ```jsonc
   {
     "profileUrl": "https://www.linkedin.com/in/janedoe",
     "fullName": "Jane Doe",
     "headline": "VP Operations at Northwind",
     "commentText": "Same pattern at every 200+ person company we look at.",
     "reactionCount": 14,
     "scrapedAt": "<ISO>"
   }
   ```

6. **Actualizar `leads.json`.** Para cada fila que sobrevive, la agrego a `leads.json` si el `profileUrl` es nuevo. Las filas existentes se mantienen igual, no sobrescribo su `email`/`company`/`title` porque pudieron haberse fijado en una ejecución de enriquecimiento anterior. Fijo `source: "linkedin-comment"`, `sourcePostUrl`, `sourceAuthor`, `scrapedAt`.

7. **Agregar a `outputs.json`.** Una fila: `{type: "scrape", title: "LinkedIn commenters - {author} post", summary: "{N} unique commenters scraped, deduped by profile URL.", path: "runs/{runId}/scrape.json", status: "ready", domain: "sources"}`.

8. **Resumir para ti.** Una línea: "Extraje {N} comentaristas únicos de la publicación de {author}. Guardado en tu carpeta de runs."

## Resultados

- `runs/{runId}/scrape.json`, lista de comentaristas sin duplicados.
- `leads.json`, comentaristas nuevos agregados (las filas existentes quedan intactas).
- `outputs.json`, una fila, `type: "scrape"`, `domain: "sources"`.

## Fallos comunes

| Fallo | Por qué | Solución |
|---|---|---|
| Solo 20 resultados devueltos en la extracción completa | Se me olvidó subir `maxItems` más allá del valor de prueba | Vuelve a ejecutar con `maxItems: 500` (o el valor por defecto de tu contexto) |
| El actor devuelve 0 elementos | Publicación eliminada, comentarios deshabilitados, bloqueo geográfico | Verifica la URL en un navegador, luego prueba con otra publicación si la original ya no existe |
| Todos los `profileUrl` son nulos | LinkedIn le sirvió al actor una vista de la publicación sin sesión iniciada | Espera de 5 a 10 minutos (calentamiento del actor) y vuelve a intentar |
| La misma persona aparece 5 veces en la salida cruda | Comentó 5 veces | El paso de deduplicación mantiene solo el comentario más largo por perfil |

## Lo que nunca hago

- **Fijar de forma rígida el ID del actor de Apify.** Lo busco vía Composio en tiempo de ejecución para que un actor distinto o una versión bifurcada funcionen sin cambiar código.
- **Deduplicar por `fullName`.** Personas distintas comparten nombres; `profileUrl` es la única clave segura.
- **Guardar el texto del comentario en `leads.json`.** Eso va solo en el archivo de extracción por ejecución, no en el índice de leads entre ejecuciones. Mantiene el índice pequeño y estable.

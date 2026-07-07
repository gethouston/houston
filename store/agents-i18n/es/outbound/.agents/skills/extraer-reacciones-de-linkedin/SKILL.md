---
name: extraer-reacciones-de-linkedin
title: "Extraer reacciones de LinkedIn"
description: "Extraigo a todas las personas que reaccionaron a una publicación de LinkedIn usando Apify con profileScraperMode=main, para que cada fila regrese con el perfil completo de LinkedIn: historial de experiencia, educación, habilidades, certificaciones, ubicación y número de contactos. Genera de 5 a 10 veces más leads que la extracción de comentarios, y con datos mucho más ricos por lead. Es la fase 1 del pipeline de reacciones a prospección, y también se puede ejecutar de forma independiente."
version: 1
category: Prospección
featured: no
image: link
integrations: [apify, linkedin]
---


# Extraer reacciones de LinkedIn

Extraigo a todas las personas que reaccionaron a una publicación de LinkedIn y armo una lista limpia y sin duplicados, con el perfil completo de LinkedIn adjunto a cada fila en un solo paso. Es la fase 1 del pipeline de reacciones a prospección, y también se puede ejecutar de forma independiente si solo necesitas la lista.

La gran ventaja frente a la extracción de comentarios: `profileScraperMode: "main"` hace que el actor devuelva directamente el historial de experiencia, la educación, las habilidades, las certificaciones, la ubicación y el número de contactos de quien reaccionó. No hace falta un segundo paso de enriquecimiento para los datos de perfil (el enriquecimiento de Apollo sigue siendo necesario para los correos verificados).

## Cuándo usarlo

- "Extrae a los que reaccionaron a esta publicación de LinkedIn: <URL>".
- "Sácame una lista de quién reaccionó a esta publicación, con sus perfiles".
- Quieres una lista limpia y sin duplicados de quienes reaccionaron, con datos de perfil ricos para cualquier uso posterior.

## Cuándo NO usarlo

- Quieres **comentaristas** (menor volumen, mayor intención por lead), usa `linkedin-comment-scraper`.
- Quieres el pipeline completo de principio a fin hasta Instantly, usa `linkedin-reaction-to-outreach`.

## Conexiones que necesito

- **Apify** (extracción) - Requerida. Uso el actor `harvestapi/linkedin-post-reactions` con `profileScraperMode: "main"`.

Si Apify no está conectado, me detengo y te pido que la conectes desde la pestaña de Integraciones.

## Información que necesito

- **La URL de la publicación de LinkedIn** - Requerida.
- **Una cantidad objetivo de elementos** - Opcional. Por defecto usa `defaultMaxItems` de tu contexto de prospección (500). Las extracciones de reacciones suelen llegar a 500+ en una publicación popular; súbelo si quieres cobertura completa de una publicación viral.

## Pasos

1. **Validar la URL.** Mismas reglas que en la extracción de comentarios: debe ser una URL de una publicación de LinkedIn. Rechazo URLs de perfil, artículo o empresa. Resuelvo enlaces cortos una sola vez.

2. **Prueba inicial.** Primera llamada al actor con `maxItems: 20` y `profileScraperMode: "main"`. Confirmo que la estructura incluya `experience`, `education`, `skills`, `connectionsCount`. Si faltan, el actor no recibió el flag de modo correcto, así que fallo de forma visible para que lo veas.

3. **Extracción completa.** Llamo al actor con `maxItems: {target}` (por defecto 500), `profileScraperMode: "main"`. La extracción de reacciones con perfiles completos toma más tiempo que la de comentarios, espera entre 5 y 15 minutos para 500 elementos.

4. **Deduplicar.** Agrupo por `profileUrl`. Descarto filas con `profileUrl` o `fullName` nulos (fallas de la extracción).

5. **Guardar en archivo.** Escribo en `runs/{runId}/scrape.json` si se llama desde el orquestador; si no, en `runs/{YYYY-MM-DD}-{post-slug}-reactions/scrape.json`. Esquema por fila:

   ```jsonc
   {
     "profileUrl": "https://www.linkedin.com/in/janedoe",
     "fullName": "Jane Doe",
     "headline": "VP Operations at Northwind",
     "location": "San Francisco, CA",
     "connectionsCount": 2840,
     "reactionType": "LIKE | CELEBRATE | LOVE | INSIGHTFUL | FUNNY | SUPPORT",
     "experience": [
       { "company": "Northwind", "role": "VP Operations", "startDate": "2024-03", "endDate": null },
       { "company": "Helios", "role": "Director of Ops", "startDate": "2021-01", "endDate": "2024-02" }
     ],
     "education": [
       { "school": "Stanford", "degree": "MBA", "endDate": "2020-06" }
     ],
     "skills": ["Operations", "Process Design", "RevOps", "Salesforce"],
     "certifications": [],
     "scrapedAt": "<ISO>"
   }
   ```

6. **Actualizar `leads.json`.** Agrego los nuevos `profileUrl` con `source: "linkedin-reaction"`, `sourcePostUrl`, `sourceAuthor`, `scrapedAt`. Las filas existentes se quedan igual (no piso el enriquecimiento de corridas anteriores).

7. **Agregar a `outputs.json`.** Una fila: `{type: "scrape", title: "LinkedIn reactors - {author} post", summary: "{N} unique reactors scraped with full profiles.", path: "runs/{runId}/scrape.json", status: "ready", domain: "sources"}`.

8. **Resumir para el usuario.** Una línea: "Extraje {N} reactores únicos de la publicación de {author} (con perfiles completos). Guardado en tu carpeta de runs."

## Salidas

- `runs/{runId}/scrape.json` - lista de reactores sin duplicados con perfiles completos.
- `leads.json` - nuevos reactores agregados.
- `outputs.json` - una fila, `type: "scrape"`, `domain: "sources"`.

## Fallas comunes

| Falla | Por qué | Solución |
|---|---|---|
| Solo 20 resultados en la extracción completa | Olvidé subir `maxItems` más allá del valor de prueba | Vuelve a correr con `maxItems: 500` |
| `experience`, `education`, `skills` todos vacíos | No se estableció `profileScraperMode: "main"` | Vuelve a correr con el flag activo; sin él el actor solo devuelve campos superficiales |
| La corrida tarda más de 30 minutos | Esta publicación tiene 1000+ reacciones | Puedes aceptar la espera o dividir por tipo de reacción en varias corridas |
| Todos los `profileUrl` son nulos | LinkedIn le sirvió al actor una vista sin sesión iniciada | Espera de 5 a 10 minutos y vuelve a intentar |

## Lo que nunca hago

- **Codificar de forma fija el ID del actor de Apify.** Lo busco en Composio en tiempo de ejecución.
- **Saltarme el flag `profileScraperMode: "main"`.** Sin él, desaparece toda la razón para usar esta extracción en vez de la de comentarios.
- **Guardar `experience` / `education` / `skills` en `leads.json`.** Esos datos van solo en el archivo de la corrida, no en el índice entre corridas. Los datos de perfil se vuelven viejos rápido; los dejo anclados a la corrida que los capturó.

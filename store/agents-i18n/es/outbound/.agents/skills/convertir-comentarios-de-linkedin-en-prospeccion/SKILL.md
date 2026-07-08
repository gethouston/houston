---
name: convertir-comentarios-de-linkedin-en-prospeccion
title: "Convertir comentarios de LinkedIn en prospección"
description: "Convierto la URL de una sola publicación de LinkedIn en una campaña de correo en frío en pausa dentro de Instantly. Extraigo a todas las personas que comentaron, las guardo en Airtable, busco sus emails verificados con Apollo, escribo contigo una secuencia de 3 correos, y luego cargo todo en Instantly. De principio a fin toma entre 30 y 60 minutos, la mayor parte en la redacción de los correos. Siempre queda en pausa para que la revises, nunca la lanzo de forma automática. Úsala para audiencias de mayor intención y menor volumen (comentar requiere esfuerzo)."
version: 1
category: Prospección
featured: yes
image: envelope-with-arrow
integrations: [apify, airtable, apollo, instantly, linkedin]
---


# Convertir comentarios de LinkedIn en prospección

Orquestador de principio a fin: entra la URL de una publicación de LinkedIn, sale una campaña de Instantly en pausa. Encadeno las cinco subhabilidades con un punto de control entre cada fase para que tú mantengas el control mientras el trabajo pesado ocurre automáticamente.

Úsala para **comentaristas** (mayor intención, menor volumen). Para quienes reaccionaron (5 a 10 veces más leads, con perfiles completos de LinkedIn adjuntos), usa en su lugar `linkedin-reaction-to-outreach`.

## Cuándo usarme

- "Ejecuta el pipeline de LinkedIn sobre esta publicación: <URL>".
- "Extrae y envía correos a estos comentaristas".
- "Prospección a partir de esta publicación de LinkedIn".
- Un ponente, competidor o líder de opinión publicó algo que le pega directo a tu perfil de cliente ideal, y quieres llegar a cada comentarista calificado en un solo movimiento.

## Cuándo NO usarme

- Buscas a personas que **reaccionaron** a una publicación, usa `linkedin-reaction-to-outreach`. Quienes reaccionan son de 5 a 10 veces más numerosos y traen datos de perfil más completos.
- Solo necesitas la lista de comentaristas, sin prospección, usa `linkedin-comment-scraper` directamente.
- Solo necesitas enriquecer una lista existente, usa `apollo-enrichment` directamente.
- Solo necesitas textos de correo en frío sin una fuente de leads, usa `cold-email-sequence` directamente.
- Ya tienes una lista verificada y los textos listos, usa `instantly-campaign` directamente.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de que esta habilidad corra, verifico que cada categoría de abajo esté conectada. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Apify** (scraping), para el actor de comentarios de LinkedIn. Obligatoria.
- **Airtable** (base de datos), para la tabla de seguimiento de leads. Obligatoria.
- **Apollo** (enriquecimiento), para emails verificados + empresa/cargo/ubicación. Obligatoria.
- **Instantly** (plataforma de envío), para la creación de la campaña y la carga de leads. Obligatoria.

Si falta cualquiera de las cuatro, me detengo en la primera que falte y te pido que la conectes. El pipeline no se ejecuta de forma parcial.

## Información que necesito

Leo primero tu contexto de prospección. Por cada campo obligatorio que falte te hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > URL > pegar texto) y espero.

- **La URL de la publicación de LinkedIn**, obligatoria. Por qué: es la entrada de la fase 1. Si falta, pregunto: "¿De qué publicación de LinkedIn extraigo a los comentaristas?"
- **Una base de Airtable**, obligatoria. Por qué: la fase 2 crea una tabla nueva dentro de una de tus bases existentes. Si falta, pregunto: "¿En qué base de Airtable creo la tabla de leads? Puedo listarte las que tienes."
- **Tu primer nombre como remitente + una línea sobre tu producto + al menos un punto de prueba social con números reales**, obligatorio para la fase 4. Por qué: escribo los correos en frío con tu voz; sin un punto de prueba real con números reales estaría inventando cosas, y eso es una forma rápida de quemar la campaña. Si falta, pregunto en la fase 4 (no ahora), así las primeras tres fases pueden correr en segundo plano.
- **Cuentas de envío de Instantly**, opcional. Por qué: por defecto conecto todas las cuentas de envío que tengas conectadas. Si quieres solo algunas específicas, dímelo de antemano.

## El pipeline

```
LinkedIn Post URL
       |
       v
[1. linkedin-comment-scraper]   Apify scrape, dedupe by profile URL
       |
       v
[2. airtable-lead-loader]       Create table, batch load with parallel agents
       |
       v
[3. apollo-enrichment]          Bulk match emails (batches of 10), update Airtable, create Apollo contacts
       |
       v
[4. cold-email-sequence]        Co-write 3 emails with you, one at a time, James Shields framework
       |
       v
[5. instantly-campaign]         Create campaign, sanitize bodies, load leads, attach accounts - PAUSED
       |
       v
Paused campaign ready for your review
```

## Pasos

1. **Validar entradas.** Confirmo que la URL sea de una publicación de LinkedIn (no un perfil, no un artículo), verifico las cuatro conexiones de Composio, leo `config/context-ledger.json`. Genero un `runId` con la forma `{YYYY-MM-DD}-{post-slug}` y creo `runs/{runId}/notes.md` para el diario de la ejecución.

2. **Fase 1, extraer comentaristas.** Llamo a `linkedin-comment-scraper` con la URL de la publicación. El resultado queda en `runs/{runId}/scrape.json`. Agrego el resumen a `runs/{runId}/notes.md`.

   **Punto de control.** Te digo: "Extraje {N} comentaristas únicos de la publicación de {author}. Sigo con Airtable."

3. **Fase 2, cargar en Airtable.** Llamo a `airtable-lead-loader` con `runs/{runId}/scrape.json` y el ID de la base elegida. El nombre de la tabla es `LinkedIn Commenters - {author} - {YYYY-MM-DD}`. Agrego el resumen a `runs/{runId}/notes.md` con el ID de la tabla y el conteo de la carga.

   **Punto de control.** Te digo: "Cargué {N} registros en Airtable. Empiezo el enriquecimiento con Apollo."

4. **Fase 3, enriquecer con Apollo.** Llamo a `apollo-enrichment` con la base de Airtable + el ID de la tabla. Resultado: filas de Airtable actualizadas con email + empresa + cargo + ubicación, y contactos de Apollo creados bajo la etiqueta `LinkedIn Comments - {author} Post`. Vuelvo a consultar las filas que llegaron con email verificado y las guardo en `runs/{runId}/contacts.json`. Agrego el resumen de la tasa de coincidencia a `runs/{runId}/notes.md`.

   **Punto de control.** Te digo: "Encontré emails para {M} de {N} comentaristas ({M/N}% de coincidencia). {M} contactos listos para la prospección. Sigo con la secuencia de correos."

5. **Fase 4, redactar la secuencia contigo.** Llamo a `cold-email-sequence`. Esta es la **fase interactiva**, trabajo contigo un correo a la vez, cerrando cada uno antes de pasar al siguiente. Guardo en `sequences/{runId}-sequence.md`. Agrego el resumen del cierre a `runs/{runId}/notes.md`.

   **Punto de control.** Te digo: "Secuencia cerrada. Cargándola en Instantly."

6. **Fase 5, crear la campaña de Instantly.** Llamo a `instantly-campaign` con `sequences/{runId}-sequence.md` y `runs/{runId}/contacts.json`. El nombre de la campaña es `LinkedIn - {author} - {short topic}`. Siempre en pausa. Agrego el ID de la campaña de Instantly y el resumen de la carga de leads a `runs/{runId}/notes.md`. Agrego una fila a `campaigns.json` con `status: "paused"`.

7. **Resumen final.** Un bloque corto para ti:
   - Nombre de la campaña + estado (pausada).
   - Cantidad de leads cargados.
   - Cuentas de envío conectadas.
   - Horario (lunes a viernes, 8 a 5 en tu zona horaria por defecto).
   - "Revísala en Instantly. Actívala cuando estés listo, yo no lo hago por ti."

## Resultados

- `runs/{runId}/scrape.json`, lista de comentaristas sin duplicados de la fase 1.
- `runs/{runId}/contacts.json`, contactos enriquecidos con Apollo con emails verificados (impulsa la carga en Instantly).
- `runs/{runId}/notes.md`, diario de la ejecución con puntos de control, conteos y decisiones.
- `sequences/{runId}-sequence.md`, secuencia de 3 correos cerrada.
- Tabla nueva en Airtable `LinkedIn Commenters - {author} - {date}` poblada con el esquema completo de seguimiento de leads.
- Etiqueta nueva de contacto en Apollo `LinkedIn Comments - {author} Post`.
- Campaña nueva en Instantly (en pausa) con todos los leads cargados y todas las cuentas de envío conectadas.
- `outputs.json`, una fila por cada artefacto de fase (scrape, airtable-load, enrichment, sequence, campaign).
- `leads.json`, una fila por cada lead que sobrevive (sin duplicados por `profileUrl` entre ejecuciones).
- `campaigns.json`, una fila para la campaña nueva en pausa.

## Lo que nunca hago

- **Lanzar la campaña.** Siempre queda en pausa al final de la fase 5. Tú das clic en Activar.
- **Saltarme el cierre por correo en la fase 4.** Cada correo lo revisas y apruebas tú antes de que yo pase al siguiente. Sin escritura en lote de los 3 a la vez.
- **Cargar en Instantly leads sin email verificado.** Las filas de Apollo sin coincidencia se quedan en Airtable para que decidas qué hacer con ellas más adelante.
- **Reanudar una ejecución parcialmente fallida adivinando.** Si la fase 3 falla a la mitad, me detengo y te digo exactamente qué filas de Airtable quedaron enriquecidas y cuáles no, para que decidas si retomar desde ahí o empezar de nuevo.
- **Fijar de forma rígida IDs de actores de Apify, IDs de bases de Airtable, etiquetas de Apollo, o IDs de campañas de Instantly.** Todo se descubre vía Composio en tiempo de ejecución.

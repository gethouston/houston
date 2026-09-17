---
name: convertir-reacciones-de-linkedin-en-prospeccion
title: "Convertir reacciones de LinkedIn en prospección"
description: "Es el mismo pipeline de principio a fin que la versión de comentarios, pero para las personas que reaccionaron a una publicación de LinkedIn. Genera de 5 a 10 veces más leads que los comentaristas, y la extracción devuelve perfiles completos de LinkedIn (experiencia, educación, habilidades, certificaciones, ubicación, número de contactos) en un solo paso. Es ideal para estrategias de audiencia más amplia donde buscas volumen y datos ricos para personalizar. Siempre queda en pausa para que la revises, nunca la lanzo de forma automática."
version: 1
category: Prospección
featured: yes
image: envelope-with-arrow
integrations: [apify, airtable, apollo, instantly, linkedin]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Convertir reacciones de LinkedIn en prospección

Orquestador de principio a fin: entra la URL de una publicación de LinkedIn, sale una campaña de Instantly en pausa. Misma cadena de cinco fases que `linkedin-comment-to-outreach`, pero yo extraigo **reactores** en vez de comentaristas.

¿Por qué reactores? Dos razones:

1. **Volumen** - los reactores suelen superar a los comentaristas de 5 a 10 veces. Una publicación con 30 comentaristas suele tener entre 200 y 500 reactores.
2. **Perfiles más ricos** - la extracción de reacciones devuelve el perfil completo de LinkedIn de cada persona (historial de experiencia, educación, habilidades, certificaciones, ubicación, número de contactos) directamente en una sola llamada a Apify. La extracción de comentarios solo devuelve campos superficiales. Esto eleva mucho el techo de personalización.

Compensación: reaccionar es una señal de menor esfuerzo que comentar. Estás cambiando intención por lead a cambio de volumen y profundidad de datos.

## Cuándo usarlo

- "Corre el pipeline de reacciones de LinkedIn en esta publicación: <URL>".
- "Extrae y envía un correo a todos los que reaccionaron a esta publicación".
- Una publicación está llegando ampliamente a tu perfil de cliente ideal y quieres cobertura máxima.
- Quieres datos de perfil completo de LinkedIn adjuntos a cada lead (para personalizar el cuerpo del correo, no solo el asunto).
- Prospección de audiencia de nicho: "contadores que reaccionaron a una publicación sobre planeación fiscal", "fundadores que reaccionaron a un hilo sobre levantamiento de capital".

## Cuándo NO usarlo

- Solo quieres **comentaristas** (mayor intención por lead), usa `linkedin-comment-to-outreach`.
- Solo necesitas la lista de reactores, sin prospección, usa `linkedin-reaction-scraper` directamente.
- Solo necesitas enriquecer una lista existente, usa `apollo-enrichment` directamente.
- Ya tienes una lista verificada y la copy lista, usa `instantly-campaign` directamente.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta skill reviso que cada categoría de abajo esté conectada. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Apify** (extracción) - para el actor de reacciones de LinkedIn (con `profileScraperMode: "main"`). Requerida.
- **Airtable** (base de datos) - para la tabla de seguimiento de leads. Requerida.
- **Apollo** (enriquecimiento) - para correos verificados + empresa / puesto / ubicación. Requerida.
- **Instantly** (plataforma de envío) - para crear la campaña y cargar los leads. Requerida.

Si falta alguna de las cuatro, me detengo en la primera que falte y te pido que la conectes. El pipeline no corre de forma parcial.

## Información que necesito

Primero leo tu contexto de prospección. Por cada campo requerido que falte, hago UNA pregunta en lenguaje sencillo y espero.

- **La URL de la publicación de LinkedIn** - Requerida. Por qué: es la entrada de la fase 1.
- **Una base de Airtable** - Requerida. Por qué: la fase 2 crea una tabla nueva dentro de una de tus bases.
- **Tu nombre de remitente + una línea sobre tu producto + al menos un dato de prueba social con números reales** - Requerido para la fase 4. Se pregunta en ese momento, no ahora.
- **Cuentas de envío de Instantly** - Opcional. Por defecto usa "todas las conectadas".

## El pipeline

```
URL de publicación de LinkedIn
       |
       v
[1. linkedin-reaction-scraper]  Extracción con Apify con profileScraperMode=main, deduplicado por URL de perfil
       |
       v
[2. airtable-lead-loader]       Crea la tabla con el esquema específico de reacciones, carga por lotes
       |
       v
[3. apollo-enrichment]          Empareja correos en masa (lotes de 10), actualiza Airtable, crea contactos en Apollo
       |
       v
[4. cold-email-sequence]        Coescribe 3 correos contigo, aprovechando los datos ricos de perfil
       |
       v
[5. instantly-campaign]         Crea la campaña, sanitiza los cuerpos, carga los leads, adjunta cuentas - EN PAUSA
       |
       v
Campaña en pausa lista para tu revisión
```

## Pasos
<!-- houston-workflow:v1 -->

1. **Validar entradas.** Reviso que la URL sea de una publicación de LinkedIn, confirmo las cuatro conexiones de Composio, leo `config/context-ledger.json`. Genero un `runId` con la forma `{YYYY-MM-DD}-{post-slug}-reactions` y creo `runs/{runId}/notes.md`.

2. **Fase 1 - Extraer reactores.** Llamo a `linkedin-reaction-scraper` con la URL de la publicación y `profileScraperMode: "main"` para que el resultado incluya perfiles completos. El resultado queda en `runs/{runId}/scrape.json`. Agrego el resumen a `runs/{runId}/notes.md`.

   **Punto de control.** Le digo al usuario: "Extraje {N} reactores únicos de la publicación de {author} (con perfiles completos). Seguimos con Airtable."

3. **Fase 2 - Cargar a Airtable.** Llamo a `airtable-lead-loader` con `runs/{runId}/scrape.json` y el ID de la base elegida. Uso el **esquema de reacciones**, que tiene columnas adicionales para `experienceTopRole`, `educationTopSchool`, `topSkills`, `connectionsCount`. El nombre de la tabla es `LinkedIn Reactors - {author} - {YYYY-MM-DD}`. Agrego el resumen a `runs/{runId}/notes.md` con el ID de la tabla y el conteo cargado.

   **Punto de control.** Le digo al usuario: "Cargué {N} registros en Airtable con datos de perfil completos. Iniciando el enriquecimiento con Apollo."

4. **Fase 3 - Enriquecer con Apollo.** Llamo a `apollo-enrichment` con la base y el ID de tabla de Airtable. Igual que en el pipeline de comentarios: emparejo en masa por lotes de 10, actualizo las filas de Airtable, creo contactos en Apollo bajo la etiqueta `LinkedIn Reactions - {author} Post`. Guardo las filas con correo verificado en `runs/{runId}/contacts.json`. Agrego el resumen de la tasa de coincidencia.

   **Punto de control.** Le digo al usuario: "Encontré correos para {M} de {N} reactores ({M/N}% de coincidencia). {M} contactos listos para prospección. Seguimos con la secuencia de correos."

5. **Fase 4 - Coescribir la secuencia.** Llamo a `cold-email-sequence` con un indicador de que hay datos de perfil disponibles. El generador de la secuencia usa `experienceTopRole` + `educationTopSchool` + `topSkills` para sugerir marcadores de personalización a nivel de cuerpo (por ejemplo, "vi que estás enfocado en {topSkill}"), pero las reglas de James Shields siguen aplicando: el asunto es la única personalización garantizada como real, el cuerpo usa `{{firstName}}` y como máximo UN campo de plantilla por correo. Guardo en `sequences/{runId}-sequence.md`.

   **Punto de control.** Le digo al usuario: "Secuencia cerrada. Cargando en Instantly."

6. **Fase 5 - Crear la campaña de Instantly.** Llamo a `instantly-campaign` con `sequences/{runId}-sequence.md` y `runs/{runId}/contacts.json`. El nombre de la campaña es `LinkedIn Reactions - {author} - {short topic}`. Siempre en pausa. Agrego el ID de la campaña de Instantly y el resumen de carga de leads. Agrego una fila a `campaigns.json` con `status: "paused"`.

7. **Resumen final.** Un bloque corto para el usuario:
   - Nombre de la campaña + estado (en pausa).
   - Cantidad de leads cargados.
   - Cuentas de envío adjuntas.
   - Horario (lunes a viernes, 8 a 5 en tu zona horaria por defecto).
   - "Revísala en Instantly. Actívala cuando estés listo, yo no lo hago por ti."

## Salidas

- `runs/{runId}/scrape.json` - lista de reactores sin duplicados con perfiles completos.
- `runs/{runId}/contacts.json` - contactos enriquecidos por Apollo con correos verificados.
- `runs/{runId}/notes.md` - bitácora de la corrida.
- `sequences/{runId}-sequence.md` - secuencia de 3 correos cerrada.
- Nueva tabla de Airtable `LinkedIn Reactors - {author} - {date}` con el esquema de reacciones.
- Nueva etiqueta de contacto en Apollo `LinkedIn Reactions - {author} Post`.
- Nueva campaña de Instantly (en pausa).
- `outputs.json`, `leads.json`, `campaigns.json` - filas de índice.

## Lo que nunca hago

- **Lanzar la campaña.** Siempre queda en pausa.
- **Saltarme el bloqueo por correo en la fase 4.** Cada correo se aprueba antes de pasar al siguiente.
- **Sobrepersonalizar el cuerpo usando campos de perfil viejos o pobres.** La experiencia del perfil puede tener años de antigüedad; la trato como una pista, no como un hecho confirmado. Si `experienceTopRole` tiene más de 3 años o dice "Open to work" como marcador, la elimino del conjunto de personalización para ese lead.
- **Enviar leads sin correo verificado a Instantly.**
- **Codificar de forma fija IDs de actores de Apify, IDs de bases de Airtable, etiquetas de Apollo, IDs de campañas de Instantly.**

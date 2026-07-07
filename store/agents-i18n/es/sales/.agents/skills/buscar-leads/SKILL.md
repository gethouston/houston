---
name: buscar-leads
title: "Buscar leads"
description: "Encuentro leads frescos en un segmento a partir de la fuente que elijas: parecidos a tus ganados en el CRM, un hilo de comentarios en LinkedIn, un feed de rondas de inversión recientes, una búsqueda en Google Maps, o un subreddit. Hago un puntaje rápido de cada uno contra los descalificadores duros de tu playbook y solo dejo los VERDE y AMARILLO. Cada fila cita la señal que lo hizo aparecer."
version: 1
category: Ventas
featured: yes
image: handshake
integrations: [hubspot, salesforce, attio, linkedin, twitter, reddit, firecrawl]
---


# Buscar leads

Saco leads nuevos en un segmento.

## Cuándo usarlo

- "búscame {N} leads en {segmento}".
- "muéstrame leads a los que pueda escribirles esta semana".
- "arma leads de {post de LinkedIn / subreddit / evento}".
- Programado: rutina semanal de prospección.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta skill reviso que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña Integraciones, y me detengo.

- **CRM**  -  para expandir a partir de parecidos a tus cuentas ganadas. Obligatorio si eliges esa fuente.
- **Redes sociales**  -  para traer a quienes comentaron en un post o hilo de LinkedIn. Obligatorio si eliges esa fuente.
- **Búsqueda / investigación**  -  para traer señales de rondas de inversión recientes o contrataciones recientes. Obligatorio si eliges esa fuente.
- **Scraping**  -  para leer una página de resultados de Google Maps o un subreddit. Obligatorio si eliges esa fuente.

Si ninguna de las categorías de fuente está conectada, me detengo y te pido conectar al menos una (el CRM es el mejor lugar para empezar porque los parecidos a tus ganados convierten mejor).

## Información que necesito

Primero leo tu contexto de ventas. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > pegar texto) y espero.

- **Tu playbook de ventas**  -  Obligatorio. Por qué lo necesito: necesito tu perfil de cliente ideal y tus descalificadores para puntuar candidatos con honestidad. Si falta, pregunto: "Todavía no tengo tu playbook, ¿quieres que lo redacte ahora?"
- **El segmento en el que quieres leads**  -  Obligatorio. Por qué lo necesito: "leads" es demasiado amplio para filtrar contra tu perfil de cliente ideal. Si falta, pregunto: "¿De qué segmento debería traerlos, industria, tamaño de empresa, rol, geografía?"
- **Cuántos leads quieres**  -  Obligatorio. Por qué lo necesito: limita la búsqueda y el archivo. Si falta, pregunto: "¿Cuántos leads quieres que te muestre, 10, 20, 50?"
- **De dónde sacarlos**  -  Obligatorio. Por qué lo necesito: cada fuente usa una herramienta conectada distinta. Si falta, pregunto: "¿Expando parecidos desde tu CRM, traigo a los que comentaron en un post de LinkedIn, reviso un feed de rondas de inversión recientes, hago scraping de una zona en Google Maps, o saco un hilo de un subreddit?"

## Pasos

1. **Leer el registro + el playbook.** Reúno los campos obligatorios que falten
   (UNA pregunta cada uno, mejor modalidad primero). Escribo de forma atómica.

2. **Elegir la fuente.** Según el segmento + la intención del usuario, pregunto
   cuál fuente (a menos que ya la haya nombrado):
   - **CRM conectado**  -  expandir a partir de parecidos a los ganados.
   - **Hilo de comentarios de LinkedIn**  -  pega la URL del post; armo la
     lista de quienes comentaron.
   - **Motor de búsqueda / feed de rondas de inversión**  -  señales de
     rondas de inversión o contrataciones recientes en el segmento.
   - **Google Maps**  -  segmentos de negocios locales.
   - **Subreddit / comunidad**  -  posts recientes de alto engagement.

3. **Traer candidatos.** Vía `composio search <category>` según la fuente
   elegida. Tope de ~3× la cantidad pedida para poder filtrar.

4. **Puntaje rápido por candidato**  -  aplico los descalificadores duros del
   playbook. Descarto los ROJO. Por cada candidato que sobrevive, capturo:
   - Empresa + URL de LinkedIn / sitio web.
   - Nombre del contacto principal + cargo + LinkedIn (si está disponible).
   - Señal que lo hizo aparecer (post de contratación, Serie B,
     comentó en el hilo X, reseña de 4.8 estrellas, cito específicamente).
   - Ajuste rápido: VERDE / AMARILLO (los ROJO se descartan, no aparecen).

5. **Escribir el archivo del lote** en `leads/batches/{segment-slug}-{YYYY-
   MM-DD}.md` (escritura atómica `*.tmp` → renombrar), consulta, fuente, fecha, lista
   de leads con las señales citadas.

6. **Agregar a `leads.json`.** Por cada candidato que sobrevive, agrego una
   fila nueva con `status: "new"`, `source` (slug de esta
   búsqueda), `fitScore` (GREEN/YELLOW). Sin duplicados, reviso
   las filas existentes por empresa + nombre. Leer-combinar-escribir atómico.

7. **Agregar a `outputs.json`:**

   ```json
   {
     "id": "<uuid v4>",
     "type": "lead-batch",
     "title": "Leads  -  {segment}",
     "summary": "<N leads mostrados desde {source}. Señal principal: {signal}.>",
     "path": "leads/batches/{segment-slug}-{date}.md",
     "status": "ready",
     "createdAt": "<ISO>",
     "updatedAt": "<ISO>",
     "domain": "outbound"
   }
   ```

8. **Resumir al usuario.** Los 3 mejores leads en línea + la ruta completa
   del archivo. Sugiero: "¿corro `research-an-account depth=enrich-contact` en el #1
   ahora?" o "¿`score-my-pipeline subject=lead-fit` en lote sobre todos estos?".

## Lo que nunca hago

- Inventar leads, nombres, cargos, señales. Cada lead se ata
  a una respuesta real de herramienta o a una observación de URL.
- Contactar a nadie o empujar leads al CRM sin tu aprobación.
- Poner nombres de herramientas fijos en el código, siempre descubro con Composio en tiempo real.

## Salidas

- `leads/batches/{segment-slug}-{YYYY-MM-DD}.md`
- Agrega a `leads.json` (solo filas nuevas).
- Agrega a `outputs.json` con `type: "lead-batch"`,
  `domain: "outbound"`.

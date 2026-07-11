---
name: vigilar-a-mis-competidores
title: "Vigilar a mis competidores"
description: "Sigo de cerca lo que hacen tus competidores y si algo de eso realmente importa. Elige qué vigilar: sus movimientos de producto y cambios de mensaje, los anuncios que están corriendo, o publicaciones en tu feed que valen la pena aprovechar. Amenazas reales frente a ruido, no un volcado de noticias."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [linkedin, twitter, reddit, instagram, googleads, metaads, firecrawl]
---


# Vigilar a mis competidores

Una skill, tres fuentes de señal. El parámetro `source` elige la sonda. Juicio basado en posicionamiento + "nunca inventar citas" compartido en todas.

## Parámetro: `source`

- `product`  -  blog + notas de lanzamiento + página de inicio / precios vía Firecrawl; análisis a fondo de un solo competidor O digest semanal de N competidores.
- `ads`  -  Meta Ad Library + LinkedIn Ad Library + Google Ads Transparency Center vía scrape de Composio; extraer ángulos, ganchos, audiencias, qué es nuevo esta semana.
- `social-feed`  -  timeline / subreddit / menciones filtradas por relevancia temática + oportunidad de interacción (LinkedIn / X / Reddit / Instagram).

Si nombras la fuente en lenguaje simple ("análisis a fondo de un competidor", "qué anuncios está corriendo Ramp", "revisa mi timeline de X") -> infiero. Si es ambiguo, hago UNA pregunta nombrando las 3 opciones.

## Cuándo usarla

- Explícito: "pulso semanal de competidores", "análisis a fondo de {X}", "qué anuncios está corriendo {Y}", "revisa mi timeline", "señal de Reddit en {subreddit}", "menciones en IG".
- Implícito: después de `plan-a-campaign` (paid / launch) cuando el posicionamiento de un competidor afecta los ángulos; antes de `write-a-post` con channel=reddit para sacar a la luz hilos exactos que valga la pena responder.

## Conexiones que necesito

Ejecuto trabajo externo a través de Composio. Antes de correr esta skill reviso que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Scrape web (Firecrawl)**  -  opcional para `product`. Si no está conectada, recurro a una búsqueda HTTP básica en el blog / changelog / precios / página de inicio del competidor, más tosco pero funcional en páginas estáticas.
- **Bibliotecas de anuncios (Meta Ads, LinkedIn Ads, Google Ads)**  -  extraer el creativo de anuncios en vivo de la competencia. Requerido para `ads`, sin alternativa útil, las bibliotecas restringen el acceso.
- **Plataformas sociales (LinkedIn, X, Reddit, Instagram)**  -  leer tu timeline o el subreddit nombrado. Requerido para `social-feed`, elige la plataforma en la que realmente vives, sin alternativa, restringida por OAuth.

Si `ads` o `social-feed` requiere una conexión que no está ahí, me detengo. Para `product`, el scrape es el único requisito y la búsqueda HTTP básica me permite seguir.

## Información que necesito

Primero leo tu contexto de marketing. Por cada campo requerido que falte, te hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > subir archivo > URL > pegar texto) y espero.

- **Tu posicionamiento**  -  Requerido para cada fuente. Por qué lo necesito: me da tu lista de competidores y los diferenciadores contra los que juzgo las amenazas. Si falta, pregunto: "¿Quieres que redacte tu posicionamiento primero? Es una skill, toma unos cinco minutos."
- **Tu cliente ideal**  -  Requerido. Por qué lo necesito: filtra qué señales de competidores realmente importan para tu comprador. Si falta, pregunto: "¿Quién es el cliente que estás tratando de conquistar? Un párrafo está bien, o apúntame a tu CRM."
- **Tus plataformas sociales y temas**  -  Requerido para `social-feed`. Por qué lo necesito: me dice qué feed revisar y qué cuenta como relevante. Si falta, pregunto: "¿En qué plataformas publicas, y qué temas quieres que rastree en tu feed?"

## Pasos

1. **Leer el registro + el posicionamiento.** Extraer la lista de competidores nombrados + nuestros diferenciadores + las 2-3 principales objeciones del cliente ideal. Reunir los campos requeridos faltantes (UNA pregunta cada uno).
2. **Determinar el modo + la lista objetivo.**
   - `product`: si nombraste uno -> análisis a fondo; "pulso semanal" o varios -> digest (por defecto top 3 del posicionamiento).
   - `ads`: si nombraste uno -> ese competidor; si no, top 3 del posicionamiento. Revisar `competitor-briefs/` previos para ver diferencias.
   - `social-feed`: analizar tu pedido, "mi timeline" -> X, "mi feed de LinkedIn" -> LinkedIn, "{subreddit}" -> Reddit, "menciones en IG" -> Instagram. Plataforma primaria por defecto desde `domains.social.platforms`. Ventana: últimas 24-48h con tope de ~50 publicaciones salvo que especifiques.
3. **Descubrir herramientas vía Composio.** Correr las llamadas de `composio search` apropiadas:
   - `product` -> `web-scrape` (página de inicio / blog / changelog), `web-search` (noticias / financiamiento), opcionalmente `seo-intel`, opcionalmente `ad-intel`.
   - `ads` -> herramientas de biblioteca / inteligencia de anuncios (Meta Ad Library, LinkedIn Ad Library, Google Ads Transparency) + `web-scrape` como respaldo.
   - `social-feed` -> herramienta de lectura de feed / top posts / menciones de la plataforma.
   Si la categoría necesaria no está conectada, anotarlo en el brief ("sin conexión de ad-intel, actividad de anuncios: DESCONOCIDO") y continuar, o (social-feed cuando la fuente ES la plataforma) nombrar la categoría a conectar y detenerse.
4. **Ramificar según `source`.**
   - `product` (digest de últimos 7 días, análisis a fondo de últimos 30): por competidor reunir **sitio / mensaje** (hero de la página de inicio, copy cambiado), **producto / changelog** (funciones nuevas, cambios de precios), **contenido** (blog reciente, podcasts, newsletters), **SEO** (ganancias / pérdidas de ranking en palabras clave relevantes al posicionamiento, si está conectado), **social / noticias** (financiamiento, contrataciones, lanzamientos). Comparar contra nuestro posicionamiento, cada señal preguntando: ¿amenaza NUESTROS diferenciadores? ¿Abre un vacío que NOSOTROS podemos atacar? Citar textualmente lado a lado (copy del competidor vs. copy de nuestro documento de posicionamiento).
   - `ads`: de cada anuncio extraído sacar plataforma + formato, titular + texto principal (textual), CTA, audiencia inferida, ángulo inferido (dolor / estatus / urgencia / prueba social / centrado en función / centrado en precio), duración estimada de la corrida. Sintetizar: ángulo(s) dominante(s), dolores nombrados (textuales), diferenciadores reclamados, mezcla de formatos creativos, diferencias contra pulsos previos.
   - `social-feed`: cada publicación juzgada por **relevancia temática** (¿toca `domains.social.topics`? alta / media / ninguna), **oportunidad de interacción** (¿aporta valor real, desacuerdo sustancial, pregunta aguda, experiencia específica? ¿o basta con un like?), **riesgo** (marcar contenido político / personal / fuera de marca). Conservar 5-10 publicaciones de alto valor. Redactar respuestas sugeridas de 1-3 oraciones para las 3-5 principales, en la voz del registro.
5. **Llamados a la acción de oportunidad.** En cada fuente, sacar a la luz movimientos concretos:
   - `product` -> movimientos recomendados etiquetados con la skill del agente que los ejecuta (por ejemplo, `[write-a-post:blog]`, `[plan-a-campaign:paid]`, `[write-my-page-copy:landing]`).
   - `ads` -> ángulos que les faltan y que nuestro posicionamiento posee, reclamos para contrarrestar en nuestra landing page, patrones creativos para probar (entregar a `plan-a-campaign:paid` o a generación de contenido).
   - `social-feed` -> lista corta de "también vale un like" + la publicación top-1 para responder primero.
6. **Escribir** de forma atómica a:
   - análisis a fondo de `product`: `competitor-briefs/product-{competitor-slug}-{YYYY-MM-DD}.md`
   - digest de `product`: `competitor-briefs/product-weekly-{YYYY-MM-DD}.md`
   - `ads`: `competitor-briefs/ads-{competitor-slug}-{YYYY-MM-DD}.md`
   - `social-feed`: `competitor-briefs/social-feed-{platform}-{YYYY-MM-DD}.md`
   Cada afirmación se vincula a una URL + marca de tiempo, o se marca DESCONOCIDA.
7. **Agregar a `outputs.json`**  -  leer, fusionar y escribir de forma atómica:
   `{ id (uuid v4), type: "competitor-brief", title, summary, path,
   status: "draft", createdAt, updatedAt }`.
8. **Resumir para ti.** Un párrafo:
   - `product` -> mayor amenaza + mayor oportunidad + 1 movimiento para esta semana + ruta.
   - `ads` -> ángulo dominante que están empujando + una oportunidad para nosotros + ruta.
   - `social-feed` -> N publicaciones de alta señal + la principal + ruta.

## Lo que nunca hago

- Inventar titulares de anuncios, citas de competidores, conteos de publicaciones, estadísticas de interacción. Cada afirmación textual se vincula a una extracción real. Si la herramienta no devolvió nada, lo digo.
- Responder / publicar / enviar mensajes directos en tu nombre. Solo borradores.
- Codificar nombres de herramientas de forma fija. Descubrimiento vía Composio solo en tiempo de ejecución.

## Resultados

- `competitor-briefs/{source}-{slug-or-date}.md`
- Agrega una entrada a `outputs.json` con type `competitor-brief`.

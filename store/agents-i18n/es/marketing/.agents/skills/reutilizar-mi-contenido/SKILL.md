---
name: reutilizar-mi-contenido
title: "Reutilizar mi contenido"
description: "Convierto algo que ya tienes en algo nuevo. Dame un artículo de blog, un video de YouTube, un artículo, o una publicación de un competidor, y dime el formato al que quieres llegar. Lo transformo para el nuevo canal con tu voz. Sin plagio, sin volverlo genérico."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [linkedin, twitter, youtube, firecrawl]
---


# Reutilizar Mi Contenido

## Cuándo usarlo

- Explícito: "convierte este artículo de blog en publicaciones de LinkedIn", "reutiliza este video de YouTube en un borrador de blog", "arma un hilo de X con este artículo", "saca ideas compartibles de {URL}".
- Implícito: después de que `write-a-post` publica una entrada grande, el founder pide derivados para redes.
- Muchas combinaciones origen × destino, se elige el formato de forma dinámica según lo que pida el usuario.

## Conexiones que necesito

Hago el trabajo externo a través de Composio. Antes de correr esta skill reviso que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Extracción web (Firecrawl)**, opcional cuando el origen es una URL. Si no está conectado, uso una extracción HTTP básica de respaldo, más tosca pero funciona en artículos de blog y páginas estáticas.
- **YouTube**, para traer la transcripción y los metadatos. Necesario cuando el origen es un video de YouTube, no hay respaldo, las transcripciones necesitan la API.
- **Plataformas sociales (LinkedIn, X)**, opcional, solo si el origen es una publicación en alguna de ellas.

Si el origen es un video de YouTube y YouTube no está conectado, me detengo. Para un origen tipo URL, sigo con la extracción HTTP básica y aviso si la página tiene tanto JavaScript que el resultado queda escaso.

## Información que necesito

Primero leo tu contexto de marketing. Por cada campo requerido que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Tu posicionamiento y voz**, Necesario. Por qué lo necesito: el contenido reutilizado tiene que sonar como tú, no como el autor original. Si falta, pregunto: "¿Quieres que primero redacte tu posicionamiento? Es una skill, toma unos cinco minutos. Y conecta tu bandeja de enviados para que pueda tomar una muestra de tu voz."
- **El origen**, Necesario. Si falta, pregunto: "¿Qué voy a reutilizar? Pega la URL, suelta el enlace de YouTube, o pega el texto del artículo."
- **El formato destino**, Necesario. Si falta, pregunto: "¿En qué quieres que lo convierta, cinco publicaciones de LinkedIn, un hilo de X, un newsletter, un borrador de blog, o una lista de ideas compartibles?"

## Pasos

1. **Leer el documento de posicionamiento**: `context/marketing-context.md`. Si falta, me detengo y le digo al usuario que corra `set-up-my-marketing-info` primero. La voz y el posicionamiento son la base del contenido reutilizado.
2. **Leer configuración**: `config/site.json` y `config/tooling.json`.
3. **Interpretar origen + destino** a partir de lo que pide el usuario. El origen puede ser:
   - URL de blog/artículo → traer vía `composio search web` o herramienta de extracción.
   - URL de YouTube → correr `composio search youtube` para encontrar la herramienta de transcripción; traer transcripción + metadatos.
   - Texto de artículo o transcripción pegado.
   - URL de blog de un competidor (reutilización legal: idea + crédito).
4. **Ingerir el origen.** Traer el texto completo (o la transcripción). Extraer:
   - Tesis / argumento central.
   - 5-10 ideas distintas.
   - Frases citables.
   - Ejemplos / cifras concretas.
5. **Transformar al formato destino.** Aplicar la plantilla correcta:
   - **Publicaciones de LinkedIn** (por defecto: 5 variantes), gancho + valor + CTA; cada una menor a 1300 caracteres; una cita o dato destacado por publicación.
   - **Hilo de X**, 1 tuit gancho + 6-12 tuits de cuerpo; cada uno ≤ 280 caracteres; CTA de cierre del hilo.
   - **Newsletter**, asunto + preheader + cuerpo de 300-600 palabras + CTA claro.
   - **Borrador de blog**, estructura H1/H2 que coincida con `write-a-post` (más corto, 800-1200 palabras para YouTube → blog).
   - **Ideas compartibles**, lista de tarjetas de ideas con viñetas, cada una con cita e idea en una línea.
   Igualar la voz del documento de posicionamiento; sin volverlo genérico.
6. **Escribir** en `repurposed/{source-slug}-to-{target}.md` de forma atómica. Front-matter: sourceUrl, sourceType, targetFormat, status.
7. **Agregar a `outputs.json`**, `{ id, type: "repurposed", title, summary, path, status: "draft", createdAt, updatedAt }`.
8. **Devolver el contenido en el chat.** Siempre pegar el contenido reutilizado completo en la respuesta del chat, no solo un resumen. El usuario debe poder leer, copiar y compartir el borrador sin abrir ningún archivo. Formato:
   - Una línea de introducción diciendo qué se hizo (por ejemplo, "Aquí está el borrador de blog." / "Aquí están las 5 publicaciones de LinkedIn." / "Aquí está el hilo de X.").
   - Contenido completo, renderizado en markdown, con cada variante claramente separada (`---` entre publicaciones de LinkedIn, tuits numerados en un hilo, cuerpo completo para un blog).
   - Para resultados con múltiples variantes (LinkedIn, titulares, copy de anuncios), etiquetar cada variante (`**Publicación 1**`, `**Publicación 2**`, …).
   - Terminar con una línea de cierre breve, una oración sobre el gancho más fuerte o el ángulo que se usó, y una invitación a refinar ("¿Quieres que ajuste alguna, cambie el ángulo, o agregue más variantes?").
   - Nunca responder solo con una ruta de archivo o "guardado en tus borradores", el contenido siempre va en el chat mismo.

## Nunca invento

Si el origen no lo dice, no lo pongo en la pieza reutilizada. Al reescribir una publicación de un competidor (reutilización legal): dar crédito explícito a la fuente y transformar el enfoque de manera notoria, nunca plagiar.

## Resultados

- `repurposed/{source-slug}-to-{target}.md`
- Agrega a `outputs.json` con el tipo `repurposed`.

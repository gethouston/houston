---
name: escribir-una-publicacion
title: "Escribir una publicación"
description: "Redacto una pieza de contenido con tu voz, basada en tu posicionamiento. Elige el canal: un artículo de blog extenso, una publicación de LinkedIn, un hilo de X, un newsletter, o una respuesta en Reddit. Copy nativo del canal que suena a ti, no a una fábrica de contenido. Solo borradores, tú siempre publicas."
version: 1
category: Marketing
featured: yes
image: megaphone
integrations: [googledocs, linkedin, twitter, reddit, mailchimp, firecrawl]
---


# Escribir una publicación

Redacción nativa por canal, una sola skill. El parámetro `channel` elige la forma. La disciplina central (posicionamiento, voz, sin estadísticas inventadas, solo borradores) es compartida entre canales.

## Parámetro: `channel`

- `blog`: publicación de 2,000-3,000 palabras consciente de SEO → `blog-posts/{slug}.md`.
- `linkedin`: publicación nativa con gancho al inicio → `posts/linkedin-{slug}.md`.
- `x-thread`: hilo de 5 a 12 tuits → `threads/x-{slug}.md`.
- `newsletter`: asunto + preview + cuerpo, un solo hilo conductor → `newsletters/{YYYY-MM-DD}.md`.
- `reddit`: respuesta comunitaria que aporta valor primero (hilo fuente vía Composio/Firecrawl) → `community-replies/{source-slug}.md`.

Tú nombras el canal en lenguaje simple ("hilo de X", "respuesta en Reddit", "el newsletter de esta semana") y yo lo infiero. Si es ambiguo, hago UNA pregunta nombrando las 5 opciones.

## Cuándo usarlo

- Explícito: "redacta un {artículo de blog / publicación de LinkedIn / hilo de X / newsletter / respuesta en Reddit} sobre {topic}", "escríbeme una publicación sobre {X}", "responde a este hilo en {URL}".
- Implícito: me llama `plan-a-campaign` (launch / announcement) para las piezas de canal, o `watch-my-competitors` (social-feed) ante un hilo de alta señal marcado.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta skill, reviso que las categorías de abajo estén conectadas. Si falta alguna, te digo cuál es, te pido que la conectes desde la pestaña de Integraciones y me detengo.

- **Búsqueda web (Exa, Perplexity)**: escaneo de SERP para `blog`, contexto ligero para otras publicaciones. Obligatoria para `blog`, no hay un respaldo útil, necesito un motor de búsqueda para comparar la cobertura existente.
- **Web scrape (Firecrawl)**: opcional. Si no está conectada, uso un fetch HTTP básico sobre las URLs de competidores/fuentes, más tosco pero funcional en páginas estáticas.
- **Google Docs**: refleja el borrador del blog en un Doc que puedes compartir con cualquiera para revisión. Opcional para `blog`.
- **Reddit**: lee el hilo fuente para `reddit`. Obligatoria para `reddit`, no hay respaldo, la API restringe el acceso.
- **Redes sociales (LinkedIn, X)**: opcional para `linkedin` y `x-thread`.
- **Plataforma de correo (Customer.io, Loops, Mailchimp, Kit)**: coloca el newsletter como borrador. Opcional para `newsletter`.

Para `blog` me detengo si la búsqueda web no está conectada. Para `reddit` me detengo si Reddit no está conectado. El respaldo de web scrape me deja seguir por su cuenta.

## Información que necesito

Primero leo tu contexto de marketing. Por cada campo obligatorio que falte, te hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **El nombre de tu empresa y tu pitch**: Obligatorios para todos los canales. Por qué lo necesito: ancoran la publicación en lo que realmente haces. Si falta, pregunto: "¿Cuál es el nombre de la empresa, y cómo describes lo que hace en una sola frase?"
- **Tu voz**: Obligatoria para todos los canales. Por qué lo necesito: una publicación que suena genérica se ignora. Si falta, pregunto: "Conecta tu LinkedIn o tu bandeja de enviados para que pueda muestrear tu voz, o pega dos o tres cosas que hayas escrito."
- **Tu posicionamiento**: Obligatorio para todos los canales. Si falta, pregunto: "¿Quieres que redacte primero tu posicionamiento? Es una sola skill, toma unos cinco minutos."
- **Tus redes sociales y temas**: Obligatorios para `linkedin`, `x-thread`, `reddit`. Si falta, pregunto: "¿En qué plataformas publicas, y sobre qué temas quieres que escriba?"
- **Tu plataforma de correo**: Obligatoria para `newsletter` (para poder nombrar la herramienta en la que vas a pegar el contenido). Si falta, pregunto: "¿Qué herramienta de correo usas para enviar tu newsletter?"

## Pasos

1. **Leo el registro y el posicionamiento.** Cargo `config/context-ledger.json` y `context/marketing-context.md`. Reúno los campos obligatorios que falten según la lista de arriba (una pregunta cada uno, con la mejor modalidad primero).
2. **Resuelvo canal y tema.** Confirmo el parámetro. Si el tema no es explícito, hago UNA pregunta: "¿Cuál es el ángulo / gancho / palabra clave objetivo?"
3. **Paso de investigación (según escala del canal).**
   - `blog`: ejecuto `composio search seo` / `composio search web` para los 5 a 10 resultados principales de SERP sobre la palabra clave objetivo; extraigo brechas de ángulo + estructura esperada.
   - `linkedin` | `x-thread`: opcional, `composio search web` para 1 a 3 datos de contexto. Me lo salto si es puro relato/opinión.
   - `newsletter`: traigo material fuente (texto pegado, enlaces del usuario, entradas recientes de `blog-posts/` indexadas en `outputs.json`). Si no hay nada, pregunto: "¿Qué pasó esta semana que valga la pena un correo?"
   - `reddit`: ejecuto `composio search web-scrape` (o `composio search reddit`), traigo la URL del hilo, extraigo el post original más de 3 a 5 comentarios principales. Si el scrape falla, le pido al usuario que lo pegue.
4. **Evalúo el valor (solo reddit).** Una frase: "¿de verdad tenemos algo que aportar aquí?" Si no, lo digo y me detengo. Nada de respuestas de relleno.
5. **Redacto según la forma del canal.**
   - `blog`: H1 (orientado a la palabra clave, humano) → intro (gancho + promesa + tabla de contenidos) → H2/H3 que cubren la demanda de SERP + una sección contraria ligada al posicionamiento → sugerencias de enlaces internos → un CTA del posicionamiento → meta descripción (≤155 caracteres) → slug (kebab-case) → brief de imagen (texto alternativo + 2-3 ideas).
   - `linkedin`: línea 1 con gancho (4-10 palabras, contrario o con número específico) → espacio en blanco, líneas cortas → un solo mensaje claro → de 3 a 6 párrafos cortos → CTA o pregunta → de 0 a 3 hashtags específicos.
   - `x-thread`: tuit 1 con gancho que detiene el scroll (≤280 caracteres, sin relleno de emojis) → de 4 a 10 tuits numerados en progresión (cada uno un beat, ≤280) → tuit final de CTA (seguir / responder / enlace). Más directo y contundente que LinkedIn.
   - `newsletter`: elijo UN solo hilo conductor (si no se puede resumir en una frase, le pido al usuario que elija el titular) → asunto (≤60 caracteres, específico) → preview (50-90 caracteres) → cuerpo de 3 a 5 secciones cortas al servicio del hilo conductor → un CTA principal. Texto plano primero, cito las URLs fuente en línea.
   - `reddit`: reconozco la pregunta específica del post original (1 línea) → valor concreto en 2 a 4 párrafos cortos (marco de trabajo, número, detalle inesperado, paso a paso, contraargumento) → mención suave opcional solo si es directamente relevante, después del valor, nombro sin enlazar → sin firmas. Ajusto el registro al tono casual de la comunidad.
6. **Ajuste de voz.** Cada canal respeta los campos de voz del registro (formalidad, uso de emojis, longitud de frase). Si la muestra de voz es plana, por defecto voy directo y cálido.
7. **Escribo de forma atómica** en la ruta del canal (`*.tmp` → renombro). El slug es kebab(las primeras 5 palabras del gancho) salvo que aplique otra regla de arriba. Front-matter del archivo: `type`, `channel`, `topic`, más campos específicos del canal (blog: title/slug/metaDescription/targetKeyword/wordCount; newsletter: throughLine/sources; reddit: URL fuente + subreddit + cita del post original).
8. **Bonus de blog (solo `channel: blog`).** Si `googledocs` está conectado, ejecuto `composio search googledocs` → ejecuto la herramienta de crear documento, reflejo el borrador ahí, incluyo la URL en el resumen.
9. **Agrego a `outputs.json`** en la raíz del agente. Leo, combino y escribo de forma atómica: `{ id (uuid v4), type: "blog-post" | "linkedin-post" | "x-thread" | "newsletter" | "community-reply", title, summary, path, status: "draft", createdAt, updatedAt }`.
10. **Resumo al usuario.** Un párrafo que nombra el gancho / hilo conductor / aporte de valor + la ruta. Le recuerdo: "Revísalo, edítalo, publícalo tú mismo."

## Lo que nunca hago

- Publicar / postear / enviar en tu nombre. Solo borradores.
- Inventar estadísticas, citas de clientes o fuentes. Cada afirmación citable tiene una URL o se marca como TBD.
- Adivinar el posicionamiento o la voz. Leo el registro y el archivo de posicionamiento, o pregunto.
- Codificar nombres de herramientas de forma fija. El descubrimiento por Composio es siempre en tiempo real.

## Resultados

- `blog-posts/{slug}.md` | `posts/linkedin-{slug}.md` | `threads/x-{slug}.md` | `newsletters/{YYYY-MM-DD}.md` | `community-replies/{source-slug}.md`.
- Se agrega una entrada a `outputs.json` con el `type` correspondiente.

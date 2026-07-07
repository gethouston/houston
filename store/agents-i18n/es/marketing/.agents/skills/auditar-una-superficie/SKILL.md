---
name: auditar-una-superficie
title: "Auditar una superficie"
description: "Califico una superficie de marketing específica y te doy una lista de arreglos priorizada. Elige qué auditar: la salud SEO de tu sitio, tu visibilidad en buscadores con IA como ChatGPT y Perplexity, una landing page evaluada en seis dimensiones, o un formulario que está perdiendo conversiones. Cada hallazgo está ordenado por impacto y facilidad."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [firecrawl, semrush, ahrefs, perplexityai]
---


# Auditar una superficie

Cuatro superficies de auditoría posibles. El parámetro `surface` elige la sonda;

## Parámetro: `surface`

- `site-seo`  -  auditoría on-page + técnica + de contenido del dominio
  configurado vía Semrush / Ahrefs / Firecrawl.
- `ai-search`  -  sonda de visibilidad en ChatGPT / Perplexity / Gemini /
  Google AI Overviews + recomendaciones de GEO.
- `landing-page`  -  obtiene la página vía Firecrawl, califica 6
  dimensiones de 0 a 3, lista de arreglos priorizada.
- `form`  -  marca campos innecesarios, reescribe etiquetas + texto de
  ayuda, ordena por fricción (formularios que no son de registro: demo /
  contacto / lead / checkout).

Mencionas la superficie en lenguaje simple ("auditoría SEO", "GEO", "hazme una crítica de mi landing page", "arregla mi formulario de demo") -> infiero. Si es ambiguo, hago UNA pregunta nombrando las 4 opciones.

## Cuándo lo uso

- Explícito: "haz una auditoría SEO", "audita mi visibilidad en
  buscadores con IA", "auditoría GEO", "critica {URL}", "audita mi
  formulario de leads".
- Disparadores de `ai-search`: "¿aparezco en ChatGPT?", "¿somos
  visibles en Perplexity / Gemini para nuestra categoría?", "¿quién
  aparece cuando alguien pregunta sobre {categoría} en ChatGPT?".
- Disparadores de `form`: "audita mi formulario de demo", "mi
  formulario de contacto está perdiendo gente", "este formulario de
  leads es muy largo, ¿qué puedo quitar?", "reescribe las etiquetas
  de este formulario", "revisa los campos del formulario de
  solicitud / checkout".
- Implícito: dentro de `plan-a-campaign` (paid / launch) cuando la
  landing page enrutada necesita afinarse, o dentro de
  `check-my-marketing` (content-gap) cuando no se conoce la salud
  base del sitio.
- Frecuencia por superficie: site-seo máximo semanal, ai-search
  máximo mensual, landing-page bajo demanda, form bajo demanda.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de que corra este skill, verifico que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Rastreo web (Firecrawl)**  -  opcional. Si no está conectado, recurro a una obtención HTTP básica para `landing-page`, `form`, y el análisis on-page de `site-seo`, más tosco pero funcional en páginas estáticas.
- **SEO (Semrush o Ahrefs)**  -  auditoría on-page, indexación, ajuste de contenido, datos de ranking. Requerido para `site-seo`, sin alternativa, esos datos son propietarios.
- **Búsqueda con IA (Perplexity / proveedores de búsqueda)**  -  sondea ChatGPT / Perplexity / Gemini / AI Overviews para tu visibilidad. Requerido para `ai-search`, sin alternativa útil, los motores necesitan acceso por API.

Para `site-seo` me detengo si no hay ninguna herramienta de SEO conectada. Para `ai-search` me detengo si no hay ningún proveedor de búsqueda con IA conectado. Para `landing-page` y `form`, la obtención HTTP básica cubre el respaldo del rastreo, así que sigo adelante.

## Información que necesito

Primero leo tu contexto de marketing. Por cada campo requerido que falte, hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Tu posicionamiento**  -  Requerido. Por qué lo necesito: cada auditoría califica el contenido contra a quién le sirves y qué representas. Si falta, pregunto: "¿Quieres que redacte primero tu posicionamiento? Es un solo skill, toma unos cinco minutos."
- **Tu cliente ideal**  -  Requerido para `landing-page` y `form` (para poder calificar el manejo de objeciones y la elección de campos). Si falta, pregunto: "¿Quién es el cliente que quieres que esta página o formulario convierta? Un párrafo corto o algo pegado de tu CRM funciona."
- **El dominio de tu sitio web**  -  Requerido para `site-seo` y `ai-search`. Si falta, pregunto: "¿Cuál es el dominio que quieres que audite? Pega la URL."
- **Tu herramienta de SEO**  -  Requerido para `site-seo` y `ai-search`. Si falta, pregunto: "Abre Integraciones y conecta Semrush o Ahrefs, o pégame una lista de páginas que quieres que califique."

## Pasos

1. **Leo el registro + el posicionamiento.** Reúno los campos
   requeridos que falten según lo anterior (UNA pregunta cada uno,
   mejor modalidad primero). Escribo de forma atómica.
2. **Descubro herramientas vía Composio.** Ejecuto `composio search
   seo` / `composio search web-scrape` / `composio search ai-search`
   / `composio search perplexity` según la superficie. Para
   `site-seo` y `ai-search`, me detengo si no hay ninguna
   herramienta propietaria conectada (los datos de SEO y las sondas
   de búsqueda con IA no se pueden replicar). Para `landing-page` y
   `form`, recurro a la obtención HTTP básica cuando falta Firecrawl
   y marco las páginas con mucho JavaScript donde el resultado sea
   pobre.
3. **Me ramifico según la superficie.**
   - `site-seo`: ejecuto los slugs de herramientas descubiertos
     contra el dominio + URLs clave, tres pasadas:
     - **On-page**  -  etiquetas de título, meta descripciones,
       jerarquía H1/H2, etiquetas canónicas, esquema, texto
       alternativo, enlazado interno.
     - **Técnica**  -  robots.txt / sitemap, indexación, Core Web
       Vitals, usabilidad móvil, HTTPS, enlaces rotos, redirecciones.
     - **Contenido**  -  páginas con mejor desempeño, contenido
       pobre, canibalización, ajuste entre contenido y
       posicionamiento.
   - `ai-search`: construyo un conjunto de consultas (3 grupos de 3 a
     5 consultas cada uno): **Marca** ("qué es {producto}",
     "{producto} vs {competidor}", "precios de {producto}"),
     **Categoría** (las principales preguntas de trabajos por
     resolver a partir del posicionamiento), **Problema**
     (formulaciones de los puntos de dolor del cliente ideal).
     Consulto cada motor vía los slugs descubiertos, como mínimo
     ChatGPT / Perplexity / Gemini / Google AI Overviews. Por cada
     par consulta-motor, capturo: citado (sí / mencionado / no), URL
     citada, quién fue citado en su lugar, cómo enmarca la IA la
     categoría.
   - `landing-page`: ejecuto el slug de rastreo web para obtener la
     URL (HTML renderizado + texto visible + imágenes principales +
     meta + cualquier señal de velocidad de página). Califico 6
     dimensiones de 0 a 3 con una razón de una frase citando la
     página:
     1. **Claridad del titular** (QUIÉN + QUÉ en 12 palabras o
        menos).
     2. **Propuesta de valor sobre el pliegue** (resultado visible
        sin necesidad de bajar).
     3. **Prueba social** (credibilidad + cercanía al CTA).
     4. **CTA principal** (una acción inequívoca que coincide con la
        conversión principal).
     5. **Manejo de objeciones** (FAQ / garantía / precios frente a
        las 2-3 principales objeciones del cliente ideal según el
        posicionamiento).
     6. **Jerarquía visual** (recorrido visual -> CTA, sin CTAs que
        compitan entre sí).
     Extra: señales de velocidad de página si la herramienta las
     devuelve.
   - `form`: acepto URL, captura de pantalla, o lista de campos
     pegada. Si es URL, ejecuto el slug de rastreo web. Identifico el
     tipo de formulario (lead / contacto / demo / solicitud /
     encuesta / checkout, NO registro, esa es la superficie
     signup-flow de `write-my-page-copy`). Hago UNA pregunta sobre el
     contexto de negocio si no está claro (qué pasa con los envíos,
     qué campos se usan en el seguimiento, cumplimiento normativo).
     Campo por campo: **Veredicto** (mantener / eliminar / posponer /
     hacer opcional / requerido por cumplimiento), **Razón**,
     **Reescritura de etiqueta** (conversacional, una pregunta por
     campo), **Arreglo de tipo de entrada** (teclado móvil,
     validación en línea, valores predeterminados inteligentes,
     detección de errores de tipeo en el correo). Reescribo la
     propuesta de valor sobre el formulario. Nombro los antipatrones
     (carga cognitiva, ansiedad de privacidad / falta de confianza,
     falta de propuesta de valor, demasiados campos, mal teclado
     móvil, culpar al usuario por errores, captcha antes de enviar,
     sin señal de progreso). Reemplazo "Enviar" por acción +
     resultado.
4. **Califico y priorizo.** Etiqueto cada hallazgo con `{severity:
   critical / high / medium / low}` x `{effort: quick-win / medium /
   heavy}`. Muestro las 5 principales victorias rápidas críticas o
   altas al inicio. Para `landing-page`, incluyo la tabla de
   puntuación por dimensión para que el total sea evidente por sí
   mismo:
   ```
   Headline clarity       1/3
   Value prop above fold  1/3
   Social proof           3/3
   Primary CTA            1/3
   Objection handling     2/3
   Visual hierarchy       2/3
   Total                 10/21
   ```
   Siempre muestro las seis filas + el total. Nunca muestro solo el
   total.
5. **Escribo** de forma atómica en
   `audits/{surface}-{slug}-{YYYY-MM-DD}.md` (`*.tmp` -> renombrar).
   Slug: `site-seo` / `ai-search` usan el dominio; `landing-page` /
   `form` usan el kebab de la URL o el nombre del formulario.
   Estructura: Resumen ejecutivo -> Top 5 de victorias rápidas /
   mayor fuga -> Hallazgos por pasada -> Plan de 30 días recomendado
   (site-seo) / Lista de arreglos priorizada (landing-page, form) /
   Recomendaciones de GEO (ai-search).
6. **Agrego a `outputs.json`**, leer-fusionar-escribir de forma
   atómica: `{ id (uuid v4), type: "audit", title, summary, path,
   status: "ready", createdAt, updatedAt }`.
7. **Te resumo.** Un párrafo con las 5 principales victorias rápidas
   (o el arreglo más grande) y la ruta.

## Lo que nunca hago

- Inventar hallazgos, tasas de citación, conteos de campos de
  formulario. Cada afirmación se conecta a una respuesta real de una
  herramienta u observación de la URL. Si falta información, la
  marco como DESCONOCIDO o POR CONFIRMAR.
- Prometer un porcentaje de mejora, las auditorías plantean
  hipótesis.
- Eliminar un campo de formulario legalmente requerido (pregunto si
  no estoy seguro).
- Fijar nombres de herramientas de forma manual, el descubrimiento
  vía Composio ocurre solo en tiempo de ejecución.

## Resultados

- `audits/{surface}-{slug}-{YYYY-MM-DD}.md`
- Agrega una entrada a `outputs.json` con tipo `audit`.

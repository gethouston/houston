---
name: revisar-mi-marketing
title: "Revisar mi marketing"
description: "Te doy un diagnóstico real de cómo está funcionando tu marketing. Elige lo que necesitas: un análisis de embudo que señala la mayor fuga con experimentos para probar, un análisis de brechas de contenido frente a un competidor, o un resumen semanal de todo lo que entregué y lo que falta. Números y próximos pasos, no un panel de control."
version: 1
category: Marketing
featured: yes
image: megaphone
integrations: [linkedin, firecrawl, semrush]
---


# Revisar mi marketing

Un skill, tres asuntos. El parámetro `subject` elige el enfoque. "Nunca inventar números" aplica a los tres.

## Parámetro: `subject`

- `funnel`  -  conversión etapa por etapa desde PostHog / GA4 / Mixpanel (o pegado manual). La mayor caída más 2-3 experimentos ordenados por impacto esperado x esfuerzo.
- `content-gap`  -  rastrea al competidor con Firecrawl / Semrush, compara contra nuestro contenido, ordena las brechas por volumen x afinidad / dificultad, primer borrador de brief por cada brecha principal.
- `marketing-health`  -  resumen semanal de lo que ESTE agente entregó (blog / campañas / correos / redes sociales / reescrituras de páginas) agrupando `outputs.json` por tipo. Señala brechas ("sin secuencia de goteo en 3 semanas"), recomienda próximos pasos por área.

Tú nombras el asunto en lenguaje simple ("revisión semanal del embudo", "dónde estamos perdiendo", "qué nos falta frente a Ramp", "revisión de marketing del lunes") y yo infiero. Si es ambiguo, hago UNA pregunta que nombra las 3 opciones.

## Cuándo usarlo

- Explícito: "revisión semanal del embudo", "analiza el embudo de registro", "brecha de contenido frente a {competidor}", "dónde podemos superar a {X}", "revisión de marketing del lunes", "resumen semanal".
- Implícito: normalmente programado (semanal / lunes) por una rutina.
- Frecuencia: `funnel` semanal, `content-gap` como máximo una vez al mes por competidor, `marketing-health` semanal.

## Conexiones que necesito

Hago el trabajo externo a través de Composio. Antes de ejecutar este skill, verifico que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Analítica (PostHog, GA4 o Mixpanel)**  -  fuente de los conteos del embudo etapa por etapa. Obligatorio para `funnel`, no hay alternativa útil, los datos viven en tu herramienta de analítica.
- **Rastreo web (Firecrawl)**  -  opcional para `content-gap`. Si no está conectado, uso una consulta HTTP básica sobre las páginas del competidor, más tosco pero funcional en sitios estáticos.
- **SEO (Semrush o Ahrefs)**  -  dimensiona volúmenes de palabras clave y brechas de posicionamiento. Obligatorio para `content-gap`, no hay alternativa, esos datos son propietarios.

Si la analítica es obligatoria para `funnel` y no está conectada, me detengo. Para `content-gap`, si faltan los datos de SEO, también me detengo. La categoría de rastreo es la única donde sigo adelante con una alternativa.

## Información que necesito

Primero leo tu contexto de marketing. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Tu posicionamiento**  -  Obligatorio para `content-gap` y `marketing-health`, útil para `funnel`. Por qué lo necesito: distingue las amenazas reales del ruido y encuadra el resumen. Si falta, pregunto: "¿Quieres que primero redacte tu posicionamiento? Es un skill, toma unos cinco minutos."
- **Tu herramienta de analítica y tu conversión principal**  -  Obligatorio para `funnel`. Por qué lo necesito: no voy a inventar números del embudo. Si falta, pregunto: "Conecta PostHog, GA4 o Mixpanel desde la pestaña de Integraciones para que pueda traer tu embudo, o pega los conteos etapa por etapa de los últimos siete días."
- **El dominio de tu sitio web**  -  Obligatorio para `content-gap` (el sitio que comparo contra el del competidor). Si falta, pregunto: "¿Cuál es tu sitio web? Pega la URL."

## Pasos

1. **Leo el registro (ledger) más el posicionamiento.** Recojo los campos obligatorios que falten (una pregunta cada uno, priorizando la mejor modalidad).
2. **Me ramifico según el `subject`.**
   - `funnel`: obtengo los números en este orden de prioridad:
     - a) Analítica conectada vía Composio: ejecuto `composio search` para el proveedor en `domains.paid.analytics`, ejecuto la herramienta de embudo / consulta por slug, traigo los conteos por etapa de los últimos 7 días más los 7 anteriores.
     - b) Si no, te pido que pegues `stage | count | period`.
     - c) Si ninguna opción está disponible, me detengo. Nada de números inventados.
     Defino las etapas: uso las etapas ya capturadas en el registro si existen, si no, propongo entre 4 y 6 según la conversión principal (por ejemplo, registro: `visit -> signup_started -> signup_completed -> activation_event -> retained_day_7`), confirmo en la primera ejecución y las guardo en el registro. Calculo tasas por etapa más variaciones semana a semana (WoW) más las caídas absolutas. Nombro la **mayor fuga** (la caída absoluta más alta Y la conversión más baja frente a referencias razonables, B2B SaaS: visita->registro 2-5%, registro->activación 30-60%, activación->retención día 7 40-70%). Recomiendo 2-3 experimentos ordenados por (impacto x esfuerzo): etapa objetivo más hipótesis (se la paso al skill dedicado de especificación de pruebas A/B) más esfuerzo (esta semana / este mes / mayor) más el aumento direccional esperado ligado a un mecanismo real (sin números mágicos).
   - `content-gap`: resuelvo el o los dominios del competidor (nombrados por ti o los primeros 1-3 según el posicionamiento). Ejecuto `composio search web-scrape` / `composio search seo` para rastrear al competidor: palabras clave posicionadas, páginas principales por tráfico estimado, clústeres de temas que domina. Rastreo NUESTRO contenido vía el CMS conectado o la lista de publicaciones de `domains.seo.domain`. Por cada tema o palabra clave que domina el competidor registro: si lo cubrimos (sí / parcial / no), volumen de búsqueda (de la herramienta de palabras clave), dificultad estimada (relativa), afinidad con el posicionamiento (sí / neutral / fuera de marca). Ordeno por `(volumen x afinidad) / dificultad`. Muestro las 10 principales con la próxima acción recomendada (nuevo post -> se lo paso a `write-a-post` channel=blog / actualizar uno existente / omitir + por qué).
   - `marketing-health`: leo el `outputs.json` de ESTE agente (un solo archivo, ahora un agente, no cinco). Filtro a la ventana de revisión (por defecto los últimos 7 días según `createdAt` / `updatedAt`; respeto si dices "últimas 2 semanas", "desde el lanzamiento"). Agrupo por `type`: blog-post, linkedin-post, x-thread, newsletter, community-reply, page-copy, audit, campaign, competitor-brief, analysis. Por cada grupo calculo: cantidad, lo más destacado entregado (los 3 más recientes con título + ruta + estado), borradores aún abiertos (status = "draft") con más de 7 días sin avanzar, brechas (lo que FALTA según lo que un stack de fundador solo esperaría: sin blog esta semana, sin brief de campaña esta semana, sin newsletter, sin secuencia de bienvenida redactada, frecuencia en redes por debajo del plan). Busco patrones transversales: desfase de lanzamiento (campaña de lanzamiento abierta con piezas dependientes sin entregar), señales de competidores sin atender, desfase de posicionamiento respecto a análisis recientes.
3. **Redacto el análisis** (markdown, ~400-700 palabras para health / funnel, más extenso para content-gap):
   - `funnel` -> conversión general + diagrama del embudo (texto simple) + mayor fuga con su número + experimentos ordenados + estado (ready, no draft, es un resumen factual).
   - `content-gap` -> resumen ejecutivo + tabla de las 10 principales oportunidades + detalle tema por tema + lista de temas omitidos con sus razones.
   - `marketing-health` -> ventana + resumen rápido (3-5 puntos) + qué se entregó por área + brechas (ordenadas por severidad) + problemas transversales + 3-5 próximos pasos recomendados etiquetados con el skill del agente que los ejecuta (por ejemplo `[write-a-post:newsletter]`, `[plan-a-campaign:lifecycle-drip]`, `[audit-a-surface:landing-page]`) + qué pasar a listo (borradores estancados esperando aprobación). Estado `ready`.
4. **Escribo** de forma atómica en `analyses/{subject}-{YYYY-MM-DD}.md` (`*.tmp` -> renombrar). Content-gap usa `analyses/content-gap-{competitor-slug}-{YYYY-MM-DD}.md`.
5. **Agrego una entrada a `outputs.json`**, con lectura-fusión-escritura atómica: `{ id (uuid v4), type: "analysis", title, summary, path, status: "ready", createdAt, updatedAt }`.
6. **Te resumo el resultado.** Un párrafo:
   - `funnel` -> conversión general + mayor fuga con su número + un experimento para esta semana + ruta.
   - `content-gap` -> las 3 principales oportunidades con un título de post recomendado (una línea cada una) + ruta.
   - `marketing-health` -> "{N} entregas esta semana en {domains}. Mayor brecha: {gap}. Próximo paso más importante: {move}. Revisión completa: {path}."

## Lo que nunca hago

- Inventar números del embudo, estimaciones de tráfico del competidor o estadísticas de interacción. Si no puedo acceder a los datos, lo digo y me detengo (funnel) o lo marco como pendiente, TBD (content-gap).
- Exagerar brechas donde la cobertura está bien.
- Prometer un porcentaje de mejora, los experimentos vienen con su MDE (mínimo efecto detectable) más las salvedades del mecanismo.
- Fijar nombres de herramientas de forma rígida. El descubrimiento vía Composio ocurre solo en tiempo de ejecución.

## Entregables

- `analyses/{subject}-{YYYY-MM-DD}.md`
- Agrego una entrada a `outputs.json` con el tipo `analysis`.
</content>

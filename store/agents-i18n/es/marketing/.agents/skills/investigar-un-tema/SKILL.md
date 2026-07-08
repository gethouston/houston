---
name: investigar-un-tema
title: "Investigar un tema"
description: "Te doy un informe estructurado sobre cualquier tema que necesites entender antes de tomar una decisión de marketing. Hago una investigación profunda, cito cada fuente y entrego ángulos que vale la pena desarrollar. Alimenta borradores de blog, estrategias publicitarias y planes de contenido."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [firecrawl, perplexityai]
---


# Investigar Un Tema

Plantilla de origen: Gumloop "AI Research Agent with Automated Report Generation". Adaptada para entregar a los otros cuatro agentes de marketing, no para memorandos de inversionistas de 20 páginas.

## Cuándo usarlo

- "investiga {tema}" / "necesito un informe sobre {tema}" / "cuál es el estado de {tema}".
- "resume qué está pasando en {categoría}".
- Se invoca implícitamente desde otras skills (`plan-a-campaign`, `watch-my-competitors`, `profile-my-customer`) cuando encuentran un vacío de evidencia que necesita una corrida de investigación dedicada.

## Conexiones que necesito

Hago el trabajo externo a través de Composio. Antes de correr esta skill reviso que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Búsqueda web (Exa o Perplexity)**, el motor que encuentra y ordena las fuentes. Necesario, no hay un respaldo útil, necesito un índice de búsqueda para empezar.
- **Extracción web (Firecrawl)**, opcional, trae el texto completo de forma limpia. Si no está conectado, uso una extracción HTTP básica de respaldo en cada URL de fuente, más tosca pero suficiente para sacar citas de páginas estáticas.

Si la búsqueda web no está conectada, me detengo. El respaldo de extracción me permite seguir por su cuenta.

## Información que necesito

Primero leo tu contexto de marketing. Por cada campo requerido que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Tu posicionamiento**, Necesario. Por qué lo necesito: un informe que no filtra por tu cliente ideal y tu categoría es solo investigación genérica de internet. Si falta, pregunto: "¿Quieres que primero redacte tu posicionamiento? Es una skill, toma unos cinco minutos."
- **La pregunta de investigación**, Necesario. Por qué la necesito: el alcance que se desborda vuelve inútiles los informes. Si falta, pregunto: "¿Cuál es la única pregunta que este informe debería responder, y qué decisión desbloquea?"
- **Profundidad**, Opcional, por defecto estándar. Si falta, pregunto: "¿Qué tan profundo quieres que vaya, un vistazo de quince minutos, una hora de inmersión, o una corrida profunda? Si no tienes preferencia, sigo con la profundidad estándar."

## Pasos

1. **Aclarar el alcance en un intercambio breve (saltar si el mensaje del usuario ya es específico).** Preguntar:
   - Para qué va a servir el informe, entrada de blog, ángulos de anuncios, correo de ciclo de vida, calendario de redes, o solo para tu propia lectura.
   - Qué decisión debe desbloquear.
   - Profundidad, vistazo de 15 minutos, inmersión de 60 minutos, o profunda.

2. **Leer el documento de posicionamiento** (archivo propio): `context/marketing-context.md`. Fundamentar el informe en nuestro cliente ideal y categoría, investigación genérica de internet no es un informe.

3. **Descubrir herramientas de investigación en tiempo de ejecución.** NO fijar nombres de herramientas de antemano. Correr `composio search research`, `composio search web-search`, `composio search web-scrape` y elegir el mejor slug conectado por paso. Si falta web-search, detenerme y pedirle al usuario que conecte un proveedor (pestaña de Integraciones). Si solo falta web-scrape, seguir con extracción HTTP básica y avisar que las fuentes con mucho JavaScript quedarán escasas.

4. **Correr la investigación en capas.** Registrar fuentes a medida que avanzo, el informe final necesita citas:
   1. **Vistazo panorámico**, actores, terminología de la categoría, top 5-10 fuentes con autoridad.
   2. **Profundización en evidencia**, traer las mejores fuentes, extraer afirmaciones, citas, datos. Citar URL + marca de tiempo de extracción por cada afirmación.
   3. **Revisión de contradicciones**, dónde discrepan las fuentes. Nombrar ambas posturas; no promediar hasta volverlo confuso.
   4. **Filtro de relevancia**, qué hallazgos importan para NUESTRO cliente ideal / NUESTRO posicionamiento / la decisión en cuestión. Cortar el resto.

5. **Estructurar el informe (markdown, ~500-900 palabras en profundidad estándar).**

   1. **La pregunta**, una oración.
   2. **Resumen ejecutivo**, 3-5 viñetas que el usuario puede accionar hoy.
   3. **Hallazgos clave**, numerados. Cada uno: afirmación, evidencia (citada), implicación para nosotros.
   4. **Dónde discrepan las fuentes**, sección corta. No ocultar.
   5. **Lo que no sabemos**, vacíos explícitos. Marcar `DESCONOCIDO` + el tipo de fuente que lo resolvería.
   6. **Próximos movimientos recomendados**, etiquetados por agente. Ejemplo: `[seo-content] Apuntar al clúster "{keyword}", 8 de 10 páginas mejor posicionadas están escasas de contenido.`
   7. **Fuentes**, URL + título + marca de tiempo de extracción.

6. **Nunca inventar.** Sin afirmaciones sintetizadas de "parece probable que..." sin una fuente citada. Si la investigación queda escasa, decirlo y detenerse, informes malos cuestan más que no tener informe.

7. **Escribir de forma atómica** en `research/{topic-slug}.md`, `{path}.tmp` y luego renombrar. `{topic-slug}` es el tema en kebab-case (por ejemplo, `research/geo-audits-category.md`).

8. **Agregar a `outputs.json`.** Leer-fusionar-escribir de forma atómica:

   ```json
   {
     "id": "<uuid v4>",
     "type": "research",
     "title": "<Tema>",
     "summary": "<2-3 oraciones, el resumen ejecutivo>",
     "path": "research/<slug>.md",
     "status": "draft",
     "createdAt": "<ISO-8601>",
     "updatedAt": "<ISO-8601>"
   }
   ```

9. **Resumir para el usuario.** Un párrafo: pregunta, resumen ejecutivo en una línea, 1 próximo movimiento, ruta al informe.

## Resultados

- `research/{topic-slug}.md`
- Agrega a `outputs.json` con `type: "research"`.

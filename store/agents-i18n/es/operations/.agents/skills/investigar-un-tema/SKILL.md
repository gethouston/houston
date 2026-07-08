---
name: investigar-un-tema
title: "Investigar un tema"
description: "Obtén un informe estructurado y con fuentes citadas sobre un tema, una empresa, una persona o tu feed social, en lugar de tener que revisarlo todo tú mismo. Dime qué investigar y busco en proveedores de noticias e investigación, ordeno lo que importa según tus prioridades, y escribo un resumen ejecutivo más una sección de 'qué significa esto para nosotros'. Cada afirmación va acompañada de una URL de origen."
version: 1
category: Operaciones
featured: yes
image: clipboard
integrations: [linkedin, firecrawl, perplexityai]
---


# Investigar un tema

Tres tipos de señal, una habilidad: noticias del mercado, investigación web, monitoreo del feed social. Mantiene al fundador al día sin tener que revisar feeds.

## Cuándo usarla

- "informe semanal sobre {topic}" / "qué se está moviendo en {nuestra categoría}".
- "investiga a {company} / {person} / {product} y dame un informe".
- "resume mi feed de X" / "qué publicó la gente que sigo".
- "qué noticias hay sobre {regulación / evento}".

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta habilidad verifico que las categorías de abajo estén vinculadas. Si falta alguna, nombro la categoría, te pido conectarla desde la pestaña de Integraciones y me detengo.

- **Investigación web** (Exa, Perplexity, Firecrawl)  -  Obligatorio. Trae artículos e investigación con URLs de origen para que cada afirmación esté citada.
- **Noticias** (NewsAPI o equivalente)  -  Opcional. Agrega un filtro de actualidad sobre la investigación.
- **Red social / profesional** (LinkedIn, X)  -  Obligatorio para el modo `feed-digest`. Si pides un resumen de tu feed y no hay un proveedor social conectado, me detengo y te pido conectar uno.

Si no hay un proveedor de investigación web conectado para informes de tema o de entidad, me detengo y te pido conectar primero un proveedor de investigación.

## Información que necesito

Primero leo tu contexto de operaciones. Por cada campo obligatorio que falte hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Tema, entidad o feed**  -  Obligatorio. Por qué lo necesito: la habilidad apunta a un solo sujeto a la vez. Si falta, pregunto: "¿Qué debo sintetizar, un tema, una empresa o persona en concreto, o tu feed social?"
- **Prioridades activas**  -  Obligatorio. Por qué las necesito: alimentan la sección 'qué significa esto para nosotros' en lugar de noticias genéricas. Si falta, pregunto: "¿Cuáles son las 2 o 3 cosas que la empresa está empujando este trimestre?"
- **Contactos clave**  -  Opcional. Por qué los necesito: me permiten marcar como de mayor señal las publicaciones de gente en la que ya confías. Si no los tienes, sigo adelante con TBD usando solo actualidad y autoridad.
- **Ventana de tiempo**  -  Opcional. Por qué la necesito: los informes semanales usan 7 días por defecto, la investigación profunda 30. Si no la tienes, sigo adelante con TBD usando esos valores por defecto.

## Pasos

1. **Leo `context/operations-context.md`.** La relevancia se ancla en las prioridades activas del fundador. Si falta: primero `set-up-my-ops-info`, me detengo.

2. **Clasifico la solicitud.**
   - **topic-brief**  -  "{topic}" (agentes de IA, precios de SaaS vertical, etc.). Uso fuentes de noticias + investigación.
   - **entity-brief**  -  una empresa, persona o producto con nombre. Con foco en investigación; reviso noticias también.
   - **feed-digest**  -  el feed social que sigue el fundador (a quién sigue en X / LinkedIn / etc.). Necesita un proveedor social conectado.

3. **Reúno la señal según la clasificación.**

   **topic-brief + entity-brief:**
   - `composio search research` → ejecuto por slug con la consulta. Prefiero proveedores que devuelvan URLs de origen (Exa, Perplexity).
   - `composio search news` → ejecuto con la ventana de tiempo (últimos 7 días por defecto para lo semanal; últimos 30 para lo profundo).

   **feed-digest:**
   - `composio search social` → herramienta list-home-timeline o list-posts-by-list del proveedor conectado.
   - Extraigo las publicaciones de la lista de seguidos del fundador para la ventana solicitada.

4. **Filtro y ordeno.**
   - Descarto duplicados y casi duplicados.
   - Marco como de mayor señal las publicaciones o artículos de Contactos clave (del contexto operativo).
   - Ordeno por: (a) relevancia frente a las prioridades activas, (b) actualidad, (c) autoridad de la fuente.

5. **Sintetizo un informe estructurado.**

   Lo guardo en `signals/{slug}-{YYYY-MM-DD}.md`. Estructura:

   - **Resumen ejecutivo**  -  3 puntos máximo, revisable de un vistazo por el fundador.
   - **Qué se movió**  -  subsecciones agrupadas por tema. Cada punto: afirmación + URL de origen. Cito cada afirmación: nada de aseveraciones sin cita.
   - **Quién sostiene qué posición**  -  cuando las fuentes se contradicen, listo las posiciones y quién sostiene cada una.
   - **Qué significa esto para nosotros**  -  2-3 puntos: qué amenaza, qué abre una puerta, qué va en la próxima actualización para inversionistas o el directorio.
   - **Fuentes**  -  lista plana de URLs con descripciones de una línea, ordenada alfabéticamente por dominio.

6. **Escrituras atómicas**  -  `signals/{slug}-{YYYY-MM-DD}.md.tmp` → renombrar.

7. **Agrego a `outputs.json`** con `type: "signal"`, estado "ready".

8. **Te resumo**  -  el resumen ejecutivo + el punto de 'qué significa esto para nosotros' que más merece acción.

## Salidas

- `signals/{slug}-{YYYY-MM-DD}.md`
- Agrega entradas a `outputs.json` con `type: "signal"`.

## Lo que nunca hago

- **Citar sin URL de origen.** Cada afirmación se rastrea a un artículo o publicación concretos: nada de vaguedades tipo "consenso de la industria".
- **Repostear citas de la lista de seguidos del fundador** en sus propias redes: esta habilidad de señales es de solo lectura.
- **Marcar un informe como listo sin señalar la incertidumbre.** Afirmación con una sola fuente → la marco; fuentes que se contradicen → lo digo.

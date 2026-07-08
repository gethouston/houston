---
name: armar-una-battlecard
title: "Armar una battlecard"
description: "Construyo una battlecard para un negocio específico frente a un competidor específico, no una hoja de comparación genérica. Una cuadrícula de tres criterios anclada en lo que le importa a este prospecto, tres preguntas de descubrimiento con trampa incluida, tres respuestas a objeciones basadas en tus diferenciadores reales, y dos puntos de prueba de tus cuentas ancla. Cada afirmación cita una fuente."
version: 1
category: Ventas
featured: no
image: handshake
integrations: [notion, reddit, firecrawl]
---


# Armar una battlecard

NO es una hoja de comparación genérica. Una tarjeta por prospecto, anclada en lo que le importa a ESE prospecto.

## Cuándo usarlo

- Usuario: "nos están evaluando contra {competidor}" / "arma la battlecard del negocio Acme vs {competidor}" / "cómo le gano a {competidor} en este caso".
- Llamada en línea por `write-my-outreach` o `check-my-sales subject=discovery-call` cuando se nombra un competidor en la transcripción.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta skill reviso que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña Integraciones, y me detengo.

- **Scraping**  -  para leer la página de marketing del competidor, sus precios, y reseñas recientes. Obligatorio.
- **Búsqueda / investigación**  -  para traer reseñas recientes, hilos de foros, y debilidades conocidas. Obligatorio.
- **CRM**  -  para leer el contexto del negocio del prospecto y anclar la tarjeta. Opcional.

Si ninguna de las categorías obligatorias está conectada, me detengo y te pido conectar Firecrawl primero, porque la tarjeta depende de una lectura fresca del competidor.

## Información que necesito

Primero leo tu contexto de ventas. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > pegar texto) y espero.

- **Tu playbook de ventas**  -  Obligatorio. Por qué lo necesito: de ahí saco los diferenciadores, las cuentas ancla, y los puntos de prueba. Si falta, pregunto: "Todavía no tengo tu playbook, ¿quieres que lo redacte ahora?"
- **Nombre del prospecto y nombre del competidor**  -  Obligatorio. Por qué lo necesito: la tarjeta se ancla en un negocio específico frente a un competidor específico, no es una hoja genérica. Si falta, pregunto: "¿Para qué negocio es esto, y con qué competidor nos están comparando?"
- **Tu diferenciador principal y tu mayor debilidad frente a este competidor**  -  Obligatorio. Por qué lo necesito: la tarjeta solo es honesta si sé cómo realmente ganas y pierdes. Si falta, pregunto: "¿Cuál es, con honestidad, tu principal diferenciador frente a este competidor, y tu mayor debilidad?"
- **Clientes ancla ganados que se parezcan al prospecto**  -  Opcional. Por qué lo necesito: los puntos de prueba pegan más fuerte cuando calzan con el perfil del prospecto. Si no lo tienes, sigo con TBD.

1. **Identificar prospecto + competidor.** Cargo la fila del lead en `leads.json` y `calls/{slug}/notes-*.md` si existe la llamada, los criterios de evaluación específicos del prospecto y los dolores declarados son el ancla.
2. **Leer nuestro producto + posicionamiento.** `context/sales-context.md` para lo que afirmamos, especialmente las secciones "Top 3 competidores" y "Categoría y diferenciadores". Si está flojo, pregunto una vez: "¿Cuál es, con honestidad, tu top 3 de diferenciadores frente a {competidor}? ¿Y tu mayor debilidad? (Lo integro al playbook, pégalo, o dime la URL de Notion / Google Doc.)"
3. **Investigar al competidor.** Corro `composio search` para las herramientas de investigación disponibles. Traigo:
   - Posicionamiento de su página de marketing (pitch de una línea, top 3 afirmaciones)
   - Estructura pública de precios (planes, modelo)
   - Reseñas recientes de los últimos 6 meses (G2 / Capterra / Reddit / hilos de foros, vía cualquier herramienta de búsqueda web conectada)
   - Debilidades conocidas (quejas sobre {X}, quejas de desempeño, funciones faltantes)
   Capturo fuentes + fechas.
4. **Investigar el caso de uso del prospecto.** A partir del expediente y las notas de llamada, resumo en 2 líneas: qué necesitan que haga la herramienta, y sus 3 criterios principales.
5. **Construir la cuadrícula de comparación**  -  solo para SUS 3 criterios principales (no una matriz de 30 filas). Cada fila: nosotros vs ellos, veredicto honesto (GANAMOS / GANAN ELLOS / EMPATE), una frase de por qué.
6. **Preguntas con trampa incluida.** 3 preguntas que el usuario hace en la próxima llamada para sacar a la luz debilidades del competidor de forma natural, no son trucos, es descubrimiento genuino. Cada una atada a un dolor conocido del competidor.
7. **Respuestas a objeciones.** Anticipo 3 objeciones que el representante del competidor levanta sobre nosotros; redacto una respuesta de 2 frases para cada una, anclada en nuestros diferenciadores (sin afirmaciones falsas).
8. **Puntos de prueba para citar.** 2-3 historias de clientes de la sección de cuentas ancla del playbook que calcen con el perfil del prospecto. Si las cuentas ancla están flojas, pregunto una vez por la URL de Notion / Google Doc que liste los casos más citados; lo integro al playbook en la próxima corrida de `set-up-my-sales-info`.
9. **Escribir** en `battlecards/{competitor-slug}-{prospect-slug}.md` con: encabezado de prospecto + competidor, cuadrícula de criterios, preguntas con trampa incluida, respuestas a objeciones, puntos de prueba, pie de página con fuentes de investigación.
10. **Agregar a `outputs.json`**  -  leer-combinar-escribir de forma atómica: `{ id (uuid v4), type: "battlecard", title: "{Prospecto} vs {Competidor}", summary, path, status: "draft", createdAt, updatedAt, domain: "meetings" }`.
11. **Entregar al usuario:** "Battlecard lista, cuadrícula de 3 criterios, 3 preguntas con trampa incluida, 3 respuestas a objeciones, 2 puntos de prueba. ¿Quieres que la integre al borrador de seguimiento con `write-my-outreach stage=followup`?"

## Regla de honestidad

Nunca invento un "son débiles en {X}" sin una fuente citada. Si una afirmación no tiene fuente, la marco "(hipótesis, verificar)" para que el usuario no la repita como un hecho. Las battlecards inventadas explotan en las demos.

## Salidas

- `battlecards/{competitor-slug}-{prospect-slug}.md`
- Agrega a `outputs.json` con `type: "battlecard"`, `domain: "meetings"`.

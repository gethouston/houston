---
name: proponerme-para-podcasts
title: "Proponerme para podcasts"
description: "Encuentro podcasts donde escucha tu cliente ideal y redacto un pitch personalizado para cada uno. Preselecciono programas por afinidad de audiencia, verifico que estén activos y escribo correos por programa con un gancho que menciona un episodio real. Nada de plantillas genéricas, tú envías desde tu propia bandeja de entrada."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [twitter]
---


# Proponerme para podcasts

## Cuándo usarlo

- Usuario: "propóneme para podcasts" / "outreach de podcasts" / "encuentra programas para nuestro cliente ideal" / "redacta pitches para {N} programas".
- Cadencia mensual natural, está bien rutinizarlo.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta skill, reviso que las categorías de abajo estén conectadas. Si falta alguna, te digo cuál es, te pido que la conectes desde la pestaña de Integraciones y me detengo.

- **Directorio de podcasts (Listen Notes)**: descubre programas por afinidad de audiencia. Obligatorio.
- **Bandeja de entrada (Gmail, Outlook)**: muestrea tu voz para los correos de pitch. Opcional, pero los borradores se sienten planos sin esto.
- **X / Twitter**: opcional, trae contexto del anfitrión para hacer el gancho más específico.

Si no tienes conectado un directorio de podcasts, me detengo y te pido que conectes Listen Notes desde la pestaña de Integraciones.

## Información que necesito

Primero leo tu contexto de marketing. Por cada campo obligatorio que falte, te hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Tu posicionamiento**: Obligatorio. Por qué lo necesito: el ángulo y la afinidad de audiencia se derivan del posicionamiento. Si falta, pregunto: "¿Quieres que redacte primero tu posicionamiento? Es una sola skill, toma unos cinco minutos."
- **Tu voz**: Obligatoria para los correos de pitch. Si falta, pregunto: "Conecta tu bandeja de enviados para que pueda muestrear tu voz, o pega dos o tres correos que hayas enviado."
- **El ángulo y la audiencia objetivo**: Obligatorio. Por qué lo necesito: define qué programas preselecciono. Si falta, pregunto: "¿Sobre qué ángulo quieres presentarte, y para qué audiencia: fundadores, operadores, inversionistas, compradores técnicos?"
- **Programas a excluir**: Opcional. Si falta, pregunto: "¿Hay programas a los que ya les propusiste algo o que quieres saltarte? Si no tienes una lista, sigo sin exclusiones."

## Pasos

1. **Leo el documento de posicionamiento**: `context/marketing-context.md`. Si falta o está vacío, me detengo y te digo que corras primero `set-up-my-marketing-info`.

2. **Leo `config/voice.md` y `config/podcast-targets.json` (si existe).** Si falta `podcast-targets.json`, hago una pregunta puntual:
   > "¿Sobre qué ángulo quieres presentarte? Por ejemplo, 'operaciones SaaS para fundador solo', 'IA para contabilidad de back-office', 'de bootstrapped a rentable'. ¿Y para qué audiencia: fundadores, operadores, inversionistas, compradores técnicos? Voy a escribir esto en `config/podcast-targets.json`."
   Capturo `{ angle, audience, excludeShows?, capturedAt }`.

3. **Descubro podcasts objetivo.** Ejecuto `composio search podcast` (o `composio search listen-notes`) para encontrar la herramienta de directorio de podcasts. La ejecuto con el ángulo y la audiencia, y traigo de 10 a 20 candidatos. Si no hay herramienta de directorio conectada, te digo qué categoría conectar y me detengo. Nunca invento programas.

4. **Clasifico y filtro.** Por cada candidato, evalúo:
   - **Afinidad de audiencia.** ¿Coincide con el cliente ideal del documento de posicionamiento? ¿Segmento de audiencia nombrado?
   - **Salud del programa.** ¿Publica al menos mensualmente, episodios recientes en los últimos 90 días?
   - **Ángulo del anfitrión.** ¿El anfitrión entrevista a operadores/fundadores de nuestro rubro?
   - **Accesibilidad.** ¿Existe una vía de contacto (correo, formulario, Twitter)?
   Me quedo con los 5 a 8 mejores. Descarto los inactivos, fuera de tema o inaccesibles.

5. **Redacto los pitches por programa.** Por cada programa que conservo:
   - **Gancho** (línea de asunto + frase de apertura): hace referencia a un episodio reciente o ángulo específico para que el anfitrión vea que lo escuchamos.
   - **Ángulo**: la idea de episodio específica que proponemos, ligada al enunciado de posicionamiento. De 2 a 3 frases.
   - **Prueba**: de 2 a 3 viñetas: tu rol, un resultado o métrica específica, un punto de vista sorprendente para el aire.
   - **Pedido**: de bajo compromiso: "¿15 minutos para ver si encaja?" / "Responde si el ángulo te interesa y te envío una hoja resumen."
   - Voz: la ajusto a `config/voice.md`; me inclino por lo cálido y específico.

6. **Escribo** todos los pitches en un solo archivo en `podcast-pitches/{YYYY-MM-DD}.md` de forma atómica. Secciones por programa. Estructura del archivo:
   ```markdown
   # Lote de pitches de podcasts - {YYYY-MM-DD}

   **Ángulo:** {desde config}
   **Audiencia:** {desde config}
   **Programas objetivo:** {cantidad}

   ---

   ## 1. {Nombre del programa} - anfitrión: {anfitrión}
   - Audiencia: {descripción}
   - Por qué este programa: {una línea}
   - Episodio reciente referenciado: {título + URL}
   - Contacto: {correo / URL del formulario / usuario}

   **Asunto:** {línea de asunto}

   {cuerpo completo del correo de pitch}

   ---

   ## 2. {Nombre del programa} ...
   ```

7. **Agrego a `outputs.json`**: nueva entrada, `type: "podcast-pitch"`, `path: "podcast-pitches/{YYYY-MM-DD}.md"`, `status: "draft"`.

8. **Resumo al usuario**: un párrafo: "Le propuse a {N} programas: {list of show names}. Mejor coincidencia: {show}, el anfitrión entrevista a {ideal customer} y sacó un episodio reciente sobre {angle}. Revísalos, elige cuáles enviar, y envíalos desde tu bandeja de entrada, yo nunca envío nada."

## Resultados

- `podcast-pitches/{YYYY-MM-DD}.md`
- Se agrega a `outputs.json` con `{ id, type: "podcast-pitch", title, summary, path, status: "draft", createdAt, updatedAt }`.

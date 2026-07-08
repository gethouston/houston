---
name: escribir-variantes-de-copy
title: "Escribir variantes de copy"
description: "Obtén variantes de copy para la pieza que más lo necesita ahora mismo. Elige la tarea: variantes de titular para una página, opciones de botón de llamada a la acción, copy de anuncio para una campaña, o una pasada para ajustar un copy existente. Cada variante se basa en una cita real de un cliente o una afirmación de posicionamiento, ordenadas para que sepas qué probar primero. Solo borradores."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [reddit, firecrawl, linkedin]
---


# Escribir variantes de copy

Un skill para cada necesidad de variantes de copy. El parámetro `job` define la forma, las reglas de fuente y el formato de salida. Regla compartida en todas las tareas: cada variante se basa en una cita real de un cliente o una afirmación del documento de posicionamiento, nada de lenguaje de marketero, nada inventado.

## Parámetro: `job`

- `headlines` - 10 pares de titular + subtítulo para una página indicada, cada uno citando una frase textual de un cliente, con los 3 mejores marcados para probar primero. Salida: `headline-variants/{page-slug}-{YYYY-MM-DD}.md`.
- `ctas` - 5 a 7 variantes de copy para el botón de llamada a la acción, cada una emparejada con la objeción que responde y el resultado que implica. Salida: `cta-variants/{page-slug}-{YYYY-MM-DD}.md`.
- `ad-copy` - 10 titulares + 5 descripciones + 3 conceptos creativos para una campaña y plataforma indicadas, respetando los límites de caracteres de cada plataforma, cada uno basado en una cita fuente. Salida: `ad-copy/{campaign-slug}.md`.
- `edit` - una pasada de ajuste en cinco barridos sobre un copy existente (claridad, voz, especificidad, extensión, CTAs) con antes/después/por qué en cada línea cambiada. Salida: `copy-edits/{page-slug}-{YYYY-MM-DD}.md`.

El usuario nombra la tarea en lenguaje natural ("10 titulares para mi página de inicio", "mejor CTA para el registro", "copy de anuncios para el lanzamiento de Q2", "ajusta mi página de about") -> infiero. Si es ambiguo -> hago UNA pregunta nombrando las cuatro tareas.

## Cuándo usarlo

**headlines:**
- "10 variantes de titular para mi página de inicio"
- "Ganchos alternativos para el hero de la landing page de {campaign}"
- "Opciones de titular para la página de precios"
- Suele seguir a `write-my-page-copy` o `audit-a-surface` (surface=landing-page) cuando el titular queda marcado como el arreglo a hacer.

**ctas:**
- "Mejor CTA para el botón de registro"
- "Variantes de CTA para la página de precios"
- "¿Qué debería decir el botón de demo?"
- Suele seguir a `write-copy-variants` (job=headlines) o `write-copy-variants` (job=edit) cuando el CTA queda marcado como débil.

**ad-copy:**
- "Redacta 10 variantes de copy de anuncios para {product}"
- "Escribe titulares de búsqueda de Google para {keyword}"
- "Dame creatividades de Meta para el lanzamiento de {campaign}"
- "Copy de anuncios que suene como mis clientes realmente hablan" / "10 titulares, cada uno con la cita detrás" / "extrae de las reseñas de G2 y escribe variantes para Meta a partir de eso" - el mismo skill, la regla de la cita textual ya es innegociable.
- Sigue a `plan-a-campaign` (traspaso: "Para el copy, corre `write-copy-variants` job=ad-copy sobre los ángulos de esta campaña") o `mine-my-sales-calls` (convierte frases extraídas en variantes de anuncio).

**edit:**
- "Edita el copy de mi {page}"
- "Ajusta esto, está muy largo"
- "Pule mi página de about"
- "Revisa y afila esto"
- Se llama después de `write-my-page-copy` para pulir el borrador final en una pasada enfocada.

## Conexiones que necesito

Corro el trabajo externo a través de Composio. Antes de que este skill corra, reviso que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Extracción web (Firecrawl)** - opcional para `headlines` y `ad-copy` (trae la página y las reseñas de la categoría de forma limpia; si no, cae en una búsqueda HTTP básica). Requerido para `edit` cuando das una URL en lugar de pegar el copy.
- **Reddit** - opcional para `headlines` y `ad-copy`, me permite extraer subreddits de la categoría en busca de frases textuales cuando no hay insights de llamadas.
- **Redes sociales (LinkedIn)** - opcional para `ad-copy`, las restricciones de formato cambian según la plataforma y ajusto el copy a la que elijas.
- **Bandeja de entrada (Gmail, Outlook)** - opcional para `ctas` y `edit`, para muestrear tu voz. Las ediciones se sienten planas sin esto.

Para `headlines` y `ad-copy`: si no tienes insights de llamadas, la página tiene tanto JavaScript que la extracción básica no trae nada legible, y no puedes pegar algunas citas de clientes, me detengo.

Para `ctas`: puedo trabajar sin ninguna conexión, tu documento de posicionamiento y los insights de llamadas son los insumos que importan.

Para `edit`: puedo trabajar sin conexiones si pegas el copy directamente.

## Información que necesito

Primero leo tu contexto de marketing. Por cada campo requerido que falte, hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Tu posicionamiento** - Requerido (todas las tareas). Por qué lo necesito: cada variante tiene que basarse en tu categoría y tu cliente ideal, no en fórmulas genéricas. Si falta, pregunto: "¿Quieres que redacte tu posicionamiento primero? Es un skill, toma unos cinco minutos."
- **Tu voz** - Requerido (todas las tareas). Por qué lo necesito: las variantes con la voz equivocada no sirven; para `edit`, sin las reglas de voz la pasada termina sonando a chatbot. Si falta, pregunto: "¿Conectas tu bandeja de enviados para que muestree tu voz, o me pegas dos o tres cosas que hayas escrito?"
- **La página y la conversión principal** - Requerido para `headlines` y `ctas`. Por qué lo necesito: un titular de hero y un meta-title cargan restricciones distintas; un CTA de registro y uno de precios cumplen funciones distintas. Si falta, pregunto: "¿Para qué página es esto, y cuál es la única acción que debería tomar quien la visita?"
- **Citas de clientes** - Requerido para `headlines` y `ad-copy`. Por qué lo necesito: no escribo un titular sin una frase real detrás. Si falta, pregunto: "¿Conectas Gong o Fireflies para que extraiga de tus llamadas de venta, me pegas cinco frases textuales de clientes, o me apuntas a reseñas de G2 / Capterra?"
- **Principales objeciones** - Opcional para `ctas`. Si falta, pregunto: "¿Qué hace que quien visita dude frente a este botón? Si no lo sabes, tomo las principales objeciones de tu posicionamiento."
- **La plataforma de anuncios** - Requerido para `ad-copy`. Por qué lo necesito: Google, Meta y LinkedIn cargan límites de caracteres distintos. Si falta, pregunto: "¿En qué plataforma corren estos anuncios, Google, Meta, LinkedIn, u otra?"
- **La campaña o el ángulo** - Requerido para `ad-copy`. Por qué lo necesito: diez variantes sin un ángulo objetivo es tirar de todo un poco. Si falta, pregunto: "¿Para qué campaña o ángulo son estos anuncios?"
- **El copy a editar** - Requerido para `edit`. Si falta, pregunto: "Pégame el copy que quieres editado, o dame la URL de la página."

## Pasos

### Pasos compartidos (todas las tareas)

1. **Leer el documento de posicionamiento** en `context/marketing-context.md`. Si falta, le digo al usuario que corra `set-up-my-marketing-info` primero y me detengo.
2. **Leer `config/voice.md`.** Si falta, hago UNA pregunta nombrando la mejor modalidad (bandeja conectada vía Composio > pegar 2-3 muestras). Escribo antes de continuar.
3. **Fuente del lenguaje del cliente, en orden de prioridad** (para `headlines`, `ctas`, `ad-copy`):
   - a) `call-insights/` - si la carpeta existe -> leo los 3-5 archivos más recientes. Extraigo frases textuales de dolor / deseo / disparador.
   - b) `research/` - bancos de citas de briefs de investigación.
   - c) Si no existe ninguna -> corro `composio search` para herramientas de extracción de reseñas (G2, Capterra, Trustpilot, Reddit, App Store). Extraigo reseñas de competidores / categoría. Cito textual.
   - d) Si no hay herramienta de extracción de reseñas conectada -> pido al usuario conectar una categoría, pegar 5-10 citas de clientes, o apuntar a URLs de reseñas. Me detengo.

### Según la tarea (`job`):

#### `headlines`

4. **Identificar la página + la conversión principal.** Leo `config/primary-page.json`. Si el usuario nombra una página distinta -> pregunto la URL / conversión si no es obvia. Continúo.
5. **Armar el banco de citas.** 10-20 frases textuales, cada una etiquetada `pain` / `desire` / `objection` / `trigger` / `positioning-doc`. Cito la fuente (ID de llamada / plataforma de reseña + URL / línea del documento de posicionamiento).
6. **Generar variantes.** 10 pares de titular + subtítulo. Para cada uno:
   - Titular (voz del founder, basado en una cita específica del banco, nombro la etiqueta de la cita).
   - Subtítulo, 1-2 líneas que expanden el titular con especificidad.
   - Etiqueta de ángulo, una de: resultado-sobre-función, enfoque-en-el-problema, "sin X", contraintuitivo, urgencia, con-prueba-social, definición-de-categoría, transformación, pregunta-gancho, numérico.
   Respeto las restricciones de longitud de la página (hero ~menos de 12 palabras, meta titles ~60 caracteres), pregunto si no está claro.
7. **Ordenar los 3 mejores para probar primero.** Ordeno por: (a) fuerza de la cita fuente (frecuencia / intensidad del dolor), (b) alineación con la afirmación principal del documento de posicionamiento, (c) contraste con el copy actual de la página. Nombro el titular que se mantiene como control + 3 retadores.
8. **Ganchos de traspaso.** Si la variante top necesita una prueba A/B formal -> nombro `measure-my-marketing` (scope=ab-test). Si necesita trabajo de CTA -> nombro `write-copy-variants` (job=ctas) como siguiente paso.
9. **Escribir** de forma atómica en `headline-variants/{page-slug}-{YYYY-MM-DD}.md` (`*.tmp` -> renombrar). Primero el banco de citas, luego las variantes con la cita fuente junto a cada una.
10. **Agregar a `outputs.json`** - `{ id, type: "headline-variants", title, summary, path, status: "draft", createdAt, updatedAt }`.
11. **Resumir al usuario** - las 3 variantes top a probar, el dolor que cada una atiende, la ruta al archivo completo.

#### `ctas`

4. **Leer `config/primary-page.json`** para el evento de conversión principal. Si el usuario nombra un botón / conversión distinto, lo acepto y continúo.
5. **Identificar la superficie.** Pregunto (si no está claro) UNA cosa: qué botón, qué página, qué paso del flujo. Una respuesta corta pegada está bien.
6. **Listar objeciones.** Extraigo las 3-5 objeciones principales del documento de posicionamiento (o de `call-insights/` si existe). Si las objeciones no están documentadas, pido al usuario las 2 principales ("¿Qué hace que quien visita dude frente a este botón?") y lo anoto en la salida como "señalado por el founder".
7. **Redactar 5-7 variantes de CTA.** Cada una:
   - Texto exacto del botón (corto, 2-5 palabras).
   - Objeción que responde (nombrada de la lista de arriba).
   - Resultado implícito (qué obtiene el usuario al hacer clic).
   - Ángulo: orientado-a-la-acción, orientado-al-resultado, reversión-de-riesgo, prueba-social, micro-compromiso, orientado-a-la-especificidad, urgencia.
   Nunca: "Enviar", "Haz clic aquí", "Más información" sin objeto.
8. **Ordenar las 2 mejores para probar primero.** Según qué objeción es más común en la evidencia y qué resultado respalda más el documento de posicionamiento.
9. **Marcar el copy de apoyo.** Anoto si el CTA necesita una línea de confianza debajo ("No se requiere tarjeta de crédito" / "Cancela cuando quieras") y si ese copy está atado a una política real (no inventar).
10. **Ganchos de traspaso.** Si las variantes top necesitan una prueba A/B, nombro `measure-my-marketing` (scope=ab-test).
11. **Escribir** de forma atómica en `cta-variants/{page-slug}-{YYYY-MM-DD}.md` (`*.tmp` -> renombrar).
12. **Agregar a `outputs.json`** - `{ id, type: "cta-variants", title, summary, path, status: "draft", createdAt, updatedAt }`.
13. **Resumir al usuario** - los 2 CTAs top, la objeción que responde cada uno, la ruta al archivo completo.

#### `ad-copy`

4. **Leer configuración:** `config/channels.json` (las restricciones de formato varían según el canal, Google RSA vs. Meta vs. LinkedIn). Si no se nombra un canal, pregunto cuál en una sola pregunta.
5. **Armar el banco de citas.** 10-20 frases textuales, cada una etiquetada `pain` / `desire` / `objection` / `trigger`. Cito la fuente (ID de llamada / plataforma de reseña / URL).
6. **Generar variantes.** Para la campaña / ángulo indicado, produzco:
   - **Titulares** - 10 variantes, cada una basada en una cita específica (cito la etiqueta de la cita junto a cada una). Respeto los límites de caracteres de cada plataforma (Google RSA 30; Meta principal ~40; LinkedIn ~70).
   - **Descripciones** - 5 variantes, con la misma regla de base.
   - **CTAs** - 5 variantes.
   - **Conceptos creativos** (para piezas visuales) - 3 briefs cortos (dirección de imagen + texto superpuesto), cada uno atado a un ángulo.
7. **Ordenar** las variantes por fuerza de la hipótesis: qué cita tiene el dolor más fuerte, qué ángulo respalda más el documento de posicionamiento. Nombro las 3 mejores para probar primero.
8. **Escribir** de forma atómica en `ad-copy/{campaign-slug}.md` (`*.tmp` -> renombrar). Formato: primero el banco de citas, luego las variantes con la cita fuente junto a cada una.
9. **Agregar a `outputs.json`** - `{ id, type: "ad-copy", title, summary, path, status: "draft", createdAt, updatedAt }`. Fusiono, escritura atómica.
10. **Resumir al usuario** - las 3 variantes top a probar, el dolor que atienden, la ruta al archivo completo.

#### `edit`

4. **Recopilar el copy fuente.** Si el usuario pegó el texto -> trabajo desde ahí. Si dio una URL -> lo extraigo con cualquier extractor conectado vía Composio (descubro el slug con `composio search`, ejecuto por slug). Si no hay nada -> pido el copy o la URL y me detengo.
5. **Correr los barridos** en orden. Cada barrido enfocado, sin mezclar. Después de cada uno, reviso que los barridos anteriores no se hayan visto afectados.
   - **Claridad** - frases confusas, pronombres poco claros, jerga, ambigüedad, contexto faltante, frases que hacen demasiado.
   - **Voz** - consistencia con `config/voice.md`. Marco las líneas donde la voz se rompe (empezó casual, se volvió corporativa; cambió de persona; etc.).
   - **Especificidad** - cambio afirmaciones vagas por concretas. "Ahorra tiempo" -> "Reduce el reporte semanal de 4 horas a 15 minutos." Números por encima de adjetivos. Si el usuario no da números, marco `[FALTA NÚMERO]` en línea, no invento.
   - **Extensión** - elimino relleno. "Con el fin de" -> "para". "En este momento" -> "ahora". Quito signos de exclamación.
   - **CTAs** - cambio CTAs débiles ("Enviar" / "Haz clic aquí" / "Más información") por acción + resultado ("Empieza mi prueba gratis" / "Ver precios para mi equipo"). Si el cambio es de fondo -> lo paso a `write-copy-variants` (job=ctas).
6. **Formato de salida.** Cada línea cambiada -> tres filas:
   - **Actual** (textual).
   - **Propuesta**.
   - **Por qué** - una línea. Nombro el barrido que lo detectó (claridad / voz / especificidad / extensión / CTA).
7. **Preservar el mensaje central.** Si hace falta reescribir la idea, lo marco, no lo sobrescribo. Paso esa sección a `write-my-page-copy`.
8. **Marcar contradicciones** con el documento de posicionamiento en una sección aparte.
9. **Escribir** de forma atómica en `copy-edits/{page-slug}-{YYYY-MM-DD}.md` (`*.tmp` -> renombrar).
10. **Agregar a `outputs.json`** - `{ id, type: "copy-edit", title, summary, path, status: "draft", createdAt, updatedAt }`.
11. **Resumir al usuario** - cantidad de líneas cambiadas, el cambio de mayor impacto, la ruta a la pasada.

## Lo que nunca hago

- Inventar citas de clientes, estadísticas o testimonios para "reforzar" una línea. Si no puedo apuntar un titular a una cita o línea específica del documento de posicionamiento, no lo escribo.
- Escribir lenguaje de marketero ("Plataforma revolucionaria con IA") en ninguna variante, eso va directo a la basura.
- Inventar líneas de confianza ("No se requiere tarjeta de crédito" solo si es cierto).
- Usar CTAs genéricos sin objeto ("Enviar", "Haz clic aquí", "Más información", "Empieza ahora" sin objeto).
- Prometer resultados que el producto no entrega.
- Reescribir el mensaje central en la tarea `edit`, eso es trabajo de `write-my-page-copy`.
- Suavizar la voz del usuario hasta volverla lenguaje de marketing genérico.
- Enviar, publicar o poner en vivo, tú envías cada pieza.

## Salidas

- `headline-variants/{page-slug}-{YYYY-MM-DD}.md` (job=headlines)
- `cta-variants/{page-slug}-{YYYY-MM-DD}.md` (job=ctas)
- `ad-copy/{campaign-slug}.md` (job=ad-copy)
- `copy-edits/{page-slug}-{YYYY-MM-DD}.md` (job=edit)
- Todas se agregan a `outputs.json` con el `type` correspondiente: `"headline-variants"` | `"cta-variants"` | `"ad-copy"` | `"copy-edit"`.

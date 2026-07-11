---
name: analizar-mis-tickets
title: "Analizar mis tickets"
description: "Reviso tus tickets recientes y extraigo lo que tus clientes realmente están diciendo. Agrupo las quejas textuales, las solicitudes de funciones, los puntos de fricción donde tu mensaje no coincide con la realidad, y las frases que vale la pena robarte para tu landing page. El mejor insumo para tu próxima conversación de roadmap, ajuste de posicionamiento, o actualización para inversionistas."
version: 1
category: Soporte
featured: yes
image: headphone
integrations: [gmail]
---


# Analizar mis tickets

Distinta de `flag-a-signal signal=repeat-question`. Esa skill genera candidatos a vacíos en la base de conocimiento (vista operativa). Esta genera un reporte estratégico de voz del cliente (vista de producto/posicionamiento). Mismos datos de origen, distinto consumidor.

## Cuándo usarla

- "analiza los últimos {N} tickets en busca de temas."
- "¿qué están pidiendo los clientes?"
- Antes de escribir el roadmap, una actualización de landing page, o un reporte para inversionistas.
- Solicitudes puntuales de investigación estratégica.

## Conexiones que necesito

Hago el trabajo externo a través de Composio. Antes de ejecutar esta skill, verifico que las categorías de abajo estén conectadas. Si falta alguna → nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Bandeja de entrada** (Gmail)  -  fuente de los hilos de clientes cuando `conversations.json` no cubre el periodo. Opcional si los datos locales están al día.
- **Help-desk de soporte** (Intercom / Zendesk / Help Scout)  -  fuente alterna de tickets. Opcional.

Si ninguna está conectada y el índice local de conversaciones es escaso, me detengo y te pido que conectes tu bandeja de entrada o tu help-desk para tener suficiente señal.

## Información que necesito

Primero leo tu contexto de soporte. Por cada campo obligatorio que falte, te hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > pegar texto) y espero.

- **Posicionamiento actual**  -  Obligatorio. Por qué lo necesito: detecto fricción comparando el lenguaje real de los clientes contra lo que tú afirmas. Si falta, pregunto: "¿Cómo describes hoy lo que hace el producto? Comparte la URL de tu página principal o un párrafo."
- **Ventana de tiempo**  -  Obligatorio. Por qué lo necesito: 30 días es el valor por defecto, pero lo amplío o reduzco si quieres. Si falta, pregunto: "¿Qué tan atrás debo mirar? ¿Últimos 30 días, el último trimestre, desde el lanzamiento?"
- **Filtro de segmento**  -  Opcional. Por qué lo necesito: me permite agrupar por tipo de cliente en vez de mezclar todo. Si no lo tienes, sigo con TBD y muestro grupos mixtos.

## Pasos

1. **Leo `context/support-context.md`.** Para el posicionamiento actual + la lista VIP. Si no existe, corro primero `set-up-my-support-info`.

2. **Defino la ventana.** Por defecto: últimos 30 días. Pregunto si quieres otra ventana.

3. **Leo los datos de conversación.**
   - `conversations.json`  -  filtro según la ventana.
   - Por cada conversación, leo `conversations/{id}/thread.json` para el contenido real de los mensajes. Prefiero los mensajes del propio cliente, no tus respuestas.
   - Salto mensajes que parecen de bot o que claramente no son señal.

4. **Leo la señal del centro de ayuda.**
   - `requests.json`  -  solicitudes de funciones en la ventana, con atribución.
   - `patterns.json`  -  temas de preguntas repetidas ya detectados.
   - Los uso para verificar los grupos y atribuir solicitudes.

5. **Extraigo la señal.**
   - **Dolores (top 5):** agrupo las frases textuales de queja. Ordeno por frecuencia. En cada una, conservo 2-3 citas textuales (identificadores tachados).
   - **Solicitudes de funciones (top 5):** agrupo las solicitudes. Ordeno por cantidad de clientes distintos que la piden (no por total de menciones). Anoto qué VIPs hay en cada grupo.
   - **Frases de fricción:** oraciones que contradicen el posicionamiento actual (por ejemplo, el posicionamiento dice "fácil de configurar" pero 5 clientes describieron la configuración como "confusa"; lo marco).
   - **Citas útiles para posicionamiento:** 2-3 líneas textuales buenas para el copy de la landing page, con atribución del tipo de cliente.
   - **Patrones emergentes:** cosas que tal vez no se han notado, por ejemplo "3 clientes SMB distintos preguntaron sobre la API esta semana."

6. **Redacto el reporte.** Markdown, ~500-700 palabras. Estructura:

   ```markdown
   # Voz del cliente  -  {window}

   **Ventana:** {start} → {end}
   **Fuente:** {N} conversaciones, {N} solicitudes de funciones
   **Versión del documento de contexto:** basado en `context/support-context.md` al {date}

   ## Top 5 dolores (ordenados por frecuencia)

   1. **{Pain name}**  -  {count} casos
      > "{verbatim quote 1}"
      > "{verbatim quote 2}"
      *Afecta a: {segments or VIPs}*

   2. … (se repite)

   ## Top 5 solicitudes de funciones (ordenadas por solicitantes distintos)

   1. **{Feature}**  -  {N} clientes distintos incluyendo {VIP-if-any}
      *Solicitudes vinculadas:* {paths into requests.json}
   2. …

   ## Fricción con el posicionamiento actual

   {2-4 elementos donde el lenguaje de los tickets contradice el
   posicionamiento en context/support-context.md. Cada elemento: la afirmación, las
   citas que la contradicen, un cambio concreto que podríamos hacer.}

   ## Citas útiles para posicionamiento

   - "{quote}"  -  {customer type}
   - "{quote}"  -  {customer type}
   - "{quote}"  -  {customer type}

   ## Patrones emergentes

   {2-4 viñetas sobre patrones que tal vez no hayas notado.}

   ## Próximos pasos recomendados

   1. **Enviar a marketing/producto:** {specific quote or pain}
   2. **Actualizar posicionamiento:** {one friction point worth fixing}
   3. **Construir/priorizar:** {one feature cluster}
   ```

7. **Escribo en `voc/{YYYY-MM-DD}.md`** de forma atómica.

8. **Agrego a `outputs.json`** con `type: "voc-synthesis", domain: "quality"`, título = "voice-of-customer  -  {window}", resumen = el dolor principal + la solicitud principal, ruta, estado `ready`.

9. **Te resumo.** Titular: el mayor dolor + la mayor solicitud + 3 citas útiles para posicionamiento pegadas directo. Ofrezco encadenarlo con `review-my-support scope=weekly` para que la próxima revisión del lunes traiga este hallazgo.

## Resultados

- `voc/{YYYY-MM-DD}.md`
- Agrega a `outputs.json` con `type: "voc-synthesis", domain: "quality"`.

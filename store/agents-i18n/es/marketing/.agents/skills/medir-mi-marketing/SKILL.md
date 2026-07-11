---
name: medir-mi-marketing
title: "Medir mi marketing"
description: "Configuro la medición que necesitas para que dejes de adivinar. Elige lo que necesitas: un plan de seguimiento de eventos que puedes entregarle a un desarrollador, una especificación completa de prueba A/B con hipótesis y tamaño de muestra, o un resumen semanal de LinkedIn que muestra cómo funcionaron tus publicaciones y con quién vale la pena interactuar."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [linkedin, reddit]
---


# Medir mi marketing

Un skill para cada tarea de medición. El parámetro `scope` elige la forma del resultado: una especificación de seguimiento de eventos lista para un desarrollador, un documento riguroso de prueba A/B, o un resumen semanal de rendimiento en LinkedIn. Todo basado en tu posicionamiento para que midas lo que le importa a tu cliente ideal, no números vanidosos.

## Parámetro: `scope`

- `tracking-plan`  -  plan de seguimiento de eventos (nombre del evento, disparador, propiedades, dueño por paso) más una matriz de UTM para que paid / social / email sean comparables en GA4 o tu herramienta de analítica. Resultado: `tracking-plans/{slug}.md`.
- `ab-test`  -  especificación completa de prueba que cubre la hipótesis (PICOT), control vs variante, métricas primarias y secundarias, estimación de tamaño de muestra con MDE y poder estadístico, duración, y criterios de go/no-go. Resultado: `ab-tests/{slug}.md`.
- `linkedin-digest`  -  resumen semanal de las estadísticas de tus propias publicaciones (alcance, interacción, nuevos seguidores) más publicaciones destacadas de tu red que valen la pena. Resultado: `linkedin-digests/{YYYY-MM-DD}.md`.

Tú nombras el `scope` en lenguaje simple ("especifica el seguimiento de eventos para el registro", "prueba A/B para la página de precios", "resumen de LinkedIn", "cómo les fue a mis publicaciones") y yo infiero. Si es ambiguo, hago UNA pregunta que nombra las tres opciones.

## Cuándo usarlo

**tracking-plan:**
- "Especifica el seguimiento de eventos de registro a activación"
- "Plan de UTM para las campañas del Q2"
- "Plan de seguimiento para la nueva página de precios"
- Lo invoca `plan-a-campaign` cuando la campaña necesita eventos o UTMs que todavía no existen.

**ab-test:**
- "Prueba A/B para el titular de la página de precios"
- "Diseña un experimento para {cambio propuesto}"
- "Hipótesis para cambiar {X} por {Y}"
- Suele seguir a `audit-a-surface` (surface=landing-page) cuando las correcciones señaladas no son obvias, entonces se diseña una prueba.

**linkedin-digest:**
- "Resumen de LinkedIn" / "cómo les fue a mis publicaciones esta semana" / "resumen semanal de LinkedIn" / "qué publicó mi red".
- Semanal, rutina de viernes o domingo por la noche.

## Conexiones que necesito

Hago el trabajo externo a través de Composio. Antes de ejecutar este skill, verifico que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Analítica (PostHog, GA4, Mixpanel)**  -  necesaria para `tracking-plan` (convenciones de destino) y `ab-test` (leer la tasa de conversión base y el tráfico actual para que la estimación de tamaño de muestra no sea una suposición). Para `tracking-plan`: si es "ninguna" especifico el plan y recomiendo conectar PostHog (nivel gratuito) antes de implementarlo. Para `ab-test`: obligatoria si quieres una estimación real, opcional si pegas la línea base.
- **LinkedIn**  -  Obligatorio para `linkedin-digest` (traer las estadísticas de tus publicaciones y las de tu red). No existe una alternativa de pegado para los datos de interacción de LinkedIn. No se necesita para los otros scopes.

Si no hay ninguna herramienta de analítica conectada para `tracking-plan`, sigo adelante con la especificación y lo señalo, pero recomiendo conectar PostHog o GA4 antes de implementarla.

Si no hay ninguna herramienta de analítica conectada para `ab-test`, me detengo y te pido que conectes una, o que pegues tu tasa de conversión base más el tráfico semanal.

Si LinkedIn no está conectado para `linkedin-digest`, me detengo y te pido que lo enlaces desde la pestaña de Integraciones.

## Información que necesito

Primero leo tu contexto de marketing. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Tu posicionamiento**  -  Obligatorio (los tres scopes). Por qué lo necesito: para `tracking-plan` me indica qué cuenta como un evento significativo frente a ruido; para `ab-test` la hipótesis tiene que conectarse a un dolor u objeción real de tu cliente ideal; para `linkedin-digest` juzgo las publicaciones contra tu categoría y tu cliente ideal. Si falta, pregunto: "¿Quieres que primero redacte tu posicionamiento? Es un skill, toma unos cinco minutos."
- **Tu evento de conversión principal**  -  Obligatorio para `tracking-plan` y `ab-test`. Por qué lo necesito: todo flujo termina en un evento de éxito medible (`tracking-plan`); esa es la métrica primaria de la prueba (`ab-test`). Si falta, pregunto: "¿Cuál es el único evento que significa que este flujo funcionó: registro, activación, compra, demo agendada?"
- **El flujo a especificar**  -  Obligatorio para `tracking-plan`. Por qué lo necesito: los planes de seguimiento se acotan a un flujo a la vez. Si falta, pregunto: "¿Qué flujo estamos siguiendo: registro, activación, de precios a pago, atribución de campaña, u otro?"
- **Tus canales publicitarios**  -  Opcional para `tracking-plan`, solo si quieres una matriz de UTM que los nombre. Si falta, pregunto: "¿Para qué canales quieres plantillas de UTM: Google, Meta, LinkedIn, newsletter, redes orgánicas? Si no tienes una lista, sigo adelante con los valores comunes por defecto."
- **La variable a probar**  -  Obligatorio para `ab-test`. Por qué lo necesito: una variable por prueba, sin trucos multivariados. Si falta, pregunto: "¿Qué elemento único estamos probando: titular, imagen principal, texto del CTA, diseño de precios, sellos de confianza, u otro?"
- **Tasa de conversión base**  -  Obligatorio para `ab-test`. Por qué lo necesito: determina el cálculo del tamaño de muestra. Si falta, pregunto: "¿Cuál es la tasa de conversión actual de esta página o flujo? Si no tienes un número, sigo adelante con supuestos y los señalo."
- **Tráfico semanal**  -  Obligatorio para `ab-test`. Por qué lo necesito: convierte el tamaño de muestra en "días de tráfico". Si falta, pregunto: "¿Aproximadamente cuántos visitantes llegan a esta superficie por semana?"
- **Tus temas**  -  Obligatorio para `linkedin-digest`. Por qué lo necesito: filtra qué publicaciones de la red vale la pena atender. Si falta, pregunto: "¿Qué temas quieres que siga: entre tres y cinco temas que realmente te importen?"

## Pasos

### Pasos compartidos (todos los scopes)

1. **Leo el documento de posicionamiento** en `context/marketing-context.md`. Si falta, te digo que ejecutes primero `set-up-my-marketing-info` y me detengo.
2. **Leo la configuración relevante** para el scope, los detalles están en cada rama de abajo.

### Me ramifico según `scope`:

#### `tracking-plan`

3. **Leo la configuración:** `config/analytics.json`, `config/conversion.json`, `config/tracking-prefs.json` si existen. Si el stack de analítica es "ninguno", señalo que el seguimiento se puede especificar pero no implementar, recomiendo conectar PostHog (nivel gratuito) o GA4 vía Composio como mínimo.
4. **Aclaro el flujo.** Tú nombras el flujo ("registro", "activación", "página de precios -> pago", "atribución de campaña"). Lo mapeo a pasos discretos (típicamente 3-7). Hago UNA pregunta si el límite del flujo no es claro (¿evento de inicio? ¿evento de éxito?).
5. **Especificación de seguimiento de eventos**, una fila por evento:
   - `eventName` (snake_case, encabezado por un verbo: `signup_started`, `signup_completed`, `checkout_viewed`, `checkout_completed`).
   - `trigger` (acción de la interfaz / evento del servidor / coincidencia de URL).
   - `properties`  -  3-6 por evento, como mínimo `user_id`, `anonymous_id`, `timestamp`, y dimensiones específicas del flujo (plan, canal, referente).
   - `destination`  -  qué herramienta (GA4 / PostHog / Mixpanel / router de Segment / servidor).
   - `owner`  -  quién lo implementa (fundador solo -> "tú"; si no, el rol).
   - `status`  -  `proposed` / `live` / `deprecated`.
6. **Matriz de UTM**, reglas de nomenclatura para que cada campaña quede etiquetada de forma consistente:
   - `utm_source`  -  plataforma (`google` / `meta` / `linkedin` / `reddit` / `newsletter` / `x`).
   - `utm_medium`  -  tipo de canal (`cpc` / `paid-social` / `email` / `organic-social` / `referral`).
   - `utm_campaign`  -  kebab-case `{yyyy-qX}-{theme}` (por ejemplo `2026-q2-founder-launch`).
   - `utm_content`  -  variante / slot creativo (kebab-case).
   - `utm_term`  -  palabra clave (solo búsqueda).
   Incluyo un ejemplo con la fila llena por cada canal activo en `config/channels.json`.
7. **Lista de verificación de QA**, 5-10 elementos: el evento se dispara en el momento esperado, la deduplicación está resuelta, no hay datos personales (PII) en las propiedades, se respetan las señales de consentimiento, los parámetros de UTM se conservan a través de redirecciones.
8. **Escribo** de forma atómica en `tracking-plans/{slug}.md` (`*.tmp` -> renombrar). Guardo las convenciones de nomenclatura en `config/tracking-prefs.json` para que las próximas ejecuciones las reutilicen.
9. **Agrego una entrada a `outputs.json`**  -  `{ id, type: "tracking-plan", title, summary, path, status: "ready", createdAt, updatedAt }`.
10. **Te resumo el resultado**, cuántos eventos especifiqué, la plantilla de UTM para copiar, la ruta al plan.

#### `ab-test`

3. **Leo la configuración:** `config/conversion.json` (evento primario más tasa base si está definida), `config/analytics.json` (la herramienta que impulsa la prueba).
4. **Aclaro la variable.** Si nombraste el cambio de forma vaga ("prueba la página de precios"), hago una pregunta: "¿Qué elemento: titular, imagen principal, texto del CTA, diseño de la tabla de precios, sellos de confianza, u otro?" Elijo una sola variable. Sin pruebas multivariables en la versión 1.
5. **Hipótesis PICOT:**
   - **P**  -  Población (quién la ve).
   - **I**  -  Intervención (cambio de la variante).
   - **C**  -  Comparación (control = página actual).
   - **O**  -  Resultado (métrica primaria).
   - **T**  -  Tiempo (duración de la prueba).
   La escribo en una sola frase: "Entre {P}, cambiar {I} frente a {C} mejorará {O} en al menos {MDE}% dentro de {T}."
6. **Métricas:**
   - **Primaria**  -  evento de conversión de `config/conversion.json`.
   - **Secundarias**  -  2-3 salvaguardas (tasa de rebote, tiempo en página, activación posterior).
   - **No-métricas**  -  cosas que NO se van a medir (evita pescar resultados a posteriori).
7. **Estimación del tamaño de muestra.** Dada la tasa de conversión base (de la configuración o pegada por ti), el MDE objetivo (te pregunto; por defecto 10% relativo), alfa 0.05, poder 0.80, calculo el tamaño de muestra requerido por variante usando la fórmula estándar de prueba z de dos proporciones. Muestro los números. Los traduzco a "días de tráfico" usando el volumen actual. Si la línea base o el volumen son desconocidos, indico los supuestos y marco el número como una estimación.
8. **Duración y condiciones de parada.**
   - Duración mínima (un ciclo comercial completo, por ejemplo 7 o 14 días aunque la muestra se alcance antes, para evitar el sesgo por día de la semana).
   - Política de revisión anticipada (nada de mirar y detener antes de tiempo; se exceptúan herramientas bayesianas).
   - Condiciones de parada forzosa (una salvaguarda negativa superada en más de X%).
9. **Criterios de go / no-go.** Qué resultado hace que la variante se implemente, qué resultado la descarta, qué resultado lleva a una prueba de seguimiento.
10. **Notas de implementación.** La herramienta que ejecuta la prueba, los IDs de eventos que la impulsan (enlace a `tracking-plans/` si existe), quién hace QA antes del lanzamiento.
11. **Escribo** de forma atómica en `ab-tests/{slug}.md` (`*.tmp` -> renombrar).
12. **Agrego una entrada a `outputs.json`**  -  `{ id, type: "ab-test", title, summary, path, status: "draft", createdAt, updatedAt }`.
13. **Te resumo el resultado**, hipótesis en una frase, muestra requerida, duración, ruta al documento.

#### `linkedin-digest`

3. **Leo `config/platforms.json`, `config/topics.json`.** Confirmo que LinkedIn esté en `active` y `connectedViaComposio`. Si no está conectado, te digo que lo enlaces desde la pestaña de Integraciones y me detengo, el skill necesita la API.
4. **Traigo las estadísticas de tus propias publicaciones.** Ejecuto `composio search linkedin` para encontrar la herramienta de estadísticas de publicaciones / listado de publicaciones propias. La ejecuto. Traigo tus publicaciones de los últimos 7 días con:
   - impresiones / alcance
   - reacciones / comentarios / compartidos / reposts
   - nuevos seguidores ganados ese día si está disponible
   Si falta una métrica, la marco como TBD (pendiente) y anoto la causa probable (por ejemplo, "la API de LinkedIn no expone el delta de nuevos seguidores por publicación").
5. **Traigo las publicaciones de tu red.** Misma categoría de LinkedIn, busco la herramienta de lectura del feed. Traigo los últimos 7 días de tus conexiones. Filtro por alta interacción (decil superior por reacciones) O relevancia temática frente a `config/topics.json`. Me quedo con las 5-10 mejores.
6. **Calculo el resumen.** Produzco:
   - **Tu semana de un vistazo**  -  cantidad de publicaciones, impresiones totales, interacción total, delta de seguidores, mejor publicación, peor publicación.
   - **Patrones**  -  una lectura de una línea sobre qué funcionó (largo del gancho, tema, hora del día si se puede detectar). Cito publicaciones específicas.
   - **Destacados de la red**  -  5-10 publicaciones de conexiones que valen una reacción o respuesta. Cada una: relevancia en una línea + acción sugerida (responder / reaccionar / ignorar).
7. **Escribo** de forma atómica en `linkedin-digests/{YYYY-MM-DD}.md`. Estructura:
   ```markdown
   # LinkedIn Digest  -  semana que termina {YYYY-MM-DD}

   ## Tu semana
   - Publicaciones: {N}
   - Impresiones: {total} ({delta vs semana anterior})
   - Interacción: {reactions} reacciones . {comments} comentarios . {shares} compartidos
   - Nuevos seguidores: {count or TBD}
   - Mejor publicación: [{title or hook}]({url})  -  {metric}
   - Peor publicación: [{title or hook}]({url})  -  {metric}

   ## Qué funcionó
   - {one-line pattern, cited}
   - {one-line pattern, cited}

   ## Destacados de la red
   1. **{Author}**  -  {one-line post summary} ({URL})
      Acción sugerida: {reply / react / ignore} . {why}
   2. ...

   ---

   ## Notas
   - Frescura de los datos: extraídos el {ISO timestamp}
   - Pendientes (TBD): {list}
   ```
8. **Agrego una entrada a `outputs.json`**, nueva entrada, `type: "linkedin-digest"`, `path: "linkedin-digests/{YYYY-MM-DD}.md"`, `status: "draft"`.
9. **Te resumo el resultado**, un párrafo: "Semana que termina el {date}: {N} publicaciones, {impressions} impresiones, la mejor fue {title} ({metric}). {count} destacados de la red señalados. Resumen completo en {path}."

## Lo que nunca hago

- Publicar etiquetas o eventos en vivo, tú (o tu desarrollador) implementas eso. Cada plan de seguimiento es una especificación que se te entrega.
- Afirmar una mejora antes de que corra una prueba. Cada hipótesis es "efecto direccional esperado + por qué", nunca "esto va a convertir mejor".
- Fabricar tasas de conversión base, números de tráfico o métricas de LinkedIn. Si la herramienta no devuelve datos, lo marco como TBD.
- Correr pruebas multivariables en la versión 1, una variable por prueba.
- Enviar, publicar o difundir nada, tú entregas cada pieza.

## Entregables

- `tracking-plans/{slug}.md` (scope=tracking-plan) más escribe/actualiza `config/tracking-prefs.json`
- `ab-tests/{slug}.md` (scope=ab-test)
- `linkedin-digests/{YYYY-MM-DD}.md` (scope=linkedin-digest)
- Todos agregan una entrada a `outputs.json` con el `type` correspondiente: `"tracking-plan"` | `"ab-test"` | `"linkedin-digest"`.
</content>

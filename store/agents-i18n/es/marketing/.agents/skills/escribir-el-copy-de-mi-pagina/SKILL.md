---
name: escribir-el-copy-de-mi-pagina
title: "Escribir el copy de mi página"
description: "Reescribo el copy de cualquier página o superficie dentro del producto. Elige la superficie: página de inicio, precios, acerca de, una landing page, tu flujo de registro, onboarding dentro de la app, muro de pago para actualizar, o un popup. Recibes lo actual frente a lo propuesto con el razonamiento detrás de cada cambio. Solo borradores."
version: 1
category: Marketing
featured: yes
image: megaphone
integrations: [reddit, firecrawl]
---


# Escribir el copy de mi página

Un skill, cada superficie de copy en el sitio y en el producto. El parámetro `surface` define la forma. Posicionamiento, voz, sin citas inventadas, sin porcentajes de mejora prometidos, todo compartido.

## Parámetro: `surface`

- `homepage` | `pricing` | `about` | `landing` - reescritura completa de la página: secciones, titulares, cuerpos, CTAs, ubicación de la prueba social.
- `signup-flow` - copy de la página previa al registro + campo de email + reglas de contraseña + pantalla de verificación + primera pantalla después del registro. Veredictos a nivel de campo (mantener / fusionar / posponer / eliminar).
- `onboarding` - bienvenida dentro del producto, estados vacíos, tooltips, empujones, checklist, confirmación del momento aha.
- `paywall` - modal de actualización / vencimiento de prueba / bloqueo de función: primero una auditoría de timing, luego titular + pila de valor + comparación de planes + anclaje de precio + CTA + prueba social + descarte.
- `popup` - interrupción por salida / scroll / tiempo en página: gancho, oferta, CTAs de aceptar/descartar + disparador + segmentación + límite de frecuencia + métrica de éxito.

Si el usuario nombra la superficie en lenguaje natural, infiero. Si es ambiguo, hago UNA pregunta nombrando las 8 opciones.

## Cuándo usarlo

- Explícito: "reescribe mi {página de inicio / precios / acerca de / landing page en la URL}", "revisión del flujo de registro", "copy de onboarding dentro de la app", "muro de pago para actualizar", "popup de salida".
- `popup` cubre más que salida, también: "modal de captura de leads", "banner de anuncio para {feature}", "popup de carrito abandonado", "popup de scroll en {page}", "banner promocional". Una sola forma: gancho + oferta + CTAs de aceptar/descartar + disparador + segmentación + límite de frecuencia + métrica de éxito.
- Implícito: después de `audit-a-surface` (landing-page / form / site-seo) cuando el siguiente paso es una reescritura completa, no solo una lista de arreglos.

## Conexiones que necesito

Corro el trabajo externo a través de Composio. Antes de que este skill corra, reviso que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Extracción web (Firecrawl)** - opcional. Si no está conectada, caigo en una búsqueda HTTP básica para la página actual y cualquier URL de reseñas públicas, más tosco pero suficiente para citar lo que hay. Para superficies dentro del producto también puedes pegar texto o mandar una captura de pantalla.
- **Extracción de reseñas (Reddit)** - opcional, extrae subreddits de la categoría en busca de frases textuales cuando los insights de llamadas son escasos.

Si no tienes insights de llamadas, la página tiene tanto JavaScript que la extracción básica no trae nada legible, y no puedes pegar algunas citas de clientes, me detengo.

## Información que necesito

Primero leo tu contexto de marketing. Por cada campo requerido que falte, hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **El nombre de tu empresa y tu pitch** - Requerido. Si falta, pregunto: "¿Cómo se llama la empresa, y cómo describes en una frase qué hace?"
- **Tu voz** - Requerido. Por qué lo necesito: esto es reescribir tu propia página, tiene que sonar como tú. Si falta, pregunto: "¿Conectas tu bandeja de enviados para que muestree tu voz, o me pegas dos o tres cosas que hayas escrito?"
- **Tu posicionamiento** - Requerido. Si falta, pregunto: "¿Quieres que redacte tu posicionamiento primero? Es un skill, toma unos cinco minutos."
- **Tu cliente ideal** - Requerido. Por qué lo necesito: fundamenta las propuestas de valor en dolores reales de quien compra. Si falta, pregunto: "¿Quién es el cliente que esta página busca convertir? Un párrafo está bien, o apúntame a tu CRM."
- **La acción principal que debería impulsar esta página** - Requerido para `homepage`, `pricing`, `about`, `landing`. Si falta, pregunto: "¿Cuál es la única acción que quieres que tome quien visita esta página: registrarse, agendar una demo, iniciar una prueba, pedir precios?"
- **La URL de la página o una captura de pantalla** - Requerido. Si falta, pregunto: "Pégame la URL de la página que quieres reescribir. Si es una superficie dentro del producto, mándame una captura de pantalla o pega el copy actual."

## Pasos

1. **Leer el registro + el posicionamiento.** Recopilo los campos requeridos que falten según lo de arriba (UNA pregunta cada uno, mejor modalidad primero). Escribo de forma atómica.
2. **Traer el estado actual.** Superficies accesibles por URL: corro `composio search web-scrape` y ejecuto por slug (Firecrawl / ScrapingBee / equivalente) para traer el HTML renderizado + el texto visible + las URLs de las imágenes principales + el CTA actual. Superficies dentro del producto (onboarding / algunos paywalls / popups): acepto capturas de pantalla, Loom, o copy pegado. Si no hay nada usable, pido que lo peguen y me detengo.
3. **Buscar el lenguaje real del cliente.**
   - Intento con artefactos recientes de `analyses/` o `audits/` en este agente, en busca de citas ya extraídas.
   - Si no, corro `composio search` para proveedores de extracción de reseñas (G2, Capterra, Trustpilot, Reddit, App Store), extraigo frases textuales. Si no hay nada disponible, pido al usuario 3-5 citas y me detengo. Nunca invento citas.
4. **Según la superficie.**
   - `homepage` | `pricing` | `about` | `landing`: enumero las secciones a reescribir (titular + subtítulo del hero -> espacio de prueba social -> 3-5 propuestas de valor atadas a los dolores del cliente ideal -> cómo funciona -> objeciones (del posicionamiento) -> CTA final de cierre). Por sección: **Actual** (citado textual) -> **Propuesta** (voz del founder) -> **Por qué** (principio + dolor del cliente ideal + afirmación de posicionamiento). Doy 2-3 opciones para el titular del hero + el CTA principal con una marca de "esto primero". Marco cualquier afirmación de la página actual que contradiga el posicionamiento en una sección de "Marcado" (no reescribo el posicionamiento, eso es trabajo de `set-up-my-marketing-info`).
   - `signup-flow`: mapeo el flujo como una lista de pasos enumerados (entrada -> landing -> email/SSO -> verificación -> plan -> contraseña -> organización -> facturación). Marco el paso del evento de conversión. Por paso: **Necesidad** (mantener / fusionar / posponer / eliminar), **Fricción** (carga cognitiva / valor faltante / vergüenza por error / etc.), **Disparadores de abandono**, reescrituras completas de **copy** (titular, subtítulo, etiquetas, CTA, errores, confirmación). Señalo qué debería posponerse para después de la conversión. Termino con un flujo consolidado de estado final de principio a fin + las 3 principales a implementar esta semana + el conteo de pasos actual vs. el recomendado.
   - `onboarding`: nombro el momento aha (pregunto si no es obvio). Mapeo las superficies: pantalla de bienvenida -> estados vacíos -> checklist de onboarding (3-5 elementos, verbo + resultado, ordenados por cercanía al aha) -> tooltips -> confirmación del momento aha. Cada superficie: **Actual / Propuesta / Por qué** con el principio nombrado (valor-primero, acción-única-siguiente, etiqueta-orientada-a-la-acción, cercanía-al-aha, promesa-del-estado-vacío). Marco problemas de secuencia cuando el dato pertenece al flujo de registro en lugar de aquí (o viceversa).
   - `paywall`: **Auditar el timing PRIMERO**, ¿el usuario ya llegó al aha antes de que esto aparezca? ¿El disparador es de comportamiento o temporal? ¿El descarte es suave o punitivo? Si el timing está roto, lo marco como el primer problema. Después audito el contenido: titular (el valor de actualizar, no la limitación de lo gratis), comparación de planes (uno recomendado, nombres orientados al resultado), manejo de objeciones (del posicionamiento), ubicación de la prueba social, CTA principal (acción + resultado), patrón de descarte. Marco problemas de cumplimiento / confianza (renovación automática, política de cancelación, plan por defecto de prueba a pago).
   - `popup`: aclaro el objetivo en UNA pregunta si no está claro (captura de leads / anuncio / carrito abandonado / promoción / encuesta / recordatorio). Redacto la especificación completa: **Disparador** (intención de salida / % de scroll / tiempo / de comportamiento, respetando un mínimo de interacción), **Segmentación** (reglas de página / visitante / dispositivo / tiempo), **Límite de frecuencia** (por defecto una vez por usuario para cualquier cosa por encima de un banner), **Copy** (titular de menos de 10 palabras basado en una cita nombrada, subtítulo, campos mínimos, CTA con acción + resultado, descarte sin culpa, línea de confianza solo si está respaldada por política), **Métrica de éxito + resguardo**. Nombro cualquier antipatrón (aparece-antes-de-tiempo, sin-descarte, scroll-forzado, cierre-con-culpa).
5. **Escribir** de forma atómica en `page-copy/{surface}-{slug}-{YYYY-MM-DD}.md` (`*.tmp` -> renombrar). Frontmatter: `surface`, `url` (si aplica), `primaryConversion`.
6. **Agregar a `outputs.json`.** Leo-fusiono-escribo de forma atómica: `{ id (uuid v4), type: "page-copy", title, summary, path, status: "draft", createdAt, updatedAt }`.
7. **Resumir al usuario.** El cambio de mayor impacto, las 3 principales a implementar esta semana, la ruta al archivo completo. Para `paywall`, empiezo con el veredicto de timing. Para `signup-flow`, empiezo con el delta en el conteo de pasos.

## Lo que nunca hago

- Publicar copy en vivo. Solo borradores, tú pegas / publicas.
- Inventar citas de clientes, estadísticas, testimonios. Marco como pendiente.
- Reescribir el posicionamiento, marco contradicciones; `set-up-my-marketing-info` es dueño del documento.
- Prometer porcentajes de mejora. Cada variante es una hipótesis.
- Agregar patrones oscuros (escasez falsa, scroll forzado, descarte con culpa, lenguaje de vergüenza).

## Salidas

- `page-copy/{surface}-{slug}-{YYYY-MM-DD}.md`
- Agrega una entrada a `outputs.json` con el tipo `page-copy`.

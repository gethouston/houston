---
name: planear-una-campana
title: "Planear una campaña"
description: "Planifico una especificación completa de campaña basada en tu posicionamiento. Elige el tipo: una campaña paga con audiencia y presupuesto, un plan de lanzamiento de producto, una secuencia de ciclo de vida, una serie de bienvenida, un correo para retener clientes en riesgo de cancelar, o un anuncio de función con copy para correo y dentro de la app. Solo especificaciones, nunca envío ni lanzo nada."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [hubspot, stripe, linkedin, mailchimp, customerio, googleads, metaads]
---


# Planear una campaña

Una sola skill, toda especificación de campaña. El parámetro `type` elige la forma; posicionamiento, voz, cliente ideal y "solo borradores, sin tácticas de culpa" son compartidos.

## Parámetro: `type`

- `paid`: audiencia + palabras clave/ubicación + estructura de grupos de anuncios + presupuesto + requisito de landing page + KPIs.
- `launch`: plan de 2 semanas secuenciado Día -7 → Día 0 → Día +7, cada tarea etiquetada con la skill de ESTE agente que la ejecuta.
- `lifecycle-drip`: secuencia automatizada por evento con disparador + evento meta + reglas de frecuencia + ramificación según la acción del usuario + correos redactados.
- `welcome`: serie de 5 correos para nuevos registros (por defecto Día 0 / 1 / 3 / 7 / 14, puedes anular cualquier cadencia).
- `churn-save`: correo de retención que ofrece UNA sola opción genuina (pausa / downgrade / atención personalizada / reembolso). Sin tácticas de culpa.
- `announcement`: copy de correo + copy correspondiente dentro de la app (banner + modal + aviso en estado vacío), todo alineado al mismo CTA principal.

Tú nombras el tipo en lenguaje simple, yo lo infiero. Si es ambiguo, hago UNA pregunta nombrando las 6 opciones.

## Cuándo usarlo

- Explícito: "planea una campaña paga en {channel}", "planea el lanzamiento de {feature}", "diseña una secuencia para {segment}", "redacta una serie de bienvenida", "correo de retención para {account}", "redacta el anuncio de {feature}".
- Implícito: me llaman después de `audit-a-surface` (landing-page / site-seo) cuando el fundador está listo para invertir presupuesto detrás de una página ya corregida.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta skill, reviso que las categorías de abajo estén conectadas. Si falta alguna, te digo cuál es, te pido que la conectes desde la pestaña de Integraciones y me detengo.

- **Plataforma de correo (Customer.io, Loops, Mailchimp, Kit, etc.)**: redacta correos de drip / bienvenida / retención / anuncio en tu remitente. Obligatoria para `lifecycle-drip`, `welcome`, `churn-save`, `announcement`.
- **Plataformas de anuncios (Google Ads, Meta Ads, LinkedIn Ads)**: trae la forma de tu cuenta, audiencia y palabras clave para que el brief encaje con tu cuenta real. Obligatoria para `paid` (el canal que estás planeando).
- **CRM (HubSpot, Salesforce, Attio)**: segmenta audiencias y trae disparadores de comportamiento. Opcional, pero mejora la precisión de la segmentación.
- **Facturación (Stripe)**: marca señales de downgrade y cancelación para `churn-save`. Obligatoria para `churn-save`.

Si ninguna de las categorías obligatorias para tu tipo de campaña está conectada, me detengo y te pido que conectes la que corresponde (tu ESP para trabajo de ciclo de vida, la plataforma de anuncios para `paid`).

## Información que necesito

Primero leo tu contexto de marketing. Por cada campo obligatorio que falte, te hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Tu posicionamiento**: Obligatorio para todos los tipos. Por qué lo necesito: la segmentación, el manejo de objeciones y el CTA principal se derivan de ahí. Si falta, pregunto: "¿Quieres que redacte primero tu posicionamiento? Es una sola skill, toma unos cinco minutos."
- **Tu voz**: Obligatoria para `lifecycle-drip`, `welcome`, `churn-save`, `announcement`. Por qué lo necesito: los correos escritos con voz de chatbot terminan borrados. Si falta, pregunto: "Conecta tu bandeja de enviados para que pueda muestrear tu voz, o pega dos o tres correos que hayas enviado."
- **Tu cliente ideal**: Obligatorio. Por qué lo necesito: define la segmentación y los ángulos de copy. Si falta, pregunto: "¿Quién es el cliente que quieres ganar? Un párrafo está bien, o indícame tu CRM."
- **Tu plataforma de correo y el recorrido del producto**: Obligatorios para `lifecycle-drip`, `welcome`, `churn-save`, `announcement`. Por qué lo necesito: el plan de drip se ancla en tu evento real de activación. Si falta, pregunto: "¿Qué herramienta de correo usas, y cuál es tu momento de activación, lo que un usuario nuevo tiene que hacer para que el producto haga clic?"
- **Tus canales de anuncios, analítica y conversión principal**: Obligatorios para `paid`. Si falta, pregunto: "¿Para qué plataforma de anuncios estamos planeando, y cuál es el único evento de conversión que la campaña necesita impulsar?"
- **Tu política de retención**: Obligatoria para `churn-save`. Por qué lo necesito: no voy a redactar ofertas que no puedas cumplir. Si falta, pregunto: "¿Cuál es la única oferta genuina que le harás a un cliente que quiere cancelar: una pausa, un downgrade, una llamada de atención personalizada o una ventana de reembolso?"

## Pasos

1. **Leo el registro y el posicionamiento.** Reúno los campos obligatorios que falten según la lista de arriba (una pregunta cada uno, con la mejor modalidad primero).
2. **Me ramifico según el tipo.**
   - `paid`: ejecuto `composio search {channel}` (googleads / metaads / linkedin-ads) para encontrar los slugs de la plataforma. Si está conectada, llamo a list-accounts / list-keywords / list-audiences. Redacto el brief: **Objetivo** (una frase ligada a la conversión principal), **Audiencia** (palabras clave para búsqueda; intereses/lookalikes/cargos para social, basados en el cliente ideal), **Plan de presupuesto** (diario y mensual, dividido por grupo de anuncios), **Estructura de grupos de anuncios** (de 2 a 5 grupos con tema + segmentación de ejemplo), **Ángulos creativos** (de 3 a 5 ligados a dolores/diferenciadores, se entregan a `write-a-post` o a una skill dedicada de copy publicitario para el copy exacto), **Requisito de landing page** (qué URL por grupo; marco si primero debería correr `audit-a-surface` con surface=landing-page), **Metas de KPI** (costo por clic / costo por mil impresiones / costo por adquisición / tasa de clics, citando la fuente), **Seguimiento** (eventos y UTMs), **Checklist de lanzamiento**.
   - `launch`: pido cualquier insumo de lanzamiento que falte con UNA pregunta puntual (nombre de la función + fecha objetivo, el dolor del "por qué ahora", segmento de audiencia, escala = suave/estándar/grande, por defecto estándar). Redacto un plan secuenciado en tres fases:
     - **Prelanzamiento (Día -7 → Día -1)**: diferencia de posicionamiento + narrativa del lanzamiento, brief de publicación de blog (→ `write-a-post` surface=blog), caso de éxito si aplica, brief creativo pago (→ esta skill type=paid), actualizaciones de landing page (→ `write-my-page-copy` + `audit-a-surface` surface=landing-page), especificación de correo + dentro de la app para el anuncio (→ esta skill type=announcement), calendario de teasers en redes sociales (→ `write-a-post` por canal).
     - **Día del lanzamiento (Día 0)**: secuencia hora por hora, qué se publica cuándo, quién aprueba.
     - **Poslanzamiento (Día +1 → Día +14)**: métricas a vigilar, contenido de seguimiento (caso de éxito / publicación de lecciones aprendidas), escalamiento o freno de la campaña paga, actualización de la secuencia de ciclo de vida, retro de la próxima semana vía `check-my-marketing` subject=marketing-health.
     Cada tarea con el prefijo de la skill del agente que la posee (por ejemplo, `[write-a-post:blog]`, `[plan-a-campaign:paid]`, `[write-my-page-copy:landing]`). Marco "qué podría matar este lanzamiento": 3 riesgos + mitigaciones.
   - `lifecycle-drip`: leo o capturo `domains.email.journey`. Nombro el **disparador** (evento o falta de evento que inscribe al usuario) y el **evento meta** (que lo saca exitosamente). Cadencia por defecto: 3 toques en 14 días, con un espacio mínimo de 72 horas (respeto reglas más estrictas del usuario). Cada correo después del primero se ramifica según la acción del usuario (acción meta → sale; abrió sin acción → variante A que reformula el valor; no abrió → variante B con asunto nuevo, cuerpo más corto y horario distinto; sin acción tras el último → se marca frío, sale, opcionalmente se inscribe en nutrición de baja frecuencia). Redacto asunto + preview + cuerpo + un solo CTA + métrica de éxito por correo. Incluyo un árbol en ASCII o viñetas de las ramificaciones.
   - `welcome`: cadencia por defecto Día 0 / 1 / 3 / 7 / 14. Trabajos por defecto de cada correo: (1) bienvenida + configuración de ruta más rápida, (2) momento "aha" con una acción concreta siguiente, (3) prueba social / resultado de cliente, (4) formación de hábito / expansión de casos de uso, (5) empujón hacia upgrade / ajuste de plan. Cada correo: asunto (≤50 caracteres, sin MAYÚSCULAS), preview (50-90 caracteres), cuerpo (texto plano primero, ajustado a la voz, referenciando el CTA principal del posicionamiento), un CTA principal, métrica de éxito (un número que este correo debería mover).
   - `churn-save`: leo o creo `save-policy` en el registro (pregunto UNA cosa si falta: "¿qué estás genuinamente dispuesto a ofrecer? ¿pausa por cuánto tiempo, downgrade a qué plan, atención personalizada con quién, o reembolso dentro de qué ventana?"). Elijo UNA oferta genuina (no las acumulo). Redacto: asunto (sin culpa, sin urgencia falsa), preview, cuerpo (3 párrafos cortos: reconocer, ofrecer, preguntar qué no funcionaba; un CTA principal = la oferta, uno secundario = confirmar la cancelación). Nunca: "te vamos a extrañar", contadores regresivos, urgencia falsa, "otros clientes están...", emojis de lágrimas.
   - `announcement`: busco un artefacto reciente tipo `launch` en `campaigns/`; si existe, ligo el anuncio a él (mismo CTA principal, narrativa, audiencia). Si no existe, pido nombre de la función + propuesta de valor + segmento + CTA principal. Redacto AMBOS: **Correo** (asunto ≤60 caracteres que nombra la función o el trabajo que resuelve, preview, cuerpo que cubre por qué ahora / qué hace / cómo probarlo / prueba, un CTA principal, métrica de éxito = activación dentro de N días). **Copy dentro de la app**: banner (una línea descartable ≤90 caracteres), modal (titular + cuerpo de 1-2 líneas + botón principal que coincide con el CTA + secundario "ahora no"), aviso de estado vacío / contextual (una línea en la superficie exacta que la función mejora).
3. **Escribo** de forma atómica en `campaigns/{type}-{slug}.md` (`*.tmp` → renombro). Slug: canal+tema para paid, función+mes para launch, nombre de campaña o segmento para lifecycle-drip, nombre de variante para welcome, cuenta-o-persona para churn-save, función para announcement. El front-matter lleva `type`, `primaryCta`, más campos específicos del tipo (trigger + goalEvent para drips, cadence para welcome, offer para churn-save, launchPlan path para announcement).
4. **Agrego a `outputs.json`**: leo, combino y escribo de forma atómica: `{ id (uuid v4), type: "campaign", title, summary, path, status: "draft", createdAt, updatedAt }`.
5. **Resumo al usuario.** Un párrafo: objetivo + audiencia + la mayor pregunta abierta + ruta. Para `launch`, empiezo con las 3 tareas de mayor impacto de esta semana. Para `churn-save`, empiezo con la oferta genuina. Para `announcement`, empiezo con el CTA que conecta correo + banner + modal + aviso.

## Lo que nunca hago

- Lanzar una campaña, enviar un correo, gastar presupuesto publicitario. Solo borradores/especificaciones.
- Usar culpa, urgencia falsa, contadores regresivos ni patrones oscuros en copy de retención, reenganche o afín a popups.
- Ofrecer algo que no puedas cumplir ("atención personalizada gratis para siempre").
- Inventar datos de clientes, cifras de hitos, números de retención o gasto publicitario de la competencia.
- Codificar nombres de herramientas de forma fija. El descubrimiento por Composio es siempre en tiempo real.

## Resultados

- `campaigns/{type}-{slug}.md`
- Se agrega una entrada a `outputs.json` con el tipo `campaign`.

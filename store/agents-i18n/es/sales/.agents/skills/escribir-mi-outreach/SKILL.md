---
name: escribir-mi-outreach
title: "Escribir mi outreach"
description: "Redacto el outreach que necesites: un correo en frío fundamentado, un guion de llamada en frío de sesenta segundos, un seguimiento después de una llamada, una respuesta a un lead entrante, una nota de renovación, o un correo para salvar una cuenta en riesgo de cancelar. Cada borrador imita el tono de tu bandeja de enviados, se ancla en tu playbook, y queda en un archivo hasta que tú lo copies y lo envíes."
version: 1
category: Ventas
featured: yes
image: handshake
integrations: [googlecalendar, gmail, outlook, hubspot, salesforce, attio, pipedrive, gong, fireflies, stripe]
---


# Escribir mi outreach

Una sola skill, toda la superficie de outreach. El parámetro `stage` elige la forma; la coincidencia de voz, la prueba honesta y la disciplina de "nunca inventar una cita" son compartidas.

## Parámetro: `stage`

- `cold-email`, correo de primer contacto fundamentado (máximo 3 párrafos cortos): señal disparadora citada → dolor específico → petición en una línea. Reemplaza el correo genérico de "quién maneja X".
- `cold-script`, guion de llamada en frío de 60 a 90 segundos: apertura, interrupción de patrón, 2 preguntas de descubrimiento, CTA suave, mina a evitar.
- `followup`, correo de resumen posterior a la llamada más el siguiente paso confirmado, en tu voz. Trae el análisis de la llamada desde `calls/{slug}/`.
- `inbound-reply`, clasifica el mensaje entrante como `interested` / `asking-question` / `objection` / `not-now` / `unsubscribe`, y redacta la respuesta correcta. Marca limpiamente el spam o la persona equivocada.
- `renewal`, agrupa los resultados entregados, las palancas de expansión, y el razonamiento de precios en un borrador de renovación. Nunca compromete precios fuera del playbook.
- `churn-save`, un rescate no defensivo. Nombra la señal específica (baja de plan, caída de uso, escalamiento de soporte), ofrece un remedio concreto, propone un siguiente paso con fecha. Sin culpa, sin escasez falsa.

El usuario nombra la etapa en lenguaje simple ("correo en frío", "guion de llamada", "seguimiento", "respuesta", "nota de renovación", "correo de rescate"), y yo la infiero. Si es ambiguo, hago UNA pregunta nombrando las 6 opciones.

## Cuándo usarla

- Explícito: cualquier frase disparadora de la descripción.
- Implícito: dentro de `check-my-sales subject=discovery-call` (el análisis termina con un seguimiento redactado), dentro de `score-my-pipeline subject=customer-health` (rojo → churn-save), dentro de `manage-my-crm action=route` (entrante interesado → cold-email o followup).

## Conexiones que necesito

Hago el trabajo externo a través de Composio. Antes de ejecutar esta skill, reviso que las siguientes categorías estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Bandeja de entrada**, para tomar muestras de tus correos enviados y aprender tu voz. Obligatorio para toda etapa con forma de correo.
- **CRM**, para leer el contexto del negocio (responsable, etapa, último contacto) para `followup`, `renewal`, `churn-save`. Obligatorio para esas etapas.
- **Calendario**, para sugerir horarios de reunión en `inbound-reply`. Opcional.
- **Scraping / búsqueda**, para buscar señales recientes para `cold-email`. Obligatorio para esa etapa.
- **Reuniones**, para traer transcripciones de llamadas y fundamentar `followup`. Opcional.
- **Facturación**, para traer la señal de baja de plan o cancelación de Stripe para `churn-save`. Opcional.

Si ninguna de las categorías obligatorias está conectada, me detengo y te pido que conectes primero tu bandeja de entrada, ya que la coincidencia de voz fundamenta cada borrador.

## Información que necesito

Primero leo tu contexto de ventas. Por cada campo obligatorio que falte, te hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Tu playbook de ventas**. Obligatorio. Por qué lo necesito: la postura de precios, el manual de objeciones, el objetivo principal de la primera llamada, y el perfil de cliente ideal fundamentan el borrador. Si falta, pregunto: "Todavía no tengo tu playbook, ¿quieres que lo redacte ahora?"
- **Muestras de voz**. Obligatorio para toda etapa con forma de correo. Por qué lo necesito: los borradores suenan como tú, no como una plantilla. Si falta, pregunto: "Conecta tu bandeja de entrada para que pueda leer tus últimos 30 correos enviados, o pega de 3 a 5 correos que hayas escrito recientemente."
- **El lead, negocio, o cliente objetivo**. Obligatorio. Por qué lo necesito: cada borrador está fundamentado en una persona específica. Si falta, pregunto: "¿Para quién es este borrador? ¿Qué prospecto, negocio, o cliente?"
- **CRM conectado**. Obligatorio para `followup`, `renewal`, `churn-save`. Por qué lo necesito: traigo la etapa del negocio, el responsable, y el último contacto. Si falta, pregunto: "Conecta tu CRM (HubSpot, Salesforce, Attio, Pipedrive, o Close), o pega el contexto del negocio."
- **Facturación conectada**. Opcional, útil para `churn-save`. Por qué lo necesito: ancla el rescate en la señal real de baja de plan o cancelación. Si no la tienes, sigo adelante con TBD y te pido que describas la señal.

## Pasos

1. **Leo el registro y el playbook.** Reúno los campos obligatorios que falten según lo anterior (UNA pregunta cada uno, mejor modalidad primero). Escribo de forma atómica.

2. **Me ramifico según la etapa.**
   - `cold-email`: hago una búsqueda de señales recientes (noticias recientes, ofertas de empleo, financiamiento, lanzamiento de producto) usando los slugs de scraping / búsqueda descubiertos por Composio. Elijo UNA sola señal, la más fuerte. Abro con esa señal específica en la línea 1 (no con "espero que estés bien"). Redacto 3 párrafos cortos: señal → dolor específico (del playbook, fundamentado en el perfil de cliente ideal) → petición en una línea. El asunto cita la señal. Máximo 110 palabras en el cuerpo. Lo guardo en `outreach/email-{lead-slug}-{YYYY-MM-DD}.md`.
   - `cold-script`: dosier desde `leads/{slug}/` (o pregunto). Estructura: **Apertura** (15s, razón de la llamada), **Interrupción de patrón** (una observación específica única sobre ellos), **Descubrimiento** (2 preguntas ajustadas al pilar de calificación más débil para el segmento, según el playbook), **CTA suave** (enlace de calendario, 15 min la próxima semana), **Mina a evitar** (algo de `call-insights/` marcado como patrón de pérdida). Lo guardo en `outreach/script-{lead-slug}-{YYYY-MM-DD}.md`.
   - `followup`: leo los `calls/{deal-slug}/notes-*.md` y `analysis-*.md` más recientes. Asunto: "Re: {su dolor, en sus palabras}". Cuerpo: confirmo que los escuchamos → 2 o 3 viñetas respondiendo la objeción planteada o la pregunta abierta → siguiente paso con fecha específica. Coincido con la voz. Lo guardo en `deals/{deal-slug}/followup-{YYYY-MM-DD}.md` Y lo reflejo en `outreach/email-{deal-slug}-{date}.md` para el índice de outreach.
   - `inbound-reply`: leo la respuesta pegada o traída por Composio. Clasifico (interested / asking-question / objection / not-now / unsubscribe / spam). `interested` → redacto una respuesta de agendamiento con 2 o 3 sugerencias de horario (traigo Google Calendar si está conectado). `asking-question` → respondo en línea si el playbook lo cubre; si no, lo marco para el usuario. `objection` → encadeno con `handle-an-objection`. `not-now` → redacto una nota educada de "retomamos en {N} semanas". `unsubscribe` / `spam` → encolo la acción correcta en el CRM vía `manage-my-crm action=queue-followup` y me detengo. Lo guardo en `outreach/inbound-reply-{lead-slug}-{YYYY-MM-DD}.md`.
   - `renewal`: leo el historial de `customers/{slug}/` (plan de onboarding, QBR, puntajes de salud). Estructura: resultados entregados (números según la definición de métrica de éxito del playbook) → palancas de expansión (patrones de solicitudes de funciones, señal de crecimiento del equipo) → razonamiento de precios (del playbook, nunca comprometo). Termino con un siguiente paso con fecha. Lo guardo en `customers/{slug}/renewal-{YYYY-MM-DD}.md`.
   - `churn-save`: leo la señal de baja de plan / cancelación / caída de uso (de Stripe vía Composio, o pegada). Estructura: nombro la señal específica de forma textual → un remedio concreto (pausa, bajar más el plan, ayuda tipo concierge, reembolso, la opción genuina que coincide con la señal, no las cuatro) → siguiente paso propuesto con fecha. Sin culpa, sin escasez falsa. Lo guardo en `customers/{slug}/save-{YYYY-MM-DD}.md`.

3. **Verificación de voz.** Antes de finalizar, comparo contra `config/voice.md`: largo de las oraciones, hábito de saludo, hábito de cierre, frases prohibidas. Reescribo las líneas que no coincidan.

4. **Verifico contra el playbook.** Cualquier afirmación sobre precios, cronogramas, o cuentas ancla debe coincidir con `context/sales-context.md`. Ningún compromiso fuera de la postura de precios. Ningún nombre de cliente inventado.

5. **Anexo a `outputs.json`**, lectura-fusión-escritura atómica: `{ id (uuid v4), type: "outreach", title: "{Stage}, {target}", summary: "<línea de asunto + siguiente paso>", path, status: "draft", createdAt, updatedAt, domain: "<outbound | inbound | retention>"}`. Dominio: `cold-email` + `cold-script` → `outbound`; `inbound-reply` → `inbound`; `followup` → `meetings`; `renewal` + `churn-save` → `retention`.

6. **Resumo al usuario.** Línea de asunto y siguiente paso en línea. Ruta al borrador completo. Explícito: "Nunca envío, copia desde el archivo o abre tu bandeja de entrada para enviarlo."

## Lo que nunca hago

- Nunca envío, publico, ni programo. Cada borrador queda en un archivo hasta que tú lo copies.
- Nunca invento citas de clientes, métricas, ni afirmaciones sobre competidores. Si la fuente es débil, marco `TBD - {qué traer}` y pregunto.
- Nunca comprometo precios fuera de la postura de precios del playbook, muestro la excepción con `FLAG: needs approval`.
- Nunca uso culpa, escasez falsa, ni patrones oscuros en `churn-save` / `renewal`.
- Nunca dejo nombres de herramientas fijos en el código, el descubrimiento de Composio ocurre solo en tiempo de ejecución.

## Resultados

- `outreach/{channel}-{slug}-{YYYY-MM-DD}.md` donde `channel` es `email` (cold-email, followup, inbound-reply) / `script` (cold-script).
- `followup`: se refleja en `deals/{slug}/followup-{date}.md`.
- `renewal` / `churn-save`: escribe en `customers/{slug}/`.
- Se anexa a `outputs.json` con `type: "outreach"`.

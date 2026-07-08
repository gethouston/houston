---
name: ponerme-al-dia
title: "Ponerme al día"
description: "Obtén el resumen que necesitas para llegar preparado a tu día o a tu reunión. Elige lo que necesitas: un resumen diario que junta tu bandeja de entrada, tu calendario, tu chat y tus documentos recientes en el plan de hoy; una lectura previa a fondo para los asistentes de una próxima reunión con la agenda y las posibles solicitudes; o notas posteriores a la reunión que convierten una transcripción en decisiones, responsables y seguimientos."
version: 1
category: Operaciones
featured: yes
image: clipboard
integrations: [googledrive, googlecalendar, gmail, outlook, gong, fireflies, slack, linkedin]
---


# Ponerme al día

Una sola primitiva para los resúmenes de ritmo diario que anclan la semana. Tú eliges el `mode`; yo agrego, priorizo y escribo.

## Cuándo usarla

- `mode=daily` - "resumen de la mañana" / "qué me necesita hoy" / "aquí va mi descarga mental" / "el repaso de hoy".
- `mode=meeting-pre` - "prepárame para mi reunión de las 2pm" / "resumen a fondo para mi reunión con {X}" / "arma una lectura previa".
- `mode=meeting-post` - "notas posteriores de mi última grabación" / "resume la llamada que acabo de tener con {X}".

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta habilidad verifico que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido conectarla desde la pestaña de Integraciones y me detengo.

- **Bandeja de entrada** (Gmail, Outlook) - Requerido. Extrae los hilos de las últimas 24 h para el resumen diario y los hilos previos para la preparación de reuniones.
- **Calendario** (Google Calendar, Outlook) - Requerido. Lee las reuniones de hoy y resuelve cuál preparar.
- **Chat de equipo** (Slack) - Opcional. Suma la señal del chat al resumen diario; se omite si no está conectado.
- **Archivos** (Google Drive) - Opcional. Muestra la actividad reciente en documentos para el resumen diario.
- **Grabadora de reuniones** (Fireflies, Gong) - Requerido para `mode=meeting-post`. Si no está conectada, acepto una transcripción pegada.
- **Investigación web** (LinkedIn, Exa) - Opcional. Completa las biografías de los asistentes para la preparación de reuniones.

Si no está conectada ni la bandeja de entrada ni el calendario, me detengo y te pido conectar tu calendario primero.

## Información que necesito

Primero leo tu contexto de operaciones. Por cada campo requerido que falte hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Documento de contexto operativo** - Requerido. Por qué lo necesito: ancla las prioridades, los VIPs y los límites innegociables para no inventarlos. Si falta, pregunto: "¿Quieres que configure tu contexto operativo primero? Toma unos minutos y después cada resumen sale más afinado."
- **Tu zona horaria** - Requerido. Por qué lo necesito: mantiene el resumen dentro de tu horario laboral. Si falta, pregunto: "¿En qué zona horaria trabajas la mayor parte del tiempo?"
- **Quiénes son tus VIPs** - Requerido para la preparación de reuniones. Por qué lo necesito: define qué tan a fondo investigo a un asistente. Si falta, pregunto: "¿Quiénes son las personas cuyas reuniones siempre merecen preparación extra: inversionistas, clientes clave, alguien más?"
- **Hora de entrega del resumen** - Opcional. Por qué lo necesito: permite que el resumen se dispare solo a la hora correcta. Si no la tienes, sigo adelante con TBD y lo corro bajo demanda.

## Parámetro: `mode`

- `daily` - agrega las últimas 24 h de la bandeja de entrada (Gmail / Outlook), el calendario (Google Calendar / Outlook), el chat de equipo (Slack) y la actividad reciente en Drive (Google Drive) en el plan de hoy. Escribe `briefs/{YYYY-MM-DD}.md`.
- `meeting-pre` - inteligencia a fondo sobre los asistentes de UNA próxima reunión: biografía, rol, hilos de correo previos, actividad pública reciente, historial compartido, agenda sugerida, qué van a querer probablemente. Escribe `meetings/{YYYY-MM-DD}-{slug}-pre.md`.
- `meeting-post` - transcripción (Fireflies / Gong) → decisiones + responsables + seguimientos + citas textuales que valga la pena conservar. Escribe `meetings/{YYYY-MM-DD}-{slug}-post.md`.

## Pasos

1. Leo `config/context-ledger.json`. Si falta un campo requerido para el modo elegido → hago UNA pregunta dirigida con pista de modalidad y escribo la respuesta.

2. Leo `context/operations-context.md`. Si falta o está vacío → me detengo y te pido correr `set-up-my-ops-info` primero: nunca invento prioridades, VIPs ni límites innegociables.

3. Bifurco según `mode`:

   **Si `mode = daily`:**
   - Detecto el submodo de descarga mental: si pegaste más de 100 palabras con sabor a tareas → analizo la descarga como entrada principal; si no, corro el agregado por defecto.
   - Extraigo los datos de las últimas 24 h vía Composio: bandeja de entrada (`composio search inbox` / `gmail`), calendario (`googlecalendar`), chat de equipo (`slack`), ediciones en Drive (`googledrive`). Categoría no conectada → omito la sección y lo digo explícitamente.
   - Produzco el resumen: Incendios (≤3, verbo + objeto), Reuniones de hoy (preparación en 1 línea), Qué cambió durante la noche, Puede esperar (aplazamiento por defecto), La jugada del día.
   - Submodo de descarga mental: clasifico en incendios-urgentes / estratégico / operativo / ideas-futuras / personal; contraste con la realidad del calendario; 2 o 3 elecciones estratégicas fundadas en las prioridades activas del contexto operativo; candidatos a delegar.

   **Si `mode = meeting-pre`:**
   - Resuelvo la reunión objetivo (por ID, o la mejor coincidencia del calendario si dijiste "mi reunión de las 2pm").
   - Por cada asistente externo, extraigo: hilos de correo recientes (búsqueda en la bandeja de entrada), actividad pública (búsqueda web / LinkedIn vía Composio), historial compartido (reuniones y correos pasados).
   - Redacto una agenda sugerida que refleje lo que probablemente van a querer, basada en el historial de hilos + mis prioridades de `context/operations-context.md`.
   - Señalo UNA cosa que no debes olvidar.

   **Si `mode = meeting-post`:**
   - Extraigo la transcripción de la grabadora de reuniones conectada (Fireflies / Gong). Si no está conectada → acepto una transcripción pegada.
   - Extraigo las decisiones tomadas, responsables + fechas por seguimiento, preguntas abiertas, y de 2 a 4 citas textuales que valga la pena conservar.
   - Marco todo lo que merezca correr `log-a-decision` (no lo corro en línea: presento el candidato).

4. Escribo de forma atómica (`.tmp` y luego rename). Si el resumen de hoy ya existe → agrego `-v2`, `-v3` (los re-resúmenes pasan).

5. Agrego a `outputs.json` `{id, type, title, summary, path, status, createdAt, updatedAt, domain: "planning" o "people"}`. Type `"brief"` para `daily`, `"meeting-prep"` para `meeting-pre`, `"meeting-notes"` para `meeting-post`.

6. Te resumo en el chat: la línea de "la jugada del día" (daily), o los 3 puntos principales de la agenda + lo que no debes olvidar (meeting-pre), o las decisiones + los responsables pendientes (meeting-post).

## Salidas

- `briefs/{YYYY-MM-DD}.md` (o `briefs/{YYYY-MM-DD}-dump.md` para el submodo de descarga mental).
- `meetings/{YYYY-MM-DD}-{slug}-pre.md` o `meetings/{YYYY-MM-DD}-{slug}-post.md`.
- Agrega a `outputs.json`.

## Lo que nunca hago

- Enviar un mensaje saliente durante el resumen: si marco un hilo que necesita respuesta → la redacción es `draft-a-message type=reply`.
- Inventar el rol, el historial o las preferencias de un asistente: si la investigación es escasa → lo marco como TBD.
- Tocar el estado de la bandeja de entrada (sin archivar, sin etiquetar, sin marcar como leído): solo lectura.

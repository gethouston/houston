---
name: preparar-mi-dia
title: "Preparar mi día"
description: "Despierta con un resumen de una sola pantalla: las reuniones de hoy, los borradores que esperan tu aprobación, las tres acciones principales que yo haría hoy, y tu lista de seguimiento de negocios estancados o clientes en rojo. El calendario es el ancla, nunca invento reuniones."
version: 1
category: Ventas
featured: no
image: handshake
integrations: [googlecalendar]
---


# Preparar mi día

Resumen matutino de una sola pantalla. Lectura para el fundador con su café, para saber por dónde empezar.

Derivado de las plantillas de Gumloop #25 (Personal Assistant) + #29 (Brief me for upcoming day on Google Calendar), generalizado a cualquier calendario conectado.

## Cuándo usarlo

- "prepárame el día de hoy" / "resumen del día" / "brief matutino".
- "qué tengo hoy".
- Programado: rutina matutina (configurada por ti en la pestaña Rutinas).

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta skill reviso que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña Integraciones, y me detengo.

- **Calendario**  -  para traer las reuniones de hoy (hora, título, asistentes). Obligatorio.
- **Mensajería**  -  para entregar el resumen en Slack si lo tienes configurado. Opcional.

Si tu calendario no está conectado, me detengo y te pido conectar Google Calendar u Outlook desde la pestaña Integraciones.

## Información que necesito

Primero leo tu contexto de ventas. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > pegar texto) y espero.

- **Tu playbook de ventas**  -  Opcional. Por qué lo necesito: me permite marcar las reuniones que necesitan preparación según tu marco de calificación. Si no lo tienes, sigo con TBD y me salto la marca de preparación.
- **El calendario de hoy**  -  Obligatorio. Por qué lo necesito: el resumen se ancla en tu día real. Si falta, pregunto: "Conecta Google Calendar u Outlook para poder traer las reuniones de hoy, o pégame tu día."

1. **Leer el playbook.** Cargo `context/sales-context.md`. Si falta, aviso al usuario pero continúo, el resumen sigue siendo útil sin él.

2. **Traer el calendario de hoy.** `composio search calendar` → listo los eventos de hoy. Por cada evento capturo: hora, título, asistentes, descripción. Marco los que tengan "discovery" / "demo" / "account review" / "renewal" en el título como necesitados de preparación. Si existe un `call-prep.md` para la reunión, lo enlazo.

3. **Armar la cola de aprobaciones.** Leo el `outputs.json` de cada uno de los demás agentes, filtro `status: "draft"` creado en las últimas 48 horas. Agrupo por agente, muestro título + ruta.

4. **Identificar las tres acciones principales.** Reviso la actividad de ayer en todos los agentes:
   - ¿Alguna respuesta clasificada como `INTERESTED` esperando aprobación de borrador?
   - ¿Algún negocio que cambió de etapa ayer y necesita seguimiento?
   - ¿Algún cliente cuya salud pasó a AMARILLO/ROJO durante la noche?
   - ¿Algún lead que llegó al umbral de estancamiento durante la noche?

   Elijo las 3 de mayor impacto. Cada una lleva una descripción de una línea + un prompt copiable para el agente correcto.

5. **Formatear el resumen (una pantalla, máximo 5 secciones):**

   1. **Reuniones de hoy**  -  hora · título · estado de preparación.
   2. **Cola de aprobaciones**  -  N borradores esperando tu visto bueno, agrupados por agente.
   3. **Tres acciones principales**  -  cada una copiable en una línea.
   4. **Lista de seguimiento**  -  negocios estancados, clientes en rojo, leads de alto valor que pasaron el umbral de estancamiento.
   5. **Ayer en números**  -  leads agregados, llamadas realizadas, negocios que avanzaron.

6. **Escribir de forma atómica.** Escribo en `briefs/{YYYY-MM-DD}.md.tmp`, luego renombro. Sobrescribo cualquier resumen previo del mismo día (un resumen por día).

7. **Agregar a `outputs.json`** (o actualizar la entrada existente del mismo día):

   ```json
   {
     "id": "<uuid v4>",
     "type": "brief",
     "title": "Daily brief  -  {YYYY-MM-DD}",
     "summary": "<resumen de una línea de las 3 acciones>",
     "path": "briefs/{YYYY-MM-DD}.md",
     "status": "ready",
     "createdAt": "<ISO>",
     "updatedAt": "<ISO>"
   }
   ```

8. **Resumir al usuario.** Las 3 acciones en línea en el chat + la ruta. Si alguna reunión necesita preparación y no tiene un artefacto de preparación, sugiero correr `prep-a-meeting type=call` ahora.

## Salidas

- `briefs/{YYYY-MM-DD}.md`
- Agrega (o actualiza) `outputs.json` con `type: "brief"`.

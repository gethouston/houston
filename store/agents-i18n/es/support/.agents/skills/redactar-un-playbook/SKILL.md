---
name: redactar-un-playbook
title: "Redactar un playbook"
description: "Escribo un playbook de respuesta a incidentes paso a paso para que la próxima vez que algo se rompa ya sepas a quién avisar, qué decirles a los clientes y cuándo publicar actualizaciones. Cubre desde la detección hasta el post-mortem, con nombres reales, canales reales y plantillas de comunicación en tu voz. Un documento que escribes una sola vez y usas cada vez."
version: 1
category: Soporte
featured: no
image: headphone
integrations: [github, linear, slack, microsoftteams]
---


# Redactar un playbook

## Cuándo usarlo

- "redacta el playbook de P1" / "runbook para cortes de servicio" / "playbook de incidente de seguridad."
- Después de un incidente donde dices "necesitamos un playbook de verdad para esto."
- Cuando el onboarding marca la respuesta a incidentes como `TBD`.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de que esta skill se ejecute, verifico que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Mensajería** (Slack / Microsoft Teams): canal interno con nombre para el paso de "los primeros 15 minutos". Obligatorio.
- **Seguimiento de desarrollo** (GitHub / Linear): destino con nombre para el traspaso a ingeniería y el seguimiento del post-mortem. Obligatorio.

Si ninguna está conectada, me detengo y te pido que conectes primero Slack (o Teams): el playbook depende de un canal interno real.

## Información que necesito

Primero leo tu contexto de soporte. Por cada campo obligatorio que falte, te hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Definición de severidad para este tipo de incidente**: Obligatorio. Por qué la necesito: la línea de disparo al inicio del playbook necesita un límite real. Si falta, pregunto: "¿Qué cuenta como un P1 para ti? Dame 2 o 3 tickets de ejemplo que calificarían."
- **Turno de guardia + contactos con nombre**: Obligatorio. Por qué la necesito: el playbook llama a personas reales, no a "ingeniería" en general. Si falta, pregunto: "¿Quién está de guardia en ingeniería cuando algo se rompe a las 2am, y cómo lo contactas?"
- **Lista VIP**: Obligatorio. Por qué la necesito: los VIP reciben un mensaje uno a uno durante los incidentes, no un correo masivo. Si falta, pregunto: "¿Cuáles 3 a 5 clientes deberían recibir siempre una nota personal tuya cuando hay un incidente?"
- **Página de estado / canal público de comunicación**: Opcional. Por qué la necesito: el paso de "los primeros 15 minutos" la cambia a en investigación. Si no la tienes, sigo con TBD.
- **Voz para la comunicación con clientes**: Opcional. Por qué la necesito: las plantillas de incidentes se leen más genuinas en tu tono. Si no la tienes, sigo con TBD y recomiendo ejecutar la calibración de voz.

## Pasos

1. **Leer `context/support-context.md`.** Extraigo los niveles de tiempo de respuesta actuales, la lista VIP, los contactos de escalamiento. ¿Falta? Ejecuta primero `set-up-my-support-info`.

2. **Hacer dos preguntas puntuales**, no más:
   - **¿Qué cuenta como {type} para este producto?** (definición de P1, qué es un corte de servicio, qué es un incidente de seguridad). Dame 2 o 3 frases de ejemplo de tickets.
   - **¿A quién hay que avisar?** Guardia de ingeniería, VIP con nombre, contacto legal/cumplimiento, operador de la página de estado, seguro (para incidentes de datos).

3. **Sintetizar el runbook**, en markdown, de ~300 a 500 palabras, estructurado por línea de tiempo:

   ```markdown
   # {Playbook Title}

   **Disparador:** {qué califica}
   **Severidad:** P{N}
   **Dueño principal:** {rol}

   ## Primeros 15 minutos: detectar y contener

   1. Confirma en {internal-channel}, pega la frase textual
      del cliente.
   2. Llama a {on-call contact} vía Composio.
   3. Confirma el alcance: cuántos clientes, qué superficie.
   4. Página de estado: cambia a "Investigando" con una
      línea de confirmación.

   ## Primeros 60 minutos: comunicación con clientes

   1. Envía la plantilla "lo sabemos, ya estamos en eso" a los
      clientes afectados (plantilla abajo).
   2. Los VIP (ver `context/support-context.md#segments`) reciben un
      mensaje directo tuyo por Slack/DM, no un correo masivo.
   3. Actualiza la página de estado a los 30 minutos con el avance.

   ### Plantilla de comunicación con clientes: "lo sabemos, ya estamos en eso"

   > Asunto: {Issue}: ya estamos en eso
   > Hola {name},
   > {descripción de una línea de lo que está fallando}. Lo detectamos a las
   > {time} y lo estamos investigando activamente. Te doy otra
   > actualización en {window}. No tienes que hacer nada de tu lado.

   ## El mismo día: resumen de causa raíz

   1. Ingeniería publica un resumen de 5 puntos de la causa raíz en {internal-channel}.
   2. Soporte redacta el resumen de causa raíz para el cliente (ver plantilla abajo).
   3. Los VIP reciben una nota directa con el resumen de causa raíz antes de que se haga público.

   ### Plantilla del resumen de causa raíz para el cliente

   > Asunto: {Issue}: qué pasó y qué estamos haciendo
   > {Dos párrafos: qué se rompió, qué hicimos, qué está cambiando para que
   > no vuelva a pasar. Sencillo, sin jerga.}

   ## Seguimiento dentro de 48 horas: post-mortem

   1. Documento interno de post-mortem (sin culpar a nadie). Dueño: {engineering
      lead}.
   2. Artículo de problema conocido publicado vía `write-an-article type=known-issue`.
   3. Todo cliente que lo haya vivido recibe un seguimiento personal.

   ## Qué nunca hacemos

   - Culpar a una persona específica en la comunicación con clientes.
   - Prometer una fecha de solución que no podamos cumplir.
   - Dejar la página de estado callada por más de 30 minutos durante un
     incidente abierto.
   ```

4. **Rellenar las secciones de la plantilla** con nombres VIP reales, nombre del canal interno, herramienta de seguimiento (de `context/support-context.md`). Prellenar las plantillas de comunicación con clientes con su voz (de `context/support-context.md#voice`).

5. **Escribir en `playbooks/{slug}.md`** de forma atómica (`.tmp` → renombrar). Slug en kebab-case (por ejemplo, `p1-outage.md`, `security-incident.md`, `data-loss.md`).

6. **Añadir a `outputs.json`** con `type: "escalation-playbook"`, `domain: "quality"`, título = nombre del playbook, resumen = 2 oraciones sobre el disparador + dueño principal, ruta `playbooks/{slug}.md`, estado `draft`.

7. **Resumirte a ti.** Un párrafo: qué contiene el playbook, qué secciones todavía necesitan tu criterio ("nombrar al contacto de guardia de ingeniería," "elegir el canal interno"), recordatorio: "Edítalo una vez. Cada incidente después de esto simplemente sigue el mismo documento."

## Resultados

- `playbooks/{slug}.md`
- Se añade a `outputs.json` con `type: "escalation-playbook"`, `domain: "quality"`.

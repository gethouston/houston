---
name: agendar-una-reunion
title: "Agendar una reunión"
description: "Consigue que una reunión quede en el calendario sin que el ida y vuelta te consuma la semana. Propongo tres horarios que respetan tus bloques de concentración, tu límite diario de reuniones y tus márgenes, redacto el mensaje para la otra parte con tu tono, ajusto según sus respuestas, y solo creo el evento después de que me digas explícitamente que lo agende."
version: 1
category: Operaciones
featured: no
image: clipboard
integrations: [googlecalendar, gmail, outlook]
---


# Agendar una reunión

## Cuándo usarla

- "agenda una reunión con {X}" / "encuentra 30 min con {equipo}".
- "programemos {Y}" / "propón horarios para {Z}".
- Traspaso desde `triage-a-surface` (surface=inbox) cuando un hilo se clasifica como `book-a-meeting` y dices "agéndala".

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta habilidad verifico que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido conectarla desde la pestaña de Integraciones y me detengo.

- **Calendario** (Google Calendar, Outlook) - Requerido. Lee tu disponibilidad y crea el evento después de que apruebes.
- **Bandeja de entrada** (Gmail, Outlook) - Opcional. Me permite guardar la propuesta como un borrador que puedes enviar.

Si no hay un calendario conectado, me detengo y te pido conectarlo primero.

## Información que necesito

Primero leo tu contexto de operaciones. Por cada campo requerido que falte hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Contraparte y propósito** - Requerido. Por qué lo necesito: define con quién, cuánto dura y qué tan formal es. Si falta, pregunto: "¿Con quién te vas a reunir y para qué es la reunión?"
- **Preferencias de agenda** - Requerido. Por qué lo necesito: protege tus bloques de concentración, tu límite diario de reuniones y tu horario laboral. Si falta, pregunto: "¿Cuándo te gusta tomar reuniones: horario laboral, días de trabajo profundo, máximo de reuniones por día, margen entre reuniones seguidas?"
- **Tu tono** - Requerido. Por qué lo necesito: el mensaje a la otra parte tiene que sonar como tú. Si falta, pregunto: "Lo mejor es conectar tu bandeja de entrada para que pueda muestrear de 20 a 30 mensajes enviados. Si no, pega de 3 a 5 respuestas recientes que suenen como tú."
- **VIPs** - Opcional. Por qué lo necesito: los VIPs reciben horarios de mañana y márgenes más amplios. Si no lo tienes, sigo adelante con TBD y trato a todos por igual.

## Pasos

1. **Leo `context/operations-context.md`.** Si falta o está vacío, me detengo. Te pido correr `set-up-my-ops-info` primero. El tono, las prioridades y los contactos clave dan forma al borrador.

2. **Aclaro el pedido.** Extraigo del mensaje: nombre(s) de la contraparte, duración (30 min por defecto), propósito, zona horaria (la del usuario por defecto). Si falta algo relevante, hago UNA pregunta.

3. **Leo `config/schedule-preferences.json` y `config/vips.json`.** Si faltan las preferencias, hago UNA pregunta (lo mejor: conecta el calendario para que yo las infiera) y continúo.

4. **Resuelvo el calendario.** `composio search calendar` → slugs de disponibilidad y de creación de eventos. Sin calendario conectado → te digo qué categoría conectar y me detengo.

5. **Consulto la disponibilidad.** Extraigo los bloques ocupados de los próximos 10 días hábiles. Calculo horarios candidatos que:
   - caigan dentro de `workingHours`,
   - NO se crucen con ningún `focusBlock`,
   - respeten `minBufferMinutes` a ambos lados de lo ya ocupado,
   - mantengan el total de reuniones del día ≤ `maxMeetingsPerDay`,
   - eviten `blackoutPeriods`.

   Los umbrales vienen de la configuración: NO los escribo a mano.

6. **Elijo 3 opciones.** Repartidas entre días (p. ej. mañana AM, pasado mañana PM, fin de semana laboral AM). Prefiero media mañana (10 a 11:30) y primera hora de la tarde (2 a 4). Evito los lunes antes del mediodía y los viernes por la tarde salvo que nada más encaje. VIPs → prefiero horarios de mañana y márgenes más amplios.

7. **Redacto el mensaje.** Leo `config/voice.md` (o el bloque de tono en el contexto operativo). Si faltan muestras de tu tono → hago UNA pregunta dirigida (lo mejor: conecta la bandeja de entrada vía Composio para calibrar con 20 a 30 mensajes enviados recientes) y continúo. Patrón: reconocimiento en una línea → 3 horarios propuestos (en viñetas, con la zona horaria tuya y la de la contraparte etiquetadas si son distintas) → alternativa suave ("o sugiere un horario que te funcione mejor"). Tope de ~80 palabras.

8. **Escribo `scheduling/{slug}/proposal.md`** (slug = contraparte en kebab-case o id del hilo, con prefijo `sched-` si es independiente). Se sobrescribe en cada iteración. Estructura:

   ```markdown
   ## Counterparty
   {name} <{email}>

   ## Proposed times
   - {Day Mon DD, H:MMam PT / H:MMpm ET}  -  {duration}
   - ...

   ## Constraints honored
   - focus blocks respected: {list}
   - daily meeting cap: {X}/{max}
   - buffers: {min} min

   ## Draft message
   {the drafted body}

   ## Status
   draft
   ```

9. **Te lo presento.** "Aquí van 3 opciones + el borrador del mensaje. ¿Lo envío? ¿Lo ajusto? ¿Agrego una cuarta?" Nunca envío.

10. **Itero con la respuesta.** La contraparte responde eligiendo un horario o contrapropone → actualizo el `## Status` de la propuesta (draft → sent → counter-proposed). Confirmo o vuelvo a los pasos 5 y 6 con la ventana acotada.

11. **Agendo con tu aprobación.** Dices "agenda {horario} con {contraparte}" → llamo al slug de creación de eventos de Composio. Agrego a la contraparte como asistente, incluyo enlace de video si el proveedor lo soporta, y pongo el título según tu instrucción o el propósito inferido. Actualizo el status de la propuesta a `confirmed`.

12. **Agrego a `outputs.json`** con `type: "scheduling"`, status "draft" hasta la confirmación, y lo cambio a "ready" al agendar.

13. **Traspaso la preparación.** Después de agendar, si el asistente es VIP o la reunión es de alto riesgo, ofrezco: "¿Quieres que corra `brief-me mode=meeting-pre` sobre esta ahora?"

## Salidas

- `scheduling/{slug}/proposal.md` (sobrescrito en cada iteración)
- Evento de calendario creado tras tu aprobación
- Agrega a `outputs.json` con `type: "scheduling"`.

## Lo que nunca hago

- **Agendar** un evento de calendario sin tu "agéndalo" explícito sobre un horario específico.
- **Enviar** el mensaje a la contraparte: solo borradores. Tú lo envías desde tu propia bandeja de entrada, o me apruebas enviarlo vía Composio después de revisarlo.
- **Pasar por encima de un bloque de concentración o del límite diario** sin que lo levantes explícitamente para esa reunión en particular.
- **Proponer horarios sin leer las preferencias** - si falta `schedule-preferences.json` → pregunto una vez y continúo.

---
name: ponerme-al-dia-con-un-hilo
title: "Ponerme al día con un hilo"
description: "Señálame una conversación con un cliente y te doy la versión corta: cómo va todo, qué prometiste, y qué está esperando el cliente. Tres puntos en vez de releer un hilo de 20 mensajes. Especialmente útil antes de redactar una respuesta a algo que quedó pendiente."
version: 1
category: Soporte
featured: no
image: headphone
integrations: [gmail, outlook]
---


# Ponerme al día con un hilo

## Cuándo usarlo
`conversations/{id}/thread.json` tiene más de un puñado de mensajes y necesitas contexto rápido. Disparadores típicos:
- Tú: "¿cómo va el hilo con Acme?"
- Reabres una conversación inactiva por más de 3 días.
- Antes de `draft-a-reply` en un hilo con 5 o más mensajes: ejecuta esto primero, la respuesta sale mejor.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de que esta skill se ejecute, verifico que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Bandeja de entrada** (Gmail / Outlook): traigo el hilo en vivo si todavía no está en `conversations.json`. Opcional.
- **Mesa de ayuda** (Intercom / Zendesk / Help Scout): fuente alterna del hilo. Opcional.

Si ninguna está conectada sigo trabajando con el índice local de hilos, pero te aviso que el resumen podría no incluir la respuesta más reciente.

## Información que necesito

Primero leo tu contexto de soporte. Por cada campo obligatorio que falte, te hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Qué hilo**: Obligatorio. Por qué la necesito: resumo una conversación específica, no "soporte en general". Si falta, pregunto: "¿Cuál conversación resumo? Comparte el nombre del cliente o el asunto más reciente."
- **Audiencia del resumen**: Opcional. Por qué la necesito: tres puntos para ti se leen distinto que un traspaso para un compañero de equipo. Si no la tienes, sigo con TBD y lo escribo pensando en que lo leas tú.

## Pasos
1. **Cargar** `conversations/{id}/thread.json` y la fila del índice en `conversations.json`.
2. **Recorrer el hilo cronológicamente.** Anota: la petición original del cliente, cambios de alcance, cada promesa hecha, cada respuesta dada.
3. **Producir exactamente tres puntos:**
   - **Dónde estamos**: último mensaje, quién lo envió, estado actual (esperando al cliente / esperando de nuestro lado / en borrador).
   - **Qué prometimos**: compromisos pendientes. Los tomo de `followups.json` filtrado por conversación, más promesas no capturadas en el hilo (recomiendo `track-my-promises` si encuentro alguna).
   - **Qué espera el cliente ahora**: la petición explícita o implícita más reciente.
4. **Añadir el resumen** como bloque fechado en `conversations/{id}/notes.md`: queda guardado para la próxima vez.

## Resultados
- Devuelve un resumen de 3 puntos en el chat
- Añade un bloque de resumen fechado a `conversations/{id}/notes.md`

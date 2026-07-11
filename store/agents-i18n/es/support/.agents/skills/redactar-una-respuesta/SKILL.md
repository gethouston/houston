---
name: redactar-una-respuesta
title: "Redactar una respuesta"
description: "Dime cuál conversación y yo escribo tu respuesta. Reviso el historial del cliente, leo tus mensajes anteriores para igualar tu voz, y redacto algo que realmente responda lo que preguntaron, ya sea un error, una guía de uso o una pregunta de facturación. Nunca la envío y nunca prometo una fecha que tú no hayas aprobado."
version: 1
category: Soporte
featured: yes
image: headphone
integrations: [gmail, outlook]
---


# Redactar una respuesta

## Cuándo usarlo

- Dices "redacta una respuesta para {conversation id}" o "redacta mi respuesta."
- `check-my-inbox` mostró el hilo en el resumen matutino y le hiciste clic.
- La conversación clasificada tiene estado `open` / `waiting_founder`, y todavía no tiene `draft.md`.
- **Nunca** se invoca para enviar: esta skill solo redacta.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de que esta skill se ejecute, verifico que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Bandeja de entrada** (Gmail / Outlook): traigo el hilo en vivo y muestreo tus respuestas enviadas para el tono. Obligatorio.
- **CRM** (HubSpot / Attio / Salesforce): traigo el plan, dueño, registro de cuenta para el dosier que leo antes de redactar. Opcional si `customers.json` ya está poblado.
- **Facturación** (Stripe): traigo el ingreso mensual para respuestas relacionadas con facturación. Opcional.

Si tu bandeja no está conectada, me detengo y te pido que conectes Gmail u Outlook primero.

## Información que necesito

Primero leo tu contexto de soporte. Por cada campo obligatorio que falte, te hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Documento de contexto de soporte**: Obligatorio. Por qué la necesito: ahí viven la superficie del producto, las reglas de enrutamiento, los niveles de tiempo de respuesta, las frases prohibidas. Si falta, pregunto: "¿Quieres que te guíe primero para configurar tu contexto de soporte? Es una entrevista rápida."
- **Muestras de voz**: Obligatorio. Por qué la necesito: los borradores en el tono equivocado se terminan reescribiendo de todas formas. Si falta, pregunto: "¿Quieres que traiga 10 a 20 de tus respuestas recientes para aprender tu tono, o puedes pegar de 3 a 5 ejemplos?"
- **El hilo en sí**: Obligatorio. Por qué la necesito: redacto contra el mensaje real del cliente, no una paráfrasis. Si falta, pregunto: "¿Para cuál conversación redacto? Comparte el nombre del cliente o el correo más reciente."

## Pasos

1. **Leer `context/support-context.md`.** Si falta o está vacío, me detengo y te digo que ejecutes primero `set-up-my-support-info`.
2. **Cargar el hilo** desde `conversations/{id}/thread.json`. Identifico el mensaje más reciente del cliente: la respuesta va dirigida a eso.
3. **Encadenar `look-up-a-customer view=dossier`** para el cliente del hilo. Extraigo: plan, ingreso mensual, candidatos a error abiertos, seguimientos abiertos (de `followups.json`), cualquier entrada en `churn-flags.json`, las últimas 3 conversaciones del historial.
4. **Muestrear la voz.** Leo `config/voice.md`. Si falta o `sampleCount` < 5, ejecuto primero `calibrate-my-voice`. Reflejo las señales de tono: saludo, despedida, longitud de las oraciones, si uso el nombre de pila del cliente. Nada de "lamento el inconveniente". Nada de rodeos corporativos.
5. **Redactar la respuesta.** Según la petición:
   - **Error**: reconocer, confirmar la reproducción si es posible, indicar el siguiente paso. Nunca prometer una fecha de solución que no haya aprobado, mejor decir "te doy un tiempo estimado más adelante."
   - **Guía de uso**: responder claro, enlazar el artículo del centro de ayuda si existe en `articles/{slug}.md` (verificar antes de enlazar).
   - **Facturación**: exponer los hechos, proponer una acción (reembolso / crédito / cambio de plan). Escalar contigo antes de comprometerme.
   - **Lenguaje de cancelación**: preciso, honesto, sin culpa. Ofrecer una opción genuina; nunca prometer lo que no sea política en `context/support-context.md`.
6. **Añadir un fragmento del dosier** a `conversations/{id}/notes.md` (plan, ingreso mensual, errores abiertos, estado de cancelación) para tener contexto cuando lo apruebes.
7. **Escribir `conversations/{id}/draft.md`** de forma atómica. Actualizo la entrada en `conversations.json`: estado = `waiting_founder`, refresco `updatedAt`.
8. **Añadir a `outputs.json`** con `type: "reply-draft"`, `domain: "inbox"`, título = "Respuesta a {customer} sobre {subject}", resumen = línea de apertura, ruta.
9. **Encadenar `track-my-promises`.** Si el borrador contiene un compromiso ("le confirmaré con ingeniería antes del viernes", "lo lanzo la próxima semana"), ejecuto `track-my-promises` para que la fecha límite quede en `followups.json`.

## Resultados

- `conversations/{id}/draft.md`
- `conversations/{id}/notes.md` (fragmento del dosier añadido)
- Actualización de la entrada en `conversations.json`
- Se añade a `outputs.json` con `type: "reply-draft"`, `domain: "inbox"`.

## Qué nunca hago

- Enviar la respuesta. Tú despachas cada mensaje saliente.
- Prometer fecha / reembolso / excepción que no esté en `context/support-context.md`.
- Inventar historial del cliente si el dosier es escaso: lo marco como DESCONOCIDO y pregunto.

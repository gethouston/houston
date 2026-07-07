---
name: clasificar-un-ticket
title: "Clasificar un ticket"
description: "Dame un ticket nuevo y yo lo clasifico por ti. Leo el mensaje, determino de qué se trata (error, guía de uso, facturación, solicitud de función), verifico si el cliente es VIP, asigno una prioridad según tus reglas de asignación, y lo ubico en tu cola para que sepas exactamente qué necesita atención y con qué urgencia."
version: 1
category: Soporte
featured: yes
image: headphone
integrations: [gmail, outlook, slack]
---


# Clasificar un ticket

## Cuándo usarla
Llegó un mensaje entrante nuevo y no hay entrada en `conversations.json` para el hilo todavía, O una entrada existente necesita reclasificarse porque el contenido cambió (por ejemplo, una guía de uso se convirtió en un reporte de caída). Fundador solitario: la clasificación es constante, cada respuesta nueva necesita que esta skill se ejecute primero.

## Conexiones que necesito

Hago el trabajo externo a través de Composio. Antes de ejecutar esta skill, verifico que las categorías de abajo estén conectadas. Si falta alguna → nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Bandeja de entrada** (Gmail / Outlook)  -  trae el mensaje entrante y el hilo completo. Obligatorio.
- **Help-desk de soporte** (Intercom / Zendesk / Help Scout)  -  fuente alterna si los mensajes de los clientes llegan ahí. Obligatorio si no usas Gmail / Outlook para soporte.
- **Mensajería** (Slack)  -  fuente de los mensajes directos de clientes que clasificas como tickets. Opcional.

Si no hay bandeja de entrada ni help-desk conectados, me detengo y te pido que conectes el que tus clientes realmente usan para escribirte.

## Información que necesito

Primero leo tu contexto de soporte. Por cada campo obligatorio que falte, te hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > pegar texto) y espero.

- **Categorías de enrutamiento**  -  Obligatorio. Por qué lo necesito: clasifico cada mensaje entrante en una de ellas. Si falta, pregunto: "Cuando llega un ticket, ¿en qué categorías lo clasificas? ¿Error, guía de uso, facturación, algo más?"
- **Niveles de tiempo de respuesta**  -  Obligatorio. Por qué lo necesito: la asignación de prioridad depende de los umbrales de cada nivel. Si falta, pregunto: "¿Qué tiempo de respuesta quieres lograr para tus tickets más urgentes, y qué es aceptable para el resto?"
- **Lista VIP**  -  Obligatorio. Por qué lo necesito: los VIP tienen un piso de P1 sin importar el contenido. Si falta, pregunto: "¿Qué 3 a 5 clientes deberían tener siempre la máxima prioridad?"
- **Ingreso mensual / nivel de plan por cliente**  -  Opcional. Por qué lo necesito: me permite ponderar la prioridad según el estatus de cliente pagante. Si no lo tienes, sigo con TBD y pondero solo con las señales del contenido.

## Pasos
0. **Leo `context/support-context.md`.** Si no existe, me detengo. Te digo que corras primero `set-up-my-support-info`. Leo las reglas de enrutamiento + los niveles de tiempo de respuesta + la lista VIP del documento, nunca los dejo fijos en el código.
1. **Identifico la fuente**: tú nombras el canal o el mensaje se referencia por su id externo. Uso `composio search <channel>` para encontrar el slug correcto (por ejemplo, traer un hilo de Gmail, traer una conversación de Intercom). NO dejo slugs de herramientas fijos en el código.
2. **Traigo el hilo completo** vía Composio. Obtengo el asunto, todos los mensajes, el correo del remitente, los ids externos de los mensajes.
3. **Resuelvo el cliente.** Busco en `customers.json` por el correo del remitente. Si no lo encuentro, creo una nueva entrada en el índice (slug = la parte local del correo en formato kebab-case, deduplicado si hace falta).
4. **Categorizo** el contenido contra las categorías de enrutamiento en `context/support-context.md` (conjunto típico: `bug | how-to | feature | billing | account | security | other`). Señales de contenido: mensajes de error + stack traces apuntan a bug; "cómo hago para…" apunta a how-to; "¿pueden agregar…" apunta a feature; palabras clave "reembolso", "factura", "cobro" apuntan a billing.
5. **Asigno prioridad (P1-P4)** usando los umbrales de nivel de `context/support-context.md`. Reglas iniciales típicas: ingreso mensual >= $500/mes → P2 base; etiqueta VIP → piso de P1. Escalo según el contenido: "caído", "no puedo iniciar sesión", "pérdida de datos", "producción" → subo un nivel (máximo P1). Bajo un nivel con "cuando tengas oportunidad".
6. **Defino los campos de tiempo de respuesta** usando `domains.inbox.responseTimeTargets.firstResponseHours` (si no, la tabla de niveles del documento de contexto). `breached = false` al inicio.
7. **Escribo de forma atómica.** Upsert en `conversations.json`. Escribo los mensajes completos en `conversations/{id}/thread.json`.
8. **Agrego a `outputs.json`** con `type: "triage"`, `domain: "inbox"`, título = `{customer}  -  {subject}`, resumen = categoría + prioridad, ruta.

## Resultados
- Escribe en `conversations.json` (upsert del índice)
- Escribe en `conversations/{id}/thread.json` (hilo completo)
- Escribe en `customers.json` (nueva fila de cliente si hace falta)
- Agrega a `outputs.json` con `type: "triage"`, `domain: "inbox"`.

---
name: preparar-una-reunion
title: "Preparar una reunión"
description: "Te preparo para una reunión en el formato que corresponda: una hoja de preparación de una página con las preguntas indicadas para el pilar de calificación más débil del negocio, o un paquete de revisión de cuenta con resultados entregados, tendencia de uso, riesgos y plazo hasta la renovación. Ambos parten de tu playbook y del historial del negocio o cliente, sin plantillas genéricas."
version: 1
category: Ventas
featured: yes
image: handshake
integrations: [googlecalendar, hubspot, salesforce, attio, gong, fireflies, stripe, linkedin]
---


# Preparar una reunión

Una sola skill, dos formatos de preparación de reunión. El parámetro `type` define la estructura. Comparten el anclaje al playbook y la regla de "sin plantillas genéricas".

## Parámetro: `type`

- `call`: hoja de una página previa a la llamada (descubrimiento / demo / seguimiento / etapa avanzada). Objetivo, asistentes, preguntas, objeciones, criterios de salida.
- `account-review`: paquete trimestral de revisión de cuenta para un cliente existente. Resultados, tendencia de uso, pedidos abiertos, riesgos, meta del próximo trimestre.

Si el pedido del usuario nombra el tipo en lenguaje simple ("preparación de llamada", "revisión de cuenta"), lo infiero. Si no, hago UNA pregunta que nombre las 2 opciones.

## Cuándo usarla

- Disparadores explícitos en la descripción.
- Implícito: `brief-me-for-today` detecta una reunión inminente sin preparación y encadena aquí con `type=call`; la rutina de retención de clientes encadena aquí con `type=account-review` antes de la ventana de renovación.

## Conexiones que necesito

Todo el trabajo externo lo hago a través de Composio. Antes de ejecutar esta skill, verifico que las categorías de abajo estén conectadas. Si falta alguna, digo cuál es, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Calendario**: obtengo la hora de la reunión y los asistentes. Obligatorio.
- **CRM**: leo el registro del negocio o del cliente (etapa, dueño, contactos). Obligatorio.
- **Reuniones**: obtengo transcripciones de llamadas previas para `type=call`. Opcional.
- **Redes sociales**: enriquezco los perfiles de los asistentes vía LinkedIn. Opcional.
- **Facturación**: obtengo el estado de facturación para `type=account-review`. Opcional.

Si el calendario o el CRM no están conectados, me detengo y te pido que los conectes primero. La preparación se ancla en la reunión y en el negocio.

## Información que necesito

Primero leo tu contexto de ventas. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Tu playbook de ventas**: obligatorio. Por qué lo necesito: priorizo las preguntas según tu marco de calificación y tomo tu objetivo principal para la primera llamada. Si falta, pregunto: "Todavía no tengo tu playbook. ¿Quieres que lo redacte ahora?"
- **Para qué reunión es**: obligatorio. Por qué lo necesito: obtengo el evento del calendario, los asistentes y el negocio al que está vinculada. Si falta, pregunto: "¿Para qué reunión quieres que prepare esto? ¿Con quién es y más o menos cuándo?"
- **CRM conectado**: obligatorio. Por qué lo necesito: leo la etapa del negocio y los contactos previos para enfocar el banco de preguntas. Si falta, pregunto: "Conecta tu CRM (HubSpot, Salesforce, Attio, Pipedrive o Close), o pega el contexto del negocio."
- **Fuente de uso del producto**: opcional, útil para `type=account-review`. Por qué lo necesito: cito tendencias de uso reales. Si no la tienes, sigo adelante con TBD en la sección de uso.

## Pasos

1. **Leo el registro de contexto y el playbook.** Reúno los campos obligatorios que falten (una pregunta cada uno, empezando por la mejor modalidad). Escribo de forma atómica.

2. **Me ramifico según el tipo.**
   - `call`:
     1. Leo la fila del negocio en `deals.json` y las notas de llamadas
        previas en `calls/{slug}/`. Leo el informe de cuenta
        `accounts/{slug}/brief-*.md` (encadeno
        `research-an-account depth=full-brief` si falta y el usuario lo
        aprueba).
     2. Obtengo los detalles de la reunión de Google Calendar (vía
        Composio) si se especificó la hora. Capturo a los asistentes
        (cargo y rol; enriquezco vía LinkedIn si hay poca información).
     3. Armo la hoja de una página:
        - **Objetivo de la reunión**: a partir del objetivo principal de
          primera llamada del playbook, ajustado según la etapa
          (descubrimiento / demo / etapa avanzada).
        - **Asistentes**: nombre, cargo, perfil de una línea y motivación
          probable para esta reunión.
        - **Resumen de contexto**: 2 o 3 puntos del informe de cuenta y
          del análisis de llamadas previas.
        - **Banco de preguntas**: de 5 a 8 preguntas del marco de
          calificación del playbook. Prioriza el pilar más débil según el
          estado actual del negocio (se apoya en análisis de llamadas
          previas si existen).
        - **Objeciones probables**: las 2 principales del manual de
          objeciones del playbook, con el mejor replanteamiento actual
          para cada una.
        - **Criterios de salida**: qué debe cumplirse al final de la
          llamada para que el negocio avance de etapa (según la sección
          de etapas de negocio y criterios de salida del playbook).
        - **Minas a evitar**: cualquier patrón de pérdida señalado en
          `call-insights/*.md` para el segmento.
     4. Guardo en `deals/{slug}/call-prep-{YYYY-MM-DD}.md` (de forma
        atómica, `*.tmp` y luego renombro). Creo `deals/{slug}/` si no
        existe.
     5. Actualizo la fila en `deals.json`: fijo `lastCallPrepAt`.
   - `account-review`:
     1. Leo la fila del cliente en `customers.json` y la revisión de
        cuenta previa (`customers/{slug}/account-review-*.md`) para que
        esto sea una actualización, no una reescritura.
     2. Obtengo la tendencia de uso vía PostHog / Mixpanel / Amplitude
        (si está conectado). Obtengo el estado de facturación vía Stripe.
        Obtengo los tickets de soporte abiertos si hay una herramienta de
        tickets conectada.
     3. Armo el paquete de revisión de cuenta:
        - **Resultados entregados**: frente a la métrica de éxito
          acordada en el kickoff (de `customers/{slug}/onboarding-plan.md`
          si existe). Con números.
        - **Tendencia de uso**: trimestre contra trimestre. Cito la
          fuente de la métrica.
        - **Pedidos abiertos**: solicitudes de funcionalidades abiertas y
          escalaciones de soporte.
        - **Riesgos**: factores en amarillo o rojo de la última corrida
          de `score-my-pipeline subject=customer-health`.
        - **Meta del próximo trimestre**: un resultado concreto, ligado a
          la hoja de ruta del producto si es visible.
        - **Plazo hasta la renovación**: días hasta la renovación y
          recordatorio de la postura de precios (del playbook).
     4. Guardo en `customers/{slug}/account-review-{YYYY-QN}.md`.
     5. Actualizo la fila en `customers.json`: fijo `lastAccountReviewAt`.

3. **Agrego una entrada en `outputs.json`**: leo, combino y escribo de forma atómica: `{ id (uuid v4), type: "call-prep" (for call) | "account-review-prep" (for account-review), title, summary: "<meeting goal | top risk + top outcome>", path, status: "ready", createdAt, updatedAt, domain: "<meetings | retention>" }`.

4. **Resumo al usuario.** El objetivo de la reunión (o el resultado principal para revisión de cuenta) y las 3 preguntas principales (o el riesgo principal para revisión de cuenta), en el mismo mensaje. La ruta a la preparación completa.

## Lo que nunca hago

- Inventar asistentes, números de uso o hechos de llamadas previas. Cada fila cita su fuente.
- Entregar una plantilla genérica de llamada de descubrimiento. Cada banco de preguntas se prioriza según el estado actual de calificación del negocio.
- Escribir la revisión de cuenta como un tablero. Es narrativa, con 3 riesgos y 3 logros, no gráficos.

## Resultados

- `call` → `deals/{slug}/call-prep-{YYYY-MM-DD}.md`; actualiza `deals.json`.
- `account-review` → `customers/{slug}/account-review-{YYYY-QN}.md`; actualiza `customers.json`.
- Agrega una entrada en `outputs.json`.

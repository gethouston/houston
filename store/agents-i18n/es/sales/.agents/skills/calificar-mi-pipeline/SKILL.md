---
name: calificar-mi-pipeline
title: "Calificar mi pipeline"
description: "Puntúo lo que necesites puntuar. Elige el sujeto: cada lead sin puntuar frente a tu perfil de cliente ideal, el ajuste y ángulo de un solo lead, cada negocio abierto según sus factores de salud, o el color de cada cliente. Nombro los dos factores principales de cada fila para que ningún número sea una caja negra."
version: 1
category: Ventas
featured: no
image: handshake
integrations: [hubspot, salesforce, attio, stripe]
---


# Calificar mi pipeline

Una sola skill, cuatro superficies de calificación. El parámetro `subject` elige la rúbrica. Comparten la disciplina de "factores transparentes, sin números mágicos".

## Parámetro: `subject`

- `lead`: califica en bloque cada lead sin puntuar en `leads.json` (más cualquier vista de leads nuevos en el CRM conectado). Una pasada de todo el sistema, no de un solo lead. Devuelve una tabla clasificada.
- `lead-fit`: un solo lead con nombre: puntaje de ajuste y ángulo para presentar. Rápido, una sola fila.
- `deal-health`: cada negocio abierto en `deals.json` (o la vista de negocios abiertos del CRM conectado). Factores: tiempo en la etapa, qué tan completa está la calificación, qué tan reciente fue el último contacto. Devuelve GREEN / YELLOW / RED por negocio.
- `customer-health`: cada cliente actual en `customers.json`. Factores: tendencia de uso del producto, puntaje de satisfacción si se capturó, volumen de tickets de soporte, señal de facturación (cercanía a una baja de plan). GREEN / YELLOW / RED, con los 2 factores principales nombrados por fila.

Si el pedido del usuario nombra el sujeto en lenguaje simple ("califica los leads", "revisión de ajuste", "salud del pipeline", "quién está en rojo"), lo infiero. Si no, hago UNA pregunta que nombre las 4 opciones.

## Cuándo usarla

- Disparadores explícitos en la descripción.
- Implícito: dentro de `manage-my-crm action=route` (enrutar necesita el puntaje); dentro de `write-my-outreach stage=churn-save` (una fila de customer-health en rojo dispara el intento de retención); dentro de `check-my-sales subject=pipeline` (el resumen de salud usa los puntajes por negocio).

## Conexiones que necesito

Todo el trabajo externo lo hago a través de Composio. Antes de ejecutar esta skill, verifico que las categorías de abajo estén conectadas. Si falta alguna, digo cuál es, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **CRM**: obtengo leads, negocios abiertos, registros de clientes. Obligatorio para `lead`, `deal-health`, `customer-health`.
- **Facturación**: obtengo la señal de baja de plan o cancelación. Obligatorio para `customer-health`.
- **Rastreo / búsqueda**: enriquezco un solo lead para `lead-fit`. Opcional.

Si tu CRM no está conectado, me detengo y te pido que conectes primero HubSpot, Salesforce, Attio, Pipedrive o Close.

## Información que necesito

Primero leo tu contexto de ventas. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Tu playbook de ventas**: obligatorio. Por qué lo necesito: tu perfil de cliente ideal y tus descalificadores definen la calificación de leads y de ajuste; el marco de calificación y los criterios de salida por etapa definen la salud de los negocios. Si falta, pregunto: "Todavía no tengo tu playbook. ¿Quieres que lo redacte ahora?"
- **CRM conectado**: obligatorio para `lead`, `deal-health`, `customer-health`. Por qué lo necesito: califico filas reales, no inventadas. Si falta, pregunto: "Conecta tu CRM (HubSpot, Salesforce, Attio, Pipedrive o Close) para que pueda traer leads, negocios y clientes."
- **Umbrales de salud**: opcional, para `customer-health`. Por qué lo necesito: convierten los factores en GREEN/YELLOW/RED. Si no tienes los tuyos, sigo adelante con valores por defecto razonables (GREEN = activo semanalmente y sin señal de baja de plan; YELLOW = una preocupación; RED = dos o más) y confirmo antes de fijarlos.
- **Fuente de uso del producto**: opcional, útil para `customer-health`. Por qué lo necesito: la tendencia de uso es el factor de salud más fuerte. Si no la tienes, sigo adelante con TBD en ese factor.

## Pasos

1. **Leo el registro de contexto y el playbook.** Reúno los campos obligatorios que falten (una pregunta cada uno, empezando por la mejor modalidad). Escribo de forma atómica.

2. **Obtengo la población.**
   - `lead`: leo `leads.json` y `composio <crm> get-new-leads` (o el
     equivalente del CRM conectado).
   - `lead-fit`: la fila del lead con nombre (o datos pegados).
   - `deal-health`: `deals.json` y `composio <crm> get-open-deals`.
   - `customer-health`: `customers.json` y `composio <crm> get-customers`;
     obtengo la señal de facturación vía Stripe; obtengo la señal de uso
     vía PostHog / Mixpanel / Amplitude si está conectado.

3. **Califico según la rúbrica.**
   - `lead` / `lead-fit`: por fila, comparo contra el perfil de cliente
     ideal y los descalificadores del playbook. Califico cada dimensión
     de 0 a 3. Los descalificadores duros bajan directo a RED. Sumo →
     GREEN (≥ 80%) / YELLOW (50-79%) / RED (< 50% o algún descalificador).
     Genero un **ángulo** (un solo dolor del playbook) para cada GREEN.
   - `deal-health`: tres factores por negocio: **tiempo en la etapa**
     frente a la línea base del playbook (RED si supera 2x la línea
     base), **calificación** (% de pilares del marco cubiertos, RED si es
     menor a 50%), **contacto reciente** (días desde el último contacto
     significativo, RED si supera 14 días en etapas activas). El
     resultado general es el peor factor.
   - `customer-health`: factores por cliente: **tendencia de uso** (%
     respecto a la línea base de las 4 semanas previas), **puntaje de
     satisfacción** si se capturó, **tickets de soporte** (cantidad por
     severidad, si es accesible), **señal de facturación** (baja de plan
     o cancelación en curso). El resultado general es el peor factor.
     Nombro los 2 factores principales por fila.

4. **Escribo el lote calificado** de forma atómica en `scores/{subject}-{YYYY-MM-DD}.md`: tabla clasificada, factores por fila y próximos movimientos sugeridos. Para `lead-fit`, el mismo formato pero con una sola fila.

5. **Actualizo el archivo de la entidad correspondiente.**
   - `lead` + `lead-fit`: actualizo la fila en `leads.json` con
     `fitScore` y `scoredAt`.
   - `deal-health`: actualizo la fila en `deals.json` con `healthScore`,
     `healthDrivers` y `scoredAt`.
   - `customer-health`: actualizo la fila en `customers.json` con
     `healthColor`, `healthDrivers` y `scoredAt`.

6. **Agrego una entrada en `outputs.json`**: leo, combino y escribo de forma atómica: `{ id (uuid v4), type: "score", title: "{Subject} score  -  {YYYY-MM-DD}", summary: "<N rows. {R} red, {Y} yellow, {G} green.>", path, status: "ready", createdAt, updatedAt, domain: "<outbound (lead/lead-fit) | crm (deal-health) | retention (customer-health)>" }`.

7. **Resumo al usuario.** Los totales y la fila principal a atender. Sugiero la siguiente skill ("¿Enruto los GREEN con `manage-my-crm action=route`?" / "¿Redacto intentos de retención para los RED con `write-my-outreach stage=churn-save`?").

## Lo que nunca hago

- Inventar un número o una señal. Cada factor cita un dato concreto (fila, conteo de eventos, días).
- Empujar puntajes al CRM sin aprobación. Las actualizaciones van a los índices locales `leads.json` / `deals.json` / `customers.json`; cualquier cosa que modifique sistemas externos pasa por `manage-my-crm action=queue-followup`.
- Resultado de caja negra. Siempre nombro los factores.

## Resultados

- `scores/{subject}-{YYYY-MM-DD}.md`
- Actualiza filas en `leads.json` / `deals.json` / `customers.json`.
- Agrega una entrada en `outputs.json` con `type: "score"`.

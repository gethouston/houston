---
name: encontrar-mis-expansiones
title: "Encontrar mis expansiones"
description: "Reviso tus clientes VERDE en busca de señales de expansión (picos de uso que superan los límites del plan, crecimiento del tamaño del equipo, patrones de solicitud de funciones, adopción de nuevos productos) y clasifico las oportunidades de upsell, cross-sell, add-on y expansión de asientos según el ingreso anual potencial frente al esfuerzo de cierre. Cada fila cita la señal para que sepas por qué la traje a la vista."
version: 1
category: Ventas
featured: no
image: handshake
integrations: [linkedin]
---


# Encontrar mis expansiones

## Cuándo usarlo

- "¿hay oportunidades de expansión en mi cartera ahora mismo?".
- "quién está listo para upsell / cross-sell".
- Programado: barrido mensual de expansión.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta skill reviso que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña Integraciones, y me detengo.

- **Facturación**  -  para traer conteo de asientos, plan, y uso frente a los límites del plan. Obligatorio.
- **CRM**  -  para identificar clientes VERDE y patrones de solicitud de funciones. Obligatorio.
- **Redes sociales**  -  para leer el crecimiento del tamaño del equipo en LinkedIn. Opcional.

Si la facturación o el CRM no están conectados, me detengo y te pido conectar primero Stripe y tu CRM, la expansión se fundamenta en el uso real y el estado de la cuenta.

## Información que necesito

Primero leo tu contexto de ventas. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > pegar texto) y espero.

- **Tu playbook de ventas**  -  Obligatorio. Por qué lo necesito: la postura de precios y la lista de SKU definen qué es siquiera un upsell o un cross-sell. Si falta, pregunto: "Todavía no tengo tu playbook, ¿quieres que lo redacte ahora?"
- **Facturación conectada**  -  Obligatorio. Por qué lo necesito: los datos de asientos y uso fundamentan cada candidato de expansión. Si falta, pregunto: "Conecta Stripe para poder leer el conteo de asientos, los planes, y el uso."
- **CRM conectado**  -  Obligatorio. Por qué lo necesito: leo qué clientes están VERDE y traigo los patrones recientes de solicitud de funciones. Si falta, pregunto: "Conecta tu CRM (HubSpot, Salesforce, Attio, Pipedrive, o Close) para poder leer tu cartera de clientes."
- **Fuente de uso del producto**  -  Opcional. Por qué lo necesito: los picos de uso son la señal de expansión más fuerte. Si no la tienes, sigo con TBD en esa señal y me apoyo en las señales de asientos y crecimiento de equipo.

1. **Leer el playbook.** `context/sales-context.md` para la postura de precios + la lista de SKU.

2. **Leer `customers.json`.** Filtro solo por `health: "GREEN"`.

3. **Por cada cliente VERDE, reviso señales:**
   - **Picos de uso**  -  por encima del límite del plan actual (consulto analítica de producto).
   - **Crecimiento del tamaño del equipo**  -  nuevos asientos, crecimiento de headcount en LinkedIn (consulto el CRM + LinkedIn si está conectado).
   - **Solicitudes de funciones**  -  de tickets que mapean a un SKU existente (consulto soporte).
   - **Adopción de nuevos productos**  -  % que usa la función / SKU más reciente.

4. **Puntuar candidato.** Impacto en ingreso anual (bajo / medio / alto) × esfuerzo de cierre (bajo / medio / alto). Ordeno por la razón impacto/esfuerzo.

5. **Para candidatos de señal alta, escribo un brief por cliente:** `customers/{slug}/expansion-{YYYY-MM-DD}.md`  -  señal citada, SKU / asiento / plan propuesto, ingreso anual estimado, esfuerzo de cierre, pitch de una línea que el agente usaría.

6. **Agregar a `expansion.json`:**

   ```ts
   {
     id, slug, customerSlug,
     type: "upsell" | "cross-sell" | "add-on" | "seat-expansion",
     estAnnualRevenue, effort: "low"|"med"|"high",
     signal: "<señal citada>",
     status: "surfaced",
     createdAt, updatedAt
   }
   ```

7. **Actualizar `customers.json`**  -  incremento `openExpansions`.

8. **Agregar a `outputs.json`** con `type: "expansion"`.

9. **Resumir.** Las 3 mejores oportunidades (cliente · tipo · ingreso anual estimado). Sugiero seguimiento: "corre `write-a-proposal` sobre la principal."

## Salidas

- `customers/{slug}/expansion-{YYYY-MM-DD}.md` por candidato.
- Agrega a `expansion.json`.
- Agrega a `outputs.json`.

---
name: planear-un-onboarding
title: "Planear un onboarding"
description: "Planeo los primeros noventa días de un cliente nuevo: la agenda del kickoff, la métrica de éxito acordada en sus propias palabras desde el arranque, los hitos de tiempo hasta el valor, los champions y bloqueadores identificados por nombre, y la lista de riesgos de los primeros treinta días. El punto de partida del que toma cada revisión de cuenta y renovación posterior."
version: 1
category: Ventas
featured: no
image: handshake
---


# Planear un onboarding

Primer artefacto después del cierre. Deja explícita la métrica de éxito para que el puntaje de salud sea honesto frente a ella el año siguiente.

## Cuándo usarla

- "planea el onboarding de {customer}".
- "plan de kickoff para {customer}".
- Disparador posterior al cierre cuando el estado del plan de cierre cambia a `closed-won`.

## Conexiones que necesito

Todo el trabajo externo lo hago a través de Composio. Antes de ejecutar esta skill, verifico que las categorías de abajo estén conectadas. Si falta alguna, digo cuál es, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **CRM**: leo el registro del negocio cerrado (cuenta, contactos, monto, plazo). Opcional pero recomendado.
- **Calendario**: agendo el kickoff una vez que lo apruebes. Opcional.

Puedo ejecutar esta skill solo con tu plan de cierre y tu propuesta existentes, así que ninguna conexión es obligatoria.

## Información que necesito

Primero leo tu contexto de ventas. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Tu playbook de ventas**: obligatorio. Por qué lo necesito: contiene tu forma estándar de definir la métrica de éxito y el ritmo de tiempo hasta el valor. Si falta, pregunto: "Todavía no tengo tu playbook. ¿Quieres que lo redacte ahora?"
- **Para qué cliente es**: obligatorio. Por qué lo necesito: leo el plan de cierre y la propuesta de ese negocio para extraer el problema que declararon. Si falta, pregunto: "¿Para qué cliente es este onboarding?"
- **Su métrica de éxito en sus propias palabras**: obligatorio. Por qué lo necesito: el plan se ancla a la métrica que le importa a él, no a la nuestra. Si falta, pregunto: "¿Cómo va a saber el cliente que esto funcionó? ¿Qué dijo que se vería como éxito?"
- **Fecha del kickoff**: opcional. Por qué lo necesito: ancla la línea de tiempo de 90 días. Si no la tienes, sigo adelante con TBD y propongo una fecha basada en el inicio del contrato.

1. **Leo el playbook.** `context/sales-context.md`.

2. **Leo el plan de cierre y la propuesta de este agente.** `deals/{slug}/
   close-plan.md` y `proposal-v*.md` (la más reciente). Extraigo: el
   problema del cliente, su métrica de éxito (textual), champion, comprador
   económico, partes interesadas, línea de tiempo.

3. **Leo `config/success-metric.json`**: nuestra forma canónica de
   plantearlo. Lo comparo contra SU métrica. Señalo cualquier divergencia.

4. **Redacto el plan de onboarding:**

   1. **Agenda del kickoff**: 5 a 7 puntos, 60 minutos. Presentaciones,
      confirmación de la métrica de éxito (nosotros la repetimos, ELLOS la
      confirman verbalmente), acceso y aprovisionamiento, traspaso del
      equipo, ritmo de seguimiento.
   2. **Métrica de éxito (explícita)**: ambas versiones, la nuestra y la
      suya. Si divergen, indico cuál define el puntaje de salud de los
      primeros 90 días.
   3. **Línea de tiempo de 90 días hasta el valor:**
      - Día 0: kickoff.
      - Día 7: acceso y primer uso.
      - Día 14: primer hito de valor (concreto, medible).
      - Día 30: primera revisión de resultados.
      - Día 60: ajuste de medio término.
      - Día 90: primer resultado trimestral.
   4. **Champions y bloqueadores**: identificados por nombre. Ejecutivos
      a presentar.
   5. **Lista de riesgos de los primeros 30 días**: cualquier cosa
      visible que pudiera descarrilar el proceso.

5. **Escribo de forma atómica** en `customers/{slug}/onboarding.md.tmp` →
   renombro. Creo `customers/{slug}/` si no existe.

6. **Creo una fila en `customers.json`**: `health: "GREEN"`,
   `startedAt: <ISO>`, `renewalAt` = kickoff + plazo, etc.

7. **Agrego una entrada en `outputs.json`** con `type: "onboarding"`.

8. **Resumo.** Métrica de éxito explícita y el hito de 30 días.

## Resultados

- `customers/{slug}/onboarding.md`
- Nueva fila en `customers.json`.
- Agrega una entrada en `outputs.json`.

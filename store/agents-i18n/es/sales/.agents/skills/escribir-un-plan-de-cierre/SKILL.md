---
name: escribir-un-plan-de-cierre
title: "Escribir un plan de cierre"
description: "Construyo un plan de acción mutuo con el prospecto: una línea de tiempo compartida que cubre compras, revisión de seguridad, aprobación de presupuesto y legal, con responsables (los tuyos y los suyos) e hitos con fecha. Señalo explícitamente los tres riesgos principales y cualquier interesado desconocido para que sepas qué averiguar en la próxima llamada."
version: 1
category: Ventas
featured: no
image: handshake
---


# Escribir un plan de cierre

Plan de acción mutuo (MAP, por sus siglas en inglés). Se comparte con el campeón. Genera responsabilidad en ambas direcciones. Versión honesta: si el comprador económico es desconocido, escribe UNKNOWN, no "quien toma la decisión".

## Cuándo usarla

- "arma un plan de acción mutuo con {Acme}".
- "plan de cierre para {Acme}".
- "qué falta para cerrar {Acme}".

## Conexiones que necesito

Hago el trabajo externo a través de Composio. Antes de ejecutar esta skill, reviso que las siguientes categorías estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **CRM**, para leer el registro del negocio (responsable, etapa, monto, fecha de cierre). Opcional, pero muy recomendado.

Si tu CRM no está conectado, sigo adelante solo con tus notas de llamadas y te pido que pegues cualquier dato del negocio que me falte.

## Información que necesito

Primero leo tu contexto de ventas. Por cada campo obligatorio que falte, te hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Tu playbook de ventas**. Obligatorio. Por qué lo necesito: las etapas de negocio y la calificación determinan qué sigue abierto en el plan. Si falta, pregunto: "Todavía no tengo tu playbook, ¿quieres que lo redacte ahora?"
- **Para qué negocio es este plan**. Obligatorio. Por qué lo necesito: leo el historial de llamadas de ese negocio específico. Si falta, pregunto: "¿Para qué prospecto o negocio debería armar este plan de cierre?"
- **Fecha objetivo de cierre**. Opcional. Por qué lo necesito: ancla la línea de tiempo. Si no la tienes, propongo una según tu ciclo de cierre típico y la marco como TBD.
- **Nombres del campeón, el comprador económico, y el bloqueador**. Opcional. Por qué lo necesito: se convierten en las filas del plan. Si no los tienes, escribo UNKNOWN y marco cada uno como algo por averiguar en la próxima llamada.

1. **Leo el playbook.** Cargo `context/sales-context.md`. Necesito las etapas de negocio y la calificación para saber qué sigue abierto.

2. **Leo el historial de llamadas del negocio.** Todos los `calls/{id}/analysis.md` donde `dealSlug` coincida. Extraigo los hechos confirmados versus los inferidos.

3. **Compilo el estado actual:**

   - **Campeón**, nombre y cargo, o UNKNOWN.
   - **Comprador económico**, nombre y cargo, o UNKNOWN.
   - **Bloqueador**, si está identificado, su nombre. Si no, UNKNOWN.
   - **Ruta de compras**, ¿revisión legal? ¿cuestionario de seguridad de la información? ¿aprobación de finanzas? Si se desconoce, UNKNOWN.
   - **Presupuesto**, confirmado / en el plan / necesita aprobación / UNKNOWN.
   - **Validación técnica**, hecha / programada / requerida / N/A.
   - **Fecha objetivo de cierre**, la del usuario si la proporcionó, si no, propongo una según el ciclo de cierre típico del playbook.

4. **Redacto el plan como una línea de tiempo compartida**, la nuestra y la suya:

   ```
   Week -4 : [us] Send proposal v2 | [them] Champion aligns with EB
   Week -3 : [them] Legal review / InfoSec | [us] Technical validation call
   Week -2 : [them] Procurement approval | [us] Contract redlines
   Week -1 : [them] Exec sign-off | [us] Final kickoff-ready state
   Week  0 : [both] Contract signed, kickoff scheduled
   ```

   Cada fila: responsable (nosotros / ellos / ambos), acción, fecha objetivo, bloqueador (si lo hay).

5. **Marco los UNKNOWN de forma visible.** Cada UNKNOWN recibe una viñeta en la sección "Qué necesitamos averiguar", cada uno asignado a la próxima llamada con una pregunta específica.

6. **Escribo de forma atómica** en `deals/{slug}/close-plan.md.tmp` y renombro. Un plan de cierre por negocio, sobrescribo versiones anteriores (pero mantengo un registro de cambios breve al final: "v2, 2026-04-23: se movió el cierre 1 semana por revisión legal").

7. **Actualizo `deals.json`**, establezco `closePlanAt`, `risk` (recalculo GREEN/YELLOW/RED según los UNKNOWN y el retraso de fechas).

8. **Anexo a `outputs.json`:**

   ```json
   {
     "id": "<uuid v4>",
     "type": "close-plan",
     "title": "Plan de cierre, {Company}",
     "summary": "Cierre objetivo {date} · {N} UNKNOWNs · {N} pasos.",
     "path": "deals/{slug}/close-plan.md",
     "status": "draft",
     "createdAt": "<ISO>",
     "updatedAt": "<ISO>"
   }
   ```

9. **Resumo.** La fecha objetivo de cierre y el principal UNKNOWN que el usuario debería resolver a continuación. Sugiero `prep-a-meeting type=call` para el próximo contacto.

## Resultados

- `deals/{slug}/close-plan.md`
- Actualiza `deals.json`.
- Se anexa a `outputs.json`.

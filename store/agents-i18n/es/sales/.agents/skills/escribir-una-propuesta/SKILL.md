---
name: escribir-una-propuesta
title: "Escribir una propuesta"
description: "Redacto una propuesta de una página fundamentada en el negocio: su problema en sus propias palabras, tu enfoque propuesto, el alcance (lo que incluye y lo que no), el precio dentro de la postura de tu playbook, los términos, las métricas de éxito, el cronograma y el siguiente paso. Cualquier cosa fuera de tus innegociables de precio se marca para tu aprobación, nunca se compromete en silencio."
version: 1
category: Ventas
featured: no
image: handshake
---


# Escribir una propuesta

Propuesta de una página. No es un SOW, es un documento ajustado de una página que el campeón reenvía al comprador económico y a compras.

## Cuándo usarla

- "redacta una propuesta para {Acme}".
- "propuesta de una página para {Acme}".
- "necesito enviarle a {Acme} una cotización / un alcance".

## Conexiones que necesito

Hago el trabajo externo a través de Composio. Antes de ejecutar esta skill, reviso que las siguientes categorías estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **CRM**, para leer el registro del negocio (responsable, etapa, monto, contactos). Opcional, pero recomendado.
- **Reuniones**, para traer transcripciones de llamadas anteriores y extraer el planteamiento textual del problema y las métricas de éxito. Opcional.

Si ninguna está conectada, sigo adelante con tus notas existentes y te pido los datos del negocio que me falten.

## Información que necesito

Primero leo tu contexto de ventas. Por cada campo obligatorio que falte, te hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Tu playbook de ventas**. Obligatorio. Por qué lo necesito: los rangos de precios, la política de descuentos y los términos mínimos viables tienen que salir de tu postura, no de una suposición. Si falta, pregunto: "Todavía no tengo tu playbook, ¿quieres que lo redacte ahora?"
- **Para qué negocio es esta propuesta**. Obligatorio. Por qué lo necesito: extraigo el planteamiento textual del problema y la métrica de éxito del historial de llamadas de ese negocio. Si falta, pregunto: "¿Para qué prospecto o negocio es esta propuesta?"
- **Su planteamiento textual del problema y la métrica de éxito**. Obligatorio. Por qué lo necesito: una propuesta de una página solo funciona cuando el problema está en sus propias palabras. Si falta en las notas de llamadas, pregunto: "¿Cómo describió el prospecto el problema con sus propias palabras, y qué métrica le indicará que funcionó?"
- **Supuestos de precio (número de usuarios, plazo, volumen)**. Obligatorio. Por qué lo necesito: necesito mostrar el cálculo, no inventarlo. Si falta, pregunto: "¿Qué estamos proponiendo? ¿Cuántos puestos o qué volumen, y qué plazo?"

1. **Leo el playbook.** Cargo `context/sales-context.md`. Obligatorio. Sin él, me detengo.

2. **Leo los precios.** De la sección de postura de precios del playbook. Conozco los rangos, la política de descuentos, el límite innegociable. **Nunca redacto por debajo del innegociable.** Si el negocio lo necesita, escribo UNKNOWN y marco para aprobación.

3. **Leo el historial del negocio**, todas las notas de llamadas y análisis bajo `calls/` filtrados por `dealSlug`. Extraigo: el planteamiento del problema (textual), la métrica de éxito (textual), los interesados, la línea de tiempo.

4. **Redacto la propuesta (~300-450 palabras):**

   1. **Planteamiento del problema**, en SUS palabras, cito de qué llamada.
   2. **Enfoque propuesto**, un párrafo, concreto. Sin jerga de moda.
   3. **Alcance**, lo que incluye: en viñetas. Lo que queda explícitamente FUERA: en viñetas. La lista de lo que queda fuera es tan importante como la de lo que incluye, evita que el alcance se expanda sin control.
   4. **Precio**, rango propuesto, supuestos (número de usuarios, volumen, plazo), cualquier descuento aplicado (dentro de la política). Muestro el cálculo.
   5. **Términos**, términos mínimos viables del playbook, ajustados solo dentro de la política de descuentos.
   6. **Métricas de éxito**, cómo ambos sabrán que funcionó. Tomadas de las notas de llamadas, la métrica que nos dijeron que les importaba.
   7. **Cronograma**, arranque, hitos de valor en {N} semanas.
   8. **Siguiente paso**, quién firma, quién hace la revisión legal, fecha objetivo de cierre (de `close-plan.md` si existe).

5. **Verifico contra el playbook.** Cualquier compromiso fuera de la postura de precios o los términos se marca en línea con `FLAG: needs approval  -  exceeds {non-negotiable}`. Lo muestro al usuario en el resumen, no lo escondo.

6. **Control de versiones.** Si ya existe una propuesta anterior, incremento la versión. El primer borrador es `proposal-v1.md`; el siguiente, `v2.md`. Nunca sobrescribo.

7. **Escribo de forma atómica** en `deals/{slug}/proposal-v{N}.md.tmp` y renombro.

8. **Actualizo `deals.json`**, establezco `lastProposalAt`, `proposalVersion`.

9. **Anexo a `outputs.json`:**

   ```json
   {
     "id": "<uuid v4>",
     "type": "proposal",
     "title": "Propuesta v{N}, {Company}",
     "summary": "<resumen del alcance en una línea + rango de precio>",
     "path": "deals/{slug}/proposal-v{N}.md",
     "status": "draft",
     "createdAt": "<ISO>",
     "updatedAt": "<ISO>"
   }
   ```

10. **Resumo.** La solicitud de precio y las marcas que necesitan decisión del usuario. La ruta a la propuesta completa. Nunca la envío.

## Resultados

- `deals/{slug}/proposal-v{N}.md`
- Actualiza `deals.json`.
- Se anexa a `outputs.json`.

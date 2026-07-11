---
name: ejecutar-mi-forecast
title: "Ejecutar mi forecast"
description: "Traigo cada negocio abierto de tu CRM, lo clasifico según los criterios de salida de etapa de tu playbook en Commit / Best / Pipeline / Omit, sumo el ingreso anual por categoría, y lo comparo con el forecast de la semana pasada para marcar cualquier retraso. La confianza de cada negocio es el mínimo entre el avance de etapa, qué tan completa está la calificación, y qué tan completo está el plan de cierre, sin decisiones al ojo."
version: 1
category: Ventas
featured: no
image: handshake
integrations: [hubspot, salesforce, attio, pipedrive]
---


# Ejecutar mi forecast

## Cuándo usarla

- "arma el forecast de esta semana".
- "resumen de Commit / Best / Pipeline".
- Programado: viernes por la tarde, antes de la revisión con el Head of Sales.

## Conexiones que necesito

Todo el trabajo externo lo hago a través de Composio. Antes de ejecutar esta skill, verifico que las categorías de abajo estén conectadas. Si falta alguna, digo cuál es, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **CRM**: obtengo cada negocio abierto con su etapa, monto, fecha de cierre objetivo y dueño. Obligatorio.

Si tu CRM no está conectado, me detengo y te pido que conectes HubSpot, Salesforce, Attio, Pipedrive o Close desde la pestaña de Integraciones.

## Información que necesito

Primero leo tu contexto de ventas. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Tu playbook de ventas**: obligatorio. Por qué lo necesito: las etapas de negocio y los criterios de salida definen el puntaje de confianza de cada negocio, no solo el nombre de la etapa. Si falta, pregunto: "Todavía no tengo tu playbook. ¿Quieres que lo redacte ahora?"
- **CRM conectado**: obligatorio. Por qué lo necesito: cada fila debe citar un negocio abierto real. Si falta, pregunto: "Conecta tu CRM (HubSpot, Salesforce, Attio, Pipedrive o Close) para que pueda traer los negocios abiertos."
- **Ventana del forecast**: opcional. Por qué lo necesito: define qué cuenta como Commit frente a Best. Si no la especificas, sigo adelante con el trimestre calendario actual.

1. **Leo el playbook.** `context/sales-context.md`. Las etapas de negocio y los criterios de salida definen la confianza.

2. **Cargo los negocios abiertos.** `deals.json` cruzado con las fechas de cierre objetivo de `deals/*/close-plan.md`.

3. **Califico la confianza por negocio.** Confianza = mínimo entre (confianza de etapa, qué tan completa está la calificación, qué tan completo está el plan de cierre):

   - **Commit (>80%):** última etapa, comprador económico y champion identificados, todos los pasos del plan de cierre en GREEN, fecha dentro de la ventana del forecast.
   - **Best (40-80%):** etapa media del embudo, la mayoría de los pilares completos, el plan de cierre existe pero tiene UNKNOWNs.
   - **Pipeline (10-40%):** etapa temprana, calificación poco desarrollada.
   - **Omit (<10%):** estancado, sin contacto reciente, o en salud RED con pocas probabilidades de resolverse.

4. **Sumo por categoría.** Cuento, sumo el ingreso anual, listo los negocios.

5. **Comparo con el forecast de la semana pasada.** Cargo `forecasts/{prior-week}.md`. Por cada negocio, señalo el movimiento (sube / baja / sin cambios / nuevo / desaparecido).

6. **Escribo el forecast** en `forecasts/{YYYY-WW}.md.tmp` → renombro:

   ```markdown
   # Forecast  -  Week {YYYY-WW}

   ## Commit  -  ${annual revenue} ({N} deals)
   - {Deal} · ${annual revenue} · target {date} · drivers: ...
   ## Best  -  ${annual revenue} ({N})
   ...
   ## Pipeline  -  ${annual revenue} ({N})
   ...
   ## Omit  -  ${annual revenue} ({N})
   ...

   ## Week-over-week
   - Moved UP: {Deal} from Best → Commit (champion aligned EB)
   - Moved DOWN: {Deal} from Commit → Best (legal review surprise)
   - NEW in Commit: ...
   - GONE from Commit: ...

   ## Headline
   Committed total ${X} (last week ${Y}, {delta}).
   ```

7. **Agrego una entrada en `outputs.json`** con `type: "forecast"`.

8. **Resumo.** El número principal y el mayor movimiento semana contra semana.

## Resultados

- `forecasts/{YYYY-WW}.md`
- Agrega una entrada en `outputs.json`.

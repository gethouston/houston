---
name: ejecutar-mi-revision-operativa
title: "Ejecutar mi revisión operativa"
description: "Reúne lo que se completó y lo que avanzó en toda tu superficie operativa. Elige lo que necesitas: una revisión semanal que agrega la salida de cada habilidad, cruza prioridades y renovaciones, señala vacíos y recomienda el próximo movimiento; o un resumen de métricas que recorre cada métrica monitoreada, calcula el cambio semana contra semana y muestra qué mirar primero."
version: 1
category: Operaciones
featured: yes
image: clipboard
integrations: [googlesheets]
---


# Ejecutar mi revisión operativa

El ritual transversal de los lunes. Dos sub-revisiones detrás de una misma primitiva: normalmente quieres la revisión semanal los lunes, con el resumen de métricas conectado a ella.

## Cuándo usarla

- `period=weekly`  -  "revisión operativa del lunes" / "lectura semanal" / "qué pasó en mis operaciones esta semana".
- `period=metrics-rollup`  -  "lectura semanal de métricas" / "cómo va el negocio esta semana" / "dame los datos para la revisión del lunes".

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta habilidad verifico que las categorías de abajo estén vinculadas. Si falta alguna, nombro la categoría, te pido conectarla desde la pestaña de Integraciones y me detengo.

- **Warehouse / fuente de datos**  -  Obligatorio para `period=metrics-rollup`. Trae snapshots frescos de las métricas si los diarios están desactualizados.
- **Rastreador de metas** (Notion, Airtable, Google Sheets)  -  Opcional. Permite que la revisión semanal refleje el estado actual de las metas sin un refresco manual.

Esta habilidad funciona sin ninguna conexión para la revisión semanal: se apoya en tu trabajo guardado. Solo me bloqueo en `metrics-rollup` si no hay un warehouse conectado.

## Información que necesito

Primero leo tu contexto de operaciones. Por cada campo obligatorio que falte hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Prioridades activas**  -  Obligatorio. Por qué las necesito: la sección de vacíos frente a prioridades depende de ellas. Si falta, pregunto: "¿Cuáles son las 2 o 3 cosas que la empresa está empujando este trimestre?"
- **Ritmo operativo**  -  Obligatorio. Por qué lo necesito: hace que "revisión del lunes" signifique lo correcto para tu semana. Si falta, pregunto: "¿Cómo es tu semana, día de revisión, días de trabajo profundo, días de reuniones?"
- **Qué estás monitoreando**  -  Obligatorio para `period=metrics-rollup`. Por qué lo necesito: el resumen recorre cada métrica que observas. Si falta, pregunto: "¿Qué números miras con más atención? Lo mejor es conectar el dashboard o el warehouse donde viven."
- **Cadencia con inversionistas**  -  Opcional. Por qué la necesito: permite que la revisión señale plazos próximos con inversionistas o el directorio. Si no la tienes, sigo adelante con TBD y omito la sección de plazos.

## Parámetro: `period`

- `weekly`  -  la revisión del lunes del fundador. Agrega los últimos 7 días de `outputs.json` de todas las habilidades del agente, cruza prioridades activas + calendario de renovaciones, señala vacíos, muestra los próximos movimientos. Salida: `reviews/{YYYY-MM-DD}.md`.
- `metrics-rollup`  -  pulso semanal transversal de métricas. Lee cada métrica monitoreada, calcula el cambio semana contra semana, clasifica frente a la dirección declarada, señala anomalías abiertas. Alimenta la revisión `weekly`. Salida: `rollups/{YYYY-MM-DD}.md`.

## Pasos

1. Leo `config/context-ledger.json`. Lleno los vacíos con UNA pregunta priorizada por modalidad.
2. Leo `context/operations-context.md`  -  prioridades activas, ritmo operativo, contactos clave, postura frente a proveedores, líneas rojas.
3. Ramifico según `period`:

   **Si `period = metrics-rollup`:**
   - Leo `config/metrics.json` para el registro de métricas.
   - Por cada métrica, leo los últimos 14 snapshots de `metrics-daily.json`.
   - Calculo: valor de esta semana, valor de la semana pasada, delta semana contra semana, % semana contra semana, clasificación frente a la dirección declarada (mejoró / estable / empeoró), y anoto cualquier anomalía abierta en `anomalies.json`.
   - Ordeno primero por mayor movimiento (% absoluto semana contra semana), luego por prioridad (primero las métricas ligadas a prioridades activas).
   - Escribo el resumen como una tabla escaneable + comentario de 2-3 frases sobre los 3 mayores movimientos.

   **Si `period = weekly`:**
   - Opcionalmente leo el último `rollups/{YYYY-MM-DD}.md` si existe; si no, considero sugerir correr `metrics-rollup` antes de la revisión, sin bloquear.
   - Recorro `outputs.json` buscando cada entrada con `updatedAt` en los últimos 7 días. Agrupo por habilidad / dominio.
   - Leo `renewals/calendar.md`  -  señalo todo lo que renueve en los próximos 30 días.
   - Leo `bottlenecks.json` y `decisions.json` (últimos 30 días).
   - Produzco la revisión:
     - **Qué se completó**  -  por dominio (Planificación / Personal / Finanzas / Proveedores / Datos), en puntos con sus rutas.
     - **Qué se movió**  -  los 3 mayores movimientos de métricas del resumen si está disponible.
     - **Qué está estancado**  -  cosas iniciadas pero sin tocar hace 3+ semanas.
     - **Vacíos frente a prioridades**  -  cada prioridad activa → qué hicimos por ella esta semana → veredicto honesto (en curso / en riesgo / desviada).
     - **Plazos próximos**  -  renovaciones en los próximos 30 días, actualizaciones para inversionistas pendientes, reuniones de directorio.
     - **El movimiento**  -  la única cosa más útil que hacer esta semana.

4. Escribo de forma atómica (`.tmp` → renombrar) en la ruta correspondiente.
5. Agrego a `outputs.json` con `{id, type, title, summary, path, status: "ready", createdAt, updatedAt, domain: "planning" or "data"}`. Type = `"weekly-review"` o `"metrics-rollup"`.
6. Te resumo: el movimiento (semanal) o los 3 mayores movimientos (resumen de métricas).

## Salidas

- `reviews/{YYYY-MM-DD}.md` (semanal)
- `rollups/{YYYY-MM-DD}.md` (metrics-rollup)
- Agrega entradas a `outputs.json`.

## Lo que nunca hago

- Afirmar avance en una prioridad que no pueda evidenciar en `outputs.json`.
- Inventar movimiento de métricas: si faltan datos, lo digo.
- Reemplazar el registro de decisiones: si la revisión encuentra algo con forma de decisión, lo marco como candidato a `log-a-decision`; no lo registro como tal.

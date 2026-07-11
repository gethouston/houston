---
name: analizar-mis-datos
title: "Analizar mis datos"
description: "Obtén un análisis riguroso de lo que tus datos realmente te están diciendo. Elige lo que necesitas: un informe de experimento con el lift, la significancia estadística, los intervalos de confianza y una recomendación explícita de lanzar, descartar, iterar o no concluyente; un barrido de anomalías que marca las métricas que se desvían de sus líneas base móviles con causas hipotéticas; o una auditoría de calidad de datos que revisa nulos, duplicados, actualidad e integridad referencial en las tablas que te importan."
version: 1
category: Operaciones
featured: no
image: clipboard
---


# Analizar mis datos

Una sola primitiva analítica. Tres trabajos de datos: informes de experimentos, barridos de anomalías, auditorías de calidad de datos. Rigor por defecto: nunca recomiendo SHIP sin significancia, nunca declaro una anomalía sin línea base, nunca omito advertencias en los hallazgos de calidad de datos.

## Cuándo usarla

- `subject=experiment` - "analiza el test {X}" / "cómo le fue al experimento {Y}" / "informe del test A/B".
- `subject=anomaly` - "hay algo raro en los datos hoy" / "revisión de anomalías" / "barrido diario de anomalías" / "por qué se disparó {métrica}".
- `subject=data-qa` - "revisa la calidad de datos de {tabla}" / "por qué este número está mal" / "corre una auditoría de calidad en el almacén de datos".

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta habilidad verifico que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido conectarla desde la pestaña de Integraciones y me detengo.

- **Almacén de datos / fuente de datos** (Postgres, BigQuery, Snowflake, Redshift) - Requerido. SQL de solo lectura para extraer variantes, líneas base de anomalías y chequeos de calidad.
- **Plataforma de experimentos** (PostHog, Mixpanel, Amplitude) - Opcional. Se usa cuando `subject=experiment` y el test vive en una herramienta de analítica de producto. Si no hay ninguna conectada, trabajo con agregados que me pegues.

Si no hay un almacén de datos conectado, me detengo y te pido conectarlo primero.

## Información que necesito

Primero leo tu contexto de operaciones. Por cada campo requerido que falte hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Etapa de la empresa** - Requerido. Por qué lo necesito: define valores por defecto sensatos para el tamaño de muestra y el efecto mínimo detectable en los experimentos. Si falta, pregunto: "¿Cómo describirías tu etapa ahora mismo: pre-lanzamiento, primeros usuarios, en crecimiento o estable?"
- **Dónde viven los datos de tu negocio** - Requerido. Por qué lo necesito: tengo que saber a qué almacén de datos consultar. Si falta, pregunto: "¿Dónde viven los datos de tu negocio? Lo mejor es conectar tu almacén de datos desde la pestaña de Integraciones para que pueda leerlo directamente."
- **Qué estás midiendo ya** - Requerido para `subject=anomaly`. Por qué lo necesito: barro las métricas que ya sigues y marco las desviaciones. Si falta, pregunto: "¿Qué números sigues más de cerca? Puedes listarlos o, mejor aún, conectar el dashboard donde viven."
- **Estructura de las tablas y expectativas de actualidad** - Opcional para `subject=data-qa`. Por qué lo necesito: me ayuda a saber qué columnas no deberían ser nulas y qué tan desactualizada puede estar una tabla. Si no lo tienes, sigo adelante con TBD e infiero a partir de una muestra.

## Parámetro: `subject`

- `experiment` - analizar un test. Entradas: datos de las variantes (consulta al almacén de datos o texto pegado), hipótesis, métrica principal, métricas de resguardo. Salida: `analyses/experiment-{slug}-{YYYY-MM-DD}.md` con la recomendación de lanzar, descartar, iterar o no concluyente-extender.
- `anomaly` - barrer cada métrica en `config/metrics.json` con ≥7 snapshots; marcar desviaciones que superen el umbral por métrica o el predeterminado (2σ amarillo / 3σ rojo). Salida: `analyses/anomaly-sweep-{YYYY-MM-DD}.md` + upsert de `anomalies.json`.
- `data-qa` - chequeos de calidad de solo lectura sobre las tablas objetivo: nulos por columna, duplicados sobre claves naturales, actualidad (MAX(updated_at) vs la desactualización esperada), integridad referencial en los joins clave, sorpresas de cardinalidad. Salida: `data-quality-reports/{YYYY-MM-DD}/report.md`.

## Pasos

1. Leo `config/context-ledger.json`; lleno los vacíos con UNA pregunta ordenada por modalidad.
2. Leo `context/operations-context.md`: las prioridades activas y los límites innegociables anclan lo que cuenta como "relevante".
3. Bifurco según `subject`:

   **Si `subject = experiment`:**
   - Leo hipótesis, variantes, métrica principal, métricas de resguardo. Si faltan, pregunto en un solo turno (hipótesis + control + variante + métrica principal + métricas de resguardo).
   - Extraigo los datos de las variantes vía almacén de datos (SQL de solo lectura) o acepto agregados pegados.
   - Calculo: lift (variante vs control), significancia (test z para proporciones, test t para continuas), IC del 95%, MDE observado, deltas de las métricas de resguardo.
   - Doy la recomendación:
     - SHIP - la métrica principal se mueve con p < 0.05, los resguardos están limpios, el límite inferior del IC supera el MDE práctico.
     - KILL - la métrica principal está plana O los resguardos se degradan de forma relevante.
     - ITERATE - hay dirección pero aún sin significancia, resguardos limpios; especifico la siguiente variante.
     - INCONCLUSIVE-EXTEND - potencia estadística demasiado baja; calculo cuánto más debe correr.
   - Escribo el informe: cada número, la recomendación, el razonamiento.

   **Si `subject = anomaly`:**
   - Leo `config/metrics.json`; para cada métrica con ≥7 snapshots, calculo líneas base móviles de 7 y 28 días.
   - Comparo lo más reciente contra las líneas base; marco lo que supere el umbral por métrica o el predeterminado (2σ / 3σ).
   - Para cada métrica marcada, planteo de 1 a 3 causas hipotéticas a partir de: decisiones recientes en `decisions.json`, despliegues recientes en `context/operations-context.md`, experimentos recientes en `outputs.json`, patrones estacionales conocidos.
   - Hago upsert en `anomalies.json` con `{id, metric, severity, observedAt, baseline, deviation, hypotheses[], status: "open"}`.

   **Si `subject = data-qa`:**
   - Leo `config/schemas.json` para las tablas objetivo (o todo el almacén de datos si pides "todo").
   - Por tabla:
     - Nulos por columna (vs lo esperado).
     - Duplicados sobre la clave natural.
     - Actualidad: `MAX(updated_at)` vs la expectativa de desactualización.
     - Integridad referencial en los joins clave (huérfanos de FK).
     - Sorpresas de cardinalidad (deriva en el conteo de valores vs la línea base).
   - Informe fechado: aprobado / advertencia / fallido por chequeo + el SQL usado + una corrección sugerida por cada fallo.

4. Escribo de forma atómica (`.tmp` → rename) en la ruta.
5. Agrego a `outputs.json` `{id, type, title, summary, path, status, createdAt, updatedAt, domain: "data"}`. Type = `"experiment-readout"` / `"anomaly-sweep"` / `"data-qa-report"`.
6. Resumo: experimentos → recomendación + razón en una frase; anomalías → conteo + top 3 por severidad; calidad de datos → conteo de fallos + el primero a corregir.

## Salidas

- `analyses/experiment-{slug}-{YYYY-MM-DD}.md` (experiment)
- `analyses/anomaly-sweep-{YYYY-MM-DD}.md` + upsert de `anomalies.json` (anomaly)
- `data-quality-reports/{YYYY-MM-DD}/report.md` (data-qa)
- Agrega a `outputs.json`.

## Lo que nunca hago

- Recomendar SHIP sin significancia.
- Declarar una anomalía sin mostrar la línea base.
- Ejecutar DML / DDL: solo lectura, siempre.
- Esconder advertencias (tamaño de muestra, estacionalidad, datos faltantes) detrás del número titular.

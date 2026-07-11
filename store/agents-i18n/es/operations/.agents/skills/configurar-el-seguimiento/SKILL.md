---
name: configurar-el-seguimiento
title: "Configurar el seguimiento"
description: "Configura el seguimiento operativo que necesitas para no volar a ciegas. Elige lo que necesitas: una sola métrica que capturo a diario contra tu almacén de datos, o una especificación completa de dashboard con secciones, visualizaciones, cadencia y SQL de solo lectura detrás de cada gráfico. Yo redacto la especificación, tú o tu herramienta de BI la renderiza."
version: 1
category: Operaciones
featured: no
image: clipboard
---


# Configurar el seguimiento

Una sola habilidad para el seguimiento que necesitas. El parámetro `scope` elige la forma: la definición de una sola métrica con capturas diarias, o una especificación completa de dashboard (secciones + visualizaciones + cadencia + SQL por visualización). Ambas escriben únicamente SQL de solo lectura y se fundamentan en tu contexto operativo.

## Parámetro: `scope`

- `metric` - define una sola métrica, escribe el SQL de solo lectura contra tu almacén de datos, captura el valor actual en `metrics-daily.json`, agrega la definición a `config/metrics.json` y la registra con la cadencia elegida. Salida: `config/metrics.json` actualizado + `metrics-daily.json` + `queries/{metric-slug}/`.
- `dashboard` - propone 2-4 secciones, visualizaciones por sección, cadencia y el SQL de solo lectura detrás de cada visualización. Solo la especificación, tú o tu herramienta de BI la renderiza. Salida: `config/dashboards.json` (agregado o actualizado por id).

El usuario nombra el alcance en lenguaje natural ("dale seguimiento a los ingresos mensuales", "vigila los usuarios activos semanales", "especifica un dashboard de crecimiento", "quiero ver la retención con regularidad") -> inferir. Si es ambiguo -> hacer UNA pregunta nombrando ambas opciones.

## Cuándo usarla

**metric:**
- "empieza a rastrear {X}" / "agrega {métrica} al dashboard" / "vigila {métrica clave}"
- Una métrica nombrada por el usuario en `onboard-me` tiene un marcador `sqlSnippet` vacío, el usuario invoca esta habilidad para construir la definición real.

**dashboard:**
- "especifícame un dashboard para {X}"
- "quiero ver {grupo de métricas} con regularidad"
- "construye un dashboard para el equipo de {crecimiento / retención / churn / ingresos}"

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta habilidad verifico que las categorías de abajo estén vinculadas. Si falta alguna -> nombro la categoría, te pido conectarla desde la pestaña de Integraciones y me detengo.

- **Almacén / fuente de datos** (Postgres, BigQuery, Snowflake, Redshift) - Requerido para `scope=metric` (no puedo capturar una métrica sin una fuente de la cual leer). Opcional para `scope=dashboard` (me permite escribir fragmentos SQL que corren sobre tu esquema real; sin él dejo marcadores parametrizados).
- **Facturación** (Stripe) - Opcional para `scope=metric`. Me permite conectar métricas de ingresos directo desde facturación en lugar de inferirlas desde el almacén.

Para `scope=metric` me detengo si no hay un almacén conectado. Para `scope=dashboard` nunca me bloqueo, produce una especificación, no un dashboard renderizado.

## Información que necesito

Primero leo tu contexto operativo. Por cada campo requerido que falte hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo adjunto > URL > pegar) y espero.

- **Definición de la métrica** - Requerido para `scope=metric`. Por qué lo necesito: 'ingresos mensuales' podría significar según facturación, según contratos o ingresos anuales / 12, necesito saber cuál. Si falta, pregunto: "¿Qué significa exactamente esta métrica? Para ingresos: ¿cuentas suscripciones activas, ingresos reconocidos u otra cosa?"
- **Dónde vive esta métrica** - Requerido para `scope=metric`. Por qué lo necesito: necesito la fuente de verdad contra la cual escribir el SQL. Si falta, pregunto: "¿Qué sistema es la fuente de verdad de este número: tu almacén de datos, tu herramienta de facturación, tu base de datos de producto?"
- **Dirección y unidad** - Requerido para `scope=metric`. Por qué lo necesito: define la clasificación (mejoró / empeoró) y el formato. Si falta, pregunto: "¿Más alto es mejor, más bajo es mejor, o hay un objetivo? ¿Y es un conteo, un monto en dólares, un porcentaje u otra cosa?"
- **Cadencia** - Opcional para `scope=metric`. Por qué lo necesito: con qué frecuencia capturo. Si no la tienes, sigo adelante con diaria como valor por defecto.
- **Propósito del dashboard** - Requerido para `scope=dashboard`. Por qué lo necesito: un dashboard de crecimiento y uno de retención llevan secciones distintas. Si falta, pregunto: "¿Para qué es este dashboard y qué harías con él?"
- **Audiencia y cadencia** - Requerido para `scope=dashboard`. Por qué lo necesito: define el diseño y la frecuencia de actualización. Si falta, pregunto: "¿Quién lo va a mirar y con qué frecuencia: tú a diario, tu equipo cada semana, el consejo cada mes?"
- **Lo que ya estás rastreando** - Requerido para `scope=dashboard`. Por qué lo necesito: prefiero conectar los dashboards a métricas que ya capturas en lugar de inventar nuevas. Si falta, pregunto: "¿Qué números ya miras con más atención?"
- **Prioridades activas** - Requerido para `scope=dashboard`. Por qué lo necesito: define qué métricas van en el mosaico principal. Si falta, pregunto: "¿Cuáles son las 2 o 3 cosas que la empresa está empujando este trimestre?"

## Pasos

### Pasos compartidos (ambos alcances)

1. **Leer `context/operations-context.md`.** Si falta o está vacío, detenerse. Pedirle al usuario que ejecute `set-up-my-ops-info` primero.

### Bifurcar según `scope`:

#### `metric`

2. **Aclarar si hace falta.** Si la redacción es ambigua ("ingresos mensuales" podría ser según facturación, según contratos o ingresos anuales / 12), hacer UNA pregunta precisa. Si no, continuar.

3. **Identificar la fuente.** Leer `config/data-sources.json`. Si el usuario no nombró la fuente, elegir la más probable a partir de `config/business-context.md` (el almacén para métricas centrales del negocio, la base de datos de producto para engagement).

4. **Revisar métricas existentes.** Leer `config/metrics.json`. Si existe una métrica con el mismo slug o un nombre abrumadoramente parecido, avisar al usuario y ofrecer actualizarla en lugar de duplicarla.

5. **Confirmar el esquema.** Leer `config/schemas.json` para las tablas referenciadas. Si faltan entradas, introspectar bajo demanda (mismo patrón que el paso 3 de `ask-a-data-question`).

6. **Redactar el SQL.** Devolver un `SELECT` que resuelva a un solo valor numérico para una fecha dada. Usar el marcador `{{date}}`, el programador lo sustituye en tiempo de ejecución. Ejemplo (dialecto de BigQuery):

   ```sql
   SELECT SUM(amount) AS value
   FROM `project.dataset.subscriptions`
   WHERE state = 'active'
     AND start_date <= DATE('{{date}}')
     AND (end_date IS NULL OR end_date > DATE('{{date}}'))
   ```

7. **Autoverificar solo lectura.** Escanear en busca de palabras clave DML/DDL prohibidas. Rechazar si aparece alguna.

8. **Capturar cadencia, dirección, unidad.** Hacer UNA pregunta si no se especificó:
   - `cadence: "daily"` por defecto.
   - `direction` - más-alto-es-mejor / más-bajo-es-mejor / el-objetivo-es-lo-mejor.
   - `unit` - conteo / moneda / porcentaje / razón / duración / otro.
   NO codificar umbrales en duro, dejar `thresholds` vacío; si el usuario quiere una sigma personalizada para detección de anomalías, se sobreescribe después.

9. **Agregar la definición de la métrica** a `config/metrics.json`. También registrar la consulta reutilizable bajo `queries/{metric-slug}/` para auditoría (`ask-a-data-question` la reutiliza). Actualizar `queries.json`.

10. **Capturar ahora.** Ejecutar el SQL con `{{date}}` = hoy (zona horaria del almacén, UTC por defecto). Agregar a `metrics-daily.json` con `{ id, metricId, date, value, changeVsPrev, changeVs7dAvg, changeVs28dAvg, createdAt }`. En la primera captura los campos de cambio quedan en null.

11. **Rellenar histórico si se pide.** Si el usuario dijo "rellena los últimos N días", iterar el SQL sobre las fechas y agregar cada captura. Advertir primero sobre el costo (comparar el total estimado de bytes escaneados contra el tope).

12. **Agregar a `outputs.json`** con `type: "metric-definition"`, estado "ready".

13. **Reportar.** Valor actual + cadencia + dónde aparece en el dashboard + nota de que `analyze-my-data subject=anomaly` marca desviaciones cuando se acumulan >= 7 capturas.

#### `dashboard`

2. **Aclarar audiencia + cadencia.** Si no está claro: "¿Quién lo va a mirar y con qué frecuencia? (operador a diario / ejecutivo cada semana / equipo de crecimiento a diario / bajo demanda)." Valores por defecto: `audience: "operator"`, `cadence: "daily"`.

3. **Proponer la lista de métricas.** A partir de `config/metrics.json`, elegir las métricas que encajan con el propósito. Si el usuario nombró métricas sin seguimiento, incluirlas como marcadores con `sqlSnippet: ""` y recomendar correr esta habilidad con `scope=metric` primero.

4. **Diseñar las secciones.** Máximo 2-4 secciones. Forma canónica:
   - **Métricas clave de primera línea** - 3-5 mosaicos de un solo número para lo imprescindible.
   - **Tendencias** - series de tiempo de 30/60/90 días para las métricas clave.
   - **Desglose** - vista segmentada (segmento / área de producto / cohorte / canal).
   - **Anomalías / alertas** (opcional) - los últimos valores atípicos marcados en `anomalies.json`.

5. **Detalles por visualización.** Cada visualización especifica:
   - `title`
   - `chart`: `line` | `bar` | `number` | `sparkline` | `funnel` | `table`
   - `metricId` si corresponde a una métrica rastreada
   - `sqlSnippet` - SQL parametrizado de solo lectura usando los marcadores `{{date}}` / `{{startDate}}` / `{{endDate}}`
   - `notes` - advertencias de interpretación o problemas de calidad de datos conocidos

6. **Autoverificar solo lectura.** Cada `sqlSnippet` debe ser solo SELECT. Escanear en busca de palabras clave DML/DDL prohibidas, rechazar si aparece alguna.

7. **Escribir la especificación** en `config/dashboards.json` (atómico). Agregar o actualizar por `id`:

   ```json
   {
     "id": "growth-daily",
     "name": "Growth Daily",
     "audience": "growth team",
     "cadence": "daily",
     "sections": [
       {
         "title": "Top-line",
         "visualizations": [
           {
             "metricId": "signups",
             "title": "Signups (today)",
             "chart": "number",
             "sqlSnippet": "SELECT COUNT(*) AS value FROM events WHERE event='signup' AND DATE(ts) = DATE('{{date}}')",
             "notes": "Excludes bots flagged in users.is_bot"
           }
         ]
       }
     ],
     "createdAt": "...",
     "updatedAt": "..."
   }
   ```

8. **Agregar a `outputs.json`** con `type: "dashboard-spec"`, estado "ready".

9. **Reportar.** Presentar la especificación en el chat, un resumen de una línea por sección. Siguiente paso: "Pega esta especificación en tu herramienta de BI o pídeme traducir una visualización específica para {tu herramienta}."

## Lo que nunca hago

- **Codificar el umbral sigma en duro.** Las anulaciones por métrica viven en `config/metrics.json` -> `thresholds`. El valor por defecto de 2 sigmas vive en el valor documentado de `analyze-my-data subject=anomaly`, no incrustado en los registros de métricas.
- **Ejecutar DML/DDL.** La regla de solo lectura aplica a cada fragmento SQL, cada consulta de métrica, cada consulta de visualización. El escaneo de palabras clave prohibidas rechaza cualquier otra cosa.
- **Capturar sin un valor fresco.** Si la consulta devuelve NULL, registrar la captura con una nota `possibleCauses` en el siguiente barrido de anomalías y avisar al usuario.
- **Renderizar un dashboard HTML / renderizado.** Solo la especificación, la vista del agente de Houston es aparte y cubre la vista del operador. Tu herramienta de BI renderiza esta especificación.
- **Asumir una herramienta de BI específica.** La especificación es agnóstica de herramienta, con marcadores de parámetros.

## Salidas

- `scope=metric`:
  - `config/metrics.json` actualizado
  - Filas agregadas a `metrics-daily.json`
  - Nuevos `queries/{metric-slug}/query.sql`, `notes.md`
  - `queries.json` actualizado
  - Posiblemente `config/schemas.json` actualizado
  - Agrega a `outputs.json` con `type: "metric-definition"`.
- `scope=dashboard`:
  - `config/dashboards.json` actualizado
  - Agrega a `outputs.json` con `type: "dashboard-spec"`.

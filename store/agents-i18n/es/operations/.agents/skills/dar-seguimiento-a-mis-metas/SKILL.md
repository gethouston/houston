---
name: dar-seguimiento-a-mis-metas
title: "Dar seguimiento a mis metas"
description: "Mira dónde estás realmente parado con tus metas sin tener que armarlo a mano. Actualizo el valor actual de cada métrica de meta desde tu rastreador de metas conectado, la clasifico como en curso, en riesgo o fuera de curso frente a la curva de cumplimiento esperada, y muestro las causas raíz probables a partir de decisiones y prioridades vinculadas. Ejecútalo cada semana o cuando alguien te pregunte cómo va el trimestre."
version: 1
category: Operaciones
featured: no
image: clipboard
integrations: [googlesheets, notion, airtable, linear, linkedin]
---


# Dar seguimiento a mis metas

## Cuándo usarla

- El usuario pregunta por el estado de las metas, quiere una actualización o pregunta "qué está fuera de curso".
- Cadencia semanal / trimestral, si la última captura en
  `goal-history.json` tiene más de 10 días.
- Inicio de un nuevo trimestre, para restablecer la línea base.
- Invocada implícitamente por `prep-an-investor-package`
  cuando la última captura está desactualizada.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta habilidad verifico que las categorías de abajo estén vinculadas. Si falta alguna, nombro la categoría, te pido conectarla desde la pestaña de Integraciones y me detengo.

- **Rastreador de metas** (Notion, Airtable, Google Sheets, Linear) - Requerido si tus metas viven en alguno de estos. Extrae los últimos valores actuales por métrica de meta.
- **Almacén / fuente de datos** - Opcional. Si una métrica de meta corresponde a una métrica rastreada, leo el último valor desde ahí para mantener la consistencia.

Si tus metas viven en una herramienta conectable pero no hay nada conectado, me detengo y te pido conectar tu rastreador de metas primero.

## Información que necesito

Primero leo tu contexto operativo. Por cada campo requerido que falte hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo adjunto > URL > pegar) y espero.

- **Tus metas** - Requerido. Por qué lo necesito: actualizo metas existentes, no las invento. Si falta, pregunto: "¿Dónde viven tus metas? Lo mejor es conectar la herramienta donde las rastreas. Si no, adjunta el documento o pégalas y capturo la estructura."
- **Prioridades activas** - Requerido. Por qué lo necesito: alimenta la atribución de 'causa raíz probable' para las métricas de meta fuera de curso. Si falta, pregunto: "¿Cuáles son las 2 o 3 cosas que la empresa está empujando este trimestre?"
- **Responsables de las métricas de meta** - Opcional. Por qué lo necesito: cuando no puedo leer un número desde una fuente conectada, te digo a qué responsable escribirle. Si no lo tienes, sigo adelante con TBD y pregunto antes de inventar.
- **Curva de cumplimiento** - Opcional. Por qué lo necesito: las métricas de meta cargadas al inicio y las cargadas al final se clasifican distinto a mitad de trimestre. Si no la tienes, sigo adelante con TBD usando una curva lineal por defecto.

## Pasos

1. **Leer `context/operations-context.md`.** Si
   falta o está vacío, detenerse y pedirte que ejecutes
   `set-up-my-ops-info` primero. Las prioridades activas
   alimentan la atribución de "causa raíz probable" para las métricas de meta fuera de curso.

2. **Leer `config/goals.json`.** Si falta o está vacío, hacer UNA
   pregunta dirigida: *"Aún no hay metas, lo mejor: si el rastreador de metas
   está conectado vía Composio, señálamelo y extraigo el estado actual.
   Si no, pega o adjunta el documento de metas.
   Si todavía no tienes metas, está bien, dilo y te ayudo
   a redactar un conjunto inicial."* Escribir y continuar.

3. **Por cada objetivo, actualizar el valor actual de cada métrica de meta.** En
   orden de preferencia:
   - **Rastreador de metas conectado vía Composio** - `composio search goal`
     (o la categoría que el usuario nombró durante el onboarding). Extraer
     el último `current` por métrica de meta.
   - **Traspaso desde el seguimiento de métricas** - si la métrica de meta corresponde a una métrica rastreada
     en este agente, citar el slug de la consulta y leer
     el último valor desde `metrics-daily.json`. Mantiene
     los números consistentes entre agentes.
   - **Preguntar al responsable** - si ninguna opción está disponible, decirte
     a qué responsables escribirles y detenerse antes de inventar números.

4. **Capturar en `goal-history.json`.** Agregar un registro por
   objetivo (o por métrica de meta si el responsable actualiza a ese nivel) con
   `{ objectiveId, date, goalMetrics: [{ id, value, state }], state,
   createdAt }`. La fecha es hoy (YYYY-MM-DD).

5. **Clasificar cada métrica de meta contra su objetivo.** Tomar la curva
   de cumplimiento esperada del registro de la métrica de meta (`linear` por defecto salvo que
   el usuario haya declarado carga al inicio o al final durante el onboarding o
   en una actualización previa). Para el punto de hoy en el período:
   - `on-track` - `current / target` ≥ `expected-for-this-point`.
   - `at-risk` - dentro de 20 puntos porcentuales de lo esperado pero por debajo.
   - `off-track` - más de 20 puntos porcentuales por debajo de lo esperado.

   El umbral de 20 pp = valor por defecto documentado; el usuario puede anularlo
   por métrica de meta en `config/goals.json`.

6. **Consolidar los estados de las métricas de meta en el estado del objetivo.** Si alguna métrica de meta está
   `off-track`, el objetivo queda `off-track`. Si alguna está `at-risk` y
   ninguna `off-track`, el objetivo queda `at-risk`. Si no, `on-track`.
   Actualizar `config/goals.json` con el nuevo estado + valores `current`
   frescos.

7. **Adjuntar códigos de razón desde las decisiones vinculadas.** Por cada métrica de meta
   en riesgo / fuera de curso:
   - Escanear `decisions.json` en busca de decisiones donde
     `linkedInitiativeSlugs` incluya el mismo slug que la métrica de meta referencia
     (si hay), una decisión pendiente reciente sobre una iniciativa vinculada =
     causa probable.
   - Revisar las prioridades del contexto operativo, si la métrica de meta está atada a
     una prioridad inactiva, hacerlo visible.
   - Registrar la razón en el campo `reason` de la métrica de meta en
     `config/goals.json`.

8. **Reportar en el chat.**

   ```
   Goal refresh  -  {YYYY-MM-DD}

   On-track: {N}  |  At-risk: {N}  |  Off-track: {N}

   Off-track:
   - {objective}  -  {goal metric}: {current}/{target} {unit} ({% attained}).
     Likely cause: {linked decision slug or priority note}.

   At-risk:
   - ...

   (Full history in `goal-history.json`.)
   ```

9. **Sugerencia de traspaso.** Si algo pasó a fuera de curso en este ciclo,
   ofrecer: "¿Quieres que ejecute `find-my-bottlenecks` para ver si el patrón
   cruza varias metas? ¿O me pasas la métrica de meta fuera de curso para recordarle al responsable?"

10. **Agregar a `outputs.json`** con `type: "goal-snapshot"`,
    estado "ready".

## Salidas

- `goal-history.json` con registros agregados
- `config/goals.json` actualizado (valores actuales frescos + estado por
  objetivo + razón por métrica de meta para en riesgo / fuera de curso)
- Agrega a `outputs.json` con `type: "goal-snapshot"`.

## Lo que nunca hago

- **Inventar el valor de una métrica de meta** - si no hay fuente disponible, me detengo y
  te digo a qué responsables escribirles.
- **Codificar el umbral de riesgo en duro** - 20 pp = valor por defecto
  documentado; las anulaciones por métrica de meta viven en `config/goals.json`.
- **Modificar definiciones de metas en silencio** - si el usuario agrega un nuevo
  objetivo por chat, confirmo la forma antes de escribir.

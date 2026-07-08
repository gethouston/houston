---
name: encontrar-mis-cuellos-de-botella
title: "Encontrar mis cuellos de botella"
description: "Descubre qué está frenando realmente a tu empresa para que puedas destrabarlo. Agrupo evidencia de tus revisiones recientes, decisiones pendientes, anomalías abiertas y metas fuera de curso en cuellos de botella con nombre, cada uno con una hipótesis y un responsable propuesto para destrabarlo. Úsalo cuando algo se sienta estancado y no puedas identificar por qué."
version: 1
category: Operaciones
featured: no
image: clipboard
---


# Encontrar mis cuellos de botella

## Cuándo usarla

- El usuario pregunta "qué está estancado", "qué está bloqueando el progreso", "por qué no avanzamos con X".
- La revisión semanal más reciente (de este agente) repite un riesgo o una petición de la anterior.
- Una meta pasó a fuera de curso y la iniciativa vinculada también se retrasó.

## Conexiones que necesito

Ejecuto todo el trabajo externo a través de Composio. Antes de ejecutar esta skill verifico que las categorías de abajo estén vinculadas. Si falta alguna → nombro la categoría, te pido conectarla desde la pestaña de Integraciones y me detengo.

- **Gestor de proyectos** (Linear, Notion, Asana) - Opcional. Revela iniciativas estancadas y bloqueos a nivel de ticket; funciono sin él, pero con menos señal.
- **Chat de equipo** (Slack) - Opcional. Me permite detectar peticiones que se repiten entre hilos.

Esta skill funciona sin ninguna conexión; se apoya sobre todo en lo que ya está en tu trabajo guardado. Aquí nunca me bloqueo.

## Información que necesito

Primero leo tu contexto de operaciones. Por cada campo requerido que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > pegar texto) y espero.

- **Prioridades activas** - Requerido. Por qué las necesito: un cuello de botella solo importa si bloquea algo que estás impulsando. Si faltan, pregunto: "¿Cuáles son las 2 o 3 cosas que la empresa está impulsando este trimestre?"
- **Contactos clave** - Requerido. Por qué los necesito: propongo responsables para destrabar; sin contactos estaría adivinando nombres. Si faltan, pregunto: "¿Quién destraba qué: ingeniería, ventas, operaciones? Nombres y cómo contactarlos."
- **Decisiones, revisiones o instantáneas de metas recientes** - Opcional. Por qué las necesito: más trabajo guardado significa evidencia más sólida. Si no las tienes, sigo adelante con TBD y me apoyo en lo que haya.

## Pasos

1. **Leo `context/operations-context.md`.** Si falta o está vacío, me detengo y le pido al usuario ejecutar primero `set-up-my-ops-info`. Las prioridades y los contactos clave anclan la lógica del "responsable propuesto para destrabar".

2. **Reúno evidencia de las últimas 4 semanas** (trato cada fuente como "si existe, la uso; si falta, continúo"):
   - `reviews/` - los últimos 4 archivos de revisión semanal. Busco riesgos o peticiones que se repiten.
   - `triage/` - los últimos 4 archivos de triage de bandeja de entrada. Hilos "can-wait" recurrentes de la misma persona sugieren un cuello de botella de delegación.
   - `decisions.json` - cualquier decisión con `status: "pending"` de más de 14 días → cuello de botella de latencia de decisión.
   - `goal-history.json` - cualquier métrica de meta en `off-track` durante dos o más instantáneas consecutivas → candidato a cuello de botella ligado a la iniciativa vinculada.
   - el `anomalies.json` de este agente - anomalías abiertas que se repiten sugieren un cuello de botella de datos o de proceso.

3. **Agrupo los temas recurrentes.** Agrupo la evidencia por responsable compartido, dependencia entre equipos compartida o meta compartida. Cuello de botella = grupo, no incidente individual.

4. **Para cada grupo, formulo una hipótesis** (1-2 oraciones, nunca planteada como certeza):
   - "La contratación en ingeniería está embotellada en el calendario de entrevistas del fundador; 3 iniciativas esperan al mismo revisor."
   - "Los cambios de precios están bloqueados por una decisión pendiente de la semana del {date}; 2 lanzamientos en fila detrás de ella."
   - "Las consultas de datos entre agentes duplican trabajo; tanto el paquete para el board como la actualización a inversionistas piden la misma consulta de retención."

5. **Propongo un responsable para destrabar.** Leo la sección de liderazgo / contactos clave del contexto operativo. Para cuellos de botella entre equipos, el responsable = quien posee el recurso que bloquea (p. ej. el CTO para una restricción del calendario de ingeniería), no el ejecutivo aguas abajo. Para un fundador solo, el responsable = el fundador; el destrabe propuesto suele ser "reservar tiempo para {X}" o "delegar {Y}".

6. **Cuantifico el impacto.** Listo `impactOnGoalIds` (objetivos bloqueados) e `impactOnInitiativeSlugs` (iniciativas estancadas). Mantengo las citas precisas; las cadenas de evidencia referencian rutas reales (archivos de revisión, slugs de decisión, ids de anomalía).

7. **Descarto duplicados contra los cuellos de botella abiertos.** Leo `bottlenecks.json`. Si el grupo coincide con una fila abierta existente (mismo responsable propuesto + conjunto de impacto superpuesto), actualizo en el lugar (agrego evidencia nueva, refino la hipótesis, actualizo `updatedAt`). NO creo duplicados.

8. **Enrutamiento de asuntos sensibles.** Si la hipótesis nombra a una persona específica como cuello de botella (desempeño / capacidad), NO dejo ese lenguaje en `bottlenecks.json`. Generalizo a lenguaje de rol y proceso ("capacidad de entrevistas de ingeniería") en la fila del índice. Los detalles se los señalo al CEO solo en el chat.

9. **Escribo los cuellos de botella nuevos / actualizados** en `bottlenecks.json` (atómico). Cada fila: `{ slug, title, hypothesis, proposedOwner, impactOnGoalIds, impactOnInitiativeSlugs, status: "open", evidence, createdAt, updatedAt }`.

10. **Agrego a `outputs.json`** con `type: "bottleneck"` y estado "ready" por cada fila nueva.

11. **Entrego en el chat.**

    ```
    {N} cuello(s) de botella identificado(s).

    1. **{title}** - responsable propuesto: {owner}.
       Hipótesis: {hypothesis}
       Bloquea: {N} meta(s), {M} iniciativa(s).
       Evidencia: {citations}

    2. ...

    ¿Quieres que redacte un recordatorio para {proposed owner} sobre el #1?
    (Eso se lo pasaría a la skill `draft-a-message`.)
    ```

## Resultados

- `bottlenecks.json` con filas agregadas / actualizadas
- Agrega a `outputs.json` con `type: "bottleneck"` por cada fila nueva.

## Lo que nunca hago

- **Nombrar a una persona como cuello de botella** en el JSON indexado; generalizo a rol/proceso y señalo los detalles en privado.
- **Plantear una hipótesis como certeza**; solo "probable" / "el patrón sugiere".
- **Redactar aquí el mensaje de recordatorio**; se lo paso a `draft-a-message` (borradores en la bandeja ajustados a tu tono).

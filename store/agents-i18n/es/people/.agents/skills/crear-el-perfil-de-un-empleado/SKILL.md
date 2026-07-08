---
name: crear-el-perfil-de-un-empleado
title: Crear el perfil de un empleado
description: "Reúno todo lo que sé sobre un empleado en una sola página: perfil de Recursos Humanos, plan de onboarding, seguimientos recientes e historial del proceso de entrevistas. Útil antes de una reunión 1:1, una conversación de compensación o una reunión difícil."
version: 1
category: Personal
featured: no
image: busts-in-silhouette
integrations: [notion, slack, loops]
---


# Crear el perfil de un empleado

## Cuándo usarla

- Explícito: "cuéntame sobre {empleado}", "trae todo sobre {empleado}", "prepárame para mi 1:1 con {empleado}", "dossier de {empleado}".
- Implícito: se activa antes de un ciclo de evaluación, una conversación sensible (plan de mejora de desempeño, promoción, cambio de compensación), o una entrevista de salida.
- Frecuencia: bajo demanda, por empleado.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta habilidad reviso que las categorías de abajo estén conectadas. Si falta alguna, la nombro, te pido que la conectes desde la pestaña de Integraciones y me detengo.

- **Plataforma de RR.HH. (Gusto, Deel, Rippling, Justworks)**: para leer rol, nivel, antigüedad, manager, compensación, autorización de trabajo. Obligatorio.
- **Chat (Slack)**: para traer contexto de hilos recientes si es relevante. Opcional.
- **Documentos (Notion)**: para traer notas de evaluación o documentos de 1:1 si los llevas ahí. Opcional.
- **Bandeja de entrada (Loops)**: para traer comunicaciones recientes si es útil. Opcional.

Si tu plataforma de RR.HH. no está conectada, me detengo y te pido que conectes Gusto, Deel, Rippling o Justworks desde la pestaña de Integraciones.

## Información que necesito

Primero leo tu contexto de personal. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Identidad del empleado**: Obligatorio. Por qué lo necesito: no voy a armar un dossier de alguien que no puedo identificar con precisión. Si falta, pregunto: "¿De qué empleado se trata? Nombre completo y equipo si lo tienes."
- **Autorización para ver campos confidenciales**: Obligatorio cuando se piden datos de compensación o visa. Por qué lo necesito: nunca filtro la compensación o el estatus de un empleado a otra persona sin esto. Si falta, pregunto: "¿Este dossier debería incluir compensación y detalles de autorización de trabajo, o solo rol y antigüedad?"
- **Fuente del roster**: Obligatorio cuando la plataforma de RR.HH. no está conectada. Por qué lo necesito: necesito algún lugar de donde leer los datos básicos. Si falta, pregunto: "Conecta tu plataforma de RR.HH. para que pueda traer esto directamente, o pega el registro del empleado."

## Pasos

1. **Leer el documento de contexto de personal.** Leo `context/people-context.md` para niveles, bandas salariales y reglas de confidencialidad sobre el contenido del dossier. Si falta o está vacío, le digo al usuario: "Primero necesito tu contexto de personal, corre la habilidad set-up-my-people-info." Me detengo.
2. **Leer la configuración.** `config/context-ledger.json`. Si la plataforma de RR.HH. no está conectada y no hay un enlace de roster guardado, hago UNA pregunta puntual con sugerencia de modalidad: "Conecta tu plataforma de RR.HH. (Gusto, Deel, Rippling o Justworks) en la pestaña de Integraciones, o pega el registro del empleado." Guardo la respuesta y continúo.
3. **Confirmar autorización.** Confirmo que quien solicita el dossier está autorizado a ver datos confidenciales de este empleado. Nunca revelo los datos confidenciales de un empleado (compensación, desempeño, salud, inmigración) a otro sin autorización explícita.
4. **Descubrir la herramienta de la plataforma de RR.HH.**: corro `composio search hris` para encontrar el slug de perfil de solo lectura. Traigo: rol, nivel, antigüedad, manager, ubicación, compensación (si está autorizado), estatus de autorización de trabajo / visa (si está autorizado), fecha de inicio.
5. **Búsquedas en fuentes locales (solo lectura).**
   - `onboarding-plans/{employee-slug}.md`: si este agente hizo su onboarding. Reviso los aciertos y fallas de los días 30/60/90.
   - `checkins/`: reviso los seguimientos más recientes que mencionen a este empleado.
   - `retention-scores/`: el puntaje más reciente para este empleado.
   - `interview-loops/{employee-slug}.md`: si fue candidato antes, tomo las señales del debrief del panel.
   - Si algún directorio de agente hermano falta (instalación independiente), lo salteo en silencio y anoto "N/A: agente hermano no instalado" en el dossier.
6. **Armar el dossier** con cuatro secciones:
   - **Perfil**: nombre, rol, nivel, antigüedad, manager, ubicación, estatus de autorización de trabajo (si está autorizado).
   - **Historia**: recorrido de contratación (reclutador → oferta → inicio), hitos del onboarding, cambios de nivel, cambios de compensación (si está autorizado).
   - **Señales recientes**: temas de los 1:1 de los últimos N seguimientos, puntaje de retención y su tendencia, aprobaciones recientes gestionadas por este agente.
   - **Próximos hitos**: próxima fecha de evaluación, vencimiento de visa (si aplica), cliff de equity (si aplica), próximo hito del plan de onboarding.
7. **Escribir** el dossier de forma atómica en `dossiers/{employee-slug}.md` (`*.tmp` → renombrar). Lo mantengo en una sola página fácil de escanear.
8. **Agregar a `outputs.json`**: leo el arreglo existente, agrego `{ id, type: "dossier", title, summary, path, status: "draft", createdAt, updatedAt }`. Escribo de forma atómica.
9. **Resumir al usuario**: un párrafo con la señal principal (antigüedad, puntaje de retención y próximo hito) y la ruta al documento.

## Nunca

- Nunca modifico registros de la plataforma de RR.HH. o de nómina. Solo lectura.
- Nunca invento antigüedad, compensación ni datos de desempeño. Si falta la fuente, marco DESCONOCIDO.
- Nunca filtro datos confidenciales de un empleado a otro sin autorización explícita.

## Resultados

- `dossiers/{employee-slug}.md`.
- Se agrega a `outputs.json` con tipo `dossier`.

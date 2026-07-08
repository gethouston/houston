---
name: coordinar-un-proceso-de-entrevistas
title: "Coordinar un proceso de entrevistas"
description: "Programo el proceso de entrevistas de un candidato: encuentro horarios que funcionen para todo el panel, redacto un resumen para cada entrevistador y te entrego el cronograma para que lo confirmes. Nunca envío las invitaciones, eso lo haces tú."
version: 1
category: Personal
featured: no
image: busts-in-silhouette
integrations: [googlecalendar, outlook, loops]
---


# Coordinar un Proceso de Entrevistas

## Cuándo usarla

- Explícito: "programa el proceso de {candidate}", "coordina el
  panel para {candidate}", "organiza las entrevistas de
  {candidate}", "agenda el proceso".
- Requisito previo: el registro del candidato existe y pasó la
  preselección.
- Una invocación por proceso de entrevistas de candidato.

## Conexiones que necesito

Realizo el trabajo externo a través de Composio. Antes de correr esta
habilidad, verifico que las categorías de abajo estén conectadas. Si
falta alguna, nombro la categoría, te pido que la conectes desde la
pestaña de Integraciones, y me detengo.

- **Calendario (Google Calendar, Outlook)**: leer disponibilidad y
  redactar invitaciones. Obligatoria.
- **Bandeja de entrada (Gmail, Outlook, Loops)**: redactar el
  contacto con el candidato con el horario propuesto. Opcional.

Si tu calendario no está conectado, me detengo y te pido que lo
conectes desde la pestaña de Integraciones.

## Información que necesito

Primero leo tu contexto de personal. Por cada campo obligatorio que
falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app
conectada > archivo > URL > texto pegado) y espero.

- **Registro del candidato**: Obligatorio. Por qué lo necesito: no programo un proceso para un candidato que nunca he visto. Si falta, pregunto: "Primero haz una evaluación de este candidato para que sepa que ya pasó el primer filtro."
- **Panel**: Obligatorio. Por qué lo necesito: necesito nombres y correos para revisar disponibilidad. Si falta, pregunto: "¿Quién está en el panel? Comparte nombres o correos."
- **Ventana objetivo**: Obligatorio. Por qué la necesito: no puedo buscar disponibilidad sin ella. Si falta, pregunto: "¿En qué ventana estamos pensando, por ejemplo, martes a jueves en la tarde de la próxima semana?"
- **Duración por entrevista**: Obligatorio. Por qué la necesito: define los horarios que busco. Si falta, pregunto: "¿Cuánto dura cada entrevista, 30, 45 o 60 minutos?"
- **Zona horaria**: Obligatoria cuando el panel abarca varias regiones. Por qué la necesito: evita sorpresas a las 6 de la mañana. Si falta, pregunto: "¿Qué zona horaria debo usar como referencia para el proceso?"

## Pasos

1. **Leer el documento de contexto de personal** en
   `context/people-context.md`. Si falta o está vacío, le digo al
   usuario: "Primero necesito tu contexto de personal, corre la
   habilidad configurar-mi-informacion-de-personal." Me detengo.
2. **Leer el registro del candidato** en
   `candidates/{candidate-slug}.md`. Si falta, le digo al usuario
   que corra primero `screen-resume` o `score-candidate`. Me
   detengo.
3. **Preguntar por el panel y la ventana** si no se dieron: UNA
   pregunta: "¿Quién está en el panel (correos o nombres) y cuál es
   la ventana objetivo (por ejemplo, 'martes a jueves en la
   tarde')? Además, ¿cuánto dura cada entrevista (30, 45 o 60
   minutos)?"
4. **Descubrir la herramienta de calendario vía Composio.** Corro
   `composio search calendar` para el slug de calendario (Google
   Calendar / Outlook). Si no hay calendario conectado, le digo al
   usuario qué categoría conectar desde Integraciones. Me detengo.
5. **Revisar disponibilidad.** Ejecuto el slug de la herramienta
   para obtener la disponibilidad de cada panelista y del candidato
   (si comparte su disponibilidad). Encuentro horarios sin
   conflictos dentro de la ventana objetivo que se ajusten a la
   duración. Señalo conflictos de forma explícita.
6. **Proponer el cronograma.** Organizo el proceso como un bloque de
   entrevistas seguidas o espaciadas, una por panelista, cada una
   con inicio, fin y zona horaria propuestos. Si el candidato
   necesita descansos, los agrego.
7. **Redactar invitaciones (nunca enviarlas).** Por cada horario,
   redacto el texto de la invitación: título, asistentes, duración,
   marcador de lugar o enlace de video, descripción (1 a 2 frases
   que conecten con el puesto y el enfoque del panelista). Guardo
   los borradores en línea, sin ninguna mutación de `send` /
   `create_event` sin la confirmación explícita del fundador.
8. **Correr `preparar-a-un-entrevistador` por cada panelista.** La
   llamo una vez por entrevistador para que cada resumen se agregue
   a `interview-loops/{candidate-slug}.md`.
9. **Escribir el bloque del cronograma.** Agrego una sección con
   fecha `## Proceso programado - {YYYY-MM-DD}` a
   `interview-loops/{candidate-slug}.md` con la tabla de horario
   propuesto, las invitaciones redactadas y los conflictos
   señalados. Escritura atómica (`*.tmp` → renombrar).
10. **Agregar a `outputs.json`**: `{ id, type: "loop-scheduled",
    title, summary, path: "interview-loops/{candidate-slug}.md",
    status: "draft", createdAt, updatedAt }`, escritura atómica.
11. **Resumir para el usuario**: un párrafo con el cronograma
    propuesto, los conflictos señalados, el recordatorio de que las
    invitaciones son borradores, y la ruta al archivo del proceso.
    Cierro con: "Responde 'enviar invitaciones' después de revisar
    y ejecuto la mutación en el calendario."

## Nunca inventar

- Nunca enviar una invitación de calendario sin la aprobación
  explícita del fundador. Solo borradores.
- Nunca inventar la disponibilidad de un panelista, si la
  disponibilidad no se puede leer (calendario privado, sin
  conexión), lo señalo y pido al usuario que confirme
  manualmente.
- Nunca inferir la zona horaria; pregunto si no está clara.

## Salidas

- `interview-loops/{candidate-slug}.md`: cronograma e invitaciones
  agregados. Los resúmenes por entrevistador se agregan vía
  `preparar-a-un-entrevistador`.
- Se agrega a `outputs.json` con tipo `loop-scheduled`.

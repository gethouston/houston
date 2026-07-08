---
name: preparar-a-un-entrevistador
title: "Preparar a un entrevistador"
description: "Obtén un resumen de una página para prepararte antes de entrar a la entrevista, ya seas tú o alguien del panel: antecedentes del candidato, las preguntas que vale la pena hacer, las señales de alerta de la rúbrica y la hoja de puntaje. Se puede leer en dos minutos."
version: 1
category: Personal
featured: no
image: busts-in-silhouette
integrations: [notion, linkedin, loops]
---


# Preparar a un Entrevistador

## Cuándo usarla

- Explícito: "prepárame para entrevistar a {candidate}", "qué le
  pregunto a {candidate}", "resumen de entrevista para {candidate}",
  "prepárame para el proceso de {candidate}".
- Implícito: llamada como dependencia por
  `coordinar-un-proceso-de-entrevistas`, cada panelista necesita un
  resumen a la medida.
- Una invocación equivale a un resumen para un entrevistador. ¿Todo
  el panel? Se llama una vez por entrevistador vía
  `coordinar-un-proceso-de-entrevistas`.

## Conexiones que necesito

Realizo el trabajo externo a través de Composio. Antes de correr esta
habilidad, verifico que las categorías de abajo estén conectadas. Si
falta alguna, nombro la categoría, te pido que la conectes desde la
pestaña de Integraciones, y me detengo.

- **Documentos (Notion, Google Docs)**: leer rúbricas de
  entrevistas previas o compartir el resumen si las guardas en un
  espacio de trabajo compartido. Opcional.
- **Extracción web (LinkedIn)**: actualizar datos de antecedentes
  desde un perfil público si el registro del candidato está escaso.
  Opcional.
- **Bandeja de entrada (Loops o Gmail)**: obtener contexto previo de
  hilos con el candidato para el resumen del entrevistador.
  Opcional.

Esta habilidad lee sobre todo archivos locales, así que las
conexiones faltantes no me detienen, simplemente trabajo con lo que
ya está en el registro del candidato.

## Información que necesito

Primero leo tu contexto de personal. Por cada campo obligatorio que
falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app
conectada > archivo > URL > texto pegado) y espero.

- **Registro del candidato**: Obligatorio. Por qué lo necesito: cada afirmación del resumen debe rastrearse hasta él. Si falta, pregunto: "Primero haz una evaluación de este candidato soltando el currículum o compartiendo la URL de LinkedIn, para que tenga algo de dónde partir."
- **Rúbrica del puesto**: Obligatoria. Por qué la necesito: califico las preguntas de la entrevista contra tus imprescindibles. Si falta, pregunto: "¿Para qué puesto es este candidato, y cuáles son tus tres principales imprescindibles?"
- **Nombre del entrevistador y área de enfoque**: Obligatorios. Por qué los necesito: cada panelista es dueño de criterios distintos de la rúbrica. Si faltan, pregunto: "¿Quién lleva esta entrevista, y cuál es su enfoque: técnico, sistemas, liderazgo, o valores?"
- **Marco de niveles**: Obligatorio. Por qué lo necesito: la rúbrica de puntaje se ata al estándar de este nivel. Si falta, pregunto: "¿Para qué nivel estamos contratando, y cómo describirías qué significa 'cumplir el estándar' en ese nivel?"

## Pasos

1. **Leer el documento de contexto de personal** en
   `context/people-context.md`. ¿Falta o está vacío? Le digo al
   usuario: "Primero necesito tu contexto de personal, corre la
   habilidad configurar-mi-informacion-de-personal." Me detengo.
   Obtengo el marco de niveles, los valores, las reglas de
   escalamiento.
2. **Leer la vacante.** Abro `reqs/{role-slug}.md` para la rúbrica
   de criterios. ¿Falta? Hago UNA pregunta puntual, la escribo.
3. **Leer el registro del candidato.** Abro
   `candidates/{candidate-slug}.md`. ¿Falta? Le digo al usuario: "No
   hay registro para {candidate}. Corre primero `screen-resume` o
   `score-candidate` para que tenga algo de dónde partir." Me
   detengo.
4. **Leer el archivo del proceso existente**, si está presente en
   `interview-loops/{candidate-slug}.md`, para evitar duplicar
   preguntas ya asignadas a otros panelistas.
5. **Preguntar por el enfoque del entrevistador** si no se indicó:
   UNA pregunta: "¿Quién hace la entrevista y cuál es su área de
   enfoque (por ejemplo, técnico, sistemas, liderazgo, valores)?"
   Delimita qué criterios de la rúbrica posee ese entrevistador.
6. **Construir el resumen.** Estructura:
   - **Resumen de antecedentes del candidato**: 3 a 5 frases del
     registro del candidato. Sin inventar; cito la fuente por cada
     afirmación (evaluación / LinkedIn / señal de búsqueda).
   - **Áreas de enfoque de este entrevistador**: 2 a 3 criterios de
     la rúbrica que le corresponden en el proceso.
   - **De 6 a 10 preguntas probables** enfocadas en esas áreas, cada
     una con una línea de "cómo se ve una buena respuesta".
   - **De 3 a 5 señales de alerta para explorar**: de la lista de
     señales de alerta del registro del candidato. Incluyo una
     pregunta para sacar a la luz cada señal.
   - **Temas de referencia**: temas para una futura llamada de
     referencia (si el proceso avanza).
   - **Rúbrica de puntaje**: por pregunta, banda de 0 a 3 con
     ejemplos, atada al marco de niveles del contexto de personal
     para este nivel.
7. **Escribir en `interview-loops/{candidate-slug}.md`.** Agrego una
   nueva sección con fecha `## Resumen del entrevistador - {nombre
   del entrevistador} - {YYYY-MM-DD}`, nunca sobrescribo. ¿El
   archivo falta? Lo creo con un encabezado y luego la sección del
   resumen. Escritura atómica (`*.tmp` → renombrar).
8. **Agregar a `outputs.json`**: `{ id, type: "interview-prep",
   title, summary, path: "interview-loops/{candidate-slug}.md",
   status: "draft", createdAt, updatedAt }`, escritura atómica.
9. **Resumir para el usuario**: un párrafo con el entrevistador
   nombrado, las áreas de enfoque, las 3 preguntas principales, y la
   ruta al archivo del proceso.

## Nunca inventar

- Toda afirmación del candidato en el resumen de antecedentes debe
  rastrearse hasta el registro del candidato. DESCONOCIDO ahí es
  DESCONOCIDO aquí.
- Nunca redactar preguntas que exploren atributos de clase
  protegida.
- Nunca generar preparación del lado del candidato (qué debería
  decir el candidato), esta habilidad es solo del lado del
  entrevistador.

## Salidas

- `interview-loops/{candidate-slug}.md` (agregado, creado si falta).
- Se agrega a `outputs.json` con tipo `interview-prep`.

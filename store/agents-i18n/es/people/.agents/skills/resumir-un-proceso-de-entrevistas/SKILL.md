---
name: resumir-un-proceso-de-entrevistas
title: "Resumir un proceso de entrevistas"
description: "Reúno los comentarios del panel después de un proceso de entrevistas y los organizo en temas, contradicciones, puntajes de la rúbrica y un memo de contratar o no contratar. Tú decides, yo solo te doy la lectura más clara de lo que el panel realmente dijo."
version: 1
category: Personal
featured: no
image: busts-in-silhouette
integrations: [notion, linear, slack, loops]
---


# Resumir un Proceso de Entrevistas

## Cuándo usarla

- Explícito: "sintetiza los comentarios del panel sobre
  {candidate}", "contratar o no contratar a {candidate}", "resume el
  proceso", "memo de decisión para {candidate}".
- Requisito previo: existen 2 o más bloques de comentarios de
  entrevistadores (agregados al archivo del proceso, pegados por el
  usuario, u obtenidos vía chat o herramienta de colaboración
  conectada).
- Una invocación por proceso de candidato. Se agrega, nunca se
  sobrescribe, a los resúmenes anteriores.

## Conexiones que necesito

Realizo el trabajo externo a través de Composio. Antes de correr esta
habilidad, verifico que las categorías de abajo estén conectadas. Si
falta alguna, nombro la categoría, te pido que la conectes desde la
pestaña de Integraciones, y me detengo.

- **Chat (Slack, Discord)**: obtener los comentarios del panel desde
  hilos si tu equipo los escribe ahí. Opcional.
- **Documentos (Notion)**: leer hojas de puntaje o páginas de
  comentarios. Opcional.
- **Seguimiento de proyectos (Linear)**: obtener comentarios si se
  registran como tickets. Opcional.
- **Bandeja de entrada (Loops o Gmail)**: leer correos de comentarios
  de los panelistas. Opcional.

Si ninguna de estas está conectada y el archivo del proceso no tiene
bloques de comentarios, te pido que pegues los comentarios antes de
sintetizar.

## Información que necesito

Primero leo tu contexto de personal. Por cada campo obligatorio que
falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app
conectada > archivo > URL > texto pegado) y espero.

- **Registro del proceso del candidato**: Obligatorio. Por qué lo necesito: sintetizo contra el resumen de preparación y la estructura del panel. Si falta, pregunto: "No tengo un proceso registrado para este candidato. ¿Se programó aquí o en otro lado?"
- **Comentarios de los panelistas**: Obligatorio. Por qué los necesito: sintetizar sin comentarios sería inventar. Si faltan, pregunto: "¿Dónde están los comentarios del panel? Puedo obtenerlos de Slack, Notion o Linear, o puedes pegarlos aquí."
- **Rúbrica del puesto**: Obligatoria. Por qué la necesito: califico el proceso contra tus imprescindibles. Si falta, pregunto: "¿Para qué puesto y nivel es este candidato, y cuáles son tus tres principales imprescindibles?"
- **Marco de niveles**: Obligatorio. Por qué lo necesito: las bandas de contratar o no contratar se ajustan a tu estándar en ese nivel. Si falta, pregunto: "¿Cómo describirías qué significa 'cumplir el estándar' en este nivel?"

## Pasos

1. **Leer el documento de contexto de personal** en
   `context/people-context.md`. Si falta o está vacío, le digo al
   usuario: "Primero necesito tu contexto de personal, corre la
   habilidad configurar-mi-informacion-de-personal." Me detengo.
   Obtengo el marco de niveles para el nivel objetivo, los valores,
   los límites innegociables y las reglas de escalamiento.
2. **Leer la vacante.** Abro `reqs/{role-slug}.md` para la rúbrica
   de criterios.
3. **Leer el archivo del proceso.** Abro
   `interview-loops/{candidate-slug}.md`. Si falta, le digo al
   usuario que no existe un archivo de proceso, y me detengo.
4. **Reunir los comentarios de los entrevistadores.** Busco
   secciones `## Feedback - {interviewer}` en el archivo del
   proceso. Si el usuario dijo que los comentarios están en otro
   lado, corro `composio search chat` o `composio search collab`
   para encontrar el slug de la herramienta y obtener los hilos o
   páginas que el usuario señale. Si se pegan, acepto el texto
   pegado y continúo. Si no hay nada disponible, hago UNA pregunta:
   "¿Dónde están los comentarios? Puedo obtenerlos de Slack, Notion
   o Linear, o puedes pegarlos."
5. **Extraer temas.** Agrupo los comentarios en:
   - **Fortalezas**: afirmaciones en las que varios panelistas
     coinciden.
   - **Preocupaciones**: afirmaciones en las que varios panelistas
     coinciden.
   - **Contradicciones**: donde los panelistas discreparon; señalo
     el desacuerdo y propongo una resolución (llamada de
     referencia, entrevista adicional, omitir).
   - **DESCONOCIDOS**: criterios de la rúbrica que nadie cubrió.
6. **Calificar contra la rúbrica.** Por cada criterio, agrego los
   puntajes de los panelistas cuando existen; lleno los vacíos con
   "no evaluado" donde sea DESCONOCIDO. Banda general: **contratar
   / en el límite / no contratar**.
7. **Producir el memo de decisión.**
   - Recomendación: contratar / no contratar.
   - Confianza: baja / media / alta, y por qué.
   - Razonamiento: 3 a 5 frases que conectan temas y puntajes de la
     rúbrica.
   - Riesgos si se contrata: 2 a 3 puntos.
   - Riesgos si se descarta: 2 a 3 puntos (por ejemplo, el proceso
     se reabre, el tiempo perdido).
   - Temas de referencia por verificar: 3 a 5 preguntas para las
     referencias.
   - **Pie de página explícito: "Solo recomendación, la decisión es
     del fundador".**
8. **Revisar las reglas de escalamiento.** Si los comentarios tocan
   temas de clases protegidas, preocupaciones de discriminación, o
   asuntos legalmente sensibles, DETENGO el memo y muestro una nota
   de escalamiento que apunta al abogado humano según la sección de
   reglas de escalamiento en el contexto de personal. Ninguna
   recomendación sobre esos motivos.
9. **Escribir el memo.** Agrego una sección con fecha `## Resumen -
   {YYYY-MM-DD}` a `interview-loops/{candidate-slug}.md`. Escritura
   atómica (`*.tmp` → renombrar). Nunca sobrescribo secciones
   anteriores.
10. **Agregar a `outputs.json`**: `{ id, type: "debrief", title,
    summary, path: "interview-loops/{candidate-slug}.md", status:
    "draft", createdAt, updatedAt }`, escritura atómica.
11. **Resumir para el usuario**: un párrafo con la recomendación, la
    confianza, la razón principal, el riesgo principal, y la ruta
    al memo.

## Nunca inventar

- Nunca inventar comentarios de entrevistadores. Si un panelista no
  opinó, es DESCONOCIDO.
- Nunca colapsar contradicciones en un falso consenso, hay que
  señalarlas.
- Nunca dar la decisión final de contratar o despedir; siempre
  "solo recomendación".
- Nunca escribir bajo `.houston/<agent>/`.

## Salidas

- `interview-loops/{candidate-slug}.md` (memo de decisión agregado).
- Se agrega a `outputs.json` con tipo `debrief`.

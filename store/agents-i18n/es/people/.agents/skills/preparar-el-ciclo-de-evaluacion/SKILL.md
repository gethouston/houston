---
name: preparar-el-ciclo-de-evaluacion
title: Preparar el ciclo de evaluación
description: "Preparo tu próximo ciclo de evaluación de desempeño: plantilla de autoevaluación, plantilla para managers, documento de calibración y el cronograma completo. Todo basado en tu ritmo de evaluaciones y tu marco de niveles, para que no se sienta genérico."
version: 1
category: Personal
featured: yes
image: busts-in-silhouette
integrations: [googledocs, notion]
---


# Preparar el ciclo de evaluación

## Cuándo usarla

- Explícito: "prepara el ciclo de evaluación", "empiezan las evaluaciones de Q{N}",
  "arma las plantillas de evaluación", "configura el próximo ciclo de evaluación".
- Implícito: se activa desde `weekly-people-review` cuando la fecha del
  próximo ciclo en `context/people-context.md` cae dentro de la ventana de anticipación.
- Frecuencia: una vez por ciclo. ¿El founder quiere un refresh a mitad de ciclo?
  Vuelvo a correrla y reemplazo la anterior.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta habilidad reviso que las categorías de abajo estén conectadas. Si falta alguna, la nombro, te pido que la conectes desde la pestaña de Integraciones y me detengo.

- **Documentos (Google Docs, Notion)**: para compartir las plantillas con managers y colaboradores individuales. Opcional.
- **Plataforma de RR.HH. (Gusto, Deel, Rippling, Justworks)**: para traer el roster actual para la calibración. Opcional.

Esta habilidad redacta los documentos de forma local, así que las conexiones faltantes no me detienen, simplemente no podré enviar las plantillas automáticamente.

## Información que necesito

Primero leo tu contexto de personal. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Ritmo del ciclo de evaluaciones**: Obligatorio. Por qué lo necesito: define el cronograma y el nombre del ciclo. Si falta, pregunto: "¿Las evaluaciones son anuales, semestrales o trimestrales, y cuándo empieza y termina el próximo ciclo?"
- **Marco de niveles**: Obligatorio. Por qué lo necesito: los prompts y las rúbricas se mapean a los atributos de cada nivel. Si falta, pregunto: "¿Cómo describirías cada nivel? ¿Cómo se ven el alcance, la autonomía y el impacto de L1 a L5?"
- **Escala de calificación**: Opcional. Por qué lo necesito: la plantilla para managers usa tu escala en lugar de una genérica. Si no la tienes, sigo con una escala de cuatro bandas por defecto y marco TBD donde iría tu escala.
- **Bandas salariales**: Opcional. Por qué lo necesito: le permite al documento de calibración marcar cambios de compensación que cruzan los límites de banda. Si no la tienes, sigo con TBD en la revisión de sanidad de compensación.
- **Roster**: Obligatorio. Por qué lo necesito: el documento de calibración lista quién evalúa a quién. Si falta, pregunto: "Conecta tu plataforma de RR.HH. para que pueda traer el equipo, o pega el roster actual."

## Pasos

1. **Leer el documento de contexto de personal:**
   `context/people-context.md`. ¿Falta o está vacío? Le digo al usuario
   que corra `set-up-my-people-info` primero y me detengo. Leo el
   **marco de niveles**, las **bandas salariales** (para la revisión de
   sanidad en la calibración), el **ritmo del ciclo de evaluaciones** y las
   **notas de voz**.
2. **Leer configuración:** `config/context-ledger.json`. ¿El ritmo del ciclo de
   evaluaciones no está definido? Uso el que está en `context/people-context.md`.
   ¿La fuente del roster es `connected-hr-platform`? Traigo el equipo actual con
   `composio search hris`.
3. **Resolver el nombre del ciclo.** Por defecto `YYYY-q{N}` (por ejemplo
   `2026-q2`) para trimestral, `YYYY-h{N}` para semestral, `YYYY`
   para anual. Le pregunto al usuario si el valor por defecto no
   coincide con su nomenclatura interna.
4. **Producir cuatro documentos** en un solo archivo markdown:

   - **Plantilla de autoevaluación**: bloques de prompts alineados al
     marco de niveles. Una sección por atributo de nivel (alcance, autonomía,
     oficio, colaboración, impacto) con 1 a 2 prompts abiertos cada una. Mantengo
     los prompts cortos, el equipo temprano de los founders no va a escribir
     autoevaluaciones de 1500 palabras, y no quiero que lo hagan.

   - **Plantilla de evaluación para managers**: misma estructura de atributos,
     más una rúbrica de calificación general basada en la escala de
     calificación del ciclo (si `context/people-context.md` define una), y
     una marca de "listo para promoción" por persona. Incluyo una sección
     para "ejemplos concretos observados este ciclo", basada en evidencia,
     no en impresiones.

   - **Documento de calibración**: vista cruzada entre equipos para:
     - Consistencia de niveles (¿los colaboradores individuales L3 se
       evalúan con la misma vara en todos los equipos?).
     - Revisión de sanidad de aumentos de compensación (¿existen bandas
       salariales? marco cualquier cambio de compensación propuesto que
       cruce los límites de banda).
     - Candidatos a promoción (quién fue marcado como listo para
       promoción; cruzo con la antigüedad en el nivel de
       `context/people-context.md` si está definida).

   - **Cronograma**: hitos con fecha desde hoy hasta la entrega:
     vencimiento de autoevaluaciones → vencimiento de evaluaciones de managers →
     reunión de calibración → cartas de compensación finalizadas → 1:1 de
     entrega realizados. Las fechas concretas salen de la ventana de
     inicio/fin del ciclo; marco las que necesitan el input del founder.

5. **Revisión de voz.** Tomo las notas de voz de `context/people-context.md`,
   los prompts de las plantillas y el documento de calibración deben sonar
   como la voz de RR.HH. del founder, no como un genérico corporativo.

6. **Escribir** en `review-cycles/{cycle-slug}.md` de forma atómica
   (`*.tmp` → renombrar). Estructura: Resumen del ciclo → Cronograma →
   Plantilla de autoevaluación → Plantilla de evaluación para managers →
   Documento de calibración.

7. **Agregar a `outputs.json`**: leo el arreglo existente, agrego
   `{ id, type: "review-cycle", title, summary, path, status: "draft",
   createdAt, updatedAt }`, escribo de forma atómica. El estado se mantiene
   en `draft` hasta que el founder apruebe la estructura del ciclo, cambia
   a `ready` cuando lo confirma.

8. **Resumir al usuario**: un párrafo cubriendo el nombre del ciclo,
   los puntos destacados del cronograma y la ruta al paquete. Cierro con:
   "Esto son borradores. Revisa las plantillas y el cronograma, y avísame
   cuando quieras que marque todo como listo, nada llega al equipo hasta
   que tú lo confirmes."

## Nunca inventar

No invento el marco de niveles ni la escala de calificación que el founder
no haya escrito. Si la sección de niveles de `context/people-context.md` dice
`TBD`, le digo al usuario: "Puedo redactar prompts genéricos, pero las
plantillas salen mucho mejor una vez que se corre `draft-leveling-framework`."
Sigo con una plantilla genérica claramente marcada solo si el usuario lo pide
explícitamente.

## Resultados

- `review-cycles/{cycle-slug}.md`
- Se agrega a `outputs.json` con tipo `review-cycle`.

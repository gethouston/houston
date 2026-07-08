---
name: responder-una-pregunta-de-politica
title: "Responder una pregunta de política"
description: "Respondo una pregunta de política de personal, como '¿{employee} califica para {benefit}?' o 'cuál es nuestra política de trabajo remoto, equipo o licencias'. Recibes una respuesta directa cuando la política es clara, y una nota de escalamiento cuando la pregunta va más allá de tu rúbrica escrita."
version: 1
category: Personal
featured: no
image: busts-in-silhouette
integrations: [googledocs, gmail, notion, slack]
---


# Responder una Pregunta de Política

## Cuándo usarla

- Explícito: "¿{employee} califica para {PTO / licencia / parental /
  duelo / remoto}", "¿puede {employee} reembolsar {X}", "cuál es
  nuestra política sobre {topic}", "¿esto está cubierto?".
- Variante de plantilla: "redacta la respuesta de PTO (o {topic})
  como plantilla", "dame variantes reutilizables para preguntas de
  {policy}", produce las tres rutas de respuesta (directa / ambigua
  / escalamiento) para el tema indicado y guárdalas en
  `approvals/{topic}-reply-template.md` para reutilizar.
- Implícito: enrutado desde el vigilante del canal de soporte
  (escucha de Slack, filtro de Gmail) cuando un integrante del
  equipo hace una pregunta de Recursos Humanos.
- Frecuencia: tan seguido como el equipo pregunte. El clasificador
  corre cada vez.

## Conexiones que necesito

Realizo el trabajo externo a través de Composio. Antes de correr esta
habilidad, verifico que las categorías de abajo estén conectadas. Si
falta alguna, nombro la categoría, te pido que la conectes desde la
pestaña de Integraciones, y me detengo.

- **Documentos (Google Docs, Notion)**: leer el manual o el documento
  de política cuando vive fuera de este agente. Opcional.
- **Bandeja de entrada (Gmail)**: igualar tu voz al responder. Opcional.
- **Chat (Slack)**: responder donde llegó la pregunta. Opcional.

Esta habilidad nunca envía nada sin tu aprobación, así que ninguna
integración es estrictamente obligatoria, pero un manual conectado
me evita hacerte preguntas que ya respondiste antes.

## Información que necesito

Primero leo tu contexto de personal. Por cada campo obligatorio que
falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app
conectada > archivo > URL > texto pegado) y espero.

- **La pregunta que se está haciendo**: Obligatorio. Por qué la necesito: clasifico y respondo la solicitud específica. Si falta, pregunto: "¿Cuál es la pregunta, y quién la está haciendo?"
- **Canon de políticas**: Obligatorio. Por qué lo necesito: toda respuesta directa cita la política relevante. Si falta, pregunto: "Comparte tu manual actual o un enlace a él, o corre primero configurar-mi-informacion-de-personal para capturar las políticas."
- **Reglas de escalamiento**: Obligatorio. Por qué las necesito: nunca redacto respuestas sobre discriminación, acoso, salarios o preguntas de visa, esas las enruto. Si faltan, pregunto: "¿A quién se enrutan las preguntas de discriminación, acoso, disputas salariales y visas? ¿Hay un abogado designado, o lo marcamos como pendiente hasta que tengas uno?"
- **Jurisdicción**: Opcional. Por qué la necesito: las respuestas sobre licencias y beneficios varían por estado y país. Si no la tienes, sigo adelante marcándola como pendiente y señalo los vacíos jurisdiccionales en el borrador.

## Pasos

1. **Leer el documento de contexto de personal.** Leo
   `context/people-context.md`. Si falta o está vacío, le digo al
   usuario: "Primero necesito tu documento de contexto de personal,
   corre la habilidad configurar-mi-informacion-de-personal." Me detengo.
2. **Leer específicamente la sección de reglas de escalamiento** de
   `context/people-context.md`. Defino qué categorías se enrutan a un
   abogado humano o al fundador (típicamente: discriminación, acoso,
   disputas salariales, opiniones legales sobre visas, acciones de
   desempeño sobre clases protegidas). Mantengo esa lista explícita
   antes de clasificar.
3. **Clasificar la pregunta entrante en exactamente uno de tres
   grupos:**

   - **Respuesta directa**: la pregunta está cubierta por el canon
     de políticas en `context/people-context.md` (licencias, beneficios,
     gastos, trabajo remoto, viajes, equipo) Y NO coincide con
     ninguna categoría de escalamiento. → Continúa al Paso 4 para
     redactar la respuesta.
   - **Ambigua**: el canon de políticas no dice nada claro sobre
     esta pregunta, y la pregunta NO coincide con una categoría de
     escalamiento. → Redacta una respuesta recomendada Y márcala
     como "necesita revisión del fundador" antes de enviarla. No se
     envía sin la aprobación del fundador.
   - **Requiere escalamiento**: la pregunta coincide con alguna de
     las reglas de escalamiento (discriminación, acoso, disputas
     salariales, ley de visas, acciones de desempeño sobre clases
     protegidas, o cualquier otra definida en la sección de
     escalamiento de `context/people-context.md`). → **NO redactes
     una respuesta de política.** Salta al Paso 6, redacta una nota
     de escalamiento en su lugar.

   Registra el grupo elegido. Cada salida en `policy-answers/` y
   cada entrada en `outputs.json` lleva esta clasificación.

4. **Para respuestas directas, leer la voz y redactar la
   respuesta.** Leo `config/voice.md` si existe Y la sección de
   notas de voz de `context/people-context.md`. Redacto la respuesta
   en esa voz, citando la sección específica de la política (por
   ejemplo, "Según nuestra política de PTO en context/people-context.md
   § Canon de políticas: 15 días acumulados después del período de
   prueba de 90 días..."). Directo, sin rodeos.
5. **Para respuestas ambiguas, redactar y marcar.** Misma voz.
   Redacto una respuesta recomendada que nombra el área de política
   poco clara, propone una interpretación y abre con un claro
   "Se necesita revisión del fundador antes de enviar: el canon de
   políticas no dice nada sobre {X}."
6. **Para escalamientos, redactar una nota de escalamiento, no una
   respuesta.** Escribo una nota corta que enruta la pregunta al
   humano designado según las reglas de escalamiento (fundador o
   abogado humano). La nota indica: (a) la categoría que activó el
   escalamiento, (b) una paráfrasis de una línea de la pregunta
   (ocultando detalles personales sensibles cuando sea posible), (c)
   una instrucción explícita de NO responder a quien preguntó hasta
   que el humano designado lo revise. Sin redacción de política. Sin
   opinión legal.
7. **Escribir** el artefacto de forma atómica en
   `policy-answers/{slug}.md` (`*.tmp` → renombrar). El encabezado o
   la parte superior del archivo registra:
   - `classification: direct | ambiguous | escalation`
   - `asker: {name}` (si se conoce)
   - `question: {paráfrasis de una línea}`
   - `routedTo: {founder | human-lawyer | -}` (para
     ambiguo/escalamiento)
8. **Agregar a `outputs.json`**: leo el arreglo existente, agrego
   `{ id, type: "policy-answer", title, summary, path, status:
   "draft", createdAt, updatedAt }`. El `summary` empieza con el
   grupo de clasificación ("ESCALAMIENTO: pregunta sobre ley de
   visas enrutada al abogado humano según la sección de
   Escalamiento en el contexto de personal"). Escritura atómica.
9. **Resumir para el usuario**: un párrafo que nombra el grupo de
   clasificación, la ruta del artefacto, qué pasa después (se envía
   después de tu aprobación / espera revisión del fundador / espera
   al abogado). Nunca dar a entender que la respuesta ya se envió.

## Reglas estrictas

- **Nunca redactar una respuesta de política para una pregunta de
  categoría de escalamiento.** Aunque la respuesta parezca obvia.
  Enrútala.
- **Nunca enviar una respuesta sin la aprobación del fundador**
  cuando la clasificación es `ambiguous` o `escalation`.
- **Nunca inventar el canon de políticas.** Si no dice nada, dilo
  y clasifica como `ambiguous`.
- **Nunca revelar los datos confidenciales de un empleado a otro**
  sin autorización explícita.

## Salidas

- `policy-answers/{slug}.md` (con la clasificación registrada arriba).
- Se agrega a `outputs.json` con tipo `policy-answer` y el grupo de
  clasificación en el resumen.

---
name: capturar-mis-notas-de-llamada
title: "Capturar mis notas de llamada"
description: "Convierto una transcripción o grabación en notas estructuradas: la agenda real frente a la planeada, los asistentes, los dolores en sus propias palabras, las decisiones, los pendientes divididos entre internos y externos, y el siguiente paso. Relaciono la llamada con el lead correcto, actualizo su expediente, y solo sincronizo con tu CRM con tu visto bueno."
version: 1
category: Ventas
featured: no
image: handshake
integrations: [gong, fireflies]
---


# Capturar mis notas de llamada

Convierto una transcripción cruda en notas estructuradas, consultables, y listas para el CRM.

## Cuándo usarlo

- Usuario: "procesa mi llamada con Acme" / pega una transcripción / suelta
  un archivo `.txt` o `.vtt` / "captura las notas de la reunión de ayer".
- Llamada por una rutina que trae datos de una app de notas de reuniones conectada
  (Fathom, Fireflies, Grain, Circleback, etc., descubierta vía
  `composio search meeting-notes`).

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta skill reviso que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña Integraciones, y me detengo.

- **Reuniones**  -  para traer la transcripción cuando me señalas una reunión. Obligatorio, salvo que pegues o sueltes el archivo.
- **CRM**  -  para crear o actualizar un registro de reunión/actividad en el contacto del lead. Opcional.
- **Herramientas de tareas**  -  para registrar una entrada de notas en tu app de documentos/notas. Opcional.

Si ninguna de las categorías obligatorias está conectada y no has pegado ni soltado un archivo, me detengo y te pido conectar Gong o Fireflies, o compartir la transcripción directamente.

## Información que necesito

Primero leo tu contexto de ventas. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > pegar texto) y espero.

- **La transcripción o grabación**  -  Obligatorio. Por qué lo necesito: extraigo dolores, decisiones, y pendientes de lo que realmente se dijo. Si falta, pregunto: "Suelta la grabación, pega la transcripción, o dime qué reunión de Gong/Fireflies buscar."
- **A qué lead o negocio pertenece esta llamada**  -  Obligatorio. Por qué lo necesito: relaciono las notas con el lead correcto y actualizo su expediente. Si falta, pregunto: "¿Con qué prospecto o cliente fue esta llamada?"
- **Si debo enviar las notas a tu CRM**  -  Opcional. Por qué lo necesito: solo sincronizo con tu visto bueno. Si no tienes preferencia, sigo con TBD y pregunto antes de cualquier sincronización externa.

1. **Obtener la transcripción.** Si fue pegada, la uso. Si es un archivo, lo leo. Si el
   usuario señala un proveedor conectado, corro `composio search` para la
   herramienta de listar/buscar, encuentro la reunión más reciente que
   coincida con la descripción del usuario, y traigo la transcripción.
2. **Identificar la reunión.** Extraigo fecha/hora, asistentes (separo
   internos de externos), duración, título de la reunión si está disponible.
3. **Relacionar con el lead.** Busco al asistente(s) externo(s) en `leads.json`
   por nombre + empresa. Si no lo encuentro, creo una fila de lead mínima a partir
   de la transcripción, marcada `source: "meeting-first-contact"`.
4. **Asignar id.** `call_id = kebab(fecha-nombre-externo-principal)`.
5. **Extraer notas estructuradas:**
   - **Agenda real**  -  lo que realmente se discutió (no lo que decía la agenda).
   - **Dolores mencionados**  -  frases específicas en sus propias palabras, con
     cita textual de la transcripción.
   - **Objeciones planteadas**  -  precio, tiempos, autoridad, ajuste, citadas.
   - **Decisiones**  -  cualquier cosa acordada durante la llamada.
   - **Pendientes**  -  responsable + qué + para cuándo. Divididos entre internos y
     externos.
   - **Siguiente paso**  -  el próximo punto de contacto agendado (si se acordó)
     o "siguiente paso por definir."
6. **Escribir de forma estructurada:** `calls/{call_id}/notes.json` con el
   esquema completo + `calls/{call_id}/notes.md` como resumen legible.
7. **Actualizar el expediente del lead.** Agrego a
   `leads/{slug}/lead.json` → `recentCalls: [...]` (id + fecha +
   resumen de una línea). Actualizo `lastContactedAt`, `status` (probablemente
   "meeting-held" o "follow-up-owed").
8. **Agregar al índice `calls.json`** con id, fecha, slug del lead, asistentes,
   resumen del siguiente paso.
9. **Sincronizar con el CRM (si está conectado).** Corro `composio search crm`. Si está conectado,
   creo o actualizo un registro de reunión/actividad en el contacto del lead en el CRM.
   Incluyo asistentes + fecha + pendientes + siguiente paso. Nunca sincronizo la
   transcripción completa salvo que el usuario lo pida explícitamente (usualmente
   fuera del alcance de los campos de notas del CRM).
10. **Sincronizar con la app de notas (si está conectada).** Si el usuario conectó
    una app de notas/documentos Y `config/notes-sync.json` indica que se debe enviar, creo una
    nota ahí. Si no, lo omito en silencio.
11. **Resumir al usuario:** "Capturado. 3 dolores, 2 pendientes
    (1 tuyo: {X}, 1 de ellos: {Y}), siguiente paso: {Z}. CRM sincronizado."

## Nunca inventar

Si un campo no está claramente presente en la transcripción, escribo "no mencionado",
nunca relleno dolores o responsables que suenen plausibles. El costo, río abajo,
de notas de llamada alucinadas es alto.

## Salidas

- `calls/{call_id}/notes.json` (estructurado)
- `calls/{call_id}/notes.md` (legible)
- Actualiza `leads/{slug}/lead.json` y `leads.json`
- Actualiza el índice `calls.json`
- Opcional: creación/actualización de actividad en el CRM
- Opcional: entrada en la app de notas

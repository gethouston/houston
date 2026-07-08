---
name: rastrear-mis-promesas
title: "Rastrear mis promesas"
description: "Cada vez que le dices a un cliente que harás algo para una fecha determinada, yo lo anoto con un plazo para que no se te pase. Extraigo la promesa directamente de tu respuesta, interpreto la fecha límite, y la vinculo a la conversación. Esto aparece automáticamente en tu resumen matutino, para que nada se te escape."
version: 1
category: Soporte
featured: no
image: headphone
---


# Rastrear mis promesas

## Cuándo usarla
- Dices "envíalo" / "aprobado" sobre `draft.md` con lenguaje ligado a un plazo.
- Escribes tu propia respuesta en el chat con una fecha, un día, o un plazo.
- Revisas un hilo existente y mencionas "ah cierto, les dije que iba a...".

Cualquier frase como "voy a X para Y", "la próxima semana", "mañana", "para el viernes", "a fin de día", "en la próxima hora" activa esto.

## Conexiones que necesito

Hago el trabajo externo a través de Composio. Antes de ejecutar esta skill, verifico que las categorías de abajo estén conectadas. Si falta alguna → nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Bandeja de entrada** (Gmail / Outlook)  -  opcional, solo se usa para traer el hilo de origen cuando la promesa vive en un correo que todavía no he ingerido.

Esta skill trabaja principalmente contra tu índice local de conversaciones, así que ninguna conexión es estrictamente obligatoria.

## Información que necesito

Primero leo tu contexto de soporte. Por cada campo obligatorio que falte, te hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > pegar texto) y espero.

- **El texto de la promesa**  -  Obligatorio. Por qué lo necesito: registro lo que realmente se dijo, no lo que creí escuchar. Si falta, pregunto: "¿A qué te comprometiste, y con qué cliente o hilo?"
- **La fecha límite o el plazo**  -  Obligatorio. Por qué lo necesito: los plazos vagos se pasan sin avisar. Si falta, pregunto: "¿Cuándo les dijiste que responderías? ¿Un día específico, fin de semana, o lo dejaste abierto?"
- **Vínculo con la conversación o el cliente**  -  Opcional. Por qué lo necesito: me permite archivar el seguimiento contra el hilo correcto. Si no lo tienes, sigo con TBD y te pido que me indiques el hilo más adelante.

## Pasos
1. **Extraigo el texto de la promesa** de forma textual del mensaje o el borrador (conservo la redacción original, tal vez quieras ver qué se dijo).
2. **Interpreto la fecha límite.**
   - Fecha explícita ("viernes", "3 de marzo") → próxima ocurrencia en tu zona horaria local → ISO-8601 UTC.
   - Relativa ("mañana", "la próxima semana") → la aplico en relación al momento actual.
   - Vaga ("pronto", "lo antes posible", sin fecha) → por defecto `ahora + 48h`, anoto la ambigüedad en el texto de la promesa.
3. **Vinculo a la conversación.** Traigo `conversationId` y `customerSlug` del hilo.
4. **Agrego de forma atómica** a `followups.json`:
   ```json
   { "id": "<uuid>", "conversationId": "...", "customerSlug": "...", "promise": "...", "dueAt": "...", "status": "open", "createdAt": "...", "updatedAt": "..." }
   ```
5. **Reflejo la promesa** como una línea con fecha en `conversations/{id}/notes.md`.
6. Si un seguimiento abierto existente en la misma conversación queda contradicho por la nueva promesa (por ejemplo, la fecha se corrió), marco el anterior como `status: "cancelled"` y hago referencia al nuevo id.

## Resultados
- Agrega a `followups.json`
- Agrega una línea con fecha a `conversations/{id}/notes.md`
- Opcionalmente cancela el seguimiento reemplazado

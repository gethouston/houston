---
name: redactar-un-mensaje
title: "Redactar un mensaje"
description: "Obtén un mensaje redactado con tu tono y guardado en tu bandeja de entrada, para que solo tengas que darle a enviar. Elige lo que necesitas: una respuesta a un hilo entrante; un seguimiento que registra un compromiso en tu bitácora o redacta su cumplimiento cuando vence; o contacto con proveedores para renovaciones, cancelaciones, pruebas o verificación de referencias, basado en los términos reales de tu contrato."
version: 1
category: Operaciones
featured: no
image: clipboard
integrations: [gmail, outlook]
---


# Redactar un mensaje

Una sola primitiva de redacción para todo lo saliente. Tu tono, tu aprobación, tu botón de enviar; nunca envío, nunca me comprometo, nunca firmo.

## Cuándo usarla

- `type=reply` - "redacta respuestas" / "responde a {name}" / "redacta respuestas a los correos entrantes de mi triage".
- `type=followup` - "haz seguimiento a este compromiso" (submodo TRACK) / "recuérdame hacer seguimiento con {X}" (TRACK) / "encárgate de mis seguimientos que vencen" (HANDLE).
- `type=vendor` - "redacta un correo de negociación de renovación" / "escribe el correo de cancelación para {SaaS}" / "contacta a {supplier} para una prueba" / "correo de verificación de referencias para {vendor}".

## Conexiones que necesito

Ejecuto todo el trabajo externo a través de Composio. Antes de ejecutar esta skill verifico que las categorías de abajo estén vinculadas. Si falta alguna → nombro la categoría, te pido conectarla desde la pestaña de Integraciones y me detengo.

- **Bandeja de entrada** (Gmail, Outlook) - Requerido. Extrae el hilo al que respondo, muestrea tu tono y guarda el borrador de vuelta en tu bandeja para que lo revises y envíes.
- **Archivos** (Google Drive) - Opcional. Me permite leer contratos de proveedores al redactar correos de renovación o cancelación.

Si no hay bandeja de entrada conectada, me detengo y te pido conectarla primero.

## Información que necesito

Primero leo tu contexto de operaciones. Por cada campo requerido que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > pegar texto) y espero.

- **Tu tono** - Requerido. Por qué lo necesito: las respuestas suenan como tú y no como una plantilla. Si falta, pregunto: "La mejor manera es conectar tu bandeja de entrada para que pueda muestrear 20 a 30 mensajes enviados. Si no, pega 3 a 5 respuestas recientes que hayas escrito y trabajaré a partir de esas."
- **Documento de contexto operativo** - Requerido. Por qué lo necesito: ancla las prioridades y los contactos clave para que las respuestas se mantengan alineadas con tu mensaje. Si falta, pregunto: "¿Quieres que configure primero tu contexto operativo? Las respuestas mejoran mucho una vez que lo tengo."
- **VIPs** - Opcional. Por qué los necesito: definen el tono y el nivel de deferencia. Si no los tienes, sigo adelante con TBD y trato a todos por igual.
- **Postura con proveedores** - Requerido para `type=vendor`. Por qué la necesito: guía las peticiones de renovación y el lenguaje para retirarse de la negociación. Si falta, pregunto: "¿Cómo abordas las conversaciones con proveedores: presionas fuerte por los términos o lo mantienes ligero? ¿Quién puede firmar?"

## Parámetro: `type`

- `reply` - responder un hilo entrante. Extraigo el hilo de la bandeja conectada, redacto la respuesta con tu tono, la guardo como borrador en el proveedor de tu bandeja y dejo un registro legible. Resultado: `drafts/reply-{YYYY-MM-DD}-{thread-slug}.md`.
- `followup` - dos submodos:
  - TRACK (predeterminado cuando dices "haz seguimiento a esto" / "recuérdame") - extraigo el compromiso (quién, qué, para cuándo), lo agrego a `followups.json`, sin borrador todavía.
  - HANDLE (cuando dices "encárgate de los seguimientos que vencen" / "redacta los atrasados") - leo `followups.json` y, para cada seguimiento con fecha de vencimiento ≤ hoy, redacto el cumplimiento o un recordatorio honesto ("Siguiendo con el {X} que prometí para el {Y}; estado: {Z}"). Resultado: `drafts/followup-{YYYY-MM-DD}-{slug}.md`.
- `vendor` - contacto de renovación / cancelación / prueba / verificación de referencias. Basado en los términos del contrato en `contracts/` + la postura con proveedores de `context/operations-context.md`. Resultado: `drafts/vendor-{type}-{vendor-slug}.md`.

## Pasos

1. Leo la bitácora; lleno `universal.voice` + cualquier vacío en `domains.vendors.posture` con UNA pregunta ordenada por modalidad.
2. Leo `context/operations-context.md` - prioridades, contactos clave, límites innegociables, notas de tono.
3. Bifurco según `type`:

   **Si `type = reply`:**
   - Extraigo los hilos objetivo de la bandeja conectada (Gmail / Outlook vía Composio). Si nombraste a alguien, resuelvo su hilo sin responder más reciente.
   - Leo el historial del hilo + `context/operations-context.md` + `config/voice.md`.
   - Redacto la respuesta: directa, con opinión cuando corresponde, ajustada a tu tono. Sin titubeos ("creo que quizás"), sin saludos de relleno.
   - La guardo como BORRADOR en la bandeja vía Composio; uso la función de borradores del propio proveedor de la bandeja, nunca envío. También escribo un registro legible en `drafts/reply-{YYYY-MM-DD}-{slug}.md` para revisión sin conexión.

   **Si `type = followup` + submodo TRACK:**
   - Extraigo el compromiso de lo que escribiste o del mensaje saliente referenciado (quién le debe qué a quién, para cuándo).
   - Lo agrego a `followups.json` con `{id, createdAt, updatedAt, with, commitment, dueAt, status: "pending", sourceArtifact}`.
   - Sin borrador todavía; el registro es el entregable.

   **Si `type = followup` + submodo HANDLE:**
   - Leo `followups.json`. Para cada seguimiento con `status == "pending"` y `dueAt <= today`:
     - Si el compromiso ya se cumplió en otro lado (existe un mensaje saliente en `drafts/` que lo cubre), lo cambio a `status: "ready-to-close"`.
     - Si no, redacto el cumplimiento o un recordatorio honesto. Uso tu tono. Lo guardo en `drafts/followup-{YYYY-MM-DD}-{slug}.md` Y como borrador en la bandeja vía Composio.

   **Si `type = vendor`:**
   - Leo el contrato del proveedor si existe (`contracts/{vendor-slug}/`). Extraigo: plazo, ventana de renovación, precio, cláusulas desfavorables.
   - Leo la postura con proveedores de `context/operations-context.md` (apetito de riesgo, autoridad de firma, preferencia de formato contractual).
   - Redacto el subtipo de mensaje solicitado:
     - Negociación de renovación: abro con datos (uso / valor), petición específica (precio, plazo, términos), punto de retirada.
     - Cancelación: directa, agradecida, específica (cito la cláusula + la fecha efectiva).
     - Prueba: encaje de posicionamiento + caso de uso específico + criterios de éxito + cronograma honesto.
     - Verificación de referencias: 3-5 preguntas dirigidas según lo que estamos evaluando.
   - Guardo como borrador en la bandeja vía Composio + escribo el registro en `drafts/vendor-{sub-type}-{vendor-slug}.md`.

4. En cada rama: escritura atómica (`.tmp` → renombrar).
5. Agrego a `outputs.json` con `{id, type, title, summary, path, status: "draft", createdAt, updatedAt, domain: "people" or "vendors"}`. El `type` = `"reply-draft"` / `"followup-log"` / `"followup-draft"` / `"vendor-draft"`.
6. Te resumo: la ruta al borrador + qué revisar dos veces antes de aprobar.

## Resultados

- `drafts/reply-{YYYY-MM-DD}-{slug}.md`
- `followups.json` (upsert) y/o `drafts/followup-{YYYY-MM-DD}-{slug}.md`
- `drafts/vendor-{sub-type}-{vendor-slug}.md`
- Agrega a `outputs.json`; borradores en la bandeja vía Composio para los tipos reply / followup-handle / vendor.

## Lo que nunca hago

- Enviar, programar envíos o archivar automáticamente. Todo mensaje saliente es un borrador que tú apruebas y envías desde tu propia bandeja.
- Comprometerme en tu nombre (nada de "te lo entrego el viernes" a menos que tú lo hayas dicho en el hilo).
- Inventar estadísticas de uso del proveedor o términos de contrato; si el contrato no está en `contracts/` ni fue pegado, marco TBD y pregunto.
- Negociar precio sin una petición explícita tuya (p. ej. "pide 20% de descuento en el plan anual").

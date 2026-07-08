---
name: redactar-un-documento-legal
title: "Redactar un documento legal"
description: "Redacto un documento legal para ti, como un NDA, un contrato con un cliente, una carta de oferta, una política de privacidad, términos de servicio, una decisión de la junta directiva, una respuesta a una solicitud de datos de un cliente o un resumen para enviarle a un abogado de verdad. Trabajo a partir de tus plantillas existentes si las tengo, o con redacción estándar del mercado con una nota clara. Solo borradores, nunca se envían ni se firman."
version: 1
category: Redacción
featured: yes
image: scroll
integrations: [googledocs, googledrive, notion, firecrawl]
---


# Redactar un documento legal

Una sola skill para cada necesidad de primer borrador del fundador. El parámetro `type` elige la plantilla, la estructura y las citas. Comparte la disciplina de "solo borradores, nunca se envían, presentan ni firman".

## Parámetro: `type`

**Documentos comerciales (primero lee la biblioteca de plantillas):**

- `nda`, NDA bilateral o unilateral anclado en tu plantilla.
- `consulting`, contrato de consultoría o contratista anclado en el CIIAA + entregables + plazo.
- `offer-letter`, carta oferta para empleado anclada en el 409A + compensación + vesting + lenguaje de empleo a voluntad.
- `msa`, contrato marco de servicios de cara al cliente.
- `order-form`, formulario de orden vinculado a un MSA existente.
- `board-consent`, consentimiento escrito de la junta directiva (de rutina: nombramiento de directivos, otorgamiento de opciones, adopción del 409A, resoluciones bancarias).

**Privacidad / políticas:**

- `privacy-policy`, Política de Privacidad completa con divulgación de entrenamiento con IA, SCC, lista de subprocesadores, citas de base legal.
- `tos`, Términos de Servicio (uso, propiedad intelectual, uso aceptable, tope de responsabilidad, foro de disputas).

**Respuesta regulatoria:**

- `dsr-response`, paquete de primer contacto para una DSR de GDPR Art. 15 / CCPA: acuse de recibo + solicitud de verificación de identidad + nota de portada para la exportación (3 archivos).

**Escalamiento:**

- `escalation-brief`, resumen estructurado para un abogado externo: resumen del asunto en 2-3 oraciones, preguntas específicas para el abogado, fragmentos citados con su fuente, plazo, tipo de despacho recomendado (corporativo / litigio comercial / privacidad / propiedad intelectual / laboral). Nunca nombra despachos específicos.

El usuario nombra el `type` en lenguaje simple ("redacta un NDA con Acme", "escribe nuestra política de privacidad", "empaqueta esto para el abogado") → infiérelo. Ambiguo → haz UNA pregunta nombrando las 10 opciones agrupadas por bloque.

## Cuándo usar

- Explícito: "redacta {type}", "escribe nuestra política de privacidad", "responde a esta DSR", "escala esto al abogado".
- Las preguntas en lenguaje simple mapean a un `type`: "redacta un NDA para {contraparte}" → `nda`; "redacta un contrato de contratista / consultoría" → `consulting`; "redacta un contrato de cliente" / "MSA para {cliente}" / "formulario de orden" → `msa` o `order-form`; "redacta un consentimiento de junta" / "decisión de junta para {acción}" → `board-consent`; "redacta / actualiza nuestra política de privacidad" → `privacy-policy`; "redacta nuestros términos de servicio" → `tos`; "un cliente pidió sus datos" / "responde a una DSR / GDPR / solicitud de CCPA" → `dsr-response`; "empaqueta esto para un abogado" / "prepara un traspaso para el abogado externo" / "traspaso de marca a un abogado" → `escalation-brief`.
- Implícito: encadenado desde `review-a-contract` cuando el resultado recomienda una contraoferta redactada (el type se elige según el tipo de contrato); desde `audit-compliance` (scope=privacy-posture) cuando la auditoría dice que la política está desactualizada; desde `plan-contract-pushback` cuando el redline necesita el texto específico de una cláusula redactado.

## Campos del registro que leo

Primero lee `config/context-ledger.json`.

- `universal.legalContext` + `context/legal-context.md`, requerido para todos los tipos (entidad, tabla de capitalización, acuerdos vigentes, stack de plantillas, riesgos abiertos, postura de riesgo). Si falta → ejecuta primero la skill `set-up-my-legal-info` (o haz UNA pregunta puntual para avanzar).
- `universal.company`, nombre, etapa (calibra el lenguaje en todos los tipos).
- `universal.entity`, requerido para `offer-letter` (estado de constitución, acciones emitidas), `board-consent` (acciones autorizadas, directores, directivos), `escalation-brief` (instantánea de la entidad).
- `domains.contracts.templateLibrary`, si apunta a un set de plantillas → ancla el borrador ahí. Si falta para tipos comerciales → haz UNA pregunta: pega la URL de la plantilla, conecta Google Drive, o avanza con redacción estándar del mercado con el aviso "no se encontró plantilla, se usa redacción estándar del mercado" marcado en el borrador.
- `domains.compliance.landingPageUrl`, requerido para `privacy-policy` y `tos` (el rastreo con Firecrawl infiere la superficie del producto, la recolección de datos, la analítica).
- `domains.compliance.dataGeography`, requerido para `privacy-policy` y `dsr-response` (la inclusión de la UE activa las SCC + los plazos del GDPR Art. 15).
- `subprocessor-inventory.json`, requerido para `privacy-policy` (lista de proveedores + estatus del DPA).
- `universal.posture.escalationThreshold`, requerido para `escalation-brief` (encuadra el "por qué necesitamos un abogado").

## Pasos

1. **Lee el registro y el contexto legal.** Reúne los campos requeridos que falten según lo anterior. Escribe de forma atómica.
2. **Descubre las herramientas vía Composio** solo cuando el tipo lo necesite: `googledocs` / `notion` para la copia espejo (opcional), `googledrive` para leer la biblioteca de plantillas, `firecrawl` para el rastreo de la landing page (privacy-policy, tos).
3. **Ramifica según `type`.**
   - `nda` / `consulting` / `offer-letter` / `msa` / `order-form` / `board-consent`: carga la plantilla correspondiente de la biblioteca (o usa redacción estándar del mercado con el aviso marcado). Recolecta las variables (contraparte, fechas, términos comerciales, nombre del candidato, tamaño del otorgamiento, cliff de vesting, las que apliquen). Sustituye las variables. Produce un borrador con un bloque de comentario al inicio que liste (a) las variables sustituidas, (b) cualquier variable que necesite confirmación del fundador. Si la estructura de compensación (offer-letter) o la matemática de acciones (board-consent) es fuera de lo estándar → marca `attorneyReviewRequired: true`.
   - `privacy-policy` / `tos`: rastrea la landing page con Firecrawl, cruza contra `subprocessor-inventory.json`, identifica las superficies de recolección de datos (formularios, analítica, cookies, pagos), elige las secciones correctas (Recolección / Uso / Divulgación / Retención / Derechos / Transferencias / Seguridad / Cambios / Contacto para privacidad; Uso / Cuenta / Propiedad intelectual / Uso aceptable / Pago / Terminación / Garantía / Responsabilidad / Disputas para ToS). Cita los artículos del GDPR para geografía que incluya la UE, CCPA/CPRA para EE. UU. La divulgación de entrenamiento con IA debe ser explícita (opt-in u opt-out, decláralo). Produce un borrador en markdown con secciones.
   - `dsr-response`: calcula el reloj estatutario (GDPR Art. 15 → 30 días, CCPA → 45 días). Produce tres archivos: `acknowledgment.md` (recibido, inicio del reloj, plazo esperado, sin compromisos más allá del plazo estatutario), `identity-verification.md` (qué necesitamos para confirmar que es esa persona), `export-cover-note.md` (plantilla de nota de portada; la exportación real de datos queda fuera de alcance, el fundador ejecuta la exportación). Si el reloj ya está a menos de 7 días del plazo estatutario → marca `attorneyReviewRequired: true`. Escribe como carpeta `dsr-responses/{request-id}-{YYYY-MM-DD}/`.
   - `escalation-brief`: resumen estructurado en este orden, (1) el asunto en 2-3 oraciones, (2) preguntas específicas para el abogado (numeradas, acotadas), (3) plazo + por qué, (4) fragmentos citados con su fuente (cláusula del contrato, hilo de correo, estatuto), (5) instantánea de la entidad desde `universal.entity`, (6) tipo de despacho recomendado (corporativo / litigio comercial / privacidad / propiedad intelectual / laboral, sin nombres de despachos), (7) qué aceptaríamos como resultado.
4. **Escribe el borrador de forma atómica** (`*.tmp` → renombra):
   - Tipos comerciales → `drafts/{type}/{counterparty-or-candidate}-{YYYY-MM-DD}.md`.
   - `privacy-policy` → `privacy-drafts/privacy-policy-{YYYY-MM-DD}.md`.
   - `tos` → `privacy-drafts/tos-{YYYY-MM-DD}.md`.
   - `dsr-response` → `dsr-responses/{request-id}-{YYYY-MM-DD}/` (carpeta con tres archivos).
   - `escalation-brief` → `escalations/{matter-slug}-{YYYY-MM-DD}.md`.
5. **Copia espejo opcional en Google Docs.** Si `googledocs` está conectado → ofrece un borrador espejo (la skill descubre el slug en tiempo de ejecución, el usuario confirma, se crea el espejo con el enlace de vuelta en el pie del artefacto).
6. **Agrega la entrada a `outputs.json`**, lee, combina y escribe de forma atómica: `{ id, type: "draft" | "privacy-policy" | "tos-draft" | "dsr-response" | "escalation-brief", title, summary, path, status: "draft", domain: "contracts" (comercial) | "compliance" (privacidad/dsr) | "entity" (board-consent) | "advisory" (escalation-brief), createdAt, updatedAt, attorneyReviewRequired? }`.
7. **Resume para el usuario.** Un mensaje corto en lenguaje simple: qué redactaste, que es un borrador para revisar (no firmado ni enviado), y si un abogado de verdad debería revisarlo. Nunca menciones nombres de archivo, rutas, ni el procedimiento interno.

## Lo que nunca hago

- Enviar, presentar, publicar o solicitar la firma de ningún borrador. El fundador entrega, publica, o empaqueta para el abogado. Cada artefacto abre con el sello de una línea "BORRADOR, NO PARA FIRMAR / NO PARA PUBLICAR".
- Inventar una cláusula, un estatuto o un precedente que no pueda citar.
- Nombrar despachos específicos en `escalation-brief`. Solo el tipo de despacho.
- Comprometer plazos en `dsr-response` más allá del reloj estatutario, las fechas que cito son estatutarias, no promesas.
- Usar nombres de herramientas fijos en el código, el descubrimiento con Composio es solo en tiempo de ejecución.
- Omitir `attorneyReviewRequired: true` en anomalías de estructura de compensación, anomalías de matemática de acciones, o huecos en los DPA.

## Resultados

- `drafts/{type}/{slug}-{YYYY-MM-DD}.md` (tipos comerciales).
- `privacy-drafts/privacy-policy-{YYYY-MM-DD}.md` / `tos-{YYYY-MM-DD}.md`.
- `dsr-responses/{request-id}-{YYYY-MM-DD}/` (carpeta de 3 archivos).
- `escalations/{matter-slug}-{YYYY-MM-DD}.md`.
- Se agrega a `outputs.json`.

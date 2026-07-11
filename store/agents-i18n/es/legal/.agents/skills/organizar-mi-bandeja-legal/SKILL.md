---
name: organizar-mi-bandeja-legal
title: "Organizar mi bandeja legal"
description: "Reviso tu bandeja de entrada en busca de asuntos legales (contratos por revisar, NDAs, solicitudes de datos de clientes, cualquier cosa que necesite la atención de un abogado) y te digo qué requiere tu atención y qué no. Solo organizo y resumo, nunca respondo."
version: 1
category: Bandeja de entrada
featured: no
image: scroll
integrations: [gmail, outlook]
---

# Organizar mi bandeja legal

## Cuándo usarlo

- Explícito: "organiza mi bandeja legal", "revisa lo entrante en busca de contratos", "qué correo legal necesita mi atención", "corre la clasificación".
- Implícito: la primera skill que el usuario ejecuta cuando ve una tarjeta de "Necesita tu atención" y pregunta "¿qué me está esperando?".
- Segura para usar bajo demanda: a diario o varias veces por semana para un fundador solo. Ventana por defecto: últimos 7 días si no se especifica.

## Pasos

1. **Lee el contexto compartido**: `context/legal-context.md`. Si falta o está vacío, pregunta al usuario en lenguaje sencillo: "Primero necesito unos datos básicos sobre tu empresa. ¿Quieres configurarlos ahora?" Luego ejecuta `set-up-my-legal-info` si dice que sí. Detente hasta que eso esté hecho.
2. **Lee la configuración**: `config/counterparty-stack.json`. Si tu bandeja no está conectada, pregunta al usuario en lenguaje sencillo: "Necesito conectar tu bandeja de entrada para revisarla. ¿Quieres conectar Gmail u Outlook ahora?" Detente hasta que esté conectada.
3. **Descubre la herramienta de bandeja vía Composio.** Ejecuta `composio search inbox` para obtener el identificador de la herramienta. Confirma que coincide con `counterparty-stack.inboxCategory`.
4. **Trae lo entrante.** Ventana por defecto: últimos 7 días (o N según el usuario). Consulta la bandeja para mensajes probablemente legales: adjuntos de contrato (.pdf, .docx), dominios de remitente de bufetes, palabras clave en el asunto ("NDA", "MSA", "DPA", "DSR", "citatorio", "resolución de la oficina", "términos", "acuerdo"), hilos que responden a correo legal previo.
5. **Clasifica cada elemento.** Aplica la rúbrica, elige un solo grupo:
   - **NDA**: semáforo. **Verde** = mutuo, plazo ≤3 años, alcance razonable, no-solicitud estándar (o ninguno), sin residuales inusuales, sin no competencia, ley aplicable de EE. UU. **Amarillo** = exactamente una desviación (unilateral cuando somos los únicos que revelamos, plazo de 3-5 años, residuales amplios, jurisdicción cercana como Canadá/Reino Unido). **Rojo** = dos o más desviaciones, o cualquiera de: no competencia, cesión de propiedad intelectual, responsabilidad ilimitada, obligaciones de publicidad / comunicado de prensa, plazo mayor a 5 años o perpetuo, ley aplicable no estándar. Por defecto Rojo si el texto no se puede leer con confianza.
   - **MSA / formulario de pedido**: documento marco o de términos comerciales de cliente/proveedor.
   - **DPA**: adenda de procesamiento de datos o términos de datos independientes.
   - **DSR**: solicitud de titular de datos (GDPR Art. 15, CCPA).
   - **citatorio / proceso legal**: citatorio, requerimiento de preservación, cese y desista, retención por litigio.
   - **acción de la oficina de marcas**: acción de la oficina de USPTO o correspondencia de marca.
   - **documento de contratista**: consultoría / contratista / trabajo por encargo entrante de una contraparte.
   - **otro**: cualquier otra cosa con tinte legal (solicitud de certificado de seguro, consulta de privacidad, cuestionario de seguridad de proveedor).
6. **Dirige cada elemento.** Recomienda uno:
   - **manejar directamente vía `draft-a-legal-document`**: solo si el elemento encaja claramente con una plantilla existente (por ejemplo, un NDA Verde con una contraparte conocida).
   - **enviar a `review-a-contract` (mode=full)**: la mayoría de MSA / DPA / formularios de pedido / NDAs Amarillos van aquí.
   - **marcar `attorneyReviewRequired`**: NDAs Rojos, citatorios, cercano a litigio, cualquier cosa ambigua.
   - **ignorar**: spam, boletines, hilos ya resueltos.
7. **Escribe** el resumen en `intake-summaries/{YYYY-MM-DD}.md` de forma atómica (`*.tmp` → renombrar). Estructura: conteos arriba ("7 elementos: 3 NDA, 1 MSA, 1 DSR, 2 otros"), luego una sección por elemento con `From`, `Subject`, `Received`, `Classification`, `One-line summary`, `Recommended route`.
8. **Agrega a `outputs.json`**: lee el arreglo existente, agrega `{ id, type: "intake-summary", title, summary, path, status: "draft", createdAt, updatedAt, attorneyReviewRequired }`. Marca `attorneyReviewRequired: true` si algún elemento está señalado para revisión por abogado.
9. **Resume para el usuario.** Lenguaje sencillo. Un párrafo corto: "Encontré {N} elementos legales. {X} NDAs (con los seguros ya señalados), {Y} contratos de clientes, {Z} que necesitan los ojos de un abogado de verdad. ¿Quieres que redacte respuestas para los seguros, o que revise por completo los contratos de clientes?" Nunca nombres archivos ni rutas.

## Nunca invento

Cada clasificación se basa en un mensaje observado. Si la herramienta de bandeja falló o no devolvió datos, marca UNKNOWN en el resumen, no adivines. Si un adjunto no se puede leer, dilo y pide al usuario que pegue el texto.

## Resultados

- `intake-summaries/{YYYY-MM-DD}.md`
- Se agrega a `outputs.json` con el tipo `intake-summary`.

---
name: responder-un-cuestionario-de-seguridad
title: "Responder un cuestionario de seguridad"
description: "¿Un cliente grande te envió un cuestionario de seguridad? Yo lo leo, completo todo lo que ya sé sobre tu empresa y agrupo el resto por tema para que puedas resolver varias preguntas de una sola vez. Cada respuesta que guardo se reutiliza la próxima vez, así que el segundo cuestionario es mucho más rápido que el primero."
version: 1
category: Cumplimiento
featured: no
image: scroll
integrations: [googlesheets, googledocs, googledrive, airtable]
---


# Responder un cuestionario de seguridad

## Cuándo usar

- Explícito: "ayúdame con este cuestionario de seguridad", "completa esta evaluación de seguridad de proveedor", "clasifica este SIG / CAIQ", "qué puedo responder de este cuestionario", "un cliente enterprise me envió este documento de seguridad".
- Implícito: `sort-my-legal-inbox` clasificó un mensaje entrante como "otro → cuestionario de seguridad de proveedor" y el fundador quiere actuar.
- Un cuestionario por invocación. Varios → llama la skill una vez por cada uno.

## Qué es esto (y qué no es)

**Clasificación + borrador**, extracción rápida del set de preguntas, autocompletado desde la biblioteca de respuestas guardadas del fundador, y una lista agrupada de "lo que aún necesito de ti" para resolver muchas preguntas en una sola sesión. **No** es una auditoría completa del programa de seguridad, **no** es la aprobación final. Cada resultado termina con: "esto es un resumen, no asesoría legal; los cuestionarios de seguridad enterprise a veces implican compromisos contractuales, escala con un abogado externo cualquier cosa con impacto comercial."

## La biblioteca de respuestas

`config/security-answers.md` es la biblioteca persistente y creciente de respuestas del programa de seguridad del fundador. Se acumula con el tiempo, cada cuestionario nuevo potencialmente agrega respuestas. Markdown plano, encabezados por tema + pares de pregunta/respuesta:

```markdown
## Control de acceso
**P: ¿Exiges MFA en todas las cuentas de administrador?**
R: Sí, se requiere MFA en toda la infraestructura de producción (AWS,
   {password-manager}, {git-host}) a través de {provider}. Vigente desde
   {YYYY-MM}.

## Datos en reposo
**P: ¿Los datos de los clientes están encriptados en reposo?**
R: Sí, encriptación AES-256 en reposo mediante el cifrado administrado
   de {provider} en todos los almacenes de datos de clientes.

...
```

Buckets de tema (personalízalos si el cuestionario se desvía): control de acceso, autenticación, datos en reposo, datos en tránsito, residencia de datos, subprocesadores, respaldos y recuperación ante desastres, respuesta a incidentes, ciclo de vida seguro de desarrollo de software, gestión de vulnerabilidades, registro y monitoreo, seguridad del personal (contratación, salida y capacitación), seguridad física (normalmente "No aplica, somos remotos, alojados en {cloud}"), certificaciones de cumplimiento (SOC 2, ISO, HIPAA, GDPR), IA / entrenamiento de modelos, acceso del soporte al cliente a los datos, retención y eliminación de datos.

## Pasos

1. **Lee el contexto compartido**: `context/legal-context.md`. Si falta o está vacío, pregunta al usuario en lenguaje simple: "Necesito conocer algunos datos básicos de tu empresa antes de responder esto bien. ¿Quieres configurarlos ahora?" Luego ejecuta `set-up-my-legal-info` si dice que sí. Detente hasta que eso esté listo. Extrae el nombre de la entidad, la geografía de datos, y los acuerdos vigentes con clientes enterprise que puedan limitar las respuestas.
2. **Lee la biblioteca de respuestas**: `config/security-answers.md`. Si falta, es el primer cuestionario, está bien, la biblioteca se siembra con las respuestas capturadas aquí. Anota en el resultado cuántas respuestas previas tienes a la mano.
3. **Ubica el cuestionario.** Acepta: (a) texto pegado, (b) ruta de archivo (PDF, DOCX, XLSX, CSV), (c) URL o puntero a almacenamiento de documentos conectado, (d) enlace de Google Sheets / Airtable. Si hay una herramienta de almacenamiento de documentos u hoja de cálculo conectada, descúbrela mediante cualquier categoría de almacenamiento de documentos u hojas de cálculo conectada por Composio, y tráela. Si no se proporciona nada, haz UNA pregunta: "Pega el cuestionario, sube el archivo, o dime dónde está en tu almacenamiento de documentos."
4. **Analiza.** Extrae el set de preguntas en un arreglo estructurado: `{ id, section, question, expectedFormat? }`. `id` es un hash estable de `section + question text` para que las re-ejecuciones no renumeren. `expectedFormat` captura la forma de la respuesta si es evidente ("Sí/No", "Texto libre", "Sí/No + comentario", "Adjuntar documento"). Si falla el análisis (PDF escaneado, PDF bloqueado, solo imagen), avisa al usuario y pide una versión con texto extraíble. No adivines.
5. **Autocompleta desde la biblioteca de respuestas.** Para cada pregunta, compárala con `config/security-answers.md`:
   - **Coincidencia exacta**, un par pregunta/respuesta previo con ≥ 90% de coincidencia de tokens, mismo tema → precompleta, márcala con la fuente `"library-exact"`.
   - **Coincidencia cercana**, un par pregunta/respuesta previo del mismo tema, semánticamente equivalente → precompleta, márcala `"library-near"`, señálala para que el fundador la revise rápido.
   - **Sin coincidencia**, déjala en blanco, márcala `"needs-founder"`.
6. **Agrupa lo no respondido por tema.** Usa la lista de buckets de tema de arriba. Meta: que una sola sesión responda tantos `needs-founder` como sea posible. Dentro de cada tema, primero los Sí/No más simples, para ganar terreno rápido.
7. **Redacta el documento de respuesta.** Escríbelo en `security-questionnaires/{counterparty-slug}-{YYYY-MM-DD}.md` de forma atómica (`*.tmp` → renombra). Estructura:
   - Encabezado: contraparte, tipo de cuestionario (SIG-lite / CAIQ / personalizado / etc.), total de preguntas, cantidad precompletada, cantidad que necesita al fundador, coincidencias cercanas que necesitan revisión rápida.
   - **Respuestas precompletadas**, agrupadas por tema, cada una muestra la pregunta, la respuesta, y la etiqueta de fuente (`library-exact` / `library-near`). Las coincidencias cercanas llevan un aviso de una línea: "verifica que esto siga siendo así".
   - **Aún necesito de ti**, agrupado por tema, numerado para responder fácil por chat. Incluye la forma sugerida de respuesta (Sí/No, párrafo corto, adjuntar documento de política).
   - Pie de página: "Esto es un resumen, no asesoría legal. Algunas respuestas en los cuestionarios de seguridad crean compromisos contractuales reales. Si algo tiene un impacto comercial serio, pídeme que prepare un resumen para un abogado externo."
8. **Escribe la lista corta.** También produce una lista corta (≤ 10 elementos) de "lo que necesito de ti ahora", el conjunto mínimo para desbloquear la respuesta. En línea al inicio del documento de respuesta y en el resumen para el usuario.
9. **Captura respuestas nuevas conforme el fundador responde.** Después de que el fundador responde en el chat, agrega o actualiza `config/security-answers.md` de forma atómica:
   - Tema nuevo + pregunta/respuesta → agrégalo bajo el encabezado del tema.
   - Pregunta/respuesta existente que el fundador actualizó → reemplaza la respuesta, anota `(actualizado {YYYY-MM-DD})` en línea.
   - Nunca elimines respuestas previas sin el visto bueno explícito del fundador.
   Actualiza el documento de respuesta con las respuestas recién capturadas, reclasifícalas como `library-exact` de aquí en adelante.
10. **Agrega la entrada a `outputs.json`**, lee el arreglo existente, agrega `{ id, type: "security-questionnaire", title, summary, path, status: "draft", createdAt, updatedAt, attorneyReviewRequired }`. Marca `attorneyReviewRequired: true` si el cuestionario contiene alguna pregunta que implique un compromiso contractual (SLAs de notificación de brechas, SLAs de disponibilidad, compromisos de residencia de datos, derechos de auditoría, indemnizaciones, mínimos de seguro), esas no deberían responderse sin revisión de un abogado externo.
11. **Resume para el usuario.** Lenguaje simple. Un párrafo corto: "El cuestionario de {contraparte} tiene {total} preguntas. Completé {N} con lo que ya sé de tu empresa ({M} necesitan una revisión rápida). {K} preguntas te necesitan a ti. ¿Quieres resolver primero la sección de {tema}?" Nunca menciones archivos ni rutas.

## Nunca inventar

- Nunca inventes un control de seguridad que el fundador no haya confirmado. "No" o "Todavía no" es la respuesta correcta hasta que el fundador lo implemente, un "Sí" falso es la forma en que los fundadores incumplen contratos que ni sabían que habían firmado.
- Nunca normalices respuestas sensibles. El fundador dice "Postgres en RDS, encriptado" → el documento de respuesta dice "Postgres en RDS, encriptado", no "base de datos administrada con cifrado en reposo, estándar de la industria." La especificidad importa para los compradores enterprise y para auditorías posteriores.
- Nunca uses rodeos como "probablemente" o "es posible que". Declara la respuesta o márcala `needs-founder`.

## Prohibiciones estrictas

- Nunca envío, comparto ni devuelvo el cuestionario a la contraparte. Cada borrador es para que el fundador lo revise y lo envíe.
- Nunca doy asesoría legal que no esté claramente marcada como resumen. La línea del pie de página no es negociable.
- Nunca comprometo al fundador con un plazo, un SLA, una cifra de disponibilidad, una cobertura de seguro o un estatus de certificación sin su confirmación explícita.
- Nunca uso nombres de herramientas fijos en el código. Las búsquedas del cuestionario pasan por cualquier categoría de almacenamiento de documentos u hojas de cálculo conectada por Composio.
- Nunca trato la lista de buckets de tema como exhaustiva, si aparece un tema nuevo en el cuestionario, lo agrego a la agrupación y lo anoto en el resultado para que la biblioteca crezca.

## Resultados

- `security-questionnaires/{counterparty-slug}-{YYYY-MM-DD}.md`, borrador de respuesta + lista de lo que necesitas.
- Agrega / actualiza `config/security-answers.md`, la biblioteca persistente de respuestas.
- Se agrega a `outputs.json` con el tipo `security-questionnaire`.

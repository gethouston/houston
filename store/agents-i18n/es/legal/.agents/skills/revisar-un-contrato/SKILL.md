---
name: revisar-un-contrato
title: "Revisar un contrato"
description: "Leo un contrato que alguien te envió y te digo qué contiene. Elige qué tan a fondo: un veredicto rápido sobre si es seguro firmarlo, una revisión rápida de NDA, o un mapa cláusula por cláusula sin veredicto. Cada cláusula que necesita atención recibe una nota clara y, cuando hace falta, una redacción sugerida para objetar."
version: 1
category: Contratos
featured: yes
image: scroll
integrations: [googledocs, googledrive, notion, firecrawl]
---

# Revisar un contrato

Una sola skill para la primera lectura de un contrato de contraparte. `mode` elige la profundidad. Comparte la extracción estructurada de cláusulas y la disciplina de "nunca inventar un estándar de cláusula que no pueda citar".

## Parámetro: `mode`

- `full`: revisión completa de MSA / DPA / formulario de pedido: mapa de cláusulas + veredicto por cláusula Verde (aceptar) / Amarillo (objeción opcional) / Rojo (objeción obligatoria) + resumen en español sencillo + recomendación de aceptar / objetar / retirarse. Escribe en `contract-reviews/{counterparty}-{YYYY-MM-DD}.md`.
- `nda-traffic-light`: rúbrica rápida de 6 dimensiones para NDAs entrantes (plazo, mutualidad, definición de información confidencial, excepciones, jurisdicción, no-solicitud encubierta, devolución/destrucción). Escribe en `ndas/{counterparty-slug}-{YYYY-MM-DD}.md` con objeciones específicas en cada punto Rojo.
- `clauses-only`: extracción estructurada, sin veredicto. Lee el contrato suministrado (archivo / URL / texto pegado), extrae las cláusulas que importan (plazo, terminación, renovación, tope de responsabilidad, indemnización, propiedad intelectual, ley aplicable, DPA, entrenamiento de IA, residencia de datos, derechos de salida), escribe un mapa legible en `clause-extracts/{counterparty}-{YYYY-MM-DD}.md`, actualiza `counterparty-tracker.json` con los campos clave.

Si el usuario nombra el modo en lenguaje sencillo ("hazle semáforo a esto", "solo extrae las cláusulas", "revisión completa con veredicto") → infiere. Si es ambiguo → haz UNA pregunta nombrando las 3 opciones.

## Cuándo usarlo

- Explícito: "revisa este contrato", "hazle semáforo a este NDA", "¿se puede firmar?", "qué dice este acuerdo", "extrae las cláusulas".
- Las solicitudes en lenguaje sencillo se traducen a un `mode`: "revisa completo este contrato de cliente / MSA" / "¿es seguro firmar este MSA?" → `full`; "revisión rápida de este NDA" / "¿está bien firmar este NDA?" → `nda-traffic-light`; "solo muéstrame las cláusulas" / "extrae las cláusulas, sin veredicto" / "revisa la cláusula de propiedad intelectual" (ejecuta `full` y encabeza con la sección de propiedad intelectual) → `clauses-only` o `full` con foco en propiedad intelectual.
- Implícito: llamado por `sort-my-legal-inbox` cuando detecta un MSA / NDA / DPA y lo dirige a revisión. Se encadena con `plan-contract-pushback` cuando el resultado tiene algún punto Rojo.

## Campos del registro que leo

Lee primero `config/context-ledger.json`.

- `universal.legalContext` + `context/legal-context.md`: requerido. Aporta la entidad (verificación de compatibilidad de ley aplicable), acuerdos vigentes (comparación plantilla vs. mercado), riesgos abiertos, postura de riesgo del fundador. Si falta `context/legal-context.md`, ejecuta primero la skill `set-up-my-legal-info` (o haz UNA pregunta puntual para avanzar).
- `universal.posture.risk`: define el umbral entre Amarillo y Rojo. La postura `lean` acepta más puntos Amarillos, la postura `conservative` convierte los Amarillos marginales en Rojos.
- `domains.contracts.counterpartyStack`: si la contraparte está en la pila de contrapartes vigentes, hace referencia a los términos ya ejecutados antes.
- `domains.contracts.documentStorage`: así sé de dónde leer el contrato (Google Drive, Dropbox, Notion).

Si falta un campo requerido, haz UNA pregunta puntual con una pista de modalidad (conectar Google Drive / pegar el texto del contrato / URL a un PDF público), escríbelo, continúa.

## Pasos

1. **Lee el registro y el contexto legal.** Reúne los campos requeridos que falten según lo anterior. Escribe de forma atómica.
2. **Consigue el contrato.** Prioridad: almacenamiento de documentos conectado (Google Drive) > URL + extracción con Firecrawl > archivo subido > texto pegado. Si solo hay un PDF y ninguna herramienta de extracción de texto está conectada, dilo y pide una versión con texto extraíble.
3. **Descubre herramientas vía Composio.** Ejecuta `composio search document-storage` / `composio search web-scrape` según haga falta. Sin conexión + el contrato es una URL → pide al usuario que pegue el texto.
4. **Ramifica según `mode`.**
   - `full`: extrae el mapa de cláusulas (ver `clauses-only` abajo), califica cada cláusula frente al estándar de mercado para una empresa en etapa de fundador solo:
     - **Verde**: aceptar tal como está.
     - **Amarillo**: objeción opcional, no obligatoria.
     - **Rojo**: objeción obligatoria antes de firmar.
     Produce: resumen ejecutivo (2-3 oraciones), tabla cláusula por cláusula (Cláusula | Texto de la contraparte | Veredicto | Por qué | Objeción sugerida si es Rojo), recomendación general (Aceptar / Objetar / Retirarse). Cualquier cláusula fuera del rango de confianza (excepción de propiedad intelectual inusual, estructura de indemnización compleja, adenda de protección de datos no estándar) → marca `attorneyReviewRequired: true` y recomienda encadenar con `draft-a-legal-document` type=escalation-brief.
   - `nda-traffic-light`: aplica la rúbrica de 7 dimensiones:
     1. **Plazo** (indefinido = Rojo, más de 5 años = Amarillo).
     2. **Mutualidad** (unilateral desde la parte más grande = Amarillo, unilateral desde nosotros = Verde si somos quien revela, Rojo si no).
     3. **Definición de información confidencial** (demasiado amplia = Rojo, falta la exclusión de información de dominio público = Rojo).
     4. **Excepciones** (cláusula de conocimiento residual = Rojo, proceso legal estándar + desarrollo independiente = Verde).
     5. **Jurisdicción** (estado de la contraparte fuera de EE. UU. = Amarillo, país fuera de EE. UU. = Rojo, Delaware / California / NY = Verde).
     6. **No-solicitud encubierta** (no-solicitud de empleados escondida en el NDA = Rojo; señálalo explícitamente).
     7. **Devolución/destrucción** (falta = Amarillo, requisito de certificación a 30 días = Amarillo, a 5 días = Rojo).
     Escribe una objeción específica para cada punto Rojo (no un genérico "te enviaremos nuestro formulario"). Produce un resumen de un párrafo + veredicto + objeciones.
   - `clauses-only`: sin veredicto. Extrae cláusula por cláusula:
     - Partes, fecha de entrada en vigor, plazo, renovación automática, periodo de aviso.
     - Términos de pago, tabla de tarifas, manejo de impuestos.
     - Terminación (por conveniencia, por causa, periodo de aviso).
     - Tope de responsabilidad (por reclamo / anual / ilimitado / supertope).
     - Indemnización (mutua / unilateral, excepciones, proceso).
     - Propiedad intelectual (producto del trabajo, cesión, propiedad intelectual previa, retroalimentación).
     - DPA / manejo de datos (mecanismo de transferencia, subprocesadores, SCC).
     - Entrenamiento de IA / uso de datos (exclusión explícita, derechos de entrenamiento).
     - Residencia de datos, ley aplicable, foro de disputas, arbitraje.
     - Derechos de salida (devolución / destrucción de datos, ventana de transición).
     - Cesión, cambio de control, obligaciones derivadas.
     Cada cláusula: texto de la contraparte (citado) + paráfrasis en español sencillo + nota de "qué vigilar" de una línea (sin veredicto).
5. **Actualiza `counterparty-tracker.json`** (en todos los modos): lee, combina y escribe de forma atómica. Agrega o actualiza la fila de la contraparte con los campos estructurales extraídos (tipo, plazo, renovación automática, periodo de aviso, ley aplicable, fecha de renovación si se puede calcular).
6. **Escribe el artefacto de forma atómica** (`*.tmp` → renombrar):
   - `full` → `contract-reviews/{counterparty-slug}-{YYYY-MM-DD}.md`.
   - `nda-traffic-light` → `ndas/{counterparty-slug}-{YYYY-MM-DD}.md`.
   - `clauses-only` → `clause-extracts/{counterparty-slug}-{YYYY-MM-DD}.md`.
7. **Agrega a `outputs.json`**: lee, combina y escribe de forma atómica: `{ id (uuid v4), type: "contract-review" | "nda-review" | "clause-extract", title, summary, path, status: "ready", domain: "contracts", createdAt, updatedAt, attorneyReviewRequired? }`.
8. **Resume para el usuario.** Un párrafo corto en lenguaje sencillo: el veredicto general (o "sin veredicto" si fue solo extracción) y lo que más resalta. Si algo es un punto de ruptura, ofrece el siguiente paso con claridad: "¿Quiero que planeemos la objeción?" Nunca nombres archivos, rutas ni procedimientos internos.

## Lo que nunca hago

- Inventar un estándar de cláusula que no pueda citar. Si el estándar de mercado para un plazo no está claro, márcalo como UNKNOWN, recomienda revisión por abogado.
- Dar la asesoría legal final. Toda revisión `full` incluye el descargo "esta es una primera pasada, se recomienda revisión por abogado para cláusulas fuera de lo rutinario".
- Dar un veredicto sobre una cláusula que en realidad no extraje. Si se menciona un DPA pero no está adjunto, marca la sección del DPA como UNKNOWN.
- Fijar nombres de herramientas de antemano: el descubrimiento vía Composio es siempre en tiempo real.
- Sobrescribir `counterparty-tracker.json`: siempre lee, combina y escribe.

## Resultados

- `contract-reviews/{counterparty}-{YYYY-MM-DD}.md` (mode=full).
- `ndas/{counterparty-slug}-{YYYY-MM-DD}.md` (mode=nda-traffic-light).
- `clause-extracts/{counterparty}-{YYYY-MM-DD}.md` (mode=clauses-only).
- Actualiza `counterparty-tracker.json` (en todos los modos).
- Se agrega a `outputs.json`.

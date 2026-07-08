---
name: seguir-plazos-y-firmas
title: "Seguir plazos y firmas"
description: "Mantén el control de lo que está pendiente en el lado legal. Elige lo que necesitas: dar seguimiento a firmas pendientes, registrar un acuerdo recién firmado, ver qué plazos se aproximan, o recibir un resumen de la semana cada lunes. Yo llevo una lista continua para que nada se te escape."
version: 1
category: Seguimiento
featured: no
image: scroll
integrations: [googledrive, gmail, notion]
---

# Seguir plazos y firmas

Una sola skill para cada rastreador de estado permanente que mantiene el agente. El parámetro `scope` elige el rastreador; se comparte la disciplina de lectura-combinación-escritura atómica.

## Parámetro: `scope`

- `signatures`: vigila la plataforma de firma conectada (DocuSign / PandaDoc / HelloSign) en busca de documentos pendientes. Redacta recordatorios amables para los rezagados (nunca los envía). Archiva las copias ejecutadas en el almacenamiento de documentos conectado (Google Drive / Dropbox / Notion). Escribe el tablero de estado en `signature-status/{YYYY-MM-DD}.md`.
- `counterparties`: agrega el acuerdo ejecutado a `counterparty-tracker.json` en la raíz del agente. Campos: `id`, `counterparty`, `agreementType`, `executedDate`, `effectiveDate`, `term`, `autoRenewal`, `noticePeriod`, `governingLaw`, `keyObligations`, `renewalDate`, `signedCopyPath`. Alimenta el `scope` de `deadlines` (reloj de renovación) y el de `weekly-review` (resumen).
- `deadlines`: siembra y actualiza el calendario legal canónico. Plazos estáticos (reporte anual de Delaware el 1 de marzo, 83(b) a 30 días desde la concesión, actualización del 409A cada 12 meses, DSR a 30 días GDPR / 45 días CCPA, acción de la oficina de marcas a 6 meses, consentimiento anual de la junta) + plazos dinámicos de `counterparty-tracker.json` (relojes de renovación, ventanas de aviso). Escribe `deadline-calendar.json` en la raíz del agente + una lectura de 90 días en `deadline-summaries/{YYYY-MM-DD}.md`. Marca como urgente lo que quede ≤ 30 días, crítico lo vencido.
- `weekly-review`: agrega en todo el agente leyendo `outputs.json`: qué se entregó esta semana (revisiones de contrato, borradores, auditorías, presentaciones), qué está pendiente de firma (de lo más reciente en `signature-status/`), próximo plazo (de `deadline-calendar.json`), qué quedó marcado para revisión por abogado (entradas `attorneyReviewRequired: true` sin resolver). Escribe `weekly-reviews/{YYYY-MM-DD}.md`.

Si el usuario nombra el `scope` en lenguaje sencillo ("persigue las firmas", "registra este trato", "qué está pendiente", "revisión del lunes"), infiere. Si es ambiguo, haz UNA pregunta nombrando las 4 opciones.

## Cuándo usarlo

- Explícito: "dónde están mis firmas", "registra el {type} recién firmado de {counterparty}", "qué está pendiente o vencido", "revisión legal del lunes", "resumen legal semanal".
- Las solicitudes en lenguaje sencillo se traducen a un `scope`: "presiona / persigue las firmas pendientes" / "quién no ha firmado todavía" → `signatures`; "acabo de firmar algo, regístralo" / "registra este acuerdo firmado" / "sigue esta renovación automática" → `counterparties`; "revisa mis plazos legales" / "qué se viene en los próximos 90 días" → `deadlines`; "revisión legal semanal" / "resumen del lunes" → `weekly-review`.
- Implícito: encadenado desde `review-a-contract` (cualquier modo) hacia `counterparties` cuando un contrato llega a estado ejecutado; desde rutinas programadas para `weekly-review` + `deadlines`; desde `sort-my-legal-inbox` cuando detecta un adjunto de copia ejecutada para `counterparties`.

## Campos del registro que leo

Lee primero `config/context-ledger.json`.

- `universal.legalContext` + `context/legal-context.md`: recomendado, no requerido. Enriquece `weekly-review` con el contexto vigente. Si falta y el `scope` es `weekly-review`, ejecuta la skill `set-up-my-legal-info` o continúa con una nota.
- `universal.entity`: requerido para `deadlines` (la fecha de constitución determina la relevancia del 1 de marzo de Delaware; la fecha del 409A fija el reloj de 12 meses).
- `domains.contracts.signingPlatform`: requerido para `signatures`. Si falta, haz UNA pregunta: conectar DocuSign / PandaDoc / HelloSign o pegar el estado.
- `domains.contracts.documentStorage`: requerido para `signatures` (dónde archivar las copias ejecutadas) y para `counterparties` (dónde vive la copia firmada, `signedCopyPath`).
- `counterparty-tracker.json`: requerido para `counterparties` (lectura-combinación-escritura) + `deadlines` (fuente de los relojes de renovación dinámicos) + `weekly-review` (registros nuevos de esta semana).
- `deadline-calendar.json`: requerido para `deadlines` (línea base contra la cual comparar) + `weekly-review` (próximo plazo por mostrar).
- `outputs.json`: requerido para `weekly-review` (fuente del resumen).

Si falta algún campo requerido, haz UNA pregunta puntual con la pista de modalidad correcta, escríbelo, continúa.

## Pasos

1. **Lee el registro y los archivos de estado.** Reúne los campos requeridos que falten según lo anterior. Escribe de forma atómica.
2. **Descubre herramientas vía Composio.** `composio search signing-platform` (signatures), `composio search document-storage` (signatures + counterparties). No hace falta descubrimiento para `deadlines` ni `weekly-review` (son solo operaciones de archivo).
3. **Ramifica según `scope`.**
   - `signatures`:
     1. Ejecuta el identificador de la plataforma de firma: lista los sobres pendientes. Para cada uno: destinatario, fecha de envío, días abierto, estado de última visualización.
     2. Redacta un recordatorio amable por cada rezagado (más de 5 días abierto). Nunca lo envíes: los borradores van al tablero de estado para que el fundador los envíe.
     3. Para los sobres ejecutados, obtén el PDF vía el identificador de la plataforma de firma. Ejecuta el identificador de almacenamiento de documentos para guardarlo en una ruta conocida (`contracts/executed/{counterparty}-{YYYY-MM-DD}.pdf`).
     4. Escribe `signature-status/{YYYY-MM-DD}.md`: tres secciones, Pendientes (+ recordatorios) / Ejecutados recientemente (+ rutas) / Estancados (más de 14 días abierto, recomienda contacto o retirar). Para cada sobre ejecutado, recomienda encadenar con `track-deadlines-and-signatures` scope=counterparties para registrarlo.
   - `counterparties`:
     1. Toma como entrada: nombre de la contraparte, tipo de acuerdo, fecha de ejecución, fecha de entrada en vigor, plazo, renovación automática, periodo de aviso, ley aplicable, obligaciones clave (breve), ruta de la copia firmada. Haz UNA pregunta por cada campo que falte.
     2. Calcula `renewalDate` a partir de `effectiveDate + term - noticePeriod` (fecha crítica: cuándo hay que dar aviso para evitar la renovación automática).
     3. Lee, combina y escribe `counterparty-tracker.json` de forma atómica. No sobrescribas filas existentes: el `id` es estable; actualiza en el lugar si coincide.
     4. Agrega a `outputs.json` como `type: "counterparty-log"`.
   - `deadlines`:
     1. Parte del conjunto canónico de plazos estáticos:
        - **Reporte anual de Delaware**: 1 de marzo de cada año (condicionado a que `universal.entity.state === "DE"`).
        - **Ventana de elección 83(b)**: 30 días desde cada concesión de opciones / compra restringida de acciones de fundador. Fuente: entradas de `outputs.json` de concesiones recientes.
        - **Actualización del 409A**: 12 meses desde `universal.entity.four09aDate`.
        - **Ventana de respuesta DSR**: 30 días (GDPR Art. 15) / 45 días (CCPA); se rastrea desde cualquier entrada `dsr-response` en `outputs.json`.
        - **Respuesta a acción de la oficina de marcas**: 6 meses desde cada acción de la oficina; condicionado a `domains.ip.marks`.
        - **Consentimiento anual de la junta**: 365 días desde el último consentimiento de la junta.
     2. Enriquece con plazos dinámicos de `counterparty-tracker.json`: para cada fila abierta, calcula `renewalDate` + fecha límite de aviso (= `renewalDate - noticePeriod`).
     3. Lee, combina y escribe `deadline-calendar.json`: `id`, `kind`, `label`, `due`, `source`, `authority`, `urgency` (crítico si está vencido o ≤ 30 días; alto ≤ 90 días; medio ≤ 180 días; bajo > 180 días).
     4. Escribe `deadline-summaries/{YYYY-MM-DD}.md`: lectura de 90 días. Crítico y Alto primero; para cada uno, cita la autoridad (por ejemplo, "8 Del. C. §503", "IRC §83(b)", "GDPR Art. 15").
     5. Agrega a `outputs.json` como `type: "deadline-summary"`.
   - `weekly-review`:
     1. Lee `outputs.json`. Filtra a las entradas con `createdAt` o `updatedAt` dentro de los últimos 7 días.
     2. Agrupa por `domain` (contracts / compliance / entity / ip / advisory). Para cada uno: qué se entregó, títulos + rutas.
     3. Lee el `signature-status/` más reciente: muestra las firmas pendientes y las estancadas.
     4. Lee `deadline-calendar.json`: los próximos 3 plazos por urgencia.
     5. Muestra cualquier entrada `attorneyReviewRequired: true` que todavía no tenga un seguimiento de `escalation-brief`.
     6. Escribe `weekly-reviews/{YYYY-MM-DD}.md`: secciones, Qué se entregó (por dominio) / Firmas pendientes / Próximos 3 plazos / Pendientes de revisión por abogado / Próximos pasos recomendados.
     7. Agrega a `outputs.json` como `type: "weekly-review"`.
4. **Escrituras atómicas en todas partes** (`*.tmp` → renombrar).
5. **Resume para el usuario.** Un párrafo corto en lenguaje sencillo: lo más importante de esta corrida (el plazo que necesita conocer, las firmas todavía pendientes, qué se entregó esta semana). Nunca nombres archivos ni rutas.

## Lo que nunca hago

- Enviar recordatorios, solicitar firmas, o archivar copias ejecutadas fuera del almacenamiento de documentos configurado. Todo artefacto "enviable" queda como borrador en el tablero de estado.
- Inventar una contraparte, plazo o fecha límite. Si el campo no está en la entrada ni en el archivo fuente, márcalo como UNKNOWN / TBD y haz UNA pregunta puntual.
- Prometer que la renovación automática no se activará: las fechas que cito son mecánicas, el fundador decide si envía el aviso.
- Sobrescribir `counterparty-tracker.json` o `deadline-calendar.json`: siempre lee, combina y escribe.
- Citar un plazo estatutario sin nombrar la autoridad (GDPR Art. 15, IRC §83(b), 8 Del. C. §503, etc.).
- Fijar nombres de herramientas de antemano: el descubrimiento vía Composio es siempre en tiempo real.

## Resultados

- `signature-status/{YYYY-MM-DD}.md` (scope=signatures).
- Actualiza `counterparty-tracker.json` (scope=counterparties).
- `deadline-summaries/{YYYY-MM-DD}.md` + actualiza `deadline-calendar.json` (scope=deadlines).
- `weekly-reviews/{YYYY-MM-DD}.md` (scope=weekly-review).
- Se agrega a `outputs.json`.

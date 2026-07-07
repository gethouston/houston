---
name: leer-un-contrato
title: "Leer un contrato"
description: "Extrae las cláusulas estándar de un contrato o de toda una carpeta de contratos sin que tengas que leer el lenguaje legal tú mismo. Extraigo los límites de responsabilidad, los términos de terminación, la renovación automática, los términos de pago, la propiedad intelectual, el manejo de datos, los compromisos de disponibilidad y la exclusividad, cada uno con la cita textual, un resumen en lenguaje simple y una advertencia sobre cualquier cosa desfavorable para tu postura frente a proveedores. El calendario de renovaciones se actualiza automáticamente."
version: 1
category: Operaciones
featured: no
image: clipboard
integrations: [googledrive]
---


# Leer un contrato

## Cuándo usarla

- "saca la cláusula de {clause} de este contrato" (un solo documento).
- "cuáles son los términos de renovación automática en cada contrato de esta carpeta" (por lote).
- "extrae el límite de responsabilidad y el lenguaje de terminación del contrato marco de servicios de {vendor}".

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta habilidad verifico que las categorías de abajo estén vinculadas. Si falta alguna, nombro la categoría, te pido conectarla desde la pestaña de Integraciones y me detengo.

- **Archivos** (Google Drive)  -  Obligatorio para corridas por lote y búsquedas por proveedor nombrado. Aquí escaneo carpetas o contratos nombrados.
- **Procesamiento de documentos** (OCR o extracción de texto de PDF)  -  Obligatorio. Saca el texto real de PDFs escaneados o nativos para poder extraer las cláusulas textualmente.

Si no hay un proveedor de archivos conectado y no pegaste el contrato, me detengo y te pido conectar Google Drive o pegar el documento.

## Información que necesito

Primero leo tu contexto de operaciones. Por cada campo obligatorio que falte hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **El contrato en sí**  -  Obligatorio. Por qué lo necesito: no puedo extraer de la nada. Si falta, pregunto: "Comparte el contrato o indícame la carpeta. Sirve un PDF, un Word o un Google Doc."
- **Postura frente a proveedores**  -  Obligatorio. Por qué la necesito: me dice qué términos cuentan como advertencia. Una postura conservadora marca con más agresividad que una de riesgo rápido. Si falta, pregunto: "¿Cómo enfrentas los términos con proveedores, conservador, equilibrado o avanzar rápido?"
- **Documento de contexto operativo**  -  Obligatorio. Por qué lo necesito: ancla tus líneas rojas para poder marcar cláusulas que las violarían. Si falta, pregunto: "¿Quieres que primero configure tu contexto operativo? Me ayuda a detectar términos desfavorables con más confianza."

## Pasos

1. **Leo `context/operations-context.md`.** Si falta: me detengo y te pido correr primero la habilidad `set-up-my-ops-info`. La postura frente a proveedores + las líneas rojas anclan las advertencias de "términos desfavorables".

2. **Leo `config/procurement.json`**  -  la postura de aprobación decide qué términos merecen advertencia (un fundador conservador marca más; uno de riesgo rápido marca solo lo verdaderamente grave).

3. **Identifico el o los contratos objetivo.**
   - Archivo único: pegas el texto, compartes una URL o señalas un archivo en el drive conectado.
   - Por lote (carpeta): `composio search drive` → listo los archivos de la carpeta indicada → filtro a los que parecen contratos (PDF/DOCX/DOC).
   - Proveedor nombrado: busco primero en `contracts/`; si no está, busco en el drive vía `composio search drive`.

4. **Analizo cada contrato.** Uso `composio search doc-processing` para encontrar la mejor herramienta de procesamiento según el formato (OCR para PDFs escaneados, extractor de texto para PDFs nativos, lector de DOCX). Ejecuto por slug y saco el texto completo.

5. **Extraigo las cláusulas estándar.** Por contrato, ubico y extraigo:
   - **Límite de responsabilidad**  -  cita + monto del límite + excepciones.
   - **Terminación**  -  términos por causa, términos por conveniencia, ventanas de aviso.
   - **Renovación automática**  -  presencia, duración del término, ventana de aviso para no renovar.
   - **Términos de pago**  -  monto, frecuencia, ajustes / excedentes, cargos por mora.
   - **Propiedad intelectual**  -  quién es dueño del trabajo producido, reglas de IP preexistente.
   - **Manejo de datos / acuerdo de procesamiento de datos**  -  presencia del acuerdo de procesamiento de datos, residencia de datos, compromiso de tiempo de respuesta ante brechas.
   - **Compromiso de disponibilidad**  -  compromiso de disponibilidad, remedios.
   - **Exclusividad / no competencia**  -  presencia + alcance.

   Por cláusula: **cita textual** + **resumen de 1 línea en lenguaje simple** + **advertencia de 1 línea** si es inusual o desfavorable según tu postura frente a proveedores. Si la cláusula no existe, la marco `ABSENT` de forma explícita: nunca la omito.

6. **Escribo** en `contracts/{vendor-slug}-{YYYY-MM-DD}.md` la extracción completa. Corridas por lote: un archivo por contrato + `contracts/batch-{YYYY-MM-DD}-summary.md` que consolida las advertencias de todo el lote.

7. **Actualizo el calendario de renovaciones.** Si el contrato tiene fecha de renovación, invoco internamente la habilidad `track-my-renewals` (o anoto que `track-my-renewals` debe volver a correr) y agrego o actualizo la entrada en `renewals/calendar.md`.

8. **Escrituras atómicas**  -  `*.tmp` → renombrar.

9. **Agrego a `outputs.json`** con `type: "contract"`, estado "ready" por contrato. Por lote: una entrada `contract` para el resumen + una por cada contrato procesado.

10. **Te resumo**  -  la advertencia #1 que más merece tu atención como fundador (p. ej. "la renovación automática es en 11 días y la ventana de aviso es de 30 días: ya es demasiado tarde para frenar esta"). Ruta al archivo o archivos.

## Salidas

- `contracts/{vendor-slug}-{YYYY-MM-DD}.md` (uno por contrato)
- Opcional `contracts/batch-{YYYY-MM-DD}-summary.md` (corridas por lote)
- Actualizaciones en `renewals/calendar.md`
- Agrega entradas a `outputs.json` con `type: "contract"`.

## Lo que nunca hago

- **Firmar** o aceptar un contrato.
- **Inventar** cláusulas. Si el contrato no tiene límite de responsabilidad, lo marco `ABSENT`.
- **Interpretar legalmente.** Marco para tu atención como fundador; tú consultas con tu equipo legal.

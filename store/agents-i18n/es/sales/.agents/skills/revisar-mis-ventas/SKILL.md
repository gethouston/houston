---
name: revisar-mis-ventas
title: "Revisar mis ventas"
description: "Obtén un diagnóstico real de cómo va tu proceso de ventas. Elige lo que necesitas: un resumen de lunes en todos los frentes, una síntesis entre llamadas con ajustes al playbook, una lectura de patrones de ganados y perdidos, un análisis profundo de una llamada de descubrimiento específica, o una foto del pipeline con la etapa que más se filtra. Cada lectura termina con una acción concreta a seguir, no con un dashboard."
version: 1
category: Ventas
featured: yes
image: handshake
integrations: [hubspot, salesforce, attio, gong, fireflies]
---


# Revisar mis ventas

Una skill, cinco superficies de análisis. El parámetro `subject` elige el alcance. Comparten la disciplina de "siguientes pasos por encima de dashboards".

## Parámetro: `subject`

- `sales-health`  -  lectura del lunes. Junto todas las salidas de skills de la última semana desde `outputs.json`. Agrupo por dominio (Playbook, Outbound, Inbound, Meetings, CRM, Retention). Marco trabajo estancado + seguimientos perdidos + retrasos.
- `call-insights`  -  síntesis cruzando N llamadas: lenguaje de dolor, frecuencia de objeciones, patrones de ganados/perdidos, con sugerencias concretas de ajustes al playbook.
- `win-loss`  -  agrupo los negocios ganados y perdidos por razón. Encuentro 3 patrones que se repiten. Propongo ajustes al playbook (afinar el cliente ideal, agregar entradas al manual de objeciones, ajustes de precio).
- `discovery-call`  -  análisis profundo de una sola llamada: talk-ratio (objetivo 40% vendedor / 60% prospecto), puntaje de dolor, brechas de calificación frente al marco del playbook, riesgos / oportunidades, borrador de seguimiento.
- `pipeline`  -  foto por etapa + ingreso anual + velocidad de negocios + la transición que más se filtra. Ancla el forecast semanal.

Si el usuario nombra el sujeto en lenguaje simple ("revisión de ventas", "analiza mis llamadas", "ganados y perdidos", "cómo salió esa llamada", "revisión de pipeline") lo infiero. Si no, hago UNA pregunta nombrando las 5 opciones.

## Cuándo usarlo

- Disparadores explícitos en la descripción.
- Implícito: `capture-my-call-notes` encadena a `check-my-sales subject=discovery-call` para completar el ciclo post-llamada. La rutina semanal "revisión de ventas del lunes" dispara `subject=sales-health`. `run-my-forecast` encadena a `subject=pipeline` para la capa narrativa.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta skill reviso que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña Integraciones, y me detengo.

- **Reuniones**  -  para traer las transcripciones de llamadas para `discovery-call` y `call-insights`. Obligatorio para esos sujetos.
- **CRM**  -  para traer los negocios ganados/perdidos para `win-loss` y la foto de negocios abiertos para `pipeline`. Obligatorio para esos sujetos.

Si ninguna de las categorías obligatorias está conectada, me detengo y te pido conectar primero tu grabadora de llamadas (Gong o Fireflies), porque la mayoría de las solicitudes caen en sujetos que dependen de llamadas.

## Información que necesito

Primero leo tu contexto de ventas. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > pegar texto) y espero.

- **Tu playbook de ventas**  -  Obligatorio. Por qué lo necesito: el marco de calificación, las etapas de negocio, y el manual de objeciones fundamentan cada lectura. Si falta, pregunto: "Todavía no tengo tu playbook, ¿quieres que lo redacte ahora? Toma unos 5 minutos."
- **Grabadora de llamadas conectada**  -  Obligatorio para `discovery-call` y `call-insights`. Por qué lo necesito: leo la transcripción para puntuar el talk-ratio y sacar a la luz el lenguaje de dolor. Si falta, pregunto: "Conecta Gong o Fireflies, o pega la transcripción aquí."
- **CRM conectado**  -  Obligatorio para `win-loss` y `pipeline`. Por qué lo necesito: traigo los negocios cerrados y las fotos por etapa. Si falta, pregunto: "Conecta tu CRM (HubSpot, Salesforce, Attio, Pipedrive, o Close), o pega una lista reciente de etapas."

## Pasos

1. **Leer el registro + el playbook.** Reúno los campos obligatorios que falten (UNA pregunta cada uno, mejor modalidad primero). Escribo de forma atómica.

2. **Ramificar según el sujeto.**
   - `sales-health`: leo `outputs.json` de los últimos 7 días (o la ventana que indique el usuario). Agrupo por dominio. Por dominio, muestro (a) qué se entregó (títulos + rutas), (b) qué está estancado (elementos `status: draft` de más de 7 días + sin `updatedAt` en 3+ semanas), (c) la siguiente acción más útil. Termino con **las 3 acciones principales de la semana** entre todos los dominios.
   - `call-insights`: leo `calls/*/notes-*.md` + `analysis-*.md` de las últimas N llamadas (10 por defecto, el usuario puede cambiarlo). Extraigo: las 5 frases de dolor principales (textuales, con conteo de frecuencia), las 5 objeciones principales (con conteo de frecuencia + el mejor replanteamiento actual), temas de ganados/perdidos (qué funcionó vs qué se estancó). Termino con sugerencias concretas de ajuste al playbook: "agregar el dolor X al perfil de cliente ideal", "reescribir la entrada de objeción Y en el manual", "afinar el pilar de calificación Z". Guardo en `call-insights/{YYYY-MM-DD}.md`.
   - `win-loss`: traigo los negocios ganados y perdidos del CRM (se recomienda ≥5 de cada uno; aviso si son menos). Los agrupo por razón. Encuentro 3 patrones. Propongo ajustes al playbook. Guardo en `analyses/win-loss-{YYYY-MM-DD}.md`.
   - `discovery-call`: leo el `calls/{slug}/notes-*.md` más reciente (o pido el id de la llamada). Calculo el talk-ratio a partir de la transcripción si está disponible (etiquetas de hablante), si no, lo estimo por densidad de notas. Puntúo cada pilar de calificación de 0 a 3 frente al marco del playbook. Muestro riesgos (objeciones sin responder, interesado clave faltante, pilar estancado) + oportunidades (señal de expansión, champion fuerte, presión de tiempos). Termino con un borrador de seguimiento (lo entrego a `write-my-outreach stage=followup` o lo redacto en línea). Guardo en `calls/{slug}/analysis-{YYYY-MM-DD}.md`.
   - `pipeline`: traigo la foto de negocios abiertos del CRM. Por etapa: cantidad, ingreso anual, tiempo promedio en la etapa, conversión de una etapa a la siguiente. Marco la transición que más se filtra. Comparo contra la foto de la semana pasada si existe `pipeline-reports/*.md`. Guardo en `analyses/pipeline-{YYYY-MM-DD}.md` + reflejo la tabla en bruto en `pipeline-reports/{YYYY-WNN}.md`.

3. **Escribir de forma atómica.** Cada sujeto escribe en la ruta de arriba con `*.tmp` → renombrar.

4. **Agregar a `outputs.json`**  -  leer-combinar-escribir de forma atómica: `{ id (uuid v4), type: "analysis" (o "call-analysis" para discovery-call, "pipeline-report" para pipeline), title: "{Sujeto}  -  {fecha}", summary: "<hallazgo principal + acción principal>", path, status: "ready", createdAt, updatedAt, domain: "<playbook (sales-health, win-loss, call-insights) | meetings (discovery-call) | crm (pipeline)>" }`.

5. **Resumir al usuario.** Un párrafo: el hallazgo más importante + la siguiente acción principal. Ruta al artefacto completo.

## Lo que nunca hago

- Inventar cifras de pipeline, razones de ganados/perdidos, patrones de call-insights. Cada hallazgo se ata a una fila real o a un pasaje de transcripción.
- Entregar una lectura genérica, cada análisis termina con una acción concreta atada a una skill existente.
- Consolidar sobre ventanas de tiempo demasiado cortas para ser útiles (`win-loss` con menos de 3 de cada lado; `call-insights` con menos de 5 llamadas), en su lugar muestro una advertencia.

## Salidas

- `sales-health`, `win-loss`, `pipeline` → `analyses/{subject}-{date}.md`
- `call-insights` → `call-insights/{YYYY-MM-DD}.md`
- `discovery-call` → `calls/{slug}/analysis-{YYYY-MM-DD}.md`
- `pipeline` también refleja la tabla en `pipeline-reports/{YYYY-WNN}.md`
- Agrega a `outputs.json`.

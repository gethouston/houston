---
name: evaluar-una-propuesta-entrante
title: "Evaluar una propuesta entrante"
description: "Califica cualquier propuesta entrante que necesite tu decisión con una rúbrica real, en lugar de decidir a ojo. Ingresa la propuesta de un asesor, una solicitud de sociedad, una petición de prensa o una postulación genérica de proveedor, y la evalúo contra tus criterios guardados, reúno evidencia de señales públicas, y genero una recomendación de aprobar, rechazar o pedir más información, junto con la línea de evidencia que más importa."
version: 1
category: Operaciones
featured: no
image: clipboard
---


# Evaluar una propuesta entrante

Ejecutor genérico de rúbricas de aprobación para cualquier propuesta entrante que necesite la decisión del fundador. El triaje específico de proveedores va a la habilidad `vet-a-vendor` (criterios de compras, otra carpeta).

## Cuándo usarla

- "revisa esta postulación de proveedor contra nuestros criterios" (si es específica de compras → `vet-a-vendor`).
- "califica a estos candidatos a asesor".
- "esta sociedad encaja con nosotros".
- "debería aceptar esta petición de prensa".
- "corre el flujo de aprobación sobre esto".

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta habilidad verifico que las categorías de abajo estén vinculadas. Si falta alguna, nombro la categoría, te pido conectarla desde la pestaña de Integraciones y me detengo.

- **Investigación web** (Exa, Perplexity, Firecrawl)  -  Obligatorio. Trae señales públicas sobre quien envía la propuesta para verificar afirmaciones y detectar señales de alerta.
- **Bandeja de entrada** (Gmail, Outlook)  -  Opcional. Me permite revisar la correspondencia previa con quien envía, para que la recomendación refleje el historial.

Si no hay un proveedor de investigación web conectado, me detengo y te pido conectar primero un proveedor de investigación.

## Información que necesito

Primero leo tu contexto de operaciones. Por cada campo obligatorio que falte hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **La propuesta en sí**  -  Obligatorio. Por qué la necesito: califico lo que tengo delante. Si falta, pregunto: "Comparte la propuesta, sea un pitch, una postulación o una petición, o pega el hilo de correo."
- **Rúbrica de aprobación**  -  Obligatorio. Por qué la necesito: calificar sobre la marcha no es reproducible. Si falta, pregunto: "¿Qué criterios debo usar? Pégalos, o di 'default' y guardo una rúbrica inicial para este tipo de propuesta que puedes editar después."
- **Prioridades activas**  -  Obligatorio. Por qué las necesito: el puntaje de encaje con prioridades depende de ellas. Si falta, pregunto: "¿Cuáles son las 2 o 3 cosas que la empresa está empujando este trimestre?"
- **Líneas rojas**  -  Opcional. Por qué las necesito: me permiten rechazar de inmediato cualquier cosa que las viole. Si no las tienes, sigo adelante con TBD usando los valores por defecto del espacio de trabajo.

## Pasos

1. **Leo `context/operations-context.md`.** Las prioridades activas, las líneas rojas y las posiciones propias del fundador anclan cada evaluación con rúbrica. Si falta → primero `set-up-my-ops-info`, me detengo.

2. **Leo `config/approval-rubrics.md`.** Mapeo el tipo de propuesta a su rúbrica. Si falta el archivo o no hay rúbrica que coincida → pregunto al fundador: "¿Qué criterios debo usar? Pégalos, o puedo guardar una rúbrica por defecto para {inbound-type} que puedes editar después."

   **Rúbricas por defecto** (usadas si el fundador dice "default"):

   - **vendor-app** (proveedor / vendedor entrante genérico): encaje con prioridades, coincidencia de tamaño/etapa, búsqueda de señales de alerta (incidentes públicos), verificación de referencias (sí/no), fricción para probar.
   - **advisor**: autoridad en el dominio, acceso (a quién abriría puertas), compromiso de tiempo, alineación de compensación.
   - **partnership**: audiencia mutua, capacidad mutua, ventaja asimétrica (nos necesitan más de lo que los necesitamos), costo de salida.
   - **press**: encaje de audiencia, calidad de las preguntas, costo en tiempo del fundador, beneficio reputacional.

3. **Reúno evidencia.**
   - Leo la propuesta que el fundador pega o enlaza.
   - `composio search research` → señales públicas sobre quien envía (sitio web, actividad reciente, menciones).
   - `composio search inbox` → correspondencia previa con la persona o el dominio.
   - Si las afirmaciones de la propuesta son verificables → las verifico (p. ej. "levantó una Serie B el mes pasado" → chequeo rápido en noticias).

4. **Califico contra la rúbrica.**
   - Cada criterio: calificación (1-5 o verde/amarillo/rojo según la rúbrica) + 1-2 líneas de evidencia. Cito los enlaces.
   - Global: suma ponderada si la rúbrica define pesos; si no, un juicio cualitativo consolidado.

5. **Produzco la recomendación.**
   - **Aprobar**  -  encaja + sin señales de alerta + evidencia sólida.
   - **Rechazar**  -  desajuste claro o señales de alerta; indico las 2 razones principales.
   - **Más información**  -  en la duda; listo 2-3 preguntas concretas que el fundador debería hacer para desempatar.

6. **Escribo** en `approvals/{slug}.md` con:
   - Resumen de la propuesta (1 párrafo).
   - Rúbrica + tabla de calificación (criterio | calificación | evidencia).
   - Hallazgos de señales públicas.
   - Resumen de la correspondencia previa (si la hay).
   - Recomendación + justificación de 3 líneas.
   - Si es "más información", las preguntas de seguimiento exactas.

7. **Escrituras atómicas**  -  `*.tmp` → renombrar.

8. **Agrego a `outputs.json`** con `type: "approval"`, estado "draft" (el fundador lo marca `ready` después de decidir).

9. **Te resumo**  -  la recomendación + la línea de evidencia con más peso. Nunca digo "aprobar" sin nombrar la cosa #1 que haría que el fundador se arrepintiera.

## Salidas

- `approvals/{slug}.md`
- Agrega entradas a `outputs.json` con `type: "approval"`, estado "draft".

## Lo que nunca hago

- **Tomar la decisión.** Yo recomiendo; el fundador aprueba o rechaza.
- **Enviar un correo de acuse o de rechazo a quien envía.** Ese es el trabajo de `draft-a-message` después de que el fundador decide.
- **Usar una rúbrica no guardada.** Si me piden calificar sin rúbrica → pido una primero. Calificar sobre la marcha no es reproducible.

---
name: analizar-mis-llamadas-de-ventas
title: "Analizar mis llamadas de ventas"
description: "Extraigo las palabras exactas que usan tus clientes en las grabaciones de tus llamadas de ventas. Saco frases de dolor textuales, patrones de objeciones y señales de posicionamiento de las transcripciones de Gong o Fireflies, ordenadas por frecuencia. Esta es la mejor fuente para titulares, textos publicitarios y landing pages que suenen como tu comprador."
version: 1
category: Marketing
featured: yes
image: megaphone
integrations: [gong, fireflies, fathom]
---


# Analizar mis llamadas de ventas

Extraigo las palabras exactas que usan tus clientes en las grabaciones de tus llamadas de ventas. Saco frases de dolor textuales, patrones de objeciones y señales de posicionamiento. Es el insumo de investigación con mayor apalancamiento que tengo: el lenguaje textual del cliente le gana a cualquier paráfrasis de marketing.

## Cuándo usarlo

- "analiza mis llamadas de ventas" / "qué están diciendo los clientes" / "extrae las objeciones de mis llamadas".
- "saca señales de posicionamiento de las llamadas de la semana pasada".
- Me llaman implícitamente `set-up-my-marketing-info` (cuando busca frases textuales) y `profile-my-customer` (cuando arma las secciones de dolores/objeciones).

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta skill, reviso que las categorías de abajo estén conectadas. Si falta alguna, te digo cuál es, te pido que la conectes desde la pestaña de Integraciones y me detengo.

- **Notas de reuniones (Gong, Fireflies, Fathom, Circleback)**: trae las transcripciones recientes de llamadas. Obligatorio (o puedes pegar las transcripciones directamente).

Si no tienes conectada una app de notas de reuniones y no puedes pegar transcripciones, me detengo y te pido que conectes Gong, Fireflies o Fathom desde la pestaña de Integraciones.

## Información que necesito

Primero leo tu contexto de marketing. Por cada campo obligatorio que falte, te hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Tu posicionamiento**: Obligatorio. Por qué lo necesito: ancoro el análisis en tus afirmaciones actuales para poder marcar dónde los clientes las contradicen. Si falta, pregunto: "¿Quieres que redacte primero tu posicionamiento? Es una sola acción, toma unos cinco minutos."
- **Qué llamadas analizar**: Obligatorio. Por qué lo necesito: no voy a traer todo tu historial a ciegas. Si falta, pregunto: "¿Qué grupo de llamadas debería traer: las últimas cinco, las últimas diez, un rango de fechas o una cuenta específica?"
- **Transcripciones pegadas**: Obligatorio solo si no tienes conectada una app de notas de reuniones. Si falta, pregunto: "Sube de una a tres grabaciones de llamadas o pega las transcripciones que quieres que lea."

## Pasos

1. **Leo el documento de posicionamiento** (archivo propio): `context/marketing-context.md`. Ancoro el análisis: busco citas que respalden, actualicen o contradigan las afirmaciones actuales.

2. **Elijo la fuente. Hago UNA pregunta puntual si no es obvio, con pista de modalidad:**
   - "Puedo traer datos de tu app de notas de reuniones conectada, o puedes pegar de 1 a 3 transcripciones. ¿Cuál prefieres?"
   - Conectada: ejecuto `composio search meeting-notes`; listo las llamadas recientes; pregunto qué grupo (últimas 5, últimas 10, rango de fechas, cuenta específica).
   - Pegada: tomo el texto pegado tal cual.

3. **Si está conectada, obtengo los datos.** Ejecuto el slug de list-recent-calls de la herramienta descubierta, luego el slug de list-transcript por cada llamada. Capturo: fecha de la llamada, asistentes, duración, transcripción completa.

4. **Extraigo por llamada.** Para cada transcripción:
   - **Lenguaje textual de dolor**: de 3 a 5 citas directas donde el cliente describe el problema. Las preservo palabra por palabra.
   - **Lenguaje textual de posicionamiento**: cómo describen la categoría, nuestro producto y a la competencia. Lo preservo.
   - **Objeciones planteadas**: la objeción real, el contexto y si se manejó en la llamada.
   - **Señales de compra**: menciones de presupuesto, de plazos, de involucrados en la decisión.
   - **Sorpresas**: cualquier cosa que contradiga el documento de posicionamiento actual. Es oro puro.

5. **Sintetizo todo el grupo.** Resumo:
   - Patrones de dolor: qué lenguaje de dolor se repite, con su frecuencia.
   - Patrones de objeciones: las 3 objeciones principales por frecuencia.
   - Lenguaje de categoría: las palabras que realmente usan los clientes (frente a lo que usamos en el sitio).
   - Diferencias frente al documento de posicionamiento: qué agregar, cambiar o quitar en `context/marketing-context.md`.

6. **Estructuro el artefacto (markdown, ~400-700 palabras).** Para un grupo, escribo `call-insights/{YYYY-MM-DD}-batch.md`. Para un análisis profundo de una sola llamada, escribo `call-insights/{call-slug}.md`. Estructura:

   1. **Alcance**: N llamadas, rango de fechas, cuentas.
   2. **Principales dolores textuales**: citados, con quién los dijo y la fecha de la llamada.
   3. **Principal lenguaje textual de posicionamiento**: cómo describen los clientes la categoría, a nosotros y a la competencia.
   4. **Las 3 objeciones principales**: textuales, con contexto y si se manejaron o no.
   5. **Señales de compra detectadas**: lista.
   6. **Sorpresas y diferencias frente al documento de posicionamiento**: recomendaciones de actualización en viñetas.
   7. **Lista de entrega**: qué agentes reciben qué hallazgo. Ejemplo: `[lifecycle-email] Usa la frase "{quote}" en el asunto del correo de reactivación.`

7. **Nunca invento.** Cada cita se vincula a la transcripción, el interlocutor y la marca de tiempo. Si no se dijo, no lo redondeo ni lo resumo como si fuera una cita. Si las transcripciones son demasiado escasas, lo digo y me detengo.

8. **Escribo de forma atómica**: `{path}.tmp` y luego renombro.

9. **Agrego a `outputs.json`.** Leo, combino y escribo de forma atómica:

   ```json
   {
     "id": "<uuid v4>",
     "type": "call-insight",
     "title": "<Grupo de hallazgos de llamadas YYYY-MM-DD>" | "<Llamada con {account}>",
     "summary": "<2-3 frases: patrón de dolor principal + objeción principal + diferencia frente al posicionamiento>",
     "path": "call-insights/<slug>.md",
     "status": "draft",
     "createdAt": "<ISO-8601>",
     "updatedAt": "<ISO-8601>"
   }
   ```

10. **Ofrezco actualizar el documento de posicionamiento.** Si las diferencias son relevantes, pregunto al usuario: "¿Quieres que actualice el documento de posicionamiento con estas frases de los clientes?". Si dice que sí, ejecuto `set-up-my-marketing-info` en modo actualización.

11. **Resumo al usuario.** Un párrafo: la frase de dolor principal, la objeción principal, la mayor diferencia de posicionamiento, la ruta al artefacto.

## Resultados

- `call-insights/{YYYY-MM-DD}-batch.md` o `call-insights/{call-slug}.md`.
- Se agrega a `outputs.json` con `type: "call-insight"`.
- Puede activar la ejecución de `set-up-my-marketing-info` (requiere tu aprobación).

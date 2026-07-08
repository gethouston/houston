---
name: marcar-una-senal
title: "Marcar una señal"
description: "Detecto algo en un ticket que es más grande que el ticket mismo y lo registro correctamente. Un reporte de error queda documentado con pasos para reproducirlo y su severidad, para que ingeniería pueda actuar. Una solicitud de función queda atribuida al cliente que la pidió. Y si veo que la misma pregunta aparece tres veces o más sin un artículo de ayuda, marco el vacío en la documentación y me ofrezco a escribir uno."
version: 1
category: Soporte
featured: no
image: headphone
integrations: [gmail, github, linear, jira]
---


# Marcar una señal

Una skill para cada pregunta de "este hilo contiene una señal que hay que registrar". Se ramifica según `signal`.

## Cuándo usarlo

- **bug**: "¿esto es un error? regístralo" / el mensaje contiene mensajes de error, trazas de pila, "antes funcionaba, ahora no", pasos de reproducción, o capturas de pantalla de la interfaz rota.
- **feature-request**: la conversación o el mensaje directo contiene una petición de función ("¿pueden agregar X?", "sería genial si Y").
- **repeat-question**: en el cron semanal, o al escanear los últimos 30 a 60 días y encontrar un grupo de preguntas entrantes semánticamente similares que llegue a ≥3 sin un artículo correspondiente.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de que esta skill se ejecute, verifico que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Seguimiento de desarrollo** (GitHub / Linear / Jira): redacto un issue para los candidatos a error confirmados. Obligatorio para `bug` si quieres que lo encadene con tu sistema de seguimiento.
- **Bandeja de entrada** (Gmail): fuente de hilos para agrupar preguntas repetidas. Opcional si `conversations.json` ya cubre la ventana.

Si quieres que registre candidatos a error en un sistema de seguimiento, me detengo y te pido que conectes el que realmente usas.

## Información que necesito

Primero leo tu contexto de soporte. Por cada campo obligatorio que falte, te hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Superficie del producto**: Obligatorio. Por qué la necesito: me dice qué está dentro del alcance (error real) versus fuera de alcance (de terceros). Si falta, pregunto: "¿Qué cubre realmente tu producto? Comparte una vista rápida o indícame tu página principal."
- **Reglas de clasificación entre error y función**: Obligatorio. Por qué la necesito: la línea entre "roto" y "faltante" determina a dónde va la señal. Si falta, pregunto: "Cuando un cliente reporta que algo no funciona, ¿qué hace que sea un error para ti, en vez de una solicitud de función?"
- **Plataforma del centro de ayuda**: Obligatorio para `repeat-question`. Por qué la necesito: reviso la cobertura existente de la base de conocimiento antes de marcar un grupo como un hueco de documentación. Si falta, pregunto: "¿Dónde viven tus artículos de ayuda hoy? ¿Notion, Intercom, un sitio de documentación, o todavía en ningún lado?"

## Parámetro: `signal`

- `bug`: extraigo pasos de reproducción, versión afectada, cliente afectado. Asigno severidad según `context/support-context.md#severity`. Añado a `bug-candidates.json`. Ofrezco encadenar con el sistema de seguimiento conectado (GitHub / Linear / Jira vía Composio).
- `feature-request`: extraigo la petición + el slug del cliente que la pidió. Añado o combino en `requests.json`. Si combino, incremento el contador de solicitantes; si es VIP, lo marco.
- `repeat-question`: escaneo los últimos 30 a 60 días de `conversations.json`. Agrupo preguntas entrantes semánticamente similares. Por cada grupo ≥3 sin artículo correspondiente, añado a `patterns.json` y lo muestro como hueco de documentación.

## Pasos

1. **Leer `context/support-context.md`.** Si falta, me detengo.
2. **Leer el registro.** Relleno los vacíos.
3. **Ramificar según `signal`:**
   - `bug`: leo el `conversations/{id}/thread.json` fuente. Extraigo la reproducción (pasos numerados), la versión afectada, el mensaje de error / traza de pila. Asigno severidad. Escribo una nueva entrada en `bug-candidates.json` (leer-combinar-escribir) con `{id, title, severity, affectedCustomers, reproSteps, sourceConversationId, status: "new"}`. Si me lo indicas, encadeno con el sistema de seguimiento conectado llamando a su herramienta de creación de issues.
   - `feature-request`: leo el mensaje fuente. Extraigo la petición en una sola oración. Busco casi-duplicados en `requests.json`; si encuentro uno, añado el slug del cliente e incremento. Si es nuevo, creo la entrada. Nunca atribuyo una petición a un cliente que no la hizo.
   - `repeat-question`: leo los últimos 30 a 60 días de `conversations.json`. Agrupo por tema / similitud de la primera línea. Por cada grupo ≥3, reviso `articles/` para ver si ya existe una respuesta. Si no hay, añado un nuevo patrón a `patterns.json` con `{cluster, exampleIds, count, suggestedTitle}`. Ofrezco encadenar `write-an-article type=from-ticket` para el candidato principal.
4. **Añadir a `outputs.json`** con `type` = `bug-candidate` | `feature-request` | `repeat-question`, `domain: "inbox"` (bug / feature-request) o `domain: "help-center"` (repeat-question), título, resumen, ruta.
5. **Resumirte a ti**: qué registré + dónde + siguiente encadenamiento recomendado.

## Resultados

- Entrada en `bug-candidates.json` (para `signal = bug`)
- Entrada en `requests.json` (para `signal = feature-request`)
- Entrada en `patterns.json` (para `signal = repeat-question`)
- Se añade a `outputs.json`.

## Qué nunca hago

- Registrar un error en el sistema de seguimiento conectado sin tu aprobación. Redacto el issue; tú lo creas.
- Atribuir una solicitud de función a un cliente que no la pidió.
- Marcar un grupo de preguntas repetidas que ya tiene artículo: reviso `articles/` primero.

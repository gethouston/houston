---
name: escribir-un-articulo
title: "Escribir un artículo"
description: "Convierto un ticket resuelto en un artículo del centro de ayuda, redacto una página de estado para un problema conocido cuando algo falla, envío notas personalizadas de 'lo pediste, lo lanzamos' a los clientes que solicitaron una función, o marco artículos desactualizados que necesitan una actualización después de un cambio en el producto. Elige el tipo y obtén un borrador listo para publicar, basado en conversaciones reales y en tu voz."
version: 1
category: Soporte
featured: no
image: headphone
integrations: [googledocs, notion, github, linear]
---


# Escribir un artículo

Un solo Skill para toda solicitud de redacción del centro de ayuda. Se ramifica según `type`.

## Cuándo usar esto

- **from-ticket**: "convierte este ticket en un artículo" / "documenta
  esta resolución" / "respondí la misma pregunta 3 veces, escribe algo
  al respecto." Se invoca implícitamente desde `flag-a-signal
  signal=repeat-question` cuando un grupo llega a 3 o más casos y no
  hay un artículo que lo cubra.
- **known-issue**: "redacta un documento de problema conocido para
  {error}" / "es P1, publica una página de estado" / encadenado desde
  `draft-a-playbook`.
- **broadcast-shipped**: "lanzamos X, avísale a los clientes que lo
  pidieron" / "envía la nota de 'lo pediste, lo lanzamos'."
- **refresh-stale**: "actualiza los artículos afectados por este
  lanzamiento" / "revisa la documentación, cambiaron los precios" /
  rutina mensual del centro de ayuda.

## Conexiones que necesito

Hago el trabajo externo a través de Composio. Antes de ejecutar este Skill, verifico que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña Integraciones, y me detengo.

- **Centro de ayuda** (Notion / Google Docs / Help Scout / Intercom), refleja el borrador en tu centro de ayuda publicado. Obligatorio para `from-ticket` y `refresh-stale` si quieres que envíe el borrador ahí.
- **Sistema de seguimiento de desarrollo** (GitHub / Linear), trae el contexto del error para el documento de `known-issue`. Obligatorio para `known-issue`.
- **Bandeja de entrada** (Gmail), obtiene el hilo resuelto cuando aún no está en `conversations.json`. Opcional.

Si pides una página de problema conocido y tu sistema de seguimiento no está conectado, me detengo y te pido que lo conectes.

## Información que necesito

Primero leo tu contexto de soporte. Para cada campo obligatorio que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Plataforma del centro de ayuda**, Obligatorio. Por qué lo necesito: el formato y el tono varían según el destino. Si falta, pregunto: "¿Dónde viven hoy tus artículos de ayuda: Notion, Intercom, un sitio de documentación, o en ningún lado todavía?"
- **Muestras de tu voz**, Obligatorio. Por qué lo necesito: los artículos del centro de ayuda con el tono equivocado terminan reescribiéndose. Si falta, pregunto: "¿Quieres que analice tu carpeta de enviados para captar el tono, o puedes pasarme de 3 a 5 correos recientes a clientes?"
- **Perfil de tono del centro de ayuda**, Opcional. Por qué lo necesito: algunos equipos quieren que el centro de ayuda sea más formal que las respuestas de chat. Si no lo tienes, sigo adelante con "por definir" y uso el mismo tono de tus respuestas.
- **Qué se lanzó**, Obligatorio para `broadcast-shipped`. Por qué lo necesito: no voy a anunciar un vago "lanzamos cosas." Si falta, pregunto: "¿Qué lanzaste? Dame un título y una oración sobre qué hay de nuevo."
- **Qué cambió**, Obligatorio para `refresh-stale`. Por qué lo necesito: reviso los artículos en busca de referencias a lo que cambió. Si falta, pregunto: "¿Qué cambió: precios, el nombre de una función, un flujo de la interfaz, algo más?"

## Parámetro: `type`

- `from-ticket`: artículo basado en una conversación resuelta. Traigo
  el hilo, extraigo la respuesta reutilizable y escribo en
  `articles/{slug}.md`. Lo reflejo en la plataforma del centro de
  ayuda conectada, si está enlazada.
- `known-issue`: entrada de estado orientada al cliente. Escribo en
  `known-issues/{slug}.md` y agrego una entrada a `known-issues.json`
  con `{id, title, affectedProduct, currentStatus, postedAt,
  updatedAt}`.
- `broadcast-shipped`: borradores personalizados de "lo pediste, lo
  lanzamos", uno por cada cliente en `requests.json` que pidió lo que
  se acaba de lanzar. Escribo en
  `broadcasts/{YYYY-MM-DD}-{slug}.md`.
- `refresh-stale`: reviso `articles/` en busca de referencias que ya
  no son correctas (precios, interfaz, nombre de función), marco
  `needsReview: true` en `outputs.json` y redacto la actualización.

## Pasos

1. **Leo `context/support-context.md`.** ¿Falta? Me detengo.
2. **Leo el historial.** Completo los vacíos.
3. **Me ramifico según `type`:**
   - `from-ticket`: pregunto qué `{id de conversación}` usar como
     fuente, o elijo automáticamente del grupo que surgió de
     `flag-a-signal signal=repeat-question`. Leo
     `conversations/{id}/thread.json`. Extraigo la pregunta, la
     respuesta, capturas de pantalla y referencias de código. Redacto
     con el tono de `domains.help-center.toneProfile`.
   - `known-issue`: pregunto el id del error y el título si no me los
     dan. Leo `bug-candidates.json` para los detalles. Redacto el
     documento de estado: qué está fallando, a quién afecta, la
     solución temporal, el estado actual, la fecha estimada (solo si
     ya fue aprobada). Agrego una entrada a `known-issues.json`.
   - `broadcast-shipped`: pregunto qué se lanzó (título y una
     descripción de una oración). Leo `requests.json`, filtro a los
     clientes que pidieron exactamente esto. Redacto una nota corta y
     personal por cada cliente, citando su pedido específico. Nunca
     envío en masa: un archivo por cliente en `broadcasts/`.
   - `refresh-stale`: pregunto qué cambió (precios / interfaz /
     nombre de función). Reviso cada `articles/{slug}.md` con grep en
     busca de referencias al elemento cambiado. Por cada coincidencia,
     escribo una propuesta de reescritura como diff, sin sobrescribir.
     Marco `needsReview: true` en `outputs.json`.
4. **Escribo el artefacto** de forma atómica.
5. **Agrego una entrada a `outputs.json`** con `type` =
   `kb-article` | `known-issue` | `broadcast` | `article-refresh`,
   `domain: "help-center"`, título, resumen, ruta, estado `draft`.
6. **Resumo**: titular, qué revisar y dónde publicar.

## Resultados

- `articles/{slug}.md` (para `type = from-ticket`, `refresh-stale`)
- `known-issues/{slug}.md` y una entrada en `known-issues.json` (para
  `type = known-issue`)
- `broadcasts/{YYYY-MM-DD}-{slug}.md` (para `type = broadcast-shipped`)
- Se agrega una entrada a `outputs.json` con `domain: "help-center"`.

## Lo que nunca hago

- Publicar directo en el centro de ayuda conectado. Yo redacto, tú
  publicas.
- Inventar una fecha estimada para `known-issue`. ¿Ingeniería no se
  comprometió? Escribo "en investigación."
- Usar una plantilla genérica para `broadcast-shipped`. Cada nota
  cita el pedido específico.

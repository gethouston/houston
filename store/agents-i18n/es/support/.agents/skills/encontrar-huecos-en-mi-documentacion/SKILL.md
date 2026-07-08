---
name: encontrar-huecos-en-mi-documentacion
title: "Encontrar huecos en mi documentación"
description: "Reviso qué siguen preguntando tus clientes y detecto en qué está fallando tu centro de ayuda. Clasifico los vacíos según cuánta gente los encuentra y qué tan valiosos son esos clientes, te doy los tres principales con los tickets reales detrás de cada uno, y me ofrezco a redactar los artículos ahí mismo."
version: 1
category: Soporte
featured: no
image: headphone
---


# Encontrar huecos en mi documentación

## Cuándo usarlo

- Preguntas como: "¿sobre qué debería escribir documentación?", "¿qué huecos tenemos?", "¿qué falta en el centro de ayuda?".
- Cadencia semanal: normalmente se combina con `review-my-support scope=help-center-digest` o va antes.
- Después de que `flag-a-signal signal=repeat-question` encuentre nuevos grupos que valga la pena revisar.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de que esta skill se ejecute, verifico que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Base de conocimiento** (Notion / Google Docs): reviso tus artículos publicados para no marcar un hueco que ya llenaste. Opcional si tus artículos viven localmente.
- **CRM** (HubSpot / Attio / Salesforce): pondero los huecos según el nivel de plan del cliente y el ingreso mensual. Opcional, si falta uso peso igual para todos.

Sigo trabajando si ninguna está conectada, pero te aviso que el ranking será más aproximado sin ellas.

## Información que necesito

Primero leo tu contexto de soporte. Por cada campo obligatorio que falte, te hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Plataforma del centro de ayuda**: Obligatorio. Por qué la necesito: reviso la cobertura existente antes de clasificar un grupo como un hueco real. Si falta, pregunto: "¿Dónde viven tus artículos de ayuda hoy? ¿Notion, Intercom, un sitio de documentación, o todavía en ningún lado?"
- **Niveles de plan**: Opcional. Por qué la necesito: los huecos que afectan a clientes que pagan se ordenan más arriba que los que afectan al nivel gratuito. Si no la tienes, sigo con peso igual por ticket.

## Pasos

1. Leer `patterns.json` (grupos de preguntas repetidas) y `articles/` (base de conocimiento existente). Filtrar los patrones sin artículo correspondiente.
2. Si la lista está vacía, ejecutar primero `flag-a-signal signal=repeat-question` (o decirte que ya lo ejecuté y todavía no hay nada).
3. Clasificar cada hueco abierto por puntaje de impacto:
   - `occurrenceCount`: señal principal (con qué frecuencia se pregunta)
   - **Valor del cliente**: por cada `sourceTicketId`, busco al cliente en `customers.json`, pondero por nivel de plan / ingreso mensual si está disponible (si no, peso igual)
   - **Vigencia**: las ocurrencias recientes pesan más que las viejas; penalizo fuerte los huecos sin ocurrencias en los últimos 14 días
4. Presentar los 3 huecos principales en el chat:
   ```
   1. "¿Cómo reinicio mi clave de API?": 7 ocurrencias, 3 clientes que pagan, la más reciente hace 2 días
      Tickets fuente: t_abc, t_def, t_ghi
   2. ...
   3. ...
   ```
5. Preguntar: "¿Quieres que redacte artículos para alguno de estos? Responde con los números (por ejemplo, '1 y 3')."
6. Por cada número elegido, elijo el ticket fuente representativo (el más reciente, o el de resolución más clara) y encadeno con `write-an-article type=from-ticket`.
7. Escribir el snapshot del ranking en `gaps/{YYYY-MM-DD}.md`, añadir una entrada a `outputs.json` con `type: "docs-gap"`, `domain: "help-center"`.
8. Cuando un hueco se convierte en artículo, actualizo la entrada de `patterns.json` con `relatedArticleSlug` para que no vuelva a aparecer.

## Resultados

- `gaps/{YYYY-MM-DD}.md` (lista clasificada de los 3 principales)
- Actualiza `patterns.json` (`relatedArticleSlug` al promoverse)
- Puede encadenar con `write-an-article type=from-ticket` (una llamada por cada hueco aceptado)
- Se añade a `outputs.json` con `type: "docs-gap"`, `domain: "help-center"`.

---
name: revisar-mi-soporte
title: "Revisar mi soporte"
description: "Obtén un reporte estructurado de cómo va el soporte. Un resumen semanal que cubre todas las áreas con volumen, temas principales, promesas vencidas y alertas de cancelación abiertas. Un resumen del centro de ayuda que muestra los temas de los tickets, la velocidad de solicitudes, y el artículo más útil para escribir a continuación. O una revisión por cuenta que mapea logros, solicitudes entregadas, fricción abierta, y próximos pasos, para que llegues a la llamada preparado."
version: 1
category: Soporte
featured: yes
image: headphone
integrations: [googledocs, notion, slack]
---


# Revisar mi soporte

Una sola skill para el recuento, el reporte y la revisión. Se ramifica según `scope`.

## Cuándo usarla

- **weekly**  -  "revisión del lunes" / "reporte semanal de soporte" / "¿cómo estuvo la semana de soporte?" / rutina automática del lunes.
- **help-center-digest**  -  "resumen semanal del centro de ayuda" / "¿qué pasó en la documentación esta semana?" / rutina automática del domingo.
- **account-review**  -  "prepara la revisión de cuenta de {account}" / "esquema para el check-in con {customer}."

## Conexiones que necesito

Hago el trabajo externo a través de Composio. Antes de ejecutar esta skill, verifico que las categorías de abajo estén conectadas. Si falta alguna → nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Documentos / notas** (Google Docs / Notion)  -  publica el reporte donde tu equipo realmente lo va a leer. Opcional, si no usa markdown local como respaldo.
- **Mensajería** (Slack)  -  coloca el resumen semanal en un canal del equipo. Opcional.
- **CRM** (HubSpot / Attio)  -  trae el registro de la cuenta para el alcance account-review. Obligatorio para `account-review`.
- **Facturación** (Stripe)  -  trae el ingreso mensual y la fecha de renovación para el alcance account-review. Obligatorio para `account-review`.

Si pides una revisión de cuenta y tu CRM no está conectado, me detengo y te pido que lo conectes.

## Información que necesito

Primero leo tu contexto de soporte. Por cada campo obligatorio que falte, te hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > pegar texto) y espero.

- **Superficie del producto + mapa de niveles de plan**  -  Obligatorio. Por qué lo necesito: los recuentos agrupan los elementos por dominio y nivel. Si falta, pregunto: "¿Qué planes vendes, y qué incluye más o menos cada uno?"
- **Segmento de revisión de cuenta**  -  Obligatorio para `account-review`. Por qué lo necesito: no todos los clientes reciben una revisión de cuenta; necesito saber dónde está la línea. Si falta, pregunto: "¿Con qué clientes realmente haces revisiones de cuenta? ¿Solo enterprise, o cualquiera por encima de cierto ingreso mensual?"
- **Frecuencia de revisión**  -  Obligatorio para `weekly`. Por qué lo necesito: define la ventana del recuento. Si falta, pregunto: "¿Quieres esto semanal, cada dos semanas, o mensual?"

## Parámetro: `scope`

- `weekly`  -  recuento de todos los dominios. Volumen, temas principales, casos de alta prioridad sin resolver, alertas de cancelación abiertas, promesas que vencen esta semana, próximos pasos agrupados por dominio. Escribe en `reviews/{YYYY-MM-DD}.md`.
- `help-center-digest`  -  recuento específico de la documentación. Volumen de tickets, los 3 temas principales de `patterns.json`, elementos de alta prioridad sin resolver, velocidad de solicitudes de funciones, alertas de cancelación. Escribe en `digests/{YYYY-MM-DD}.md`.
- `account-review`  -  revisión por cuenta. 4 secciones: logros (lo alcanzado), solicitudes-entregadas (solicitudes que entregué), fricción (dolores todavía abiertos), próximos pasos (renovación / expansión / inversión). Escribe en `account-reviews/{account}-{YYYY-MM-DD}.md`.

## Pasos

1. **Leo `context/support-context.md`.** Si no existe, me detengo.
2. **Leo el ledger.** Relleno lo que falte.
3. **Me ramifico según `scope`:**
   - `weekly`: leo `outputs.json` filtrado a los últimos 7 días. Agrupo por `domain`. Por dominio: cuenta + titular de 1 línea + 1 pendiente sin resolver. Leo `followups.json` filtrado a lo que vence esta semana. Leo `churn-flags.json` filtrado a lo abierto esta semana. Termino con "2-3 cosas que te recomiendo hacer esta semana" a nivel de todo el agente.
   - `help-center-digest`: leo los conteos de `conversations.json` para la ventana, los 3 temas principales de `patterns.json`, la velocidad de `requests.json`, los cambios de estado de `known-issues.json`. Muestro el vacío de documentación más útil para escribir a continuación.
   - `account-review`: encadeno `look-up-a-customer view=timeline` para la cuenta. Leo `requests.json` + `bug-candidates.json` + `followups.json` filtrados a la cuenta. Estructuro el documento como logros / solicitudes-entregadas / fricción / próximos pasos, cada sección respaldada en la línea de tiempo + los IDs de solicitud.
4. **Escribo el artefacto** de forma atómica.
5. **Agrego a `outputs.json`** con `type` = `weekly-review` | `help-center-digest` | `account-review`, `domain: "quality"` (para `weekly` / `help-center-digest`) o `domain: "success"` (para `account-review`), título, resumen, ruta.
6. **Te resumo**: lectura de 2 minutos. Para `weekly` / `digest`, siempre lo muestro, una semana tranquila también es noticia.

## Resultados

- `reviews/{YYYY-MM-DD}.md` (para `scope = weekly`)
- `digests/{YYYY-MM-DD}.md` (para `scope = help-center-digest`)
- `account-reviews/{account}-{YYYY-MM-DD}.md` (para `scope = account-review`)
- Agrega a `outputs.json`.

## Lo que nunca hago

- Inventar números para rellenar una semana tranquila. Si el volumen es bajo, lo escribo así.
- Incluir "próximos pasos" sin respaldarlos en un resultado específico o un id de ticket.

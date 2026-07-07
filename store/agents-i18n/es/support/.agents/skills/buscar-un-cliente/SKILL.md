---
name: buscar-un-cliente
title: "Buscar un cliente"
description: "Dame el nombre de un cliente y elige lo que necesitas: un dosier con su plan, historial y pendientes; una línea de tiempo completa de cada interacción; un puntaje de salud (verde/amarillo/rojo) con las tres señales que lo explican; o una revisión de riesgo de cancelación que te dice si se está alejando y qué hacer al respecto. Un cliente, cuatro ángulos."
version: 1
category: Soporte
featured: no
image: headphone
integrations: [gmail, hubspot, salesforce, attio, stripe]
---


# Buscar un cliente

Una sola skill para cualquier necesidad de soporte de tipo "cuéntame sobre este cliente". Se ramifica según `view`.

## Cuándo usarla

- **dossier**  -  "¿quién es este cliente?" / "cuéntame sobre {account}" / implícito antes de ejecutar `draft-a-reply`.
- **timeline**  -  "muéstrame la línea de tiempo completa de {account}" / "historial de {customer}" / implícito antes de `review-my-support scope=account-review` o `draft-a-lifecycle-message type=renewal`.
- **health**  -  "califica la salud de {account}" / "¿cómo va {customer}?" / "corre health."
- **churn-risk**  -  "riesgo de cancelación de {account}" / "busca riesgo de cancelación" / "¿este cliente está en riesgo?"

## Conexiones que necesito

Hago el trabajo externo a través de Composio. Antes de ejecutar esta skill, verifico que las categorías de abajo estén conectadas. Si falta alguna → nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **CRM** (HubSpot / Attio / Salesforce)  -  trae el nivel de plan, el dueño de la cuenta, el registro de la cuenta. Obligatorio.
- **Facturación** (Stripe)  -  trae el ingreso mensual, el plan, la fecha de renovación, señales de downgrade. Obligatorio para `health` y `churn-risk`.
- **Bandeja de entrada** (Gmail / Outlook)  -  trae el historial completo de conversación para la vista timeline. Opcional si `conversations.json` ya está poblado.

Si ninguna de las categorías obligatorias está conectada, me detengo y te pido que conectes primero tu CRM.

## Información que necesito

Primero leo tu contexto de soporte. Por cada campo obligatorio que falte, te hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > pegar texto) y espero.

- **Niveles de plan y su peso**  -  Obligatorio. Por qué lo necesito: ordena bien las señales para que la alerta de cancelación de un cliente P1 no quede enterrada. Si falta, pregunto: "¿Qué planes vendes, y cuáles cuentan como tu nivel más alto?"
- **Dónde vive el historial de conversaciones**  -  Obligatorio. Por qué lo necesito: necesito traer la línea de tiempo completa de la cuenta. Si falta, pregunto: "¿Qué bandeja de entrada o help-desk tiene los hilos de tus clientes? ¿Prefieres que lo traiga de una app conectada o subes una exportación reciente?"
- **Cómo se ve "en riesgo" para ti**  -  Obligatorio para `health` / `churn-risk`. Por qué lo necesito: los umbrales de VERDE / AMARILLO / ROJO vienen de tu propia definición, no de la mía. Si falta, pregunto: "¿Qué señales te indican que un cliente está por cancelar? ¿Caída de uso, aumento de tickets de soporte, lenguaje de cancelación, algo más?"

## Parámetro: `view`

- `dossier`  -  perfil + plan + ingreso mensual (vía Stripe conectado) + candidatos a error abiertos + seguimientos abiertos + últimas 3 conversaciones. Escribe en `dossiers/{slug}.md`.
- `timeline`  -  recuento cronológico de cada interacción (ticket, llamada, compra, cambio de plan, puntaje de satisfacción). Escribe en `timelines/{slug}.md`.
- `health`  -  VERDE / AMARILLO / ROJO con las 3 señales que lo explican, el razonamiento, UNA acción recomendada. Escribe una entrada en `health-scores.json` (y una versión en prosa en `dossiers/{slug}-health.md` si se pide).
- `churn-risk`  -  alerta de riesgo abierta con la señal (lenguaje de cancelación, fricción repetida, caída abrupta de uso), severidad, acción recomendada. Escribe una entrada en `churn-flags.json`.

## Pasos

1. **Resuelvo `{account}` o `{slug}`.** ¿Me diste el nombre del cliente? Lo busco en `customers.json` por nombre / correo / dominio. ¿No hay coincidencia? Pido el identificador del CRM (HubSpot / Attio / Salesforce vía Composio) o que pegues el perfil.
2. **Leo `config/context-ledger.json`.** Relleno lo que falte.
3. **Me ramifico según `view`:**
   - `dossier`: leo el registro del CRM + `customers.json` + filtro `conversations.json` para este cliente + reviso `bug-candidates.json`, `followups.json`, `churn-flags.json`. Traigo ingreso mensual / plan desde Stripe conectado. Escribo `dossiers/{slug}.md`.
   - `timeline`: las mismas lecturas que `dossier`, pero además traigo cada conversación, cambio de plan, factura, puntaje de satisfacción desde Stripe + CRM conectados. Ordeno cronológicamente. Escribo `timelines/{slug}.md`.
   - `health`: calculo 3 señales (por ejemplo, volumen de tickets de los últimos 30 días, tendencia reciente de uso del producto vía PostHog, sentimiento de las últimas 3 interacciones). Aplico los umbrales de `domains.success.churnSignals` (te pido que los definas si no están). Devuelvo VERDE / AMARILLO / ROJO + una acción. Escribo en `health-scores.json` (leer-combinar-escribir).
   - `churn-risk`: reviso los últimos 60 días de conversaciones en busca de lenguaje de cancelación, 2 o más señales de frustración, o caída abrupta de uso. ¿Encontré algo? Escribo una nueva entrada en `churn-flags.json` con la señal + severidad + próximo paso recomendado.
4. **Agrego a `outputs.json`** con el `type` apropiado: `dossier` | `timeline` | `health-score` | `churn-risk`, `domain: "inbox"`, título, resumen, ruta.
5. **Te resumo** de forma breve: titular (plan + estado) + el próximo paso más útil.

## Resultados

- `dossiers/{slug}.md` (para `view = dossier`)
- `timelines/{slug}.md` (para `view = timeline`)
- entrada en `health-scores.json` (para `view = health`)
- entrada en `churn-flags.json` (para `view = churn-risk`)
- Agrega a `outputs.json` con `domain: "inbox"`.

## Lo que nunca hago

- Mostrar un puntaje de salud o una alerta de cancelación que no pueda respaldar con datos de `conversations.json`, Stripe, o el CRM. Marco DESCONOCIDO y pregunto.
- Inventar números de plan / ingreso mensual / uso cuando falta la conexión.

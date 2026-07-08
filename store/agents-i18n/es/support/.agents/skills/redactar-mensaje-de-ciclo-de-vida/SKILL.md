---
name: redactar-mensaje-de-ciclo-de-vida
title: "Redactar mensaje de ciclo de vida"
description: "Redacto los mensajes que llevan a tus clientes a través de su ciclo de vida. Una serie de bienvenida que guía a los nuevos registros hasta su primer logro en cinco contactos, una secuencia de renovación a 90/60/30 días basada en lo que la cuenta realmente logró, un mensaje puntual de expansión cuando los datos de uso muestran que alguien está llegando a un límite, o un mensaje de retención cuando un cliente da señales de querer irse. Cada borrador hace referencia a datos reales de la cuenta y a tus políticas reales, nada inventado."
version: 1
category: Soporte
featured: no
image: headphone
integrations: [hubspot, attio, stripe, mailchimp, customerio, loops]
---


# Redactar mensaje de ciclo de vida

Una sola skill para todo el alcance que tu operación de éxito de cliente necesita en el ciclo de vida. Se ramifica según `type`.

## Cuándo usarlo

- **welcome-series**: "redacta el onboarding para {segment}" / "serie de bienvenida para nuevos registros" / "goteo de activación."
- **renewal**: "se acerca la renovación de {account}" / "redacta el 30/60/90 para {account}" / "contacto previo a la renovación."
- **expansion-nudge**: "¿están listos para {tier}?" / "redacta un empujón de expansión para {account}" / "señal de límite alcanzado en {account}."
- **churn-save**: "salva a {account}" / "redacta un mensaje de retención para {customer}" / "pidieron cancelar."

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de que esta skill se ejecute, verifico que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Envío de correo** (Loops / Customer.io / Mailchimp): formateo la serie de bienvenida para la herramienta de ciclo de vida desde la que realmente envías. Obligatorio para `welcome-series`.
- **CRM** (HubSpot / Attio): traigo el registro de la cuenta, el dueño, el historial de plan para personalizar. Obligatorio para `renewal` / `expansion-nudge` / `churn-save`.
- **Facturación** (Stripe): leo el ingreso mensual, el plan, la fecha de renovación para fundamentar la petición en números reales. Obligatorio para `renewal` / `expansion-nudge`.

Si ninguna de las categorías obligatorias está conectada, me detengo y te pido que conectes primero tu CRM.

## Información que necesito

Primero leo tu contexto de soporte. Por cada campo obligatorio que falte, te hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Muestras de voz**: Obligatorio. Por qué la necesito: el texto de ciclo de vida en el tono equivocado se ignora. Si falta, pregunto: "¿Quieres que analice tu carpeta de enviados para el tono, o puedes soltarme de 3 a 5 de tus correos recientes a clientes?"
- **Niveles de plan + precios**: Obligatorio. Por qué la necesito: para saber qué significa "subir" o "bajar" de plan para esta cuenta. Si falta, pregunto: "¿Qué planes vendes y más o menos cuánto cuestan?"
- **Cadencia de renovación**: Obligatorio para `renewal`. Por qué la necesito: la secuencia 30/60/90 se ajusta a tu ventana de renovación. Si falta, pregunto: "¿Las renovaciones son anuales, mensuales, o algo distinto, y cuándo se cumple el plazo de esta cuenta?"
- **Ofertas de retención aprobadas**: Obligatorio para `churn-save`. Por qué la necesito: no voy a inventar un descuento o crédito. Si falta, pregunto: "Cuando alguien intenta cancelar, ¿qué le puedes ofrecer de verdad? ¿Pausa, bajar de plan, reembolso, tiempo de atención personalizada?"
- **Hitos de activación**: Obligatorio para `welcome-series`. Por qué la necesito: cada contacto necesita un evento real de "clic" hacia el que avanzar. Si falta, pregunto: "¿Cuál es lo primero que un nuevo registro necesita hacer para que el producto le haga clic, y qué sigue después?"

## Parámetro: `type`

- `welcome-series`: secuencia de 5 contactos en los días 0 / 1 / 3 / 7 / 14 para nuevos registros en `{segment}`. Cada contacto: asunto, vista previa, cuerpo, llamada a la acción, métrica de éxito. Escribe `onboarding/{segment}.md`.
- `renewal`: secuencia de 3 contactos previos a la renovación (Día-90 / Día-60 / Día-30) para `{account}`, fundamentada en la línea de tiempo de la cuenta. Cada contacto: asunto, cuerpo, llamada a la acción, logro específico a mencionar. Escribe `renewals/{account}-{YYYY-MM-DD}.md`.
- `expansion-nudge`: UN solo contacto para `{account}` fundamentado en una señal concreta de límite alcanzado (umbral de adopción de una función, cambio de tamaño del equipo, petición repetida). Escribe `expansions/{account}.md`.
- `churn-save`: UN solo mensaje de retención para `{account}` fundamentado en la señal de riesgo exacta de `churn-flags.json`, que ofrezca una opción genuina (pausa / bajar de plan / atención personalizada / reembolso). Escribe `saves/{account}.md`.

## Pasos

1. **Leer `config/context-ledger.json` y `config/voice.md`.** Relleno vacíos con una pregunta puntual.
2. **Leer `context/support-context.md`.** Si falta, me detengo y te digo que ejecutes primero `set-up-my-support-info`.
3. **Ramificar según `type`:**
   - `welcome-series`: pregunto por `{segment}` si no me lo diste, redacto 5 correos ligados a los hitos de activación del producto (reviso `domains.email.journey` si está definido, si no te pregunto por los eventos de registro / activación / clic).
     Formateo para el ESP conectado (Customer.io / Loops / Mailchimp / Kit vía Composio). Incluyo métricas de éxito por contacto.
   - `renewal`: encadeno `look-up-a-customer view=timeline` para la cuenta, extraigo logros, peticiones entregadas, fricción. Redacto Día-90 (recapitulación de valor), Día-60 (oportunidad de expansión o mecánica de renovación), Día-30 (petición directa + agenda). Cada referencia está fundamentada en el artefacto de la línea de tiempo.
   - `expansion-nudge`: encadeno `look-up-a-customer view=health` para encontrar la señal de límite alcanzado. Redacto un contacto corto y específico que nombre la señal ("noté que agregaste 3 puestos, {tier} elevaría el tope por puesto") y propongo una opción. Sin presión de venta; si no hay señal real, me detengo y te aviso.
   - `churn-save`: encadeno `look-up-a-customer view=churn-risk` para traer la alerta exacta. Reconozco el riesgo con honestidad, nombro el dolor específico, ofrezco pausa / bajar de plan / atención personalizada / reembolso, la que sea la política en `context/support-context.md`. Nunca invento un descuento no preaprobado.
4. **Escribir el artefacto** de forma atómica en la ruta correspondiente a este `type`.
5. **Añadir a `outputs.json`** con `type` = `onboarding-sequence` | `renewal-outreach` | `expansion-nudge` | `churn-save`, `domain: "success"`, título, resumen, ruta, estado `draft`.
6. **Resumirte a ti.** Titular: el gancho o asunto en una línea, la señal específica que lo fundamenta, ventana de envío recomendada.

## Resultados

- `onboarding/{segment}.md` (para `type = welcome-series`)
- `renewals/{account}-{YYYY-MM-DD}.md` (para `type = renewal`)
- `expansions/{account}.md` (para `type = expansion-nudge`)
- `saves/{account}.md` (para `type = churn-save`)
- Se añade `outputs.json` con `domain: "success"`.

## Qué nunca hago

- Enviar. Cada borrador de mensaje de ciclo de vida lo revisas tú.
- Usar culpa, escasez falsa, patrones oscuros (sobre todo en `churn-save` y `renewal`).
- Inventar un descuento, crédito o excepción que no esté en `context/support-context.md`.
- Redactar `expansion-nudge` sin una señal real de límite alcanzado: si los datos son escasos, me detengo y te aviso.

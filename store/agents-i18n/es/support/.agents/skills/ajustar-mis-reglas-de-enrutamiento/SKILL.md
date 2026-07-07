---
name: ajustar-mis-reglas-de-enrutamiento
title: "Ajustar mis reglas de enrutamiento"
description: "Actualizo las reglas que deciden cómo se clasifican los tickets entrantes y a dónde van. Cambio qué cuenta como error versus solicitud de función, redirijo los errores hacia un nuevo sistema de seguimiento, actualizo quién aprueba los reembolsos, agrego una nueva categoría, o ajusto el enrutamiento VIP. Cada triaje después de la actualización sigue automáticamente las nuevas reglas."
version: 1
category: Soporte
featured: no
image: headphone
integrations: [googledocs, stripe, notion, github, linear]
---


# Ajustar mis reglas de enrutamiento

## Cuándo usar esto

- "actualiza nuestro enrutamiento" / "arregla el enrutamiento" / "qué es error versus solicitud de función."
- "nos cambiamos a {tracker}" / "los reembolsos ahora van a {persona}" / "agrega un nivel nuevo."
- Cuando `review-my-support scope=weekly` detecta desviaciones en la clasificación.

## Conexiones que necesito

Hago el trabajo externo a través de Composio. Antes de ejecutar este Skill, verifico que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña Integraciones, y me detengo.

- **Sistema de seguimiento de desarrollo** (GitHub / Linear), destino nombrado para la regla de enrutamiento de errores. Obligatorio si el enrutamiento de errores termina en un sistema de seguimiento.
- **Facturación** (Stripe), destino nombrado para el enrutamiento de facturación. Opcional.
- **Documentos / notas** (Notion / Google Docs), destino nombrado para el enrutamiento del centro de ayuda o del estado. Opcional.

Si quieres que los errores fluyan hacia un sistema de seguimiento, me detengo y te pido que conectes el que realmente usas.

## Información que necesito

Primero leo tu contexto de soporte. Para cada campo obligatorio que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Categorías de enrutamiento actuales**, Obligatorio. Por qué lo necesito: reescribo a partir de tus reglas existentes, no desde cero. Si falta, pregunto: "¿En qué categorías clasificas los tickets hoy: error, cómo hacerlo, facturación, algo más?"
- **Qué está cambiando**, Obligatorio. Por qué lo necesito: no reescribo toda la sección si solo querías actualizar una regla. Si falta, pregunto: "¿Qué parte del enrutamiento quieres cambiar: el sistema de seguimiento, las categorías, quién aprueba los reembolsos, algo más?"
- **Quién aprueba los reembolsos**, Opcional. Por qué lo necesito: la regla de facturación nombra a una persona real. Si no lo tienes, sigo adelante con "por definir" y lo dejo como "el fundador aprueba."

## Pasos

1. **Leo `context/support-context.md`.** Si falta, primero ejecuto `set-up-my-support-info`.

2. **Te muestro las reglas actuales.** Leo la sección de reglas de enrutamiento, la resumo en 3 a 4 líneas ("hoy: error → Linear, solicitud de función → `requests.json`, interrupción → `playbooks/p1-outage.md`, facturación → Stripe + tú apruebas los reembolsos"). Pregunto: ¿qué cambia?

3. **Capturo la actualización.** Hago UNA pregunta puntual a la vez, no una entrevista completa. Actualizaciones típicas:
   - Nuevo destino de seguimiento (te cambiaste de Linear a GitHub Issues, etc.).
   - Nueva clasificación (por ejemplo, agregar "reporte de seguridad").
   - Nuevo contacto de escalamiento.
   - Cambio de quién aprueba los reembolsos.
   - Adiciones a la lista VIP (también pertenecen a la sección de segmentos, actualizo ambas si hace falta).

4. **Reescribo la sección de reglas de enrutamiento por completo.** Mantengo la forma de árbol de decisión. Para cada tipo, indico:
   - Frases o patrones que activan la regla.
   - Destino (identificador del sistema de seguimiento, ruta del playbook, expediente, chat).
   - Qué Skill actúa (`triage-a-ticket`, `flag-a-signal`, `draft-a-playbook`, etc.).
   - Qué datos capturar.

5. **También actualizo secciones relacionadas** si el cambio lo implica: lista VIP (sección de segmentos), niveles de tiempo de respuesta, entradas de problemas conocidos que mencionen el sistema de seguimiento cambiado. Explico con claridad qué más se tocó.

6. **Escribo de forma atómica** (`.tmp` → renombrar).

7. **Agrego una entrada a `outputs.json`** con `type: "routing-rules"`, `domain: "quality"`, título "Reglas de enrutamiento actualizadas: {razón breve}", un resumen de 2 oraciones sobre qué cambió, ruta `context/support-context.md`, estado `draft`.

8. **Te cuento el efecto.** Termino el resumen con: "Cada ejecución de `triage-a-ticket` y `flag-a-signal` después de esto lee las reglas nuevas, sin necesidad de sincronizar manualmente."

## Resultados

- `context/support-context.md` (enrutamiento y posiblemente secciones relacionadas actualizadas)
- Se agrega una entrada a `outputs.json` con `type: "routing-rules"`, `domain: "quality"`.

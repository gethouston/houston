---
name: auditar-mi-gasto-en-saas
title: "Auditar mi gasto en SaaS"
description: "Mira tu gasto real anualizado en SaaS en un solo lugar, incluyendo las suscripciones que olvidaste. Yo agrego todo lo que viene de tu proveedor de facturación, los recibos en tu bandeja de entrada y tu biblioteca de contratos, señalo duplicados y herramientas sin uso, y te muestro los tres principales candidatos a cancelar con su justificación. La mayoría de los fundadores se sorprenden con la cifra total la primera vez."
version: 1
category: Operaciones
featured: no
image: clipboard
integrations: [gmail, outlook, stripe]
---


# Auditar mi gasto en SaaS

Habilidad de revelación sorpresa. La mayoría de los fundadores solitarios no conocen su gasto anualizado en SaaS. Lo muestro en un solo archivo.

## Cuándo usarla

- "audita mi gasto en SaaS".
- "qué estoy pagando".
- "encuentra las suscripciones que olvidé".
- "cuánto estamos gastando en herramientas".

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta habilidad verifico que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido conectarla desde la pestaña de Integraciones y me detengo.

- **Facturación** (Stripe) - Requerido. Extrae los cargos recurrentes para que yo vea la lista real de suscripciones, no solo lo que recuerdas.
- **Bandeja de entrada** (Gmail, Outlook) - Requerido. Captura recibos y correos de renovación de herramientas que no están en tu tarjeta.
- **Archivos** (Google Drive) - Opcional. Me ayuda a encontrar los contratos firmados para cruzarlos con los cargos.

Si no está conectada ni la facturación ni la bandeja de entrada, me detengo y te pido conectar tu facturación primero.

## Información que necesito

Primero leo tu contexto de operaciones. Por cada campo requerido que falte hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Postura frente a proveedores** - Requerido. Por qué lo necesito: me dice qué tan agresivo ser al marcar duplicados y candidatos a cancelar. Si falta, pregunto: "¿Cómo sueles pensar en los proveedores: mantener todo ajustado y cancelar rápido, o quedarte con lo que funciona?"
- **Lista de proveedores conocidos** - Opcional. Por qué lo necesito: cualquier cosa que encuentre fuera de esta lista es una suscripción olvidada. Si no la tienes, sigo adelante con TBD y trato todo lo que encuentre como nuevo.
- **Auditoría anterior** - Opcional. Por qué lo necesito: me permite marcar variaciones de precio desde la última vez. Si no la tienes, omito la sección de variación de precios.

## Pasos

1. **Leo `context/operations-context.md`** - la etapa y la postura frente a proveedores anclan los umbrales de severidad. Si falta: me detengo y pido `set-up-my-ops-info`.

2. **Leo `config/procurement.json`** - `knownVendors` = lista conocida; cualquier cosa que NO esté en la lista y aparezca durante la auditoría = posible suscripción olvidada.

3. **Agrego las fuentes.**

   - **Fuente A - biblioteca de contratos (`contracts/`).** Cada contrato analizado produce una suscripción. Extraigo: proveedor, monto si se conoce, frecuencia de facturación, fecha de renovación.
   - **Fuente B - facturación conectada.** `composio search billing` → list-subscriptions / list-charges. Extraigo los cargos recurrentes de los últimos 12 meses. Normalizo a monto anualizado.
   - **Fuente C - recibos en la bandeja de entrada.** `composio search inbox` → busco `receipt OR "subscription renewed" OR "payment confirmed" OR invoice` en los últimos 90 días. Extraigo dominio del remitente + monto + fecha. Captura suscripciones que no están en la tarjeta.

4. **Deduplico entre fuentes.** Cruzo por (nombre de proveedor normalizado) + (monto ± 5%) + (frecuencia de facturación). La misma suscripción en dos fuentes → fusiono y anoto todas las fuentes.

5. **Anualizo cada entrada.** Mensual × 12, trimestral × 4, anual × 1.

6. **Detecto patrones.**

   - **Duplicados / solapamientos.** ¿Dos herramientas de gestión de proyectos? ¿Tres gestores de contraseñas? ¿Dos apps de notas? Marco con una línea: "considera consolidar en {una}."
   - **Herramientas sin uso.** Para cada suscripción, intento un chequeo de uso: `composio search {categoría}` → ¿el proveedor tiene API de último inicio de sesión o de uso? Si no, uso como aproximación la "fecha del último recibo" vs "la última actividad en la bandeja de entrada conectada". Marco todo lo que no tenga actividad aproximada en más de 60 días.
   - **Suscripciones olvidadas.** Cualquier cosa encontrada en la Fuente B o C que NO esté en `knownVendors` ni en `contracts/` → la señalo explícitamente.
   - **Variación de precios.** Si existe una auditoría anterior en `spend/` y el monto anualizado de un proveedor saltó más del 15%, lo marco.

7. **Produzco la salida** (la guardo en `spend/{YYYY-MM-DD}-audit.md`):

   - **Titular** - gasto anualizado total, cantidad de suscripciones.
   - **Tabla de gasto** - ordenada por monto anualizado descendente. Columnas: Proveedor | Categoría | Anualizado | Facturación | Próxima renovación | Última actividad | Señal.
   - **Duplicados / solapamientos** - agrupados por categoría.
   - **Sin uso (sin actividad en más de 60 días)** - lista con evidencia.
   - **Suscripciones olvidadas** - lo que no está en `config/procurement.json` ni en `contracts/`.
   - **Variación de precios** - deltas vs la auditoría anterior.
   - **Top 3 candidatos a cancelar** - las 3 cancelaciones de mayor impacto (monto anualizado alto + uso bajo + sin trampa de renovación automática). Cada una con una justificación de 3 líneas.

8. **Escrituras atómicas** - `*.tmp` → rename.

9. **Agrego a `outputs.json`** con `type: "spend-audit"`, status "ready".

10. **Sugiero próximos pasos.**
    - Por cada candidato principal a cancelar: "¿listo para redactar el correo de cancelación? Usa `draft-a-message type=vendor` con el subtipo de cancelación."
    - Si existen suscripciones olvidadas y faltan los contratos: "corre `read-a-contract` sobre {proveedor} cuando hayas ubicado el contrato."

## Salidas

- `spend/{YYYY-MM-DD}-audit.md`
- Agrega a `outputs.json` con `type: "spend-audit"`.

## Lo que nunca hago

- **Cancelar una suscripción.** Yo identifico candidatos; el fundador decide; `draft-a-message type=vendor` escribe el borrador; el fundador lo envía.
- **Mover dinero, modificar datos de facturación o cambiar métodos de pago.** Solo lectura sobre la facturación.
- **Tratar los datos de facturación como fuente de verdad absoluta.** Si las fuentes discrepan → muestro la discrepancia, no elijo un ganador en silencio.

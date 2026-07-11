---
name: programar-mi-reconocimiento-de-ingresos
title: "Programar mi reconocimiento de ingresos"
description: "Distribuyo un contrato de cliente en un cronograma de reconocimiento limpio bajo ASC 606, un archivo por contrato organizado por cliente. Manejo los patrones comunes en startups (pago anual por adelantado con reconocimiento mensual proporcional, basado en uso con un piso, diferimiento de la tarifa de implementación, modificaciones de contrato con ajuste prospectivo vs. acumulado), y señalo las decisiones de criterio (contraprestación variable, financiamiento significativo, partidas no monetarias) con opciones e impacto en dólares. Redacto y muestro, nunca decido por ti y nunca publico nada."
version: 1
category: Contabilidad
featured: no
image: ledger
integrations: [hubspot, stripe]
---

# Programar mi reconocimiento de ingresos

Convierto un contrato firmado en un cronograma de reconocimiento de ingresos mes a mes bajo ASC 606. Un artefacto JSON por contrato, agrupado por cliente. Los patrones comunes ya vienen incorporados; lo que de verdad requiere criterio (contraprestación variable, financiamiento significativo, partidas no monetarias) lo marco para que tú decidas. Resumo las opciones, nunca decido, y nunca publico.

## Cuándo usarlo

- "arma el cronograma de reconocimiento de ingresos para {customer}" / "distribuye este contrato".
- "arma el cronograma ASC 606" / "reconocimiento ASC 606 para este contrato" - mismo flujo, en el lenguaje del founder.
- "el cliente renovó / mejoró su plan / agregó un SKU, actualiza el reconocimiento de ingresos".
- "facturamos esto anualmente; reconócelo mensualmente".
- Llamado por `close-my-month` como parte del paso de reconocimiento de ingresos, una vez por cada contrato activo.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta skill, reviso que las categorías de abajo estén vinculadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Stripe** (facturación) - fuente preferida para contratos de suscripción, líneas de partida, y cadencia de facturación. Obligatorio si Stripe es tu fuente de contratos.
- **HubSpot** (CRM) - fuente alterna / complementaria para contratos firmados y precios a nivel de SKU. Opcional.

Si ninguna está conectada, recurro a un archivo de contrato que sueltes (PDF, DOCX, CSV) o a un resumen pegado. Si no tienes nada para compartir, me detengo y te pido que conectes Stripe o sueltes el contrato.

## Información que necesito

Primero leo tu contexto contable. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **El contrato en sí** - Obligatorio. Por qué: no puedo armar un cronograma de reconocimiento sin fecha de vigencia, fecha de término, líneas de partida, y precios. Si falta, pregunto: "¿Puedes compartir el contrato firmado? Conectar Stripe o HubSpot es lo más fácil, si no, suelta el PDF o pega las líneas de partida."
- **Tu modelo de ingresos y tu postura frente a ASC 606** - Obligatorio. Por qué: suscripción vs. uso vs. servicios cambia cómo se reconoce cada obligación de desempeño. Si falta, pregunto: "¿Cómo genera ingresos el negocio, suscripciones, por uso, servicios, o una mezcla? ¿Y estás intentando seguir ASC 606 al pie de la letra o te mantienes en base de caja?"
- **Un plan de cuentas con líneas de ingresos diferidos e ingresos** - Obligatorio. Por qué: redacto los borradores de asiento contable contra códigos de cuenta reales, nunca inventados. Si falta, pregunto: "¿Ya tenemos un plan de cuentas con una línea de ingresos diferidos? Si no, redactemos uno primero."
- **Si esto es un contrato nuevo o una modificación** - Opcional. Por qué: cambia si lo trato como un cronograma nuevo o como una modificación prospectiva / con ajuste acumulado. Si falta, pregunto: "¿Este es un contrato de cliente completamente nuevo, o un upsell o cambio a uno existente? Si no lo tengo, asumo que es nuevo y te lo marco para que confirmes."

## Pasos

1. **Leo el contexto.** Cargo `context/bookkeeping-context.md`, `config/context-ledger.json` (necesito `domains.revenue`, el modelo + postura ASC 606 + fuente de contratos), `config/chart-of-accounts.json` (necesito los códigos de cuenta de ingresos diferidos + ingresos). Si falta `domains.revenue`, hago una pregunta puntual con pista de modalidad (app conectada > archivo > URL > texto pegado), la guardo, y continúo.

2. **Cargo el contrato.** Orden de fuente: app conectada (Stripe / HubSpot vía Composio, descubro los slugs en tiempo de ejecución con `composio search billing` / `composio search crm`) > archivo soltado (CSV / PDF / DOCX) > URL > texto pegado. Extraigo:
   - `customer` - nombre + id interno si está disponible.
   - `contractId` - id del lado del proveedor si está disponible, si no, un slug.
   - `effectiveDate`, `endDate`.
   - Líneas de partida (SKU, descripción, cantidad, precio unitario, cadencia de facturación, fechas de inicio/fin, indicador de basado en uso, piso si lo hay).
   - Términos de pago (por adelantado / mensual / neto 30).
   - Lenguaje de contraprestación no monetaria o variable.

3. **Identifico las obligaciones de desempeño.** Por cada línea de partida, decido si es una obligación distinta o si se combina:
   - Suscripción SaaS independiente → una obligación por término de suscripción.
   - Tarifa de implementación / incorporación → obligación distinta solo si el servicio es útil por separado; si no, la combino con la suscripción, amortizada durante la vida del contrato. La marco de cualquier forma.
   - Excedente basado en uso → contraprestación variable en la misma obligación que la suscripción subyacente.
   - Servicios profesionales con entregables definidos → una obligación por entregable.

   Arreglo de salida `performanceObligations[]`:
   `{id, description, standaloneSellingPrice, recognitionPattern: "ratable" | "point-in-time" | "usage" | "milestone", startDate, endDate}`.

4. **Calculo el precio de la transacción.** Sumo la contraprestación fija entre todas las obligaciones. Agrego el piso (si lo hay) para las partidas basadas en uso. Marco, sin incluir automáticamente, cualquiera de estas:
   - **Contraprestación variable** (niveles por volumen, bonos por desempeño, reembolsos). Resumo las opciones (valor esperado vs. monto más probable), me detengo para tu confirmación.
   - **Componente de financiamiento significativo** (pago a más de 12 meses de la transferencia de control). Resumo, me detengo.
   - **Contraprestación no monetaria** (acciones, tokens, trueque). Resumo, me detengo.

   Nunca invento el tratamiento. Las partidas marcadas quedan en el arreglo `judgmentCalls[]` con opciones + recomendación.

5. **Asigno el precio de la transacción entre las obligaciones.** Uso el precio de venta independiente (SSP) como base de asignación por defecto. Si el SSP de la tarifa de implementación no es observable, uso el enfoque residual y lo marco. Produzco `allocation[]` - `{poId, allocatedAmount, method}`.

6. **Armo el cronograma de reconocimiento mensual.** Por cada obligación, aplico el patrón de reconocimiento:
   - **Proporcional** (pago anual por adelantado, mensual proporcional): `allocatedAmount / months_in_term`, cada mes desde `startDate` hasta `endDate`.
   - **Basado en uso con piso**: reconozco el piso de forma proporcional durante el término; reconozco el uso por encima del piso en el mes en que se genera (dejo filas de marcador de posición, tú completas los datos reales durante el cierre).
   - **Diferimiento de tarifa de implementación**: amortizo `allocatedAmount / months_in_contract_life`, en línea recta durante todo el término.
   - **Punto en el tiempo / hito**: una sola fila en la fecha de reconocimiento.

   Genero `schedule[]`: `{period, poId, amount, cumulativeRecognized, method}`. `cumulativeRecognized` es el acumulado corrido por obligación + total.

7. **Manejo las modificaciones de contrato.** Si marcas esto como una modificación de un contrato anterior (upsell, downsell, extensión de término):
   - **Prospectiva** (agrega bienes/servicios distintos al SSP): la trato como un contrato nuevo; empiezo un cronograma nuevo desde la fecha de modificación.
   - **Ajuste acumulado** (cambia el precio de obligaciones existentes, sin bienes distintos nuevos): recalculo el total revisado, reasigno, registro el ajuste acumulado en el período de modificación.

   La decisión de tratamiento es una decisión de criterio, resumo ambas opciones con el impacto en dólares, me detengo para tu confirmación.

8. **Redacto los borradores de asiento contable de soporte.** Por cada fila en `schedule[]`, genero un borrador de esquema de asiento contable (Dr ingresos diferidos / Cr ingresos, o Dr activo de contrato / Cr ingresos según corresponda). NO escribo en `journal-entries.json` aquí, tú corres `draft-a-journal-entry type=revrec` para persistirlo. Lo incluyo en el JSON de salida para que la skill de asientos contables lo reciba listo.

9. **Escribo el artefacto.** Convierto `customer` + `contractId` a slug. Ruta: `revrec/{customer-slug}/{contract-slug}.json`. Escritura atómica: `.tmp` → renombrar. Esquema completo:
   ```jsonc
   {
     "id": "<uuid>",
     "createdAt": "...",
     "updatedAt": "...",
     "customer": { "name": "...", "slug": "..." },
     "contract": { "id": "...", "slug": "...", "effectiveDate": "...", "endDate": "..." },
     "performanceObligations": [ /* paso 3 */ ],
     "transactionPrice": 120000.00,
     "allocation": [ /* paso 5 */ ],
     "schedule": [ /* paso 6 */ ],
     "judgmentCalls": [ /* paso 4 + paso 7 */ ],
     "jeStubs": [ /* paso 8 */ ],
     "status": "draft"
   }
   ```

10. **Agrego a `outputs.json`.** Leo, combino y escribo. Una fila por artefacto de contrato: `{id, type: "revrec-schedule", title: "Revenue Recognition - {customer} / {contract}", summary: "<2-3 oraciones sobre precio de transacción, término, y cualquier decisión de criterio>", path, status: "draft", domain: "close"}`.

11. **Te resumo.** Un párrafo: precio de la transacción, término, monto de reconocimiento mensual, y, lo más importante, cualquier `judgmentCalls` que bloquee la finalización. Por cada decisión de criterio, listo las opciones + el tratamiento recomendado + el impacto en dólares, y espero tu confirmación antes de cambiar `status: "ready"`.

## Resultados

- `revrec/{customer-slug}/{contract-slug}.json` (cronograma por contrato)
- `outputs.json` fila: `type: "revrec-schedule"`, `domain: "close"`, `status: "draft"` hasta que apruebes cada decisión de criterio.

---
name: preparar-mi-paquete-para-inversionistas
title: "Preparar mi paquete para inversionistas"
description: "Armo un paquete financiero listo para la junta directiva a partir del cierre más reciente: un resumen ejecutivo de una página (efectivo, quema, runway, ingresos mensuales / ingresos anuales, margen bruto, cantidad de empleados, las 3 principales variaciones) seguido del estado de resultados, balance general, flujo de efectivo, KPIs de SaaS (cascada de ingresos mensuales, NRR, margen bruto, recuperación de CAC), retención por cohortes si tienes ≥ 6 cohortes, y sensibilidad del runway. `mode=saas-metrics` omite el paquete completo y solo actualiza ingresos mensuales / ingresos anuales / margen bruto / NRR. Espejo opcional en Google Docs para que la junta pueda comentar. Solo borradores, nunca envío nada."
version: 1
category: Contabilidad
featured: no
image: ledger
integrations: [googledocs]
---


# Preparar mi paquete para inversionistas

Paquete para la junta a partir de tu cierre más reciente. Resumen ejecutivo arriba de todo, efectivo, quema, runway, ingresos mensuales / ingresos anuales, margen bruto, cantidad de empleados, los 3 principales factores de variación, seguido de los estados completos, KPIs de SaaS, retención por cohortes, y sensibilidad del runway más abajo. Espejo opcional en Google Docs para que tu junta pueda comentar sobre el mismo documento. Solo borradores, nunca envío nada.

## Cuándo usarlo

- "redacta el paquete financiero para la junta" / "prepara las finanzas de la actualización para inversionistas" / "arma el paquete para inversionistas del trimestre {N}".
- `mode=saas-metrics` - "actualiza ingresos mensuales / ingresos anuales" / "¿cuál es nuestro NRR este mes?" - omite el paquete completo, escribe solo el archivo de métricas.
- Después de que `close-my-month` termina el mes de fin de trimestre, o cuando quieras un paquete nuevo entre cierres.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta skill, reviso que las categorías de abajo estén vinculadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Google Docs** (docs) - opcional, me permite reflejar el paquete en un Google Doc donde tu junta pueda comentar. Si no está conectado, lo dejo como archivo markdown.

Esta skill se arma por completo a partir de tus meses ya cerrados, tus reportes de runway, y tus cronogramas de reconocimiento de ingresos. Ninguna conexión bloquea la corrida.

## Información que necesito

Primero leo tu contexto contable. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Un cierre terminado para el período** - Obligatorio. Por qué: el paquete copia el estado de resultados, el balance general, y el flujo de efectivo directamente del cierre. Si falta, pregunto: "¿Ya cerramos los libros del último mes? Si no, hagamos primero el cierre."
- **Un reporte actualizado de quema y runway** - Obligatorio. Por qué: el paquete incluye efectivo, quema, y sensibilidad del runway a partir del reporte de runway. Si falta, pregunto: "¿Quieres que actualice primero el reporte de runway? Solo toma un minuto."
- **Tu modelo de ingresos** - Obligatorio. Por qué: el paquete de SaaS incluye ingresos mensuales / ingresos anuales / NRR / retención por cohortes; el que no es SaaS se salta esas secciones. Si falta, pregunto: "¿Cómo genera ingresos el negocio, suscripciones recurrentes, por uso, servicios, o una mezcla?"
- **Los KPIs que le importan a tus inversionistas** - Opcional. Por qué: me permite anclar el resumen ejecutivo a los números que tu junta ya sigue. Si no lo tienes, uso por defecto efectivo, quema, runway, ingresos mensuales / ingresos anuales, y margen bruto.
- **Datos de contratos que abarquen al menos 13 meses** - Opcional. Por qué: se necesita para el NRR de los últimos doce meses y la retención por cohortes. Si no lo tienes, me salto esas secciones y anoto que aparecerán una vez tengas suficiente historial.

## Pasos

1. **Leo el contexto.** Cargo `context/bookkeeping-context.md`, `config/context-ledger.json`, `config/chart-of-accounts.json`. Campos obligatorios del libro de contexto: `universal.company`, `universal.accountingMethod`, `domains.revenue.model`, `domains.investors.anchorKpis`. Si falta un campo, hago una pregunta puntual con pista de modalidad (app conectada > archivo > URL > texto pegado), la guardo de forma atómica antes de continuar.

2. **Ubico el último cierre.** Listo `closes/*/package.md`, elijo el `YYYY-MM` más reciente. Si el último cierre figura como `draft` en `outputs.json`, te aviso y pregunto: ¿seguimos con el borrador o esperamos? Registro el período del cierre como fecha de corte del paquete.

3. **Ubico el último reporte de runway.** Listo `runway/*.md`, elijo el más reciente por fecha en el nombre del archivo. Leo el saldo de efectivo, la quema neta (de 3 y 6 meses), los meses de runway, y las 3 principales sensibilidades por factor de costo.

4. **Leo los cronogramas de reconocimiento de ingresos.** En modelos de SaaS/suscripción, cargo cada `revrec/{customer-slug}/{contract-slug}.json`. Los ingresos mensuales actuales = suma de reconocimiento mensual activo por contrato. Ingresos anuales = ingresos mensuales * 12.

5. **Calculo la cascada de ingresos mensuales (si es SaaS).** Con los últimos 12 meses de cronogramas de reconocimiento de ingresos:
   - **Ingresos mensuales nuevos** - contratos cuyo primer mes de reconocimiento cae dentro del período.
   - **Ingresos mensuales de expansión** - aumentos en contratos de clientes existentes (upsell, expansión de asientos).
   - **Ingresos mensuales de contracción** - disminuciones en contratos de clientes existentes (downgrade, reducción de asientos).
   - **Ingresos mensuales de baja** - contratos cuyo reconocimiento se detuvo en el período (el cliente se fue).
   - Ingresos mensuales netos nuevos = Nuevos + Expansión − Contracción − Baja.
   Cito cada delta con la ruta `revrec/{customer}/{contract}.json` + el id del contrato.

6. **Calculo el NRR sobre la cohorte de los últimos 12 meses.** Cohorte = clientes activos hace 12 meses. NRR = (ingresos mensuales actuales de la cohorte) / (ingresos mensuales de la cohorte hace 12 meses). Lo reporto en porcentaje. Solo lo calculo si los datos de contratos abarcan ≥ 13 meses.

7. **Calculo el margen bruto.** Margen bruto % = (Ingresos − costo de ventas) / Ingresos, del estado de resultados del último cierre. Extraigo las líneas de ingresos + costo de ventas directamente de `closes/{YYYY-MM}/package.md`.

8. **Calculo la recuperación de CAC (opcional).** Si el gasto de marketing y ventas es identificable en el estado de resultados Y ya calculé los ingresos mensuales nuevos: CAC = gasto de Ventas y Marketing / clientes nuevos; meses de recuperación de CAC = CAC / (ingresos mensuales nuevos * margen bruto %). Lo reporto solo si ambos insumos son números reales, si no, lo marco como `Por definir, necesita atribución del gasto de marketing`.

9. **Armo la tabla de retención por cohortes (si hay datos de contratos).** Filas = mes de la cohorte (primer mes de contrato); columnas = meses desde la adquisición (M0..M12+); celdas = ingresos mensuales retenidos / ingresos mensuales M0 de la cohorte. Una fila por mes de cohorte. La incluyo solo si existen ≥ 6 cohortes.

10. **Armo el paquete** en `investor-financials/{yyyy-qq}.md`. Slug del trimestre: `2026-q1`, `2026-q2`, etc., derivado del mes del período de cierre. Estructura:
    1. **Resumen ejecutivo (una página)** - saldo de efectivo, quema neta promedio de 3 meses, meses de runway, ingresos mensuales, ingresos anuales, margen bruto %, cantidad de empleados, los 3 principales factores de variación vs. el trimestre anterior.
    2. **Estado de resultados** - copiado del cierre.
    3. **Balance general** - copiado del cierre.
    4. **Flujo de efectivo** - copiado del cierre.
    5. **KPIs de SaaS (si aplica)** - cascada de ingresos mensuales, ingresos anuales, NRR, margen bruto %, recuperación de CAC.
    6. **Tabla de retención por cohortes** (si hay ≥ 6 cohortes).
    7. **Runway + sensibilidad** - copiado del último reporte de runway.
    8. **Notas de decisiones de criterio** - cualquier posición que necesite tu confirmación (casos límite en la definición de baja, alcance del CAC).

    Cada KPI cita su fuente (ruta del cierre + línea, rutas de reconocimiento de ingresos, ruta del runway). Sin números inventados.

11. **Espejo opcional en Google Docs.** Si `composio search docs` devuelve un slug de Docs conectado, reflejo el paquete en un Doc nuevo, incluyo la URL arriba del `.md`. Sin conexión, lo salto en silencio.

12. **Rama `mode=saas-metrics`.** Salto los pasos 3, 9, y el armado completo del paso 10. Escribo `investor-financials/metrics-{YYYY-MM}.md` con solo: ingresos mensuales (actuales + cascada), ingresos anuales, margen bruto %, NRR. Sin espejo en Docs.

13. **Escritura atómica.** `.tmp` + renombrar sobre la ruta de destino.

14. **Agrego a `outputs.json`.** Fila: `{type: "investor-financials", title: "Investor pack {yyyy-qq}" | "SaaS metrics {YYYY-MM}", summary, path, status: "draft", domain: "reporting"}`. Leo, combino y escribo.

15. **Te resumo.** Un párrafo: qué armé, sobre qué período de cierre se basa, los números principales (efectivo, quema, runway, ingresos anuales, margen bruto %), cualquier partida "por definir", y el siguiente paso (tú lo revisas, nunca lo envío). Nunca publico, nunca envío correos.

## Resultados

- `investor-financials/{yyyy-qq}.md` (paquete completo, indexado en `outputs.json` como `investor-financials`)
- `investor-financials/metrics-{YYYY-MM}.md` (solo en el submodo, mismo tipo en `outputs.json`)
- Espejo opcional en Google Docs (URL capturada en el encabezado del `.md`)

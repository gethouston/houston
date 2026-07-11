---
name: entregar-a-mi-preparador-de-impuestos
title: "Entregar a mi preparador de impuestos"
description: "Armo el paquete de fin de año para tu preparador de impuestos. Exijo una auditoría limpia como requisito (`audit-my-books` se ejecuta primero; los pendientes bloquean la entrega), y luego reúno el balance de comprobación, las conciliaciones por cuenta, los cronogramas de activos fijos y depreciación, la lista de 1099, la clasificación de I+D (si aplica), los candidatos a ajuste M-1 (no deducibilidad de comidas al 50% / 100%, diferencias de tiempo entre libros y fiscal en compensación con acciones, diferencias entre devengado y efectivo, impuesto federal sobre la renta, ingresos diferidos, gastos no deducibles), y un registro de las decisiones de criterio tomadas. Espejo opcional en Google Drive compartido con tu preparador como comentarista. Redacto el correo para tu preparador, nunca lo envío y nunca presento nada."
version: 1
category: Contabilidad
featured: no
image: ledger
integrations: [googledrive, gmail, outlook]
---


# Entregar a Mi Preparador de Impuestos

Paquete de entrega fiscal de fin de año. Sujeto a `audit-my-books`, los libros deben estar limpios primero. Una vez limpios, armo el cuadre fiscal completo bajo `handoffs/tax-{year}/`, opcionalmente lo reflejo en Google Drive, y redacto el correo para tu preparador con el enlace a la carpeta. Nunca se presenta, nunca se envía.

## Cuándo usarlo

- "cierra el año para el preparador de impuestos" / "prepara el cuadre fiscal" /
  "entrega a nuestro contador fiscal" / "paquete de fin de año para impuestos".
- Se ejecuta una vez por año fiscal, después de que el `close-my-month`
  del último mes se completa.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr este skill verifico que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Google Drive** (archivos), opcional, me permite reflejar toda la carpeta de entrega en una ubicación compartida que tu preparador de impuestos pueda ver. Si no está conectado, mantengo el paquete local.
- **Gmail u Outlook** (bandeja de entrada), opcional, me permite crear un correo borrador para tu preparador de impuestos con el enlace del paquete. Nunca lo envío. Si no está conectado, escribo el texto del correo en un archivo borrador.

Si quieres tanto el espejo en Drive como el borrador de correo y ninguno está conectado, nombro ambas categorías y te pido que conectes la que prefieras.

## Información que necesito

Primero leo tu contexto de contabilidad. Por cada campo requerido que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > pegar) y espero.

- **El año fiscal que estás entregando**, requerido. Por qué: define el rango de fechas para el balance de comprobación y los cronogramas de soporte. Si falta, pregunto: "¿Qué año fiscal estamos entregando, el más recientemente completado?"
- **Nombre y correo del preparador de impuestos**, requerido. Por qué: se coloca en el memo de portada y en el borrador de correo. Si falta, pregunto: "¿Quién presenta tu declaración este año, nombre y correo para poder dirigirle el paquete?"
- **Si estás reclamando el crédito de I+D**, requerido. Por qué: si es sí, incluyo la clasificación de I+D en el paquete. Si falta, pregunto: "¿Planeas reclamar el crédito federal de I+D este año, sí, no, o aún no decides?"
- **Una lista de activos fijos capitalizados**, opcional. Por qué: impulsa el cronograma de depreciación. Si no tienes activos capitalizados, omito esa sección. Si falta, pregunto: "¿Tienes activos fijos capitalizados (laptops compradas como activo, equipo, mejoras a locales arrendados)? Si no los tienes, sigo adelante sin un cronograma de depreciación."
- **Cierres mensuales limpios hasta fin de año**, requerido. Por qué: la entrega está sujeta a que los libros estén limpios; las brechas abiertas de conciliación y los ítems sin categorizar tienen que cerrarse primero. Si falta, pregunto: "¿Ya cerramos todos los meses del año fiscal? Si no, terminemos eso primero, de lo contrario la entrega tendrá demasiados pendientes abiertos."

## Pasos

1. **Leer el contexto.** Cargar `context/bookkeeping-context.md`,
   `config/context-ledger.json`, `config/chart-of-accounts.json`.
   Registro requerido: `universal.company` (nombre legal, EIN, tipo
   de entidad, año fiscal), `universal.accountingMethod`,
   `domains.tax.preparerName`, `domains.tax.preparerEmail`,
   `domains.tax.rdCreditEligible`. Preguntar por el contacto del
   preparador si falta (archivo > pegar) y guardarlo en caché.

2. **Determinar el año fiscal.** Si se especifica, usarlo; si no,
   usar por defecto el año fiscal más recientemente completado según
   `universal.company.fiscalYearEnd`.

3. **Requisito previo, ejecutar `audit-my-books` primero.** Invocar el
   skill `audit-my-books` para el período que termina en el cierre del
   año fiscal. Si quedan hallazgos (suspenso, brechas de conciliación
   > $100 con más de 30 días de antigüedad, devengos obsoletos,
   asientos contables atascados en borrador, candidatos a corte,
   brechas de saldo de apertura, fusiones de proveedores de alta
   prioridad), DETENERSE. Presentar la lista de bloqueos con la ruta
   de la auditoría; pedirte que cierres cada uno (o que confirmes
   explícitamente que cada uno es inmaterial). No continuar hasta que
   tú despejes el requisito previo.

4. **Balance de comprobación.** Invocar `prepare-my-financials` con
   `statement=trial-balance` y `as-of = fiscal year-end`. Escribir a
   `handoffs/tax-{year}/trial-balance.md`. Debe cuadrar con una
   diferencia de hasta 1 centavo.

5. **Resúmenes de conciliación.** Para cada cuenta en
   `domains.banks.accounts[]`, copiar la conciliación mensual final
   desde `reconciliations/{account_last4}/{YYYY-MM}.md` a la carpeta
   de entrega, más un consolidado por cuenta en
   `handoffs/tax-{year}/reconciliations/{account_last4}.md`
   (apertura → actividad mensual → cierre → ítems sin cruzar,
   debería estar vacío o documentado desde el requisito previo de
   auditoría).

6. **Cronograma de activos fijos.** Leer `config/fixed-assets.json`
   (si no existe, preguntarte si existen activos capitalizados; si
   no hay ninguno, omitir). Incluir por activo: fecha de puesta en
   servicio, costo de adquisición, método (línea recta / clase
   MACRS), vida útil, depreciación acumulada a fin de año, valor en
   libros neto. Escribir a
   `handoffs/tax-{year}/fixed-asset-schedule.md`.

7. **Cronograma de depreciación.** Calcular la depreciación en línea
   recta del año completo a partir del cronograma de activos fijos
   (convención de medio año por defecto; anotarlo arriba). Escribir a
   `handoffs/tax-{year}/depreciation-schedule.md`. Solo depreciación
   contable, la depreciación fiscal (MACRS, §179, bonus) es cálculo
   del preparador.

8. **Lista de 1099.** Invocar `prep-my-1099s` para el año fiscal
   (omitir el paso de redacción de correo si ya se ejecutó). Copiar
   `compliance/1099s/{year}.md` → `handoffs/tax-{year}/1099-
   list.md`.

9. **Clasificación de I+D (si aplica).** Si
   `domains.tax.rdCreditEligible == "yes"`, invocar
   `tag-my-rd-spend` para el año y copiar
   `compliance/rd-credit/{year}.md` →
   `handoffs/tax-{year}/rd-classification.md`. Si no, omitir con
   una línea en el memo de portada.

10. **Candidatos a ajuste M-1.** Escribir
    `handoffs/tax-{year}/m1-adjustments.md` listando las diferencias
    comunes entre libros y fiscal con montos de los libros:
    - **Comidas**, no deducibilidad del 50% en comidas de
      restaurante; no deducibilidad del 100% en la mayoría de las
      demás comidas después de 2023. Dividir por memo cuando sea
      posible; marcar `TBD` en caso contrario.
    - **Compensación en acciones**, gasto contable de compensación en
      acciones vs. el momento fiscal (fiscalmente se deduce al
      ejercicio / vesting según el plan).
    - **Diferencias entre devengado y efectivo**, si se presenta en
      base de efectivo mientras los libros son de devengado, listar
      los saldos de pasivos devengados más cuentas por cobrar a fin
      de año. Omitir si ambos son de devengado.
    - **Gasto de impuesto federal sobre la renta**, deducción
      contable, adición fiscal.
    - **Ingresos no devengados**, saldo de ingresos diferidos a fin
      de año (la base de efectivo lo reconoce distinto).
    - **Otros gastos no deducibles**, multas, sanciones,
      entretenimiento (posterior a la TCJA), contribuciones
      políticas.
    Cada fila: monto en libros, dirección (adición / deducción),
    memo. Marcar cada decisión de criterio, el preparador finaliza.

11. **Notas de decisiones de criterio.** Recorrer `outputs.json` del
    año fiscal y reunir cada nota de "decisión de criterio" (de
    `schedule-my-revenue`, `tag-my-rd-spend`,
    `draft-a-journal-entry type=stock-comp`, etc.). Escribir a
    `handoffs/tax-{year}/judgment-calls.md` con entradas por ítem:
    qué se decidió, por quién, cuándo, alternativas
    consideradas. Registro de auditoría del preparador.

12. **Memo de portada.** `handoffs/tax-{year}/cover-memo.md`, una
    página. Bloque de la empresa (nombre legal, EIN, tipo de
    entidad, estado, fin de año fiscal); postura contable; contenido
    del paquete (con viñetas y enlaces); utilidad neta en libros;
    los 3 a 5 ítems principales para la atención del preparador;
    TBDs abiertos; línea de firma.

13. **Espejo opcional en Google Drive.** Si `composio search files`
    devuelve un slug de Drive conectado: crear la carpeta `Tax
    Handoff {YYYY} - {Legal Name}`, subir cada archivo desde
    `handoffs/tax-{year}/` conservando las subcarpetas, compartir
    con `domains.tax.preparerEmail` como comentarista (nunca como
    editor). Capturar la URL en el encabezado del memo de portada.
    Omitir en silencio si Drive no está conectado.

14. **Redactar el correo al preparador.** Si `composio search inbox`
    devuelve un slug de Gmail / Outlook conectado, crear un borrador
    en la bandeja de entrada (nunca enviar) a
    `domains.tax.preparerEmail`, asunto `"{Legal Name}
    {YYYY} tax handoff package"`, cuerpo que referencia el memo de
    portada más la URL de Drive (o la ruta de la carpeta local) con
    un resumen breve del paquete y los ítems principales. Guardar el
    id/URL del borrador en el memo de portada bajo "Correo borrador
    al preparador". Si no hay conexión de bandeja de entrada,
    escribir el texto del correo en
    `drafts/tax-preparer-handoff-{year}.md`.

15. **Anexar a `outputs.json`.** Fila:
    `{type: "tax-handoff", title: "Tax handoff {year}", summary,
    path: "handoffs/tax-{year}/cover-memo.md", status: "draft",
    domain: "compliance"}`. Lectura-fusión-escritura. Cambiar a
    `ready` cuando confirmes la revisión; `posted` solo cuando
    confirmes que se envió al preparador.

16. **Resumirte.** Un párrafo: el paquete está en
    `handoffs/tax-{year}/`, componentes incluidos, utilidad neta en
    libros, TBDs restantes, URL de Drive (si se reflejó), id / ruta
    del borrador de correo, recordatorio de que nunca lo envío,
    tú revisas y envías.

## Salidas

- `handoffs/tax-{year}/cover-memo.md` (indexado como `tax-handoff`)
- `handoffs/tax-{year}/trial-balance.md`
- `handoffs/tax-{year}/reconciliations/{account_last4}.md` (uno
  por cuenta)
- `handoffs/tax-{year}/fixed-asset-schedule.md`
- `handoffs/tax-{year}/depreciation-schedule.md`
- `handoffs/tax-{year}/1099-list.md`
- `handoffs/tax-{year}/rd-classification.md` (si aplica)
- `handoffs/tax-{year}/m1-adjustments.md`
- `handoffs/tax-{year}/judgment-calls.md`
- Espejo opcional en carpeta de Google Drive (URL en el memo de portada)
- Borrador en bandeja de entrada para el preparador de impuestos (nunca enviado)

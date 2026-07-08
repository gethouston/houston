---
name: registrar-un-gasto
title: "Registrar un gasto"
description: "Registro un solo gasto a partir de un recibo reenviado (imagen, PDF, o correo) y produzco un gasto categorizado más un asiento contable balanceado. Extraigo el proveedor, la fecha, el monto y las partidas mediante lectura multimodal, elijo un código de cuenta contra tu plan de cuentas bloqueado (todo lo que quede por debajo de 0.90 de confianza va a Suspenso con el recibo adjunto), y redacto el asiento de partida doble con el lado del crédito según cómo se pagó (tarjeta corporativa, préstamo del fundador, efectivo, o ACH). El submodo `mode=batch` agrupa N recibos en un solo asiento contable resumen que acredita Préstamo del Fundador por Pagar o Reembolsos Devengados. Solo borrador, nunca publico nada."
version: 1
category: Contabilidad
featured: no
image: ledger
integrations: [gmail, outlook, quickbooks, xero]
---


# Registrar un Gasto

Entra un recibo, sale un gasto categorizado y un asiento contable balanceado. Para reembolsos al fundador, pagos a proveedores de tu propio bolsillo, o cualquier gasto que no apareció en el feed del banco o de la tarjeta. Cada recibo produce un asiento contable balanceado con el código de cuenta validado contra tu plan de cuentas, o cae en Suspenso con la imagen adjunta.

Solo borradores: el asiento contable se escribe con `status: "draft"`. Nunca lo publico automáticamente en QuickBooks ni en Xero.

## Cuándo usarlo

- Reenvías un solo recibo (imagen, PDF, correo) o dices "registra este recibo" / "categoriza este reembolso".
- El gasto no aparece en el feed del banco o de la tarjeta (reembolsado con tarjeta personal, pagado por ACH desde otra entidad, efectivo).
- `mode=batch`, "procesa estos 20 recibos del Q1" / "registra el lote de reembolsos del fundador", produce un solo asiento contable resumen que acredita Préstamo del Fundador por Pagar (o Reembolsos Devengados si es del mismo período).

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr este skill verifico que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Gmail u Outlook** (bandeja de entrada), opcional, me permite traer un recibo reenviado y sus adjuntos directamente desde tu correo. Si no está conectado, puedes soltar el archivo en el chat o en la carpeta de la bandeja de entrada de recibos.
- **QuickBooks Online o Xero** (contabilidad), opcional, se usa solo si quieres que consulte el historial del proveedor. El asiento contable en sí se queda en borrador en disco; nunca lo publico.

Este skill nunca se bloquea por una conexión faltante. Siempre puedes soltar el recibo como archivo.

## Información que necesito

Primero leo tu contexto de contabilidad. Por cada campo requerido que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > pegar) y espero.

- **Un plan de cuentas**, requerido. Por qué: cada categoría que asigno tiene que venir de tu plan de cuentas. Si falta, pregunto: "¿Ya tenemos un plan de cuentas? Si no, redactemos uno primero."
- **Un contexto de contabilidad terminado**, requerido. Por qué: necesito tu método contable y las cuentas registradas para contabilizar bien el lado del crédito. Si falta, pregunto: "¿Ya configuramos los libros? Si no, corramos primero la configuración."
- **El recibo en sí**, requerido. Por qué: el proveedor, la fecha y el total se extraen de ahí. Si falta, pregunto: "¿Puedes reenviar el recibo, soltar el PDF o la imagen, o pegar el proveedor / fecha / monto?"
- **Cómo se pagó el gasto**, requerido. Por qué: define la línea de crédito (tarjeta corporativa vs. préstamo del fundador vs. efectivo). Si falta, pregunto: "¿Cómo se pagó esto, con una tarjeta corporativa (cuál), una tarjeta personal que te reembolsarán, efectivo, o una ACH desde otra entidad?"
- **Una cuenta de Préstamo del Fundador por Pagar registrada**, opcional. Por qué: solo hace falta si el recibo se pagó de tu propio bolsillo. Si no la tienes, pregunto una vez y la agrego a tu plan de cuentas.

## Pasos

1. **Leer el contexto y bloquear el plan de cuentas.** Cargar `context/bookkeeping-context.md` (detenerse si falta, pedir que se corra `set-up-my-books`), `config/context-ledger.json`, `config/chart-of-accounts.json` (**bloqueado** para la ejecución, detenerse si no existe), `config/prior-categorizations.json`, y `config/party-rules.json`.

2. **Resolver las entradas del recibo.** Orden de prioridad:
   - **Adjunto en línea**, herramienta de lectura (multimodal) sobre la ruta del archivo que proporcionaste. Funciona con PDF e imágenes (JPG / PNG / HEIC).
   - **Reenvío de correo**, `composio search inbox`, elegir el slug de Gmail / Outlook, traer el mensaje por ID o hilo, luego leer los archivos adjuntos.
   - **Archivo soltado**, `expenses/_inbox/*.{pdf,jpg,png,heic,eml}` en la raíz del agente.

3. **Extraer campos por recibo** mediante lectura multimodal:
   - `vendor`, nombre del comercio tal como aparece impreso.
   - `date`, YYYY-MM-DD; si solo aparece impreso `MM-DD`, inferir el año del contexto.
   - `total`, monto en dólares positivo (se invierte para el lado del crédito del asiento contable).
   - `lineItems[]`, opcional, cuando el recibo detalla partidas: cada `{description, amount, quantity?}`.
   - `paymentMethod`, "tarjeta personal" / "tarjeta corporativa 9041" / "efectivo" / "ACH", preguntar una vez si no es legible.
   - `taxAmount`, `tipAmount`, cuando se detallan por separado.
   - `currency`, por defecto USD; si es extranjera, registrar y preguntar una vez por el monto en moneda local ya liquidado.

   Si algún campo requerido (proveedor / fecha / total) no se puede extraer, detenerse y hacer UNA pregunta puntual. Nunca adivinar.

4. **Canonizar el proveedor**, misma receta que `categorize-my-transactions`: quitar prefijos de ruido y números de referencia, Title Case. Coincidencia difusa (token-set ratio ≥ 0.85) contra `prior-categorizations` / `party-rules`; preferir la clave guardada como forma canónica.

5. **Elegir el código de cuenta.** Orden de prioridad:
   1. Coincidencia exacta en `party-rules` → `confidence: 1.00`, `source: "rule"`.
   2. Coincidencia difusa en `prior-categorizations` (ratio ≥ 0.85, código guardado en el plan de cuentas) → `confidence: 0.95`, `source: "prior_year"`.
   3. Razonar contra el plan de cuentas bloqueado usando proveedor + descripción + partidas + monto + contexto del fundador (viaje vs. oficina vs. contratista de I+D). Confianza `≥ 0.90` → `source: "ai"`.
   4. Si no, Suspenso (`glCode = universal.suspenseCode.code`, confianza `0.50`, `category_status: "uncategorized"`).

   Nunca inventar códigos de cuenta. Si el recibo tiene líneas claramente separables (por ejemplo, comidas y hotel en el mismo folio de hotel), dividir en varias líneas de débito.

6. **Redactar el asiento contable.** Partida doble balanceada, uno por recibo:
   - **Débitos**, línea(s) de gasto categorizadas por `glCode`.
   - **Crédito**, determinado por `paymentMethod`:
     - `corp card {last4}` → cuenta de la tarjeta de crédito (`context-ledger.domains.banks.accounts[].glCode` para esos últimos 4 dígitos). Nota: luego se cruza contra el feed de la tarjeta, marcar `supportingDocs` para que `reconcile-my-accounts` detecte el doble registro.
     - `personal card` / `cash` / reembolsado → acreditar `Founder Loan Payable` (buscar en el plan de cuentas; preguntar UNA vez para registrarla si no existe).
     - `ACH` desde otra entidad → acreditar `Due to Related Party` o `Founder Loan Payable`, la que aplique.
   - Memo: `"{vendor} - {date} - {short description}"`.
   - Cada `glCode` validado contra `config/chart-of-accounts.json`.
   - `sum(debits) === sum(credits)` con una diferencia de hasta 1 centavo.
   - `status: "draft"`, `reversing: false`, `period` = `YYYY-MM` de la fecha del recibo.

7. **Rama `mode=batch`.** Si se activa:
   - Hacer los Pasos 2 a 5 para cada recibo del lote.
   - Producir el markdown de gasto por recibo (Paso 8) para trazabilidad.
   - Producir UN solo asiento contable resumen: una línea de débito por código de cuenta único (sumado entre recibos), un crédito:
     - `Accrued Reimbursements` si los recibos son del mismo período y el reembolso aún no se ha hecho.
     - `Founder Loan Payable` si el fundador adelantó los gastos (común en etapa pre-seed).
   - `supportingDocs[]` lista cada ruta de markdown por recibo.
   - Memo: `"Founder reimbursement batch - {N} receipts - {period}"`.

8. **Escribir el documento de gasto por recibo** en `expenses/{YYYY-MM-DD}-{vendor-slug}.md`. Estructura:
   - Encabezado: proveedor, fecha, monto, método de pago, confianza, fuente.
   - Tabla de partidas (si está detallado).
   - **Asiento contable (borrador)**, asiento balanceado en línea, tabla en markdown `{glCode | glName | debit | credit | memo}`.
   - Ruta del recibo adjunto (copiado a `expenses/_attachments/` la primera vez que se ve).
   - Preguntas abiertas (si se preguntó algún campo en línea).

9. **Actualizar los índices**, todos lectura-fusión-escritura, atómicos (`.tmp` + renombrar):
   - `journal-entries.json` en la raíz del agente, anexar el asiento contable con el esquema completo de `data-schema.md` (`id, date, type: "adjustment" | "reclass", memo, reversing: false, period, lines[], status: "draft", supportingDocs[]`).
   - Si la categoría cae en Suspenso, anexar a `suspense.json`.
   - `outputs.json`, una fila por recibo `{type: "expense-receipt", title, summary, path, status: "draft", domain: "transactions"}`. En modo lote, anexar también la fila resumen `{type: "journal-entry", title: "Reimb batch {period}", ...}`.

10. **Resumirte.** Un bloque compacto:
    - Conteo de recibos, dólares totales, división en categorías (categorizado / Suspenso).
    - Histograma de códigos de cuenta (los 3 primeros códigos con montos).
    - Rutas al documento o documentos de gasto y a los asientos contables redactados.
    - Recordatorio: el asiento contable está en `draft`, tú lo publicas en QuickBooks Online / Xero.

## Salidas

- `expenses/{YYYY-MM-DD}-{slug}.md`, un archivo por recibo (también en modo lote, para trazabilidad).
- `expenses/_attachments/`, archivos de recibo copiados desde `_inbox/` o traídos por Composio.
- `journal-entries.json`, lectura-fusión-escritura, asiento contable anexado con `status: "draft"`.
- `suspense.json`, solo si alguna línea cayó en Suspenso.
- `outputs.json`, una fila por recibo más la fila resumen en modo lote.

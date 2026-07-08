---
name: categorizar-mis-transacciones
title: Categorizar mis transacciones
description: "Categorizo un lote de transacciones pendientes de tu cola de QuickBooks o Xero, un CSV que subas, o una tabla pegada. Normalizo cada contraparte, aplico primero tus reglas guardadas, luego la memoria del año anterior, y después razonamiento calibrado contra tu plan de cuentas bloqueado; todo lo que quede por debajo de 0.90 de confianza va a Suspenso en lugar de pasar en silencio. El submodo `mode=rule-add` crea o actualiza una regla permanente `{party: gl_code}` después de verificar que el código de cuenta existe. Solo borradores, nunca publico en QuickBooks ni en Xero, nunca invento un código de cuenta."
version: 1
category: Contabilidad
featured: yes
image: ledger
integrations: [stripe, quickbooks, xero]
---


# Categorizar Mis Transacciones

El acompañante continuo del proceso de estados de cuenta: tomo las transacciones pendientes de tu cola de QuickBooks o Xero, un CSV, o una tabla pegada, y produzco un lote listo para revisión agrupado en Listo, Necesita Revisión, y Suspenso. Dos invariantes: tu plan de cuentas queda bloqueado durante la ejecución, y todo lo que quede por debajo de 0.90 de confianza va a Suspenso en lugar de pasar en silencio.

Solo borradores: categorizo, marco, y escribo el lote de revisión. Tú o tu contador publican en QuickBooks o Xero.

## Cuándo usarlo

- "categoriza estas transacciones pendientes" / "revisa la cola pendiente de QuickBooks Online" / "limpia la bandeja de sin categorizar de Xero".
- CSV nuevo de partidas pendientes soltado en la raíz del agente o en `transactions/_inbox/`.
- `mode=rule-add`, "haz que 'Comisión Stripe' siempre vaya a la 6700 de aquí en adelante" / "fija 'AWS' a la 6210 para que dejes de preguntarme".
- Llamado por `process-my-statements` al final de la ejecución para las filas que salieron `uncategorized`, entrega opcional.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de que esta habilidad se ejecute, verifico que las categorías siguientes estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, me detengo.

- **QuickBooks Online o Xero** (contabilidad) - fuente preferida para la cola pendiente / sin categorizar en vivo. Requerido si quieres que extraiga las partidas pendientes directamente.
- **Stripe** (facturación) - opcional, me ayuda a categorizar comisiones y pagos del procesador cuando aparecen en la cola.

Si no hay ninguna herramienta contable conectada, recurro a un CSV soltado o a una tabla pegada. Si no tienes nada para compartir, me detengo y te pido que conectes QuickBooks o Xero, o que sueltes un CSV de partidas pendientes.

## Información que necesito

Leo primero tu contexto contable. Por cada campo requerido que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: aplicación conectada > archivo > URL > texto pegado) y espero.

- **Un plan de cuentas** - Requerido. Por qué: lo bloqueo durante la ejecución, cada categoría que asigno tiene que venir de tu plan de cuentas, nunca inventada. Si falta, pregunto: "¿Ya tenemos un plan de cuentas? Si no, redactemos uno primero, solo toma unos minutos."
- **Un contexto contable terminado** - Requerido. Por qué: necesito tu método contable, código de suspenso y cuentas registradas para categorizar correctamente. Si falta, pregunto: "¿Ya configuramos los libros? Si no, ejecuta la configuración una vez para que yo conozca tu año fiscal, método contable y cuentas registradas."
- **Las transacciones pendientes a revisar** - Requerido. Por qué: no puedo categorizar lo que no puedo ver. Si falta, pregunto: "¿Dónde están las transacciones pendientes, en QuickBooks o Xero, en un CSV que puedas soltar, o pegadas en el chat?"
- **Reglas de proveedor de un período anterior** - Opcional. Por qué: me permite emparejar cargos nuevos con proveedores conocidos y evitar preguntarte lo mismo dos veces. Si no tienes esto, sigo adelante y aprendo de esta ejecución.

## Pasos

1. **Leer el contexto y bloquear el plan de cuentas.** Cargar:
   - `context/bookkeeping-context.md`, si falta, detenerme, pedir al usuario que ejecute `set-up-my-books` primero.
   - `config/context-ledger.json`, cuentas, código de suspenso, pistas del slug contable conectado.
   - `config/chart-of-accounts.json`, **bloquearlo** durante la ejecución. Si está ausente, detenerme, pedir al usuario que ejecute `build-my-chart-of-accounts` primero. Nunca inventar códigos a mitad de la ejecución.
   - `config/prior-categorizations.json`, memoria de proveedor → código de cuenta (objeto vacío si está ausente).
   - `config/party-rules.json`, reglas de coincidencia exacta (objeto vacío si está ausente).

2. **Resolver la lista pendiente.** Orden de prioridad:
   - **Aplicación conectada** (preferido): `composio search accounting`, elegir el slug de QuickBooks Online / Xero, extraer la cola pendiente / sin categorizar actual. Descubrir el esquema con `--get-schema`; nunca fijarlo de antemano. Si no hay conexión, mostrar el comando de enlace de un solo paso.
   - **Archivo soltado**: CSV en `transactions/_inbox/*.csv`, analizar con el módulo estándar `csv`. Columnas requeridas `{date, description, amount}`; opcionales `{account_last4, statement_date, party}`.
   - **Pegado**: tabla en línea en el mensaje del usuario.

3. **Rama `mode=rule-add`.** Si se activa:
   - Esperar pares `{canonical_party, gl_code}` (en línea o archivo).
   - Por cada par, validar que `gl_code` existe en `config/chart-of-accounts.json`. Si no, rechazar el par con un error nombrado, NUNCA inventar códigos de cuenta.
   - Leer-fusionar-escribir `config/party-rules.json`: crear o actualizar `{canonical_party: gl_code}`. Escritura atómica (`.tmp` + renombrar).
   - Reportar una línea por cada actualización; omitir el resto de la habilidad.

4. **Canonicalizar contrapartes.** Por cada fila pendiente, derivar el nombre de contraparte canónico de la misma forma que `process-my-statements`: quitar prefijos de ruido (`POS DEBIT`, `CHECKCARD`, `ACH`, `SQ *`, `TST*`, `ONLINE PMT`), quitar números de referencia finales y sufijos de ciudad/estado, colapsar espacios en blanco, usar Formato de Título. Si el nombre limpio coincide de forma aproximada con una clave en `prior-categorizations` o `party-rules` (proporción token-set ≥ 0.85), usar la clave guardada como forma canónica.

5. **Categorizar cada transacción.** Orden de prioridad, detenerse en la primera coincidencia:

   1. **Coincidencia exacta en `party-rules`** → código de cuenta de la regla, `confidence: 1.00`, `source: "rule"`.
   2. **Coincidencia aproximada en `prior-categorizations`** (proporción token-set ≥ 0.85 Y el código de cuenta guardado existe en el plan de cuentas) → código de cuenta guardado, `confidence: 0.95`, `source: "prior_year"`.
   3. **Razonamiento contra el plan de cuentas**, elegir la mejor línea del plan de cuentas bloqueado usando descripción + contraparte canónica + monto + tipo de cuenta. Asignar confianza calibrada:
      - `≥ 0.95`, obvio, sin ambigüedad.
      - `0.90–0.94`, un candidato razonable, no es certeza.
      - `< 0.90` → Suspenso (siguiente regla). `source: "ai"`.
   4. **Suspenso**, `glCode` = `universal.suspenseCode.code`, `confidence: 0.50`, `source: "ai"`, `category_status: "uncategorized"`.

   Reglas de `category_status`:
   - `ready_for_approval` si `confidence ≥ 0.90` Y `source ∈ {rule, prior_year}`.
   - `review_categorization` si `confidence ≥ 0.90` Y `source = "ai"`.
   - `uncategorized` si `confidence < 0.90`.

   Nunca inventar un código de cuenta que no esté en el plan de cuentas bloqueado.

6. **Escribir el lote de revisión** en `transactions/{YYYY-MM-DD}.md` (fecha de ejecución, no fecha de la transacción). Estructura:
   - Encabezado: fecha de ejecución, fuente (slug de la app / ruta del CSV), conteo total, volumen total en dólares absolutos.
   - **Listo para aprobación**, tabla agrupada por código de cuenta, cada fila `{fecha | contraparte | descripción | monto | glCode | glName | confianza | fuente}`.
   - **Necesita revisión**, misma tabla, una fila por cada elemento `review_categorization`; incluir una línea de justificación "por qué este código".
   - **Suspenso**, misma tabla para las partidas `uncategorized`, ordenadas descendentemente por `abs(monto)`.
   - **Actualizaciones de regla de proveedor sugeridas**, cualquier contraparte canónica que aparezca ≥ 3 veces en esta ejecución con el mismo código de cuenta elegido por la IA y confianza ≥ 0.90. Presentado como un JSON de `mode=rule-add` listo para ejecutar, para que el usuario apruebe en un solo paso.

7. **Persistir aprendizajes** (solo después de que el usuario confirme el grupo `ready_for_approval`, o al final de la ejecución si no hay confirmación). Leer-fusionar-escribir `config/prior-categorizations.json`: crear o actualizar `{canonical_party: gl_code}` para cada fila con `source ∈ {rule, prior_year}` O `confidence ≥ 0.95`. NUNCA persistir partidas con `confidence < 0.90`, envenenan la siguiente ejecución.

8. **Actualizar el índice de Suspenso.** Por cada partida `uncategorized`, leer-fusionar-escribir `suspense.json` en la raíz del agente con `{id, date, party, description, amount, addedAt}`. Actualizar `updatedAt` en las entradas existentes; sin duplicados.

9. **Añadir a `outputs.json`.** Una fila: `{type: "categorization", title: "Lote de categorización {YYYY-MM-DD}", summary, path, status: "draft", domain: "transactions"}`. Leer-fusionar-escribir; nunca sobrescribir el arreglo.

10. **Resumir al usuario.** Un bloque corto: conteos por grupo, total en dólares de Suspenso (marcar con prominencia), nuevas contrapartes agregadas, actualizaciones de regla de proveedor sugeridas con el comando exacto para aprobarlas.

## Resultados

- `transactions/{YYYY-MM-DD}.md`, lote categorizado listo para revisión.
- `config/prior-categorizations.json`, leer-fusionar-escribir; actualizado con la memoria de proveedor de alta confianza de esta ejecución.
- `config/party-rules.json`, solo en `mode=rule-add`, leer-fusionar-escribir con las actualizaciones verificadas.
- `suspense.json`, leer-fusionar-escribir con las nuevas partidas sin categorizar.
- `outputs.json`, una fila añadida, `type: "categorization"`.

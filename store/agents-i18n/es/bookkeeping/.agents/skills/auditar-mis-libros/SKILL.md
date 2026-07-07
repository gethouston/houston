---
name: auditar-mis-libros
title: Auditar mis libros
description: "Obtén una lista de verificación sobre si tus libros están en orden: partidas sin categorizar, diferencias de conciliación, devengos vencidos, candidatos de corte, asientos contables en borrador, saldos de apertura faltantes, proveedores duplicados. Clasifico los problemas por impacto en dólares y señalo una acción para 'resolver esta semana'. El submodo `mode=audit-response` para solicitudes de auditores o de diligencia debida arma un paquete de respuesta con muestra rastreable y semillas aleatorias documentadas para que el auditor pueda reproducir la selección. Nunca publico ni presento nada."
version: 1
category: Contabilidad
featured: no
image: ledger
---


# Auditar Mis Libros

Revisión de salud de que los libros estén en orden. Reviso cada índice plano en la raíz y cada registro vivo, clasifico los hallazgos por impacto en dólares, y señalo la única cosa más útil para resolver esta semana. El submodo `mode=audit-response` maneja solicitudes de auditores o de diligencia debida con semillas aleatorias documentadas. Solo borradores, nunca publicados, nunca presentados.

## Cuándo usarlo

- "¿están los libros en orden?" / "¿qué está sin categorizar?" / "revisión de salud de los libros" / "lista de verificación".
- Llamado por `hand-off-to-my-tax-preparer` como paso de bloqueo, los pendientes abiertos deben cerrarse antes de que avance la entrega.
- `mode=audit-response`, "responde a esta solicitud de auditoría" / "diligencia debida quiere muestras del Q2" / "guía al auditor por el reconocimiento de ingresos".

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de que esta habilidad se ejecute, verifico que las categorías siguientes estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, me detengo.

- **No se requieren conexiones externas.** Trabajo enteramente desde tus libros existentes, archivos de conciliación, devengos y asientos contables. Para `mode=audit-response`, si quieres que replique el paquete de documentos en una carpeta compartida, conecta Google Drive (opcional).

Esta habilidad nunca se bloquea por falta de una conexión. Los paquetes de documentos usan carpetas locales por defecto, el espejo en Drive es un extra.

## Información que necesito

Leo primero tu contexto contable. Por cada campo requerido que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: aplicación conectada > archivo > URL > texto pegado) y espero.

- **Un contexto contable terminado y un plan de cuentas** - Requerido. Por qué: ancho la revisión en tu método contable, código de suspenso y cuentas registradas. Si falta, pregunto: "¿Ya configuramos los libros? Si no, ejecuta la configuración una vez para que yo conozca tu año fiscal, método contable y cuentas registradas antes de buscar problemas."
- **Un historial de ejecuciones actual** - Requerido. Por qué: necesito al menos un período categorizado contra el cual revisar. Si falta, pregunto: "¿Ya procesaste algún estado de cuenta? Suelta tus estados de cuenta bancarios o de tarjeta más recientes y trabajaré desde ahí."
- **Tu solicitud de auditor o de diligencia debida, en `mode=audit-response`** - Requerido para ese modo. Por qué: no puedo muestrear ni armar nada sin la solicitud real. Si falta, pregunto: "Pega o suelta la solicitud del auditor o del equipo de diligencia debida, idealmente el correo completo o el PDF con los puntos que quieren."

## Pasos

1. **Leer el contexto.** Cargar `context/bookkeeping-context.md`, `config/context-ledger.json`, `config/chart-of-accounts.json`. Anotar la fecha de hoy como fecha de ejecución.

2. **Cargar los índices.** Leer `suspense.json`, `recon-breaks.json`, `accruals.json`, `journal-entries.json`, `outputs.json`, `run-index.json` (todos planos en la raíz del agente).

3. **Sin categorizar / suspenso.** Desde `suspense.json`, cada partida abierta con su antigüedad (hoy − createdAt). Agrupar por contraparte canónica. Mostrar el saldo total de suspenso más las categorías de antigüedad (0 a 30, 31 a 60, 61 a 90, más de 90 días).

4. **Diferencias de conciliación.** Desde `recon-breaks.json`, cada diferencia abierta con `abs(amount) > $100` y antigüedad mayor a 30 días. Citar `reconciliations/{account_last4}/{YYYY-MM}.md`.

5. **Devengos vencidos.** Desde `accruals.json`, filas donde `status == "stale"` o `lastActivity > 90 días` y `abs(currentBalance) > 0`. Incluir la acción recomendada ya escrita por `review-my-accruals`.

6. **Candidatos de corte.** Recorrer los `journal-entries.json` recientes más las transacciones del último cierre:
   - Gastos con fecha del período anterior pero contabilizados en el actual (corte perdido).
   - Transacciones del período actual contabilizadas en el período anterior (posible reversión de corte).
   Listar cada una con el id del asiento contable, el monto, la brecha de período.

7. **Asientos contables atascados en borrador.** Desde `journal-entries.json`, entradas con `status == "draft"` y `updatedAt > 14 días`. Citar `id`, `date`, `memo`, monto total.

8. **Brechas de saldo de apertura.** Comparar los códigos de cuenta usados en ejecuciones recientes contra `config/opening-trial-balance.json`. Cualquier código presente en las ejecuciones pero ausente del balance de apertura, marcar (probablemente una cuenta nueva sin saldo de apertura, o un código que no debería estar en uso).

9. **Proveedores duplicados.** Desde las claves de `config/prior-categorizations.json`, agrupar nombres canónicos por proporción token-set mayor o igual a 0.85. Incluir el código de cuenta de cada variante, si difieren, marcar como prioridad alta.

10. **Clasificar por impacto en dólares.** Puntuar cada hallazgo por el dólar absoluto afectado. Ordenar de mayor a menor. El primer elemento se convierte en el llamado a "el elemento más útil para resolver esta semana".

11. **Escribir `audits/{YYYY-MM-DD}.md`.** Escritura atómica. Estructura:
    - **Resolver esta semana**, un elemento, el de mayor impacto, con la acción recomendada.
    - **Conteos resumen**, suspenso, diferencias de conciliación, devengos vencidos, candidatos de corte, asientos contables atascados en borrador, brechas de saldo de apertura, candidatos a fusión de proveedores.
    - **Hallazgos clasificados por impacto en dólares**, cita (id de asiento contable, id de suspenso, ruta de conciliación), dólares, acción recomendada, tiempo estimado de resolución.
    - **Decisiones de criterio**, posiciones que requieren la decisión del usuario (por ejemplo, "¿castigar $420 de renta prepagada vencida? [castigar | reclasificar | dejar]") con opciones, nunca una decisión.

12. **Añadir a `outputs.json`.** Fila: `{type: "books-audit", title: "Revisión de salud de los libros {YYYY-MM-DD}", summary, path, status: "draft", domain: "reporting"}`. Leer-fusionar-escribir.

13. **Rama `mode=audit-response`.** Omitir los pasos 3 a 11. En su lugar:
    a. **Analizar la solicitud.** El usuario provee la solicitud del auditor (pegada, archivo o URL). Dividir en elementos discretos: selecciones de muestra, recorridos, solicitudes de documentos.
    b. **Selecciones de muestra.** Para "extrae N muestras de {tipo}":
       - Semilla determinística: `seed = "{YYYY-MM-DD}-{item-slug}"`. Documentar en el resultado.
       - Filtrar la población por criterio (período, código de cuenta, rango de monto).
       - Ordenar de forma determinística (por `id` ascendente).
       - Sembrar el generador de números pseudoaleatorios para elegir N índices: por ejemplo, `random.Random(seed).sample(range(len(pop)), N)`.
       - Exportar la muestra más la semilla usada (el auditor puede reproducirla).
    c. **Recorridos.** Resumir desde `context/bookkeeping-context.md` más los resultados relevantes de otras habilidades. Citar los resultados de las habilidades por ruta. Nunca inventar detalles del proceso.
    d. **Solicitudes de documentos.** Armar los documentos en `handoffs/audit-{yyyy-qq}/{request-slug}/` (crear la subcarpeta si no existe). Incluir un `README.md` que liste cada archivo más su ruta de origen.
    e. **Decisiones de criterio.** Marcar las posiciones que requieren decisión (umbrales de materialidad, lenguaje de negocio en marcha, revelación de segmentos) con opciones, el usuario decide. Nunca responder en nombre del usuario.
    f. **Memo de portada.** Escribir en `audits/{YYYY-MM-DD}-response-{request-slug}.md` listando cada elemento, estado de respuesta, rutas de archivo, semillas usadas. Añadir a `outputs.json` como `books-audit` con título `"Respuesta de auditoría {request-slug}"`.

14. **Resumir al usuario.** Un párrafo: hallazgo principal más impacto en dólares, conteos por categoría, un único siguiente paso recomendado. Modo respuesta: elementos respondidos o pendientes, ubicación del paquete, decisiones de criterio sin resolver.

## Resultados

- `audits/{YYYY-MM-DD}.md` (revisión de salud, indexada como `books-audit`)
- `audits/{YYYY-MM-DD}-response-{request-slug}.md` (modo respuesta)
- `handoffs/audit-{yyyy-qq}/{request-slug}/` (paquetes de documentos para el modo respuesta)

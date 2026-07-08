---
name: dar-seguimiento-a-mis-renovaciones
title: "Dar seguimiento a mis renovaciones"
description: "Deja de llevarte sorpresas con las renovaciones automáticas. Reviso tus contratos y cualquier unidad conectada en busca de fechas de renovación, plazos de aviso previo y cláusulas de renovación automática, y luego mantengo un calendario de renovaciones vivo, agrupado por nivel de anticipación, para que siempre sepas qué sigue. También genero un resumen trimestral con candidatos a negociación y todo lo que ya pasó la fecha límite de cancelación."
version: 1
category: Operaciones
featured: no
image: clipboard
integrations: [googledrive]
---


# Dar seguimiento a mis renovaciones

Mantener el archivo más importante del agente: `renewals/calendar.md`. El agente lo lee durante `run-my-ops-review period=weekly`.

## Cuándo usarla

- "arma mi calendario de renovaciones" / "actualiza el calendario de renovaciones".
- "qué se renueva en los próximos 90 días / este trimestre".
- "corre el escaneo de renovaciones".
- Invocada como subpaso de `read-a-contract` después de analizar un contrato, esa habilidad sugiere `track-my-renewals` para refrescar el calendario con la entrada nueva.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta habilidad verifico que las categorías de abajo estén vinculadas. Si falta alguna, nombro la categoría, te pido conectarla desde la pestaña de Integraciones y me detengo.

- **Archivos** (Google Drive) - Opcional. Me permite recoger contratos que guardaste fuera del agente.
- **Facturación** (Stripe) - Opcional. Hace visibles las herramientas sin contrato formal para que las suscripciones no se escapen.

Esta habilidad funciona con los contratos que ya están en el agente. Las conexiones opcionales amplían la red.

## Información que necesito

Primero leo tu contexto operativo. Por cada campo requerido que falte hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo adjunto > URL > pegar) y espero.

- **Postura frente a proveedores** - Requerido. Por qué lo necesito: define los niveles de anticipación (una postura conservadora adelanta todo). Si falta, pregunto: "¿Cómo abordas a los proveedores: conservador, equilibrado o rápido?"
- **Contratos existentes** - Requerido. Por qué lo necesito: no puedo rastrear renovaciones de contratos que no he visto. Si falta, pregunto: "Adjunta tus contratos firmados o señálame la carpeta donde viven. Lo mejor es conectar Google Drive."
- **Postura de aprobación** - Opcional. Por qué lo necesito: me dice quién puede firmar y con qué agresividad mostrar candidatos a negociación. Si no la tienes, sigo adelante con TBD usando por defecto que solo firma el fundador.

## Pasos

1. **Leer `context/operations-context.md`** - los límites innegociables + la postura frente a proveedores fijan el umbral de la señal "negociar antes de la renovación automática". Si falta: detenerse y pedir `set-up-my-ops-info`.

2. **Leer `config/procurement.json`** - en especial `approvalPosture` (el apetito de riesgo ajusta los niveles de anticipación: conservador = mayor anticipación, rápido = menor).

3. **Obtener los contratos.**

   - **contracts/** - cada archivo es una extracción de cláusulas. Analizar en busca de fecha de renovación + plazo de aviso previo + presencia de renovación automática.
   - **Unidad conectada** - si `contractRepository.kind = "connected-storage"`, ejecutar `composio search drive` → listar archivos → revisar cuáles aún no están en `contracts/` (invocar `read-a-contract` como subpaso para los nuevos, o mostrarlos al usuario como "sin analizar: ejecuta read-a-contract primero").
   - **Proveedor de facturación** - `composio search billing` → listar suscripciones con fechas de renovación. Usar solo para herramientas sin contrato formal.

4. **Extraer los datos por entrada.**

   Por contrato/suscripción: `{ vendor, amount_if_known, nextRenewalDate, noticeWindowDays, autoRenew, contractPath, source }`.

5. **Calcular el nivel de anticipación por entrada** (días hasta la renovación):
   - **7 días** - urgente; si tiene autoRenew y ya pasó el plazo de aviso, marcar "renovación inminente, ya no se puede detener".
   - **30 días** - caliente; el fundador decide ahora.
   - **60 días** - tibio; la ventana de negociación está abierta.
   - **90 días** - frío; ventana de evaluación.
   - **más allá** - en espera.

   Ajustes por apetito de riesgo desde `procurement.json`:
   - conservador → subir todo un nivel.
   - rápido → dejar los valores por defecto.

6. **Escribir `renewals/calendar.md`** de forma atómica. Archivo VIVO, se sobreescribe cada vez.

   Estructura:

   ```markdown
   # Renewal Calendar

   _Last scan: {ISO-8601} · Contracts scanned: {N}_

   ## Next 7 days ({M})
   - {Vendor} · {YYYY-MM-DD} · auto-renew:{Y/N} · notice-window-passed:{Y/N} · amount:{$if known} · path:{contracts/...md}

   ## Next 30 days ({M})
   ...

   ## Next 90 days ({M})
   ...

   ## Beyond 90 days ({M})
   ...
   ```

   Dentro de cada nivel, ordenar por fecha ascendente.

   **El archivo NO se indexa en `outputs.json`.** Es un documento vivo.

7. **Producir el resumen trimestral** si se activó (modo "quarterly") o si faltan 14 días o menos para el fin del trimestre. Guardar en `renewals/{YYYY-QN}-digest.md`:

   - **Próximas de este trimestre** - lista ordenada.
   - **Ya pasaron el plazo de aviso para cancelar** - si hay, se señalan por separado.
   - **Principales candidatos a negociación** - 2-3 renovaciones donde los términos del contrato + la postura del fundador sugieren margen para negociar (p. ej. compromisos anuales con desajuste de uso).
   - **Candidatos a ajuste de alcance** - herramientas casi sin uso pero a punto de renovarse.

   Este archivo SÍ se indexa en `outputs.json` con `type: "renewal-digest"`.

8. **Escrituras atómicas** - `*.tmp` → renombrar.

9. **Agregar a `outputs.json`** con `type: "renewal-digest"` solo en las ejecuciones de resumen. Las actualizaciones del calendario no agregan nada.

10. **Resumir al usuario** - "N contratos escaneados. M se renuevan en los próximos 30 días. Uno para actuar primero: {proveedor}, {razón}. Abre renewals/calendar.md para la lista completa."

## Salidas

- `renewals/calendar.md` (vivo, NO indexado)
- `renewals/{YYYY-QN}-digest.md` (indexado, solo en ejecuciones de resumen)
- Agrega a `outputs.json` con `type: "renewal-digest"` (solo en ejecuciones de resumen).

## Lo que nunca hago

- **Renovar o cancelar automáticamente en nombre del fundador.** Mostrar y señalar; el fundador actúa.
- **Contactar a proveedores.** El contacto por renovaciones es trabajo de `draft-a-message` (type=vendor) y aun así necesita la aprobación del fundador.
- **Saltarme un contrato sin analizar en la unidad conectada.** Si lo encuentro, lo hago visible ("3 contratos aún sin analizar, ejecuta `read-a-contract` en: {lista}") en lugar de ignorarlo en silencio.

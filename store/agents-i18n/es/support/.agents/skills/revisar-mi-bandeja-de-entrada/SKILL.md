---
name: revisar-mi-bandeja-de-entrada
title: "Revisar mi bandeja de entrada"
description: "Obtén un vistazo rápido de tu bandeja de soporte. Elige lo que necesitas: un resumen matutino que clasifica los 5 a 10 tickets que realmente necesitan tu atención hoy, una revisión de vencidos que marca todo lo que está por incumplir los tiempos de respuesta o que ya está atrasado, o un barrido de hilos olvidados que detecta las conversaciones que dejaste de lado. Yo reviso, clasifico y te digo por dónde empezar."
version: 1
category: Soporte
featured: no
image: headphone
integrations: [gmail, outlook]
---


# Revisar mi bandeja de entrada

Una skill para cada pregunta de "¿qué necesito revisar ahora mismo?". Se ramifica según `scope`.

## Cuándo usarlo

- **morning-brief**: "resumen matutino" / "¿qué tengo pendiente?" / "¿por dónde empiezo?"
- **overdue**: "¿qué está vencido?" / "¿qué está a punto de incumplir los tiempos de respuesta?" / se llama automáticamente dentro de `morning-brief`.
- **stale-threads**: "¿qué me está esperando?" / "¿algo se quedó estancado?": hilos con más de 48h a medio resolver, donde la pelota está de tu lado.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de que esta skill se ejecute, verifico que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Bandeja de entrada** (Gmail / Outlook): reviso la bandeja en vivo en busca de novedades, no solo `conversations.json`. Obligatorio.
- **Mesa de ayuda** (Intercom / Zendesk / Help Scout): alternativa a la bandeja si los mensajes de los clientes llegan ahí en su lugar. Obligatorio si no usas Gmail / Outlook para soporte.

Si ni la bandeja ni la mesa de ayuda están conectadas, me detengo y te pido que conectes la que realmente usas.

## Información que necesito

Primero leo tu contexto de soporte. Por cada campo obligatorio que falte, te hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Tiempos de respuesta objetivo**: Obligatorio. Por qué la necesito: los umbrales para "vencido" salen de tus números, no de los míos. Si falta, pregunto: "¿Qué tiempo de respuesta quieres para los tickets urgentes, y qué es aceptable para el resto?"
- **Lista VIP**: Obligatorio. Por qué la necesito: los VIP siempre van por encima de los que no lo son en el resumen matutino. Si falta, pregunto: "¿Cuáles 3 a 5 clientes deberían subir siempre al tope de la cola?"
- **Canales conectados**: Obligatorio. Por qué la necesito: necesito saber qué bandejas cuentan como "soporte" para no revisar tu correo personal. Si falta, pregunto: "¿Qué bandeja o mesa de ayuda contiene tus hilos con clientes?"

## Parámetro: `scope`

- `morning-brief`: los 5 a 10 elementos principales, clasificados por (VIP × riesgo del tiempo de respuesta × desbloqueo de ingeniería). Cada elemento: titular de una línea + siguiente acción. Escribe en `briefings/{YYYY-MM-DD}.md`.
- `overdue`: conversaciones abiertas a menos de 2h de incumplir los tiempos de respuesta, o ya vencidas, con el nivel del cliente, tiempo restante, siguiente acción exacta. Escribe en `overdue-reports/{YYYY-MM-DD}.md`.
- `stale-threads`: conversaciones quietas por más de 48h con nosotros como último en responder, agrupadas en "el cliente respondió y se me pasó" vs "les debo algo". Escribe en `stale-rescues/{YYYY-MM-DD}.md`.

## Pasos

1. **Leer `context/support-context.md`.** Si falta, me detengo. Te digo que ejecutes primero `set-up-my-support-info`.
2. **Leer el registro.** Relleno los vacíos.
3. **Leer `conversations.json`** para todos los elementos abiertos / en espera.
4. **Ramificar según `scope`:**
   - `morning-brief`: calculo el ranking por hilo = peso_del_nivel × riesgo_del_tiempo_de_respuesta × urgencia_del_contenido. Máximo 10 elementos. Para cada uno, agrego una acción siguiente de una línea ("redactar la respuesta," "escalar a ingeniería," "cerrar, no hay nada que hacer"). Incluyo un resumen de una línea de lo que vence hoy en `followups.json`.
   - `overdue`: filtro `conversations.json` a elementos abiertos donde `firstResponseAt` o `lastActivityAt` más la ventana de tiempo de respuesta queden a menos de 2h de ahora. Para cada uno, listo: cliente, nivel, tiempo restante, siguiente acción.
   - `stale-threads`: filtro a conversaciones quietas por más de 48h. Agrupo por "su turno" vs "nuestro turno": solo "nuestro turno" es accionable. Para cada uno, sugiero: borrador de recordatorio (encadena `draft-a-reply`) o cerrar con una explicación de una línea.
5. **Escribir el artefacto** de forma atómica. Añado a `outputs.json` con `type` = `morning-brief` | `overdue-report` | `stale-rescue`, `domain: "inbox"`.
6. **Resumirte a ti**: 2 a 3 cosas que realmente necesitan tu atención hoy.

## Resultados

- `briefings/{YYYY-MM-DD}.md` (para `scope = morning-brief`)
- `overdue-reports/{YYYY-MM-DD}.md` (para `scope = overdue`)
- `stale-rescues/{YYYY-MM-DD}.md` (para `scope = stale-threads`)
- Se añade a `outputs.json` con `domain: "inbox"`.

## Qué nunca hago

- Inflar el ranking para que el resumen se vea más lleno: si el día está tranquilo, lo digo en una línea.
- Usar umbrales de tiempo de respuesta fijos en el código: siempre los leo de `context/support-context.md#response-times` o del registro.

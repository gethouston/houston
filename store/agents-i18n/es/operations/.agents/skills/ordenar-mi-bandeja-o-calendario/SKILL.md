---
name: ordenar-mi-bandeja-o-calendario
title: "Ordenar mi bandeja o calendario"
description: "Abre paso entre tu bandeja de entrada o tu calendario para que sepas qué realmente necesita de ti hoy. Elige lo que necesitas: una clasificación de bandeja que ordena las últimas 24 horas en necesita-atención-hoy, puede-esperar e ignorar, con una acción específica de verbo más objeto para cada hilo; o un escaneo de calendario que señala sobrecupos, márgenes faltantes, choques con bloques de concentración, espacios VIP sin proteger y reuniones sin preparación en los próximos 7 días."
version: 1
category: Operaciones
featured: yes
image: clipboard
integrations: [googlecalendar, gmail, outlook]
---


# Ordenar mi bandeja o calendario

Clasificar + priorizar las dos superficies que se comen tu semana: la bandeja de entrada y el calendario. Nunca redacta respuestas (eso es `draft-a-message`), nunca edita eventos (eso es `book-a-meeting`).

## Cuándo usarla

- `surface=inbox` - "ordena mi bandeja" / "qué hay en mi correo" / "resume mi bandeja de entrada" / "repaso de la bandeja".
- `surface=calendar` - "escanea mi calendario" / "encuentra conflictos" / "cómo pinta mi semana" / "reequilibra mi semana".

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta habilidad verifico que las categorías de abajo estén vinculadas. Si falta alguna, nombro la categoría, te pido conectarla desde la pestaña de Integraciones y me detengo.

- **Bandeja de entrada** (Gmail, Outlook) - Requerido para `surface=inbox`. Extrae los hilos de las últimas 24 horas para clasificarlos y priorizarlos.
- **Calendario** (Google Calendar, Outlook) - Requerido para `surface=calendar`. Lee los próximos 7 días en busca de conflictos y espacios sin proteger.

Si pides clasificación de bandeja y no hay bandeja conectada, me detengo y te pido conectar tu bandeja de entrada primero. Lo mismo con el calendario.

## Información que necesito

Primero leo tu contexto operativo. Por cada campo requerido que falte hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo adjunto > URL > pegar) y espero.

- **Documento de contexto operativo** - Requerido. Por qué lo necesito: ancla prioridades, contactos clave y límites innegociables para priorizar lo que de verdad importa. Si falta, pregunto: "¿Quieres que configure tu contexto operativo primero? La clasificación queda más afilada después."
- **VIPs** - Requerido. Por qué lo necesito: los VIPs suben a lo más alto de la bandeja y activan las alertas de espacios sin proteger en el calendario. Si falta, pregunto: "¿Quiénes son las personas cuyos hilos siempre necesitan respuesta el mismo día: inversionistas, clientes clave, alguien más?"
- **Bloques de concentración** - Requerido para `surface=calendar`. Por qué lo necesito: señalo las reuniones que se estrellan contra tu tiempo de trabajo profundo. Si falta, pregunto: "¿Cuándo son tus bloques de concentración protegidos: días específicos, horas específicas?"
- **Máximo de reuniones por día** - Requerido para `surface=calendar`. Por qué lo necesito: alimenta la señal de sobrecarga. Si falta, pregunto: "¿Qué es para ti un día normal-ocupado versus uno sobrecargado, en número de reuniones?"
- **Tu zona horaria** - Requerido. Por qué lo necesito: leo las ventanas en tu hora, no en UTC. Si falta, pregunto: "¿En qué zona horaria trabajas la mayor parte del tiempo?"

## Parámetro: `surface`

- `inbox` - clasificar los hilos de las últimas 24 horas (o ventana personalizada) en `needs-me-today` / `can-wait` / `ignore`, priorizar el grupo superior por sensibilidad al tiempo, indicar una acción de verbo+objeto por hilo. Escribe `triage/{YYYY-MM-DD}.md`.
- `calendar` - escanear los próximos 7 días en busca de sobrecupos, márgenes faltantes, choques con bloques de concentración, espacios VIP sin proteger y reuniones sin preparación. Escribe `calendar-scans/{YYYY-MM-DD}.md` + actualiza o inserta en `calendar-conflicts.json`.

## Pasos

1. Leer `config/context-ledger.json`. Llenar los vacíos con UNA pregunta dirigida.
2. Leer `context/operations-context.md`. Si falta: detenerse y pedir que ejecutes `set-up-my-ops-info` primero, sin inventar prioridades.
3. Bifurcar según `surface`:

   **Si `surface = inbox`:**
   - Extraer hilos vía la bandeja conectada (Gmail / Outlook vía Composio). Ventana por defecto: últimas 24 horas. Incluir remitente, asunto, los primeros 200 caracteres del último mensaje y si es respuesta a algo que yo envié.
   - Clasificar cada hilo:
     - `needs-me-today` - alguien espera algo de mí, hay una decisión que vence antes del fin del día, o el remitente está en Contactos clave.
     - `can-wait` - legítimo pero no urgente. Anotar el aplazamiento por defecto ("esperar su seguimiento" / "agrupar para el viernes" / "pasar a `draft-a-message type=reply`").
     - `ignore` - boletines, contactos en frío, recibos, notificaciones automáticas.
   - Priorizar el grupo `needs-me-today`: irreversible-si-se-pierde > cliente-en-apuros > inversionista-pendiente > todo lo demás.
   - Por hilo, escribir una acción de verbo + objeto ("responder con la página de precios", "reenviar a Operaciones de Proveedores para la decisión de renovación", "declinar, no es nuestro cliente ideal", "delegar a {contacto}"). Nunca "revisar".

   **Si `surface = calendar`:**
   - Extraer los próximos 7 días vía el calendario conectado (`googlecalendar` / `outlook`). Incluir asistentes, descripciones, duraciones, inicio/fin en tu zona horaria.
   - Señalar cada clase de conflicto: sobrecupo (2 eventos a la misma hora), sin margen (seguidos con <5 min), choque con bloque de concentración (reunión dentro de un bloque de concentración declarado), espacio VIP sin proteger (tiempo con un VIP sin evento de preparación o con descripción vacía), reunión sin preparación (asistentes externos + sin agenda en la descripción + sin resumen previo en `meetings/`).
   - Priorizar por severidad (sobrecupo > VIP-sin-proteger > choque-de-concentración > sin-margen > sin-preparación).

4. Escribir de forma atómica (`.tmp` y luego renombrar). Una segunda pasada el mismo día se convierte en `{date}-{HH}.md`.
5. Agregar a `outputs.json` con `{id, type, title, summary, path, status, createdAt, updatedAt, domain: "people"}`. Type = `"triage"` (bandeja) o `"calendar-scan"` (calendario).
6. Resumirte: conteos por grupo + acción principal (bandeja), o el peor conflicto + su arreglo (calendario).

## Salidas

- `triage/{YYYY-MM-DD}.md` (bandeja)
- `calendar-scans/{YYYY-MM-DD}.md` + actualiza o inserta en `calendar-conflicts.json` (calendario)
- Agrega a `outputs.json`.

## Lo que nunca hago

- Redactar, enviar, archivar, etiquetar, destacar o marcar como leído nada, solo lectura. Redactar = `draft-a-message`.
- Crear, mover o cancelar eventos del calendario, eso es `book-a-meeting`.
- Inventar urgencia, si el estado de un hilo no está claro: mostrarlo en `needs-me-today` con una pregunta para ti, sin fabricar una fecha límite.

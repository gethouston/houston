---
name: gestionar-mi-crm
title: "Gestionar mi CRM"
description: "Ejecuto la acción de CRM que necesites: una limpieza que detecta duplicados y desajustes de etapa sin modificar nada, una consulta de solo lectura en lenguaje natural, un enrutamiento que asigna VERDE, nutre AMARILLO y descarta ROJO, o una tarea de seguimiento enviada a tu herramienta de tareas. Nunca modifico nada sin tu aprobación fila por fila."
version: 1
category: Ventas
featured: no
image: handshake
integrations: [hubspot, salesforce, attio, pipedrive, notion, linear]
---


# Gestionar mi CRM

Una skill, cuatro acciones de CRM. El parámetro `action` elige la operación. Comparten la disciplina de "leer primero, modificar solo con aprobación".

## Parámetro: `action`

- `clean`  -  limpieza de higiene: duplicados, campos obligatorios faltantes, desajustes de etapa (ej. negocio en Etapa 3, sin champion capturado). Escribo la lista de diferencias. Solo modifico con aprobación explícita fila por fila.
- `query`  -  pregunta en lenguaje natural → consulta de solo lectura al CRM → respuesta + la consulta que corrí. "¿Cuántos negocios hay en Etapa 2?" / "Muéstrame los negocios que cierran este mes." / "¿Quién es dueño de Acme?"
- `route`  -  leo los puntajes de lead más recientes, aplico la política de enrutamiento del playbook (por defecto: VERDE → asignar dueño, AMARILLO → cola de nutrición, ROJO → descartar). Escribo las decisiones; solo modifico los campos de dueño en el CRM con aprobación.
- `queue-followup`  -  envío una tarea a la herramienta de tareas conectada (estilo Linear / Notion / Asana). Contenido de la tarea: quién, qué, cuándo, negocio / lead vinculado.

Si el usuario implica la acción ("limpia el CRM", "cómo va mi pipeline", "enruta los leads", "encola un seguimiento") la infiero. Si no, hago UNA pregunta nombrando las 4 opciones.

## Cuándo usarlo

- Disparadores explícitos en la descripción.
- Implícito: después de terminar `score-my-pipeline subject=lead`, encadeno `action=route`. Después de `check-my-sales subject=discovery-call` o `write-my-outreach stage=followup`, encadeno `action=queue-followup` para el siguiente paso.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta skill reviso que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña Integraciones, y me detengo.

- **CRM**  -  para leer contactos, negocios, y etapas; solo modifico con aprobación fila por fila. Obligatorio para cada acción.
- **Herramientas de tareas**  -  para enviar una tarea a colas estilo Linear, Notion, Asana. Obligatorio para `queue-followup`.

Si tu CRM no está conectado, me detengo y te pido conectar HubSpot, Salesforce, Attio, Pipedrive, o Close desde la pestaña Integraciones.

## Información que necesito

Primero leo tu contexto de ventas. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > pegar texto) y espero.

- **CRM conectado**  -  Obligatorio para cada acción. Por qué lo necesito: cada fila debe citar un registro real. Si falta, pregunto: "¿Con qué CRM debería trabajar, HubSpot, Salesforce, Attio, Pipedrive, o Close? Conéctalo desde la pestaña Integraciones."
- **Tus etapas de negocio y el mapa de dueños**  -  Obligatorio para `clean` y `route`. Por qué lo necesito: detecto desajustes de etapa y asigno los leads VERDE al dueño correcto. Si falta, pregunto: "Cuéntame tus etapas de negocio y quién es dueño de cada segmento."
- **Tu playbook de ventas**  -  Obligatorio para `clean` y `route`. Por qué lo necesito: los criterios de salida de etapa guían la detección de desajustes y tu perfil de cliente ideal fundamenta el descarte de los ROJO. Si falta, pregunto: "Todavía no tengo tu playbook, ¿quieres que lo redacte ahora?"
- **Política de enrutamiento**  -  Opcional. Por qué lo necesito: por defecto uso "VERDE al dueño, AMARILLO a nutrición, ROJO descartado." Si no tienes una regla distinta, sigo con ese valor por defecto.
- **Herramienta de tareas conectada**  -  Obligatorio para `queue-followup`. Por qué lo necesito: envío las tareas a un lugar donde realmente las vas a ver. Si falta, pregunto: "¿Dónde deberían caer los seguimientos, Linear, Notion, Asana?"

## Pasos

1. **Leer el registro + el playbook.** Reúno los campos obligatorios que falten (UNA pregunta cada uno, mejor modalidad primero). Escribo de forma atómica.

2. **Descubrir el slug del CRM vía Composio.** `composio search crm` → elijo el conectado. Si no hay ninguno, nombro la categoría a conectar y me detengo.

3. **Ramificar según la acción.**
   - `clean`:
     1. Traigo la lista completa de contactos + negocios vía las herramientas de lectura del CRM.
     2. Detecto problemas:
        - **Duplicados**  -  contactos que coinciden en dominio de correo + apellido + nombre aproximado; negocios de la misma cuenta con montos que se solapan.
        - **Campos obligatorios faltantes**  -  según el marco de calificación del playbook (ej. negocio en Etapa 3, sin champion capturado).
        - **Desajustes de etapa**  -  negocio en Etapa N pero no se cumplen los criterios de salida de la Etapa N-1; negocios estancados (sin actividad hace más de 30 días, en etapas activas).
     3. Escribo la lista de diferencias en `crm-reports/clean-{YYYY-MM-DD}.md`  -  una sección por tipo de problema, cada fila con la **modificación recomendada** + comando de aprobación (fila por fila, no en bloque). Nada se modifica todavía.
     4. Muestro los 10 problemas principales en línea + la ruta. Espero la aprobación explícita fila por fila antes de ejecutar modificaciones vía `composio <crm> <action>`.
   - `query`:
     1. Interpreto la pregunta como una consulta estructurada (entidad + filtros + agrupación).
     2. Corro la consulta de solo lectura vía el CRM conectado.
     3. Devuelvo la respuesta + la consulta que corrí (el usuario puede ajustarla). Guardo en `crm-reports/query-{YYYY-MM-DD}.md` con la pregunta, la consulta, y la tabla de respuesta. Sin modificar nada.
   - `route`:
     1. Leo el `scores/lead-*.md` más reciente (o corro `score-my-pipeline subject=lead` primero si está desactualizado) y `leads.json`.
     2. Aplico la política de enrutamiento:
        - **VERDE** → asigno el dueño por defecto de `ownerMap` (pregunto una vez si falta).
        - **AMARILLO** → cola de nutrición (lo muestro para un `write-my-outreach stage=cold-email` más adelante).
        - **ROJO** → descarto (cito el descalificador).
     3. Escribo las decisiones en `crm-reports/route-{YYYY-MM-DD}.md`. Muestro los 10 principales en línea + los conteos por grupo. Espero aprobación antes de modificar los campos de dueño en el CRM.
   - `queue-followup`:
     1. Interpreto la solicitud: quién, qué, cuándo. Traigo la referencia al negocio / lead si se nombró.
     2. Descubro la herramienta de tareas vía `composio search task`. Si no hay ninguna, pregunto una vez cuál usar.
     3. Envío la tarea vía el slug de creación de tareas de la herramienta. Capturo la URL de la tarea.
     4. Registro en `tasks/{YYYY-MM-DD}.md` (agrego, es un registro corrido, no un archivo por tarea).

4. **Agregar a `outputs.json`**  -  leer-combinar-escribir atómico: `{ id (uuid v4), type: "crm-sweep" (clean) | "crm-query" (query) | "routing-decision" (route) | "task-queued" (queue-followup), title, summary, path, status: "ready" (o "draft" para clean / route hasta que se aprueben las modificaciones), createdAt, updatedAt, domain: "crm" }`.

5. **Resumir al usuario.** El hallazgo principal + la siguiente aprobación obligatoria (clean / route) o confirmación (query / queue-followup). Nunca modifico nada sin aprobación explícita fila por fila.

## Lo que nunca hago

- Modificar registros del CRM (cambio de etapa, reasignación de dueño, borrado de contacto) sin aprobación explícita fila por fila.
- Inventar un campo o negocio del CRM, cada fila cita un ID de registro real del CRM conectado.
- Consultar fuera del alcance de solo lectura que el usuario autorizó.
- Enviar una tarea a una herramienta no conectada, siempre la descubro vía Composio.

## Salidas

- `clean` → `crm-reports/clean-{YYYY-MM-DD}.md`
- `query` → `crm-reports/query-{YYYY-MM-DD}.md`
- `route` → `crm-reports/route-{YYYY-MM-DD}.md`
- `queue-followup` → agrega a `tasks/{YYYY-MM-DD}.md`
- Agrega a `outputs.json`.

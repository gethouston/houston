---
name: configurar-mi-informacion-de-ventas
title: "Configurar mi información de ventas"
description: "Cuéntame lo básico sobre tu empresa, tu cliente ideal, tu postura de precios, las etapas de tus negocios, y cómo manejas las objeciones para poder darte mejor ayuda en ventas. Te hago algunas preguntas rápidas y escribo el playbook que todas las demás skills consultan primero. Solo necesitas hacer esto una vez, y yo lo mantengo actualizado a medida que las cosas cambien."
version: 1
category: Ventas
featured: yes
image: handshake
integrations: [googledocs, hubspot, salesforce, attio, pipedrive, notion]
---


# Configurar mi información de ventas

Esta skill ES DUEÑA de `context/sales-context.md`. Ninguna otra skill lo escribe.
Esta skill lo crea o lo actualiza. Su existencia desbloquea todas las demás skills del agente.

## Cuándo usarla

- "escribe mi playbook de ventas" / "redacta el playbook" / "hagamos el playbook".
- "actualiza el playbook" / "cambió nuestro cliente ideal, corrige el playbook" / "actualiza la postura de precios".
- La invoca implícitamente cualquier skill que necesite el playbook si falta, solo después de confirmar con el usuario.

## Conexiones que necesito

Hago el trabajo externo a través de Composio. Antes de ejecutar esta skill, reviso que las siguientes categorías estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **CRM**, para traer las etapas de negocio existentes y las cuentas cerradas ganadas y así darle contenido inicial al playbook. Opcional.
- **Documentos / notas**, para leer un borrador del playbook existente si tienes uno en Notion o Google Docs. Opcional.

Puedo ejecutar esta skill solo con la entrevista, así que ninguna conexión es obligatoria. Si mencionas un CRM y no está conectado, te pediré que lo conectes.

## Información que necesito

Primero leo tu contexto de ventas. Por cada campo obligatorio que falte, te hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Nombre de la empresa, sitio web y presentación de 30 segundos**. Obligatorio. Por qué lo necesito: fundamenta la sección de resumen de la empresa y da marco a todas las demás secciones. Si falta, pregunto: "¿Cuál es el nombre de tu empresa, la URL de tu sitio web, y cómo la presentarías en 30 segundos?"
- **Tu cliente ideal (industria, tamaño, roles, dolores, disparadores)**. Obligatorio. Por qué lo necesito: define las secciones de cliente ideal, comité de compra y descalificadores. Si falta, pregunto: "¿A quién le vendes hoy? Industria, tamaño de empresa, los roles que realmente lo usan, y qué los impulsa a comprar."
- **2 o 3 citas textuales de clientes**. Obligatorio. Por qué lo necesito: mantiene el lenguaje del dolor y el manual de objeciones en las palabras de tus clientes, no en lenguaje de marketing. Si falta, pregunto: "Pega 2 o 3 cosas que clientes reales hayan dicho sobre el dolor, la categoría, o una objeción que hayan planteado."
- **Tu CRM y las etapas de tus negocios**. Obligatorio. Por qué lo necesito: da contenido inicial a la sección de etapas de negocio con los nombres que realmente usas. Si falta, pregunto: "¿Qué CRM usas? HubSpot, Salesforce, Attio, Pipedrive, o Close, o pega tu lista de etapas."
- **Marco de calificación**. Obligatorio. Por qué lo necesito: define la sección de calificación (MEDDPICC, BANT, o tu propio marco). Si falta, pregunto: "¿Usas MEDDPICC, BANT, o tu propia lista de calificación?"
- **Postura de precios**. Opcional. Por qué lo necesito: me permite escribir una sección de precios real en vez de dejarla como TBD. Si no la tienes, sigo adelante con TBD.

## Pasos

1. **Leo el registro y el playbook existente.** Si `context/sales-context.md` existe, lo leo para que la ejecución sea una actualización, no una reescritura. Preservo lo que el fundador ya perfeccionó; cambio solo lo desactualizado o nuevo.

2. **Extraigo información de llamadas recientes si están disponibles.** Leo `calls/*/analysis-*.md` y `call-insights/*.md`. Llevo los patrones de objeciones y las frases textuales de dolor directo al manual, sin parafrasear.

3. **Insisto en el lenguaje textual del cliente.** Antes de redactar, le pido al fundador 2 o 3 citas textuales de clientes (el dolor nombrado, una frase sobre la categoría, una objeción escuchada). Si `call-insights/` tiene entradas, las extraigo primero. Sin parafrasear en lenguaje de marketing.

4. **Redacto el playbook (~500-800 palabras, con criterio propio, concreto).** Estructura, en orden:

   1. **Resumen de la empresa**, un párrafo: qué hacemos, para quién, qué lo hace valioso de construir ahora.
   2. **Cliente ideal**, industria, tamaño, región, etapa. Nombra **1 o 2 cuentas ancla** (reales, cerradas ganadas o objetivo).
   3. **Comité de compra**, campeón (cargo + motivaciones), comprador económico (cargo + qué lo convence), bloqueador (quién frena los negocios y por qué), influenciadores.
   4. **Descalificadores**, de 3 a 5 noes contundentes. Si ves X, te retiras.
   5. **Marco de calificación**, MEDDPICC, BANT, o la lista propia del fundador. Escribe las preguntas que este agente hace para puntuar cada pilar.
   6. **Postura de precios**, modelo, rangos (si se comparten), política de descuentos, términos mínimos viables, límite innegociable.
   7. **Etapas de negocio y criterios de salida**, qué mueve un negocio de la Etapa N a la N+1. Concreto: "La Etapa 2 se completa cuando el campeón confirmó el dolor Y nombró al comprador económico."
   8. **Manual de objeciones**, las 5 objeciones principales y la mejor respuesta actual del fundador. Prefiere el lenguaje textual de las llamadas sobre el de marketing.
   9. **Los 3 principales competidores**, nombrados, con una línea cada uno: "son fuertes en X, les ganamos en Y."
   10. **Objetivo principal de la primera llamada**, la única petición a la que llega cada llamada de descubrimiento. Concreto: "El siguiente paso es una validación técnica con su líder de ingeniería en los próximos 7 días."

5. **Marco los vacíos con honestidad.** Si una sección queda débil (sin datos de llamadas, sin cuenta ancla nombrada), escribo `TBD - {qué debería traer el fundador la próxima vez}` en vez de adivinar. Nunca invento.

6. **Escribo de forma atómica.** Escribo en `context/sales-context.md.tmp` y luego renombro a `context/sales-context.md`. Un solo archivo. NO bajo `.agents/`. NO bajo `.houston/<agent>/`.

7. **Actualizo el registro.** Establezco `universal.playbook = { present: true, path: "context/sales-context.md", lastUpdatedAt: <ISO> }` y cualquier campo `universal.idealCustomer` / `domains.crm.dealStages` / `domains.meetings.qualificationFramework` que la entrevista haya capturado de nuevo. Lectura-fusión-escritura atómica de `config/context-ledger.json`.

8. **Anexo a `outputs.json`.** Leo el arreglo existente y agrego:

   ```json
   {
     "id": "<uuid v4>",
     "type": "playbook",
     "title": "Playbook de ventas actualizado",
     "summary": "<2-3 oraciones, qué cambió en esta pasada>",
     "path": "context/sales-context.md",
     "status": "draft",
     "createdAt": "<ISO-8601>",
     "updatedAt": "<ISO-8601>",
     "domain": "playbook"
   }
   ```

   (El playbook en sí es un documento vivo, pero cada edición sustancial queda indexada para que el fundador vea la actualización en el panel.)

9. **Resumo al usuario.** Un párrafo: qué cambiaste, qué sigue como TBD, el siguiente paso exacto (por ejemplo, "ejecuta `profile-my-buyer` para {segmento} para completar la sección del comité de compra"). Le recuerdo que todas las demás skills ahora tienen contexto.

## Lo que nunca hago

- Nunca invento el perfil de cliente ideal, los precios, los competidores, ni las objeciones. Las secciones débiles quedan como TBD, nunca adivinadas.
- Nunca sobrescribo secciones ya perfeccionadas en una pasada de actualización, preservo lo que el fundador ajustó.
- Nunca escribo el playbook en otro lugar que no sea `context/sales-context.md`.

## Resultados

- `context/sales-context.md` (en la raíz del agente, documento vivo).
- Actualiza `config/context-ledger.json`.
- Se anexa a `outputs.json` con `type: "playbook"`, `domain: "playbook"`.

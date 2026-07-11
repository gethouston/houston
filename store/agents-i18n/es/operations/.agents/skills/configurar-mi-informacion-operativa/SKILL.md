---
name: configurar-mi-informacion-operativa
title: "Configurar mi información operativa"
description: "Cuéntame cómo funciona realmente tu empresa para que las demás habilidades operativas dejen de hacerte las mismas preguntas. Recojo tus prioridades del trimestre, tu ritmo operativo, tus contactos clave, tu postura frente a proveedores, tus límites innegociables y tu tono, todo en un solo documento vivo. Lo haces una sola vez y yo lo mantengo actualizado a medida que las cosas cambian."
version: 1
category: Operaciones
featured: yes
image: clipboard
---


# Configurar mi información operativa

Este agente es DUEÑO de `context/operations-context.md`. Ningún otro agente lo escribe. Esta habilidad lo crea o lo actualiza. Su existencia desbloquea a este agente.

## Cuándo usarla

- "configura nuestro contexto operativo" / "redacta el documento operativo" / "documenta cómo trabajamos".
- "actualiza el contexto operativo" / "cambiaron las prioridades, corrige el documento".
- Invocada implícitamente por otra habilidad que necesita el documento de contexto y no lo encuentra, solo después de confirmarlo contigo.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta habilidad verifico que las categorías de abajo estén vinculadas. Si falta alguna, nombro la categoría, te pido conectarla desde la pestaña de Integraciones y me detengo.

- **Bandeja de entrada** (Gmail, Outlook) - Opcional. Me permite muestrear mensajes enviados para que la sección de tono refleje cómo escribes en realidad.
- **Calendario** (Google Calendar, Outlook) - Opcional. Me ayuda a inferir tu ritmo operativo (días de trabajo profundo, densidad de reuniones).
- **Archivos** (Google Drive) - Opcional. Si me señalas un documento operativo existente, lo leo antes de redactar.

Esta habilidad funciona sin ninguna conexión, las conexiones solo hacen el documento más rico. Aquí nunca me bloqueo.

## Información que necesito

Primero leo tu contexto operativo. Por cada campo requerido que falte hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo adjunto > URL > pegar) y espero.

- **Resumen de la empresa** - Requerido. Por qué lo necesito: todas las demás habilidades se apoyan en qué haces, para quién y en qué etapa estás. Si falta, pregunto: "En una o dos frases, ¿qué hace la empresa y para quién es? ¿Y dónde están hoy: pre-lanzamiento, primeros usuarios, escalando?"
- **Prioridades activas** - Requerido. Por qué lo necesito: cada revisión semanal y flujo de aprobación gira alrededor de esto. Si falta, pregunto: "¿Cuáles son las 2 o 3 cosas que la empresa está empujando este trimestre?"
- **Ritmo operativo** - Requerido. Por qué lo necesito: define la entrega de resúmenes, la protección del trabajo profundo y la carga de reuniones. Si falta, pregunto: "¿Cómo te gusta trabajar: días de trabajo profundo, días de reuniones, máximo de reuniones al día, zona horaria?"
- **Contactos clave** - Requerido. Por qué lo necesito: ancla el enrutamiento de VIPs y el "quién desbloquea qué". Si falta, pregunto: "¿Quiénes son tus contactos clave: inversionista líder, asesor más cercano, clientes ancla, legal o finanzas fraccionales?"
- **Postura frente a proveedores** - Requerido. Por qué lo necesito: define el tono para renovaciones y compras. Si falta, pregunto: "¿Cómo abordas a los proveedores: conservador, equilibrado o rápido? ¿Quién puede firmar? ¿Anual o mensual?"
- **Límites innegociables** - Opcional. Por qué lo necesito: me impide redactar cosas que jamás enviarías. Si no lo tienes, sigo adelante con TBD usando los valores por defecto del espacio de trabajo.

## Pasos

1. **Leer la configuración.** Cargar `config/company.json`, `config/rhythm.json`, `config/voice.md`. Si falta alguno, ejecutar `onboard-me` primero (o preguntar UNA pieza faltante justo a tiempo con la sugerencia de mejor modalidad: app conectada > archivo > URL > pegar).

2. **Leer el documento existente si lo hay.** Si `context/operations-context.md` existe, leerlo para que la ejecución sea una actualización, no una reescritura. Preservar todo lo que el fundador ya afinó; cambiar solo lo obsoleto o lo nuevo.

3. **Pedir las piezas que la configuración no cubre.** Antes de redactar, pedirle al fundador de forma concisa:
   - **Contactos clave** - nombres + rol + cómo contactarlos para: inversionista líder, asesor más cercano, 1-2 clientes ancla, legal/finanzas fraccionales, contratista de operaciones (si hay).
   - **Postura frente a proveedores** - apetito de riesgo (conservador / equilibrado / rápido), autoridad de firma (solo el fundador / cualquier ejecutivo), preferencia de plazo (mensual / anual / caso por caso), preferencia de contrato (el nuestro / el de ellos / cualquiera).
   - **Límites innegociables** - cualquier cosa propia del fundador además de los cuatro del espacio de trabajo (nunca mover dinero, nunca modificar HRIS/nómina, nunca decidir compras en solitario, nunca enviar algo externo sin aprobación).
   - **Herramientas conectadas** (por categoría de Composio, no por marca) - bandeja de entrada, calendario, chat de equipo, drive, grabación de reuniones, CRM (si hay), facturación (si hay), investigación web, noticias, redes sociales.

   Si una sección queda floja, marcar `TBD  -  {lo que el fundador debería traer después}` y seguir. Nunca inventar.

4. **Redactar el documento (~300-500 palabras, con criterio, directo).** Estructura, en orden:

   1. **Panorama de la empresa** - un párrafo: qué hacemos, para quién, etapa, por qué ahora.
   2. **Prioridades activas** - 2-3 cosas que mueven la empresa este trimestre. La rúbrica del flujo de aprobación y la revisión semanal giran alrededor de esto.
   3. **Ritmo operativo** - días de trabajo profundo, días de reuniones, cadencia de revisión, días sin reuniones, zona horaria.
   4. **Contactos clave** - nombres, roles, cómo contactarlos. Organizados por categoría (inversionistas, asesores, clientes ancla, contratistas, legal).
   5. **Herramientas y sistemas** - categorías de Composio conectadas + dónde viven los datos (drive principal, CRM, herramienta de proyectos, chat, facturación).
   6. **Proveedores y postura de gasto** - apetito de riesgo, autoridad de firma, preferencias de plazo, preferencias de contrato.
   7. **Límites innegociables** - los cuatro del espacio de trabajo + los propios del fundador.
   8. **Tono de comunicación** - 4-6 viñetas sobre tono, frases prohibidas, preferencia de longitud de frases. Extraído de `config/voice.md`.

5. **Escribir de forma atómica.** Escribir en `context/operations-context.md.tmp` y luego renombrar a `context/operations-context.md`. Un solo archivo en la raíz del agente. NO bajo una subcarpeta. NO bajo `.agents/`. NO bajo `.houston/<agent>/`.

6. **NO agregar a `outputs.json`.** El documento es vivo; no es un entregable ni se indexa.

7. **Resumir al usuario.** Un párrafo: qué se capturó, qué sigue en `TBD`, y el siguiente paso exacto (p. ej. "envíame tu lista de asesores y afino la sección de Contactos clave"). Recordarle que el agente de Operaciones de Proveedores y Compras ya tiene contexto para trabajar.

## Salidas

- `context/operations-context.md` (en la raíz del agente, documento vivo)

(Sin entrada en `outputs.json`, por diseño.)

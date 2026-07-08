---
name: recolectar-las-actualizaciones-de-mi-equipo
title: "Recolectar las actualizaciones de mi equipo"
description: "Ejecuta el ciclo semanal de actualizaciones sin tener que perseguir tú mismo a tu equipo. Envío el mensaje por Slack o correo con tu tono, recopilo lo que responden, y analizo cada actualización contra tus prioridades activas para que veas qué va bien encaminado, qué se está desviando, quién está bloqueado y quién no respondió. Se mantiene inactivo con un mensaje amigable si todavía no tienes una sección de equipo en tu información operativa."
version: 1
category: Operaciones
featured: no
image: clipboard
integrations: [gmail, slack]
---


# Recolectar las actualizaciones de mi equipo

Ciclo semanal de actualizaciones dirigido al equipo. La skill permanece inactiva para el fundador que trabaja realmente solo; en el momento en que el fundador contrata a 1 o más personas y las lista en su contexto operativo, se activa.

## Cuándo usarla

- "recolecta las actualizaciones del equipo de esta semana".
- "¿vamos bien encaminados con las metas esta semana?".
- "envía el recordatorio del viernes y analiza lo que respondan".

## Conexiones que necesito

Ejecuto todo el trabajo externo a través de Composio. Antes de ejecutar esta skill verifico que las categorías de abajo estén vinculadas. Si falta alguna → nombro la categoría, te pido conectarla desde la pestaña de Integraciones y me detengo.

- **Chat de equipo** (Slack, Microsoft Teams) - Requerido. El mejor lugar para enviar el mensaje semanal y leer las respuestas.
- **Bandeja de entrada** (Gmail, Outlook) - Opcional. Alternativa cuando los miembros del equipo viven en el correo y no en el chat.

Si no hay chat de equipo ni bandeja de entrada conectados, me detengo y te pido conectar primero tu chat de equipo.

## Información que necesito

Primero leo tu contexto de operaciones. Por cada campo requerido que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > pegar texto) y espero.

- **Lista del equipo** - Requerido. Por qué la necesito: esta skill solo se ejecuta contra tu equipo declarado, nunca contra contactos al azar. Si falta, pregunto: "¿Quién está en tu equipo ahora mismo? Nombres y cómo debería contactar a cada persona; lo mejor es que subas una hoja con la lista o que los agregues a tu contexto operativo."
- **Prioridades activas** - Requerido. Por qué las necesito: evalúo cada actualización contra lo que la empresa realmente intenta lograr este trimestre. Si faltan, pregunto: "¿Cuáles son las 2 o 3 cosas que la empresa está impulsando este trimestre?"
- **Día de revisión** - Opcional. Por qué lo necesito: define la fecha límite para las respuestas. Si no lo tienes, sigo adelante con TBD y uso una ventana de 48 horas.
- **Tu tono** - Opcional. Por qué lo necesito: el recordatorio suena como tú, no como un bot. Si no lo tienes, sigo adelante con TBD usando un tono neutral; lo mejor es que conectes tu bandeja de entrada para que pueda muestrear 20 a 30 mensajes enviados.

## Pasos

1. **Leo `context/operations-context.md`.** Si la sección "Key contacts / Team" está ausente, vacía o tiene N≤1 (solo el fundador), me detengo y digo:

   > "Esta skill recolecta actualizaciones semanales de un equipo. Tu contexto operativo todavía no lista a nadie, así que no hay a quién consultar. Ejecuta `set-up-my-ops-info` y agrega una sección de Equipo cuando contrates; entonces esta skill se activa."

   NO ejecutar contra contactos externos que no estén en la lista del equipo.

2. **Leo `config/update-template.md` si existe.** Si no, uso la plantilla predeterminada de abajo.

3. **Envío los recordatorios.** Para cada miembro del equipo en la sección de Equipo:
   - `composio search chat` (preferido) o `composio search inbox` - ejecuto la herramienta de envío de mensajes del proveedor de chat de equipo del fundador.
   - Entrego la plantilla del mensaje como DM o respuesta en el hilo, dirigida a esa persona. Uso el tono del fundador según `config/voice.md`.
   - Plantilla predeterminada:

     > "Hola {name}, es hora de la actualización semanal. Tres preguntas, 2 minutos:
     > (1) ¿Qué salió esta semana? (2) ¿Qué está bloqueado y qué
     > necesitas de mí para destrabarlo? (3) ¿Cuál es la apuesta más
     > grande de la próxima semana? Responde aquí cuando tengas 2 minutos;
     > fecha límite: fin del día {reviewDay}."

   **Excepción a los límites innegociables del workspace:** la skill envía recordatorios internos al equipo. NO son comunicaciones externas. Los envíos externos siguen prohibidos.

4. **Espero las respuestas.** El usuario define la ventana (predeterminado: hasta el fin del día de `rhythm.json.reviewDay`, o 48h desde el envío si el ritmo no está configurado). Si el usuario invoca la skill una segunda vez la misma semana, consumo la ventana transcurrida hasta ese momento.

5. **Recolecto las respuestas.** Extraigo las respuestas de la misma herramienta de chat o bandeja de entrada, emparejadas por hilo o conversación.

6. **Analizo la alineación** con las prioridades activas de `context/operations-context.md`:

   - **Bien encaminado** - lo entregado contribuye a una prioridad activa.
   - **Desviándose** - trabajo en curso que no contribuye a ninguna.
   - **Bloqueado** - bloqueos declarados, con quién se espera que los destrabe.
   - **En silencio** - miembros del equipo que no respondieron.

7. **Escribo** el resumen en `updates/{YYYY-MM-DD}-roundup.md` con las cuatro secciones + una lista de "Qué debería hacer el fundador" al final (1-3 elementos: destrabar a {persona} en {tema}, redefinir el alcance de {proyecto}, reconocer {logro}).

8. **Escrituras atómicas** - `*.tmp` → renombrar.

9. **Agrego a `outputs.json`** con `type: "updates"` y estado "ready".

10. **Resumen para el usuario** - conteos (N bien encaminados / M desviándose / P bloqueados / Q en silencio) + la acción principal para el fundador tomada del resumen.

## Resultados

- `updates/{YYYY-MM-DD}-roundup.md`
- Agrega a `outputs.json` con `type: "updates"`.

## Lo que nunca hago

- **Enviar recordatorios a contactos externos.** La sección de Equipo en el contexto operativo es la lista permitida; todos los demás son externos.
- **Modificar registros de HRIS / nómina** a partir de las actualizaciones recolectadas; solo lectura sobre los sistemas de registro.
- **Ejecutarme si falta la sección de Equipo.** Me detengo con el mensaje de "todavía no hay equipo"; no improviso una lista de equipo a partir de otras fuentes.

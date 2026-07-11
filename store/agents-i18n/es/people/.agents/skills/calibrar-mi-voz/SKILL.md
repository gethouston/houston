---
name: calibrar-mi-voz
title: "Calibrar mi voz"
description: "Reviso tus comunicaciones pasadas de Recursos Humanos (ofertas, seguimientos, conversaciones difíciles) para poder igualar tu tono en cada borrador. Conecta Gmail u Outlook para obtener la lectura más precisa de tu voz, o pega de tres a cinco ejemplos."
version: 1
category: Personal
featured: no
image: busts-in-silhouette
integrations: [gmail, outlook]
---


# Calibrar Mi Voz

Ofertas, rechazos, anuncios al equipo, planes de mejora de desempeño
(PIP), conversaciones de retención: toda habilidad que este agente
redacta se apoya en tu voz. Esta habilidad revisa cómo escribes de
verdad las comunicaciones de Recursos Humanos y guarda la huella de
tono en `context/people-context.md`, de donde parte cada borrador
posterior.

## Cuándo usarla

- "calibra mi voz de Recursos Humanos" / "revisa mis ofertas
  pasadas" / "aprende cómo escribo para Recursos Humanos".
- "actualiza las notas de voz en el documento de contexto de
  personal".
- Llamada implícitamente por `configurar-mi-informacion-de-personal`
  cuando la sección de notas de voz está incompleta o desactualizada.

## Conexiones que necesito

Realizo el trabajo externo a través de Composio. Antes de correr esta
habilidad, verifico que las categorías de abajo estén conectadas. Si
falta alguna, nombro la categoría, te pido que la conectes desde la
pestaña de Integraciones, y me detengo.

- **Bandeja de entrada (Gmail, Outlook)**: revisar tus mensajes
  enviados relacionados con Recursos Humanos. Obligatoria si quieres
  que saque ejemplos de ahí.

Si no hay bandeja de entrada conectada, pregunto una vez si prefieres
que revise una bandeja conectada o que pegues de tres a cinco
ejemplos.

## Información que necesito

Primero leo tu contexto de personal. Por cada campo obligatorio que
falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app
conectada > archivo > URL > texto pegado) y espero.

- **Muestras de voz**: Obligatorio. Por qué las necesito: cada punto de la huella de voz debe rastrearse hasta muestras reales. Si faltan, pregunto: "Conecta tu bandeja de entrada para que pueda sacar de 10 a 20 mensajes recientes de Recursos Humanos, o pega de tres a cinco ejemplos aquí."
- **Alcance de las muestras**: Opcional. Por qué lo necesito: me permite filtrar entre comunicaciones con candidatos o con el equipo. Si no lo tienes, sigo adelante con el conjunto más amplio de comunicaciones de Recursos Humanos que encuentre.
- **Muestras de noticias difíciles**: Opcional. Por qué las necesito: los rechazos y las aperturas de PIP suenan distinto a las notas de celebración. Si no las tienes, sigo adelante marcando la huella de noticias difíciles como pendiente.

## Pasos

1. **Leer el documento de contexto de personal** (archivo propio):
   `context/people-context.md`. Leo la sección existente de notas de
   voz para que esta pasada sea un complemento o fusión, no una
   sobrescritura. Si el documento no existe, corro primero
   `configurar-mi-informacion-de-personal`.

2. **Elegir la fuente: hacer UNA pregunta puntual si no es obvio,
   con pista de modalidad:**
   - "Puedo sacar de 10 a 20 mensajes salientes recientes
     relacionados con Recursos Humanos de tu bandeja conectada, o
     puedes pegar de 3 a 5 ejemplos. ¿Cuál prefieres?"
   - Conectada: corro `composio search inbox`; identifico mensajes
     enviados etiquetados con destinatarios relevantes para
     Recursos Humanos (candidatos, equipo); los obtengo.
   - Pegada: tomo el texto pegado tal cual.

3. **Si está conectada, obtener los mensajes.** Ejecuto el slug de
   listar-mensajes-enviados de la herramienta de bandeja
   descubierta. Filtro los mensajes relacionados con Recursos
   Humanos: candidatos, empleados, anuncios para todo el equipo. Si
   la bandeja no puede distinguirlos, pido el nombre de la etiqueta
   o carpeta, o una ventana de fechas. Capturo: fecha de envío, rol
   del destinatario (inferido), asunto, cuerpo.

4. **Extraer la huella de tono.** Por cada muestra, anoto:
   - **Patrón de saludo**: "Hola {nombre}," vs "Hola {nombre}:" vs
     "{nombre},".
   - **Patrón de cierre**: "Hablamos pronto,", "{nombre}", "Saludos,".
   - **Longitud de las frases**: promedio y rango.
   - **Nivel de formalidad**: 1 (casual) a 5 (formal).
   - **Frases prohibidas**: lo que el fundador nunca dice (por
     ejemplo, nunca "retomar el hilo", nunca "sinergia", nunca
     "hacer llegar").
   - **Manías**: rayas o comas, párrafos de una línea o densos, uso
     de emojis, variaciones de firma, cómo entrega malas noticias.
   - **Registro de noticias difíciles**: cómo escribe rechazos,
     avisos de despido, aperturas de PIP. Distinto de los mensajes
     de celebración; captúralo por separado.

5. **Sintetizar todo el conjunto.** Consolida en 4 a 6 puntos:
   - Hábitos de saludo.
   - Preferencia de longitud y ritmo de las frases.
   - Nivel de formalidad.
   - Frases prohibidas.
   - Registro de noticias difíciles.
   - Cualquier manía distintiva.

   Más de 3 a 5 fragmentos textuales (cortos, de 2 a 3 frases cada
   uno) que ejemplifiquen la voz.

6. **Agregar a la sección de notas de voz de
   `context/people-context.md`.** NO sobrescribas la sección,
   fusiónala. Conserva todo lo que el fundador ya afinó. Escritura
   atómica en `context/people-context.md.tmp`, luego renombrar.

7. **También actualizar `config/voice.md`**: misma huella, mismos
   fragmentos textuales, para que las habilidades futuras la lean
   localmente sin volver a analizar el documento compartido.
   Escritura atómica.

8. **Agregar a `outputs.json`.** Leer, fusionar y escribir de forma
   atómica: entrada de resumen que apunta a la actualización, no un
   archivo independiente:

   ```json
   {
     "id": "<uuid v4>",
     "type": "voice-calibration",
     "title": "Voz calibrada - <YYYY-MM-DD>",
     "summary": "<2-3 frases: N muestras revisadas, los 3 puntos principales de la huella, qué cambió en context/people-context.md>",
     "path": "context/people-context.md",
     "status": "ready",
     "createdAt": "<ISO-8601>",
     "updatedAt": "<ISO-8601>"
   }
   ```

   (La entrada apunta al documento en vivo porque no hay un
   artefacto independiente, las notas de voz viven dentro de
   `context/people-context.md`.)

9. **Nunca inventar.** Cada manía o punto de la huella debe
   rastrearse hasta muestras reales. Si el conjunto de muestras es
   demasiado delgado (menos de 5 mensajes), dilo y detente, una
   huella endeble es peor que ninguna.

10. **Resumir para el usuario.** Un párrafo: N muestras revisadas,
    los 3 puntos principales de la huella, dónde quedó en el
    documento de contexto de personal, qué otras habilidades
    redactarán mejor ahora.

## Salidas

- Actualiza la sección de notas de voz de
  `context/people-context.md` (documento en vivo).
- Actualiza `config/voice.md` con la nueva huella y los fragmentos.
- Se agrega a `outputs.json` con `type: "voice-calibration"`.

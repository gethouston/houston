---
name: calibrar-mi-voz
title: "Calibrar mi voz"
description: "Extraigo tus respuestas recientes a clientes desde tu bandeja de entrada conectada, leo cómo escribes realmente y lo destilo en un perfil de voz que todo borrador futuro va a igualar. Capto tu estilo de saludo, el ritmo de tus oraciones, tu despedida, tus frases favoritas y la jerga corporativa que nunca usas. Después de esto, cada respuesta, artículo y mensaje de ciclo de vida suena como si tú lo hubieras escrito."
version: 1
category: Soporte
featured: no
image: headphone
integrations: [gmail, outlook]
---


# Calibrar mi voz

## Cuándo usarlo

- "calibra mi voz" / "aprende cómo escribo" / "trae mis respuestas enviadas."
- Después de `set-up-my-support-info`, cuando la sección de voz está en `TBD`.
- Vuelve a ejecutarlo cuando el tono se haya desviado o quieras reaprender a partir de respuestas recientes.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de que esta skill se ejecute, verifico que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Bandeja de entrada** (Gmail / Outlook): traigo entre 10 y 20 de tus respuestas enviadas recientes. Obligatorio.
- **Mesa de ayuda** (Intercom / Help Scout / Zendesk): fuente alterna si respondes desde una mesa de ayuda en vez de correo. Obligatorio si la mesa de ayuda es tu canal principal.

Si ninguna está conectada, me detengo y te pido que conectes la bandeja de entrada o mesa de ayuda desde la que realmente respondes. Si prefieres pegar ejemplos, cambio a esa opción.

## Información que necesito

Primero leo tu contexto de soporte. Por cada campo obligatorio que falte, te hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Fuente de las muestras de voz**: Obligatorio. Por qué la necesito: o bien tomo respuestas de una bandeja conectada o tú las pegas, no adivino. Si falta, pregunto: "¿Quieres que traiga tus últimas 10 a 20 respuestas a clientes desde una bandeja conectada, o prefieres pegar aquí de 3 a 5 ejemplos?"
- **Frases prohibidas**: Opcional. Por qué la necesito: las frases que suenan mal viniendo de ti van a una lista de nunca usar. Si no la tienes, sigo con TBD e infiero a partir de las muestras.

## Pasos

1. **Leer `context/support-context.md`.** Si falta, ejecuta primero `set-up-my-support-info` (o detente y dímelo).

2. **Descubrir la bandeja conectada.** Ejecuto `composio search inbox` o `composio search email-sent` (pruebo ambos, el slug exacto depende del proveedor conectado: Gmail, Outlook, Intercom, Help Scout, Zendesk, etc.). Si no hay bandeja conectada, dime qué categoría conectar (conecta una: Gmail, Outlook, Intercom, Help Scout, Zendesk) y me detengo.

3. **Traer entre 10 y 20 respuestas salientes recientes.** Ejecuto el slug de la herramienta list-sent / search-sent. Filtro a respuestas que parezcan de soporte (profundidad del hilo > 1, o etiqueta/carpeta que contenga `support`, o destinatario que no sea interno). Apunto a las 10-20 más recientes.

4. **Extraer señales de tono de las muestras:**
   - Patrón de saludo (por ejemplo, "Hola Jane," vs "Hola," vs sin saludo).
   - Longitud de las oraciones: corta / media / larga.
   - Formalidad: casual / profesional / directa.
   - Convención de firma / despedida.
   - Frases repetidas o manías ("lo voy a revisar," "para ser claro," uso de guion largo, etc.).
   - Frases prohibidas que suenan mal viniendo de ellos (por ejemplo, "lamento el inconveniente").

5. **Escribir `config/voice.md`** de forma atómica. Incluye:
   - Un resumen de tono en un párrafo (directo / cálido / humano, rasgos específicos).
   - De 3 a 5 fragmentos textuales (los más cortos pero más representativos) con la información personal oculta usando marcadores `{Customer}` / `{Email}`.
   - Lista de "Frases prohibidas".

6. **Actualizar `context/support-context.md`.** Leo el documento actual, encuentro la sección de Tono + voz, la reemplazo con un resumen de 2 oraciones que apunte a `config/voice.md` para el detalle completo. Escribo de forma atómica (`.tmp` → renombrar).

7. **Actualizar `universal.voice` en `config/context-ledger.json`**: `summary`, `sampleSource`, `sampleCount`, `capturedAt`.

8. **Añadir a `outputs.json`** con `type: "voice-calibration"`, `domain: "quality"`, título "Voz calibrada a partir de {N} muestras", resumen = 2 oraciones, ruta = `config/voice.md`, estado `ready`.

9. **Resumirte a ti.** Un párrafo: cómo se ve el tono (por ejemplo, "directo, cálido, con uso frecuente de guion largo; nunca se disculpa por el inconveniente") y una línea recordando que cada respuesta borrador, mensaje de ciclo de vida y artículo de este agente ahora toma esto como base.

## Resultados

- `config/voice.md` (muestras originales + resumen de tono)
- `context/support-context.md` (referencia al resumen de la sección de voz)
- `config/context-ledger.json` (bloque `universal.voice`)
- Se añade a `outputs.json` con `type: "voice-calibration"`, `domain: "quality"`.

---
name: escribir-secuencia-de-correos-en-frio
title: "Escribir secuencia de correos en frío"
description: "Escribo contigo una secuencia de 3 correos de prospección en frío, un correo a la vez, siguiendo el método de James Shields: asunto personalizado (no el cuerpo), 3 frases más una posdata, una oferta irresistible y un llamado a la acción de baja fricción para responder. Cierro cada correo contigo antes de pasar al siguiente, para que el tono, la prueba social y la oferta se mantengan consistentes. Es la fase 4 de ambos pipelines, y también se puede ejecutar de forma independiente si ya tienes una lista de contactos verificados y quieres textos nuevos."
version: 1
category: Prospección
featured: yes
image: pencil
integrations: []
---


# Secuencia de correos en frío

Escribo contigo una secuencia de 3 correos de prospección en frío, un correo a la vez. La secuencia sigue el método de James Shields: asunto basado en un gatillo, cuerpo de tres frases, oferta irresistible sin compromiso, llamado a la acción de una sola palabra para responder. Presento cada borrador, lo afino contigo y lo cierro antes de pasar al siguiente, así el tono, la prueba social y la oferta se mantienen consistentes.

> **Método de James Shields**: un playbook de prospección muy usado que descarta el llamado a la acción de "agenda una demo" a favor de asuntos basados en un gatillo, cuerpos de tres frases, ofertas gratis sin compromiso, y llamados a la acción de una sola palabra. Está optimizado para la tasa de respuesta, no para el número de impresiones.

## Cuándo usarme

- "Escríbeme una secuencia de correos en frío para estos contactos".
- "Redacta una prospección de 3 correos para {audiencia}".
- Fase 4 de cualquiera de los dos pipelines de LinkedIn.
- Tienes una lista de contactos verificados (de Apollo, Clay, Hunter, o de cualquier otro lugar) y quieres textos nuevos.
- Quieres renovar textos de correos en frío ya gastados con un método probado.

## Cuándo NO usarme

- **Leads tibios** que ya te conocen, usa un correo directo y único, no una secuencia en frío de 3 pasos.
- **Ciclo de vida, onboarding o nutrición** para usuarios existentes, eso es otro tipo de flujo (y vive en el agente de Marketing).
- Correos **transaccionales** (recibos, restablecimiento de contraseña, notificaciones).
- **Seguimientos posteriores a una llamada**, usa `write-my-outreach` del agente de Ventas con `stage=followup`.
- **Newsletters o correos de contenido**, usa las habilidades de contenido del agente de Marketing.

## Conexiones que necesito

- **Ninguna.** Esta habilidad escribe localmente y produce un archivo de secuencia. Las conexiones vuelven a entrar en juego en `instantly-campaign` (la siguiente fase).

## Información que necesito

Recojo los datos en el paso 1 de abajo. Como mínimo:

- **Gatillo/origen**: qué te conecta con estos leads (la publicación de LinkedIn, el evento, la noticia).
- **Producto**: descripción en una línea de lo que vendes.
- **Prueba social**: al menos un caso de estudio con **números reales** (nada de "mejora 10x" sin decir quién y cómo). De preferencia 3 o más para que cada correo tenga prueba nueva.
- **Oferta**: lo gratuito o de baja fricción que estás regalando (auditoría, diagnóstico, prueba gratis, cupo gratis).
- **Llamado a la acción de respuesta**: la respuesta de una palabra que quieres (por defecto "Me apunto").
- **Remitente**: solo tu primer nombre.
- **Borrador existente**: opcional, cualquier texto del que quieras que parta.

Si falta el gatillo, el producto, la prueba social o la oferta, te pregunto por eso en el momento antes de redactar.

## El método

### Regla 1: personaliza el asunto, no el cuerpo
- El asunto hace referencia al gatillo (publicación, evento, comentario).
- El cuerpo usa solo `{{firstName}}`.
- Evita `{{company}}`, `{{title}}`, etc. en el cuerpo, las tasas de respuesta bajan cuando los campos de fusión se notan demasiado.

### Regla 2: tres frases más posdata (solo el correo 1)
- F1: contexto/gatillo (por qué le escribes).
- F2: qué construiste / la oferta.
- F3: prueba social (números específicos).
- PD: salida suave para que puedan desconectarse sin ignorarte.

### Regla 3: oferta irresistible
- Acceso gratis, sin compromiso.
- "Solo quiero feedback honesto".
- Nada de demo, nada de llamada, ningún compromiso en el paso en frío.

### Regla 4: llamado a la acción de baja fricción
- Responde con una palabra: "Me apunto".
- NO "agenda una llamada" ni "reserva una demo".

### Regla 5: sin relleno
- Sin guiones largos (usa puntos).
- Sin "espero que este correo te encuentre bien".
- Sin viñetas ni formato en el cuerpo.
- Asuntos en minúscula.
- Escribe como si le mandaras un mensaje a un colega.

## Pasos

### Paso 1: reunir la información

Pregunta una sola vez, y regístralo en las notas del run. Si algo ya está en `config/context-ledger.json` (remitente, tono, banco de pruebas sociales), úsalo sin volver a preguntar. Confirma el gatillo y la oferta, porque esos cambian en cada campaña.

### Paso 2: correo 1, la apertura (día 0)

Redacta según esta plantilla:

```
Subject: <personalizado al gatillo, en minúscula, casual, 2-4 palabras>

Hey {{firstName}},

<1 frase: vi tu <gatillo>. Validación breve.>

<1-2 frases: qué construí. Concreto.>

<1-2 frases: prueba social. Números específicos.>

<1 frase: la oferta. Gratis, sin compromiso.>

Responde "<cta>" y <acción>.

<primer nombre del remitente>

PD <salida suave, por ejemplo "Si esto no es tu problema ahora mismo, solo responde 'ahora no' y no te molesto más.">
```

**Preséntalo. Afina hasta que quede aprobado. NO avances hasta cerrarlo.**

### Paso 3: correo 2, el seguimiento (día 3)

Redacta según esta plantilla:

```
Subject: (mismo hilo, en blanco)

Hey {{firstName}},

<1 frase: seguimiento. Reconoce el ruido en la bandeja.>

<2 frases: prueba social NUEVA. Cliente distinto, números distintos al correo 1.>

<1 frase: reitera la oferta.>

Responde "<cta>" y <acción>.

<primer nombre del remitente>
```

Más corto que el correo 1 (sin posdata). Prueba social NUEVA, nunca repitas la del correo 1.

**Preséntalo. Afina hasta que quede aprobado. NO avances hasta cerrarlo.**

### Paso 4: correo 3, la despedida (día 7)

Redacta según esta plantilla:

```
Subject: (mismo hilo, en blanco)

Hey {{firstName}},

Este es el último que te mando sobre esto.

<1 frase: la herramienta está en vivo. Otros ya la usan.>

<1 frase: llamado a la acción final, si quieres la tuya, responde "<cta>" hoy.>

No te vuelvo a escribir después de este.

<primer nombre del remitente>
```

Máximo 4 frases. "No te vuelvo a escribir" crea urgencia. Sin propuesta nueva.

**Preséntalo. Afina hasta que quede aprobado.**

### Paso 5: guardar la secuencia cerrada

Escribo en `sequences/{runId}-sequence.md` si se invoca desde un orquestador (el orquestador pasa el `runId`); si no, en `sequences/{YYYY-MM-DD}-{campaign-slug}-sequence.md`.

Formato del archivo:

```markdown
# {Campaign name}

Cerrada el {ISO date}. Remitente: {first name}. Audiencia objetivo: {short description}.

## Correo 1 (Día 0)

Subject: <subject>

<body>

## Correo 2 (Día 3)

Subject: (mismo hilo)

<body>

## Correo 3 (Día 7)

Subject: (mismo hilo)

<body>

## Notas de envío

- Horario: lunes a viernes, 8 a 5 en {timezone from context, default America/Vancouver}.
- Cuentas de envío: {from context, default "all connected"}.
- Meta de leads: {from contacts file, e.g. "92 verified leads"}.
```

### Paso 6: agregar a los resultados

Fila en `outputs.json`: `{type: "sequence", title: "{Campaign name} sequence", summary: "3-email locked sequence ready for Instantly load.", path: "sequences/{file}", status: "locked", domain: "sequence"}`.

### Paso 7: resumen final para ti

Una línea: "Secuencia cerrada en {path}. Lista para cargarla en Instantly cuando quieras."

## Resultados

- `sequences/{runId}-sequence.md`, secuencia de 3 correos cerrada y lista para `instantly-campaign`.
- `outputs.json`, una fila, `type: "sequence"`, `status: "locked"`, `domain: "sequence"`.

## Referencia rápida

| Correo | Día | Longitud | Asunto | Objetivo |
|-------|-----|--------|---------|------|
| 1 Apertura | 0 | 3 frases + PD | Personalizado al gatillo, en minúscula | Gancho + oferta + prueba |
| 2 Seguimiento | 3 | 3-4 frases | En blanco (mismo hilo) | Prueba social NUEVA, reitera la oferta |
| 3 Despedida | 7 | 4 frases MÁXIMO | En blanco (mismo hilo) | Urgencia, "no vuelvo a escribir" |

## Errores comunes

| Error | Por qué arruina la secuencia | Solución |
|---|---|---|
| Asuntos largos (6+ palabras, con mayúsculas tipo título) | Parece marketing, no una persona | Minúsculas, 2-4 palabras, hace referencia al gatillo |
| Varios llamados a la acción en un correo | Divide la atención, baja la tasa de respuesta | Un solo llamado a la acción por correo, siempre la misma palabra de respuesta |
| Repetir la prueba social entre correos | Desperdicia el segundo contacto | El correo 2 debe usar un cliente NUEVO y números NUEVOS |
| "Solo confirmando" / "voy a subir esto" | Se lee como relleno desesperado | Reconoce el ruido de la bandeja una vez, y luego entrega valor nuevo |
| Enlaces para agendar en el correo 1 | La fricción mata las respuestas en frío | Solo el llamado a la acción de respuesta, los enlaces llegan después de que digan "me apunto" |
| Romper la regla de las 3 frases | Los correos largos se leen por encima y se descartan | Corta hasta que cada frase aporte algo |
| Guiones largos, signos de exclamación, viñetas | Parece generado por IA o marketero | Texto plano, solo puntos, escribe como un mensaje de texto |

## Lo que nunca hago

- **Escribir los 3 correos antes de mostrarte alguno.** Cada correo se cierra contigo antes de redactar el siguiente. Así se detecta temprano cualquier cambio de tono.
- **Reutilizar la prueba social entre correos.** El correo 2 debe usar un cliente distinto y números distintos al correo 1. Si solo me diste un punto de prueba social, me detengo y te pido otro antes de redactar el correo 2.
- **Usar guiones largos, signos de exclamación, o formato que delate IA en el cuerpo.** La habilidad instantly-campaign también quita los símbolos "&" al momento de cargar (bug de Instantly), pero el cuerpo no debería traer esos caracteres desde mi redacción en primer lugar.
- **Agregar píxeles de seguimiento o acortadores de enlaces al cuerpo.** La entregabilidad en frío es delicada; la plataforma de envío se encarga del seguimiento, el cuerpo se queda plano.
- **Escribir un asunto para el correo 2 o el 3.** Mantener el hilo (asunto en blanco) es intencional y es lo que le indica a la bandeja del destinatario que los agrupe.

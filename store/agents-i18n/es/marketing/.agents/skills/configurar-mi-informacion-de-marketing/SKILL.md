---
name: configurar-mi-informacion-de-marketing
title: "Configurar mi información de marketing"
description: "Cuéntame lo básico sobre tu empresa, tu cliente y cómo hablas para poder darte mejor ayuda de marketing. Te hago unas preguntas rápidas sobre tu producto, posicionamiento, cliente ideal, voz y qué estás vendiendo ahora mismo. Solo necesitas hacerlo una vez, y lo mantengo actualizado a medida que las cosas cambian."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [googledocs, notion]
---


# Configurar mi información de marketing

Esta skill crea o actualiza tu documento de posicionamiento. Todas las demás skills de marketing lo leen primero; si no existe, se detienen y lo piden.

## Cuándo usarla

- "ayúdame a escribir una declaración de posicionamiento" / "redacta mi posicionamiento" /
  "hagamos el posicionamiento".
- "actualiza el documento de posicionamiento" / "cambió nuestro cliente ideal, arregla el documento
  de contexto".
- Invocada implícitamente por cualquier otra skill que necesite posicionamiento, al encontrar
  el documento faltante, solo después de confirmar contigo.

## Conexiones que necesito

Ejecuto trabajo externo a través de Composio. Antes de correr esta skill reviso que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Google Docs o Notion**  -  reflejar el documento de posicionamiento en algún lugar que puedas compartir con asesores y una futura contratación. Opcional, el documento local es la fuente de verdad.
- **Notas de reuniones (Gong, Fireflies, Circleback)**  -  extraer el lenguaje textual de tus clientes para que el documento no suene a marketer. Opcional pero el insumo de mayor apalancamiento.
- **Bandeja de entrada (Gmail, Outlook)**  -  muestrear tu voz. Opcional.

Puedo correr esta skill sin ninguna conexión, simplemente me apoyo más en lo que me pegues.

## Información que necesito

Primero leo tu contexto de marketing. Por cada campo requerido que falte, te hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > subir archivo > URL > pegar texto) y espero.

- **Lo básico de tu empresa**  -  Requerido. Por qué lo necesito: el documento abre con qué haces y para quién. Si falta, pregunto: "¿Cuál es el nombre de tu empresa, tu sitio web, y cómo describirías en una frase lo que haces?"
- **Tu cliente ideal**  -  Requerido. Por qué lo necesito: el posicionamiento sin un lector objetivo son solo adjetivos. Si falta, pregunto: "¿Quién es el cliente que estás tratando de conquistar, rol, tamaño de empresa, qué lo hace ponerse a buscar?"
- **Tu voz**  -  Requerido. Por qué lo necesito: el documento lleva las reglas de voz que todas las demás skills leen. Si falta, pregunto: "Conecta tu bandeja de enviados para que pueda muestrear tu voz, o pega dos o tres cosas que hayas escrito."
- **Dos o tres citas textuales de clientes**  -  Requerido. Por qué lo necesito: no voy a parafrasear a tus clientes en lenguaje de marketer. Si falta, pregunto: "Suelta una grabación reciente de una llamada de ventas, pega dos o tres frases de clientes que recuerdes palabra por palabra, o conecta Gong / Fireflies para que pueda extraerlas."
- **Una o dos cuentas ancla**  -  Opcional. Si falta, pregunto: "Nombra uno o dos clientes reales, o clientes objetivo, que señalarías como el ajuste perfecto. Si no lo tienes, sigo adelante con TBD."

## Pasos

1. **Leer la configuración.** Cargar `config/company.json`, `config/ideal-customer.json`,
   `config/voice.md`. Si falta alguno, correr `onboard-me` primero (o
   preguntar UNA pieza faltante justo a tiempo con la mejor pista de modalidad:
   app conectada > archivo > URL > pegar).

2. **Leer el documento existente si lo hay.** Si
   `context/marketing-context.md` existe, leerlo para que esta corrida sea una actualización,
   no una reescritura. Preservar todo lo que el fundador ya afinó; cambiar
   solo lo desactualizado o nuevo.

3. **Insistir en lenguaje textual del cliente.** Antes de redactar, pedirle
   al fundador 2-3 citas textuales de clientes (dolor que nombraron, frase
   usada sobre la categoría, objeción escuchada). Si `call-insights/` tiene
   entradas, extraer de ahí primero. Sin paráfrasis de marketer, insistir
   si el fundador empieza a "traducir" las palabras del cliente.

4. **Redactar el documento (~300-500 palabras, con opinión, directo).** Estructura,
   en orden:

   1. **Resumen de la empresa**  -  un párrafo: qué hacemos, para quién,
      qué hace que valga la pena construirlo ahora.
   2. **Cliente ideal**  -  industria, tamaño, rol, disparadores. Nombrar **1-2 cuentas
      ancla** (cierre real o cliente objetivo).
   3. **Trabajos por hacer (jobs-to-be-done)**  -  2-3 trabajos reales para los que el comprador contrata el producto.
      Se prefiere lenguaje textual del cliente.
   4. **Declaración de posicionamiento**  -  categoría + audiencia +
      valor diferenciado en una frase. Con opinión.
   5. **Categoría y diferenciadores**  -  categoría en la que jugamos + 3
      cosas que realmente nos distinguen (no "somos más rápidos").
   6. **Top 3 competidores**  -  nombrados, una línea de "son fuertes en X,
      nosotros somos fuertes en Y" cada uno.
   7. **Notas de voz de marca**  -  4-6 viñetas sobre tono, frases
      prohibidas, preferencia de longitud de oración. Extraer de
      `config/voice.md`.
   8. **Postura de precios**  -  modelo + rango actual + una cosa NO
      negociable.
   9. **CTA principal**  -  una acción hacia la que empuja cada página / correo / campaña
      ahora mismo.

5. **Marcar vacíos con honestidad.** Si una sección está delgada (sin citas
   de clientes todavía, sin cuenta ancla), escribir `TBD  -  {qué debería
   traer el fundador después}` en lugar de adivinar. Nunca inventar.

6. **Escribir de forma atómica.** Escribir a
   `context/marketing-context.md.tmp`, luego renombrar a
   `context/marketing-context.md`. Archivo único en la raíz del agente. NO
   dentro de una subcarpeta. NO dentro de `.agents/`. NO dentro de
   `.houston/<agent>/`.

7. **Agregar a `outputs.json`.** Leer el arreglo existente, agregar la nueva
   entrada, escribir de forma atómica:

   ```json
   {
     "id": "<uuid v4>",
     "type": "positioning",
     "title": "Positioning doc updated",
     "summary": "<2-3 oraciones  -  la declaración de posicionamiento + qué cambió en esta pasada>",
     "path": "context/marketing-context.md",
     "status": "draft",
     "createdAt": "<ISO-8601>",
     "updatedAt": "<ISO-8601>"
   }
   ```

   (El documento en sí es un archivo vivo, pero cada edición sustancial queda
   indexada para que el fundador vea la actualización en el panel.)

8. **Resumir para ti.** Un párrafo: qué cambió, qué sigue en
   `TBD`, próximo paso exacto (por ejemplo, "pega 3 citas de clientes y voy
   a afinar los jobs-to-be-done"). Recordarte que los otros cuatro agentes ahora tienen el contexto
   que necesitan.

## Resultados

- `context/marketing-context.md` (en la raíz del agente  -  documento vivo)
- Agrega a `outputs.json` con `type: "positioning"`.

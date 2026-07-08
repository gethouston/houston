---
name: manejar-una-objecion
title: "Manejar una objeción"
description: "Redacto un replanteamiento certero de tres frases para usar en la llamada (reconocer → ejemplo concreto de una cuenta ancla → siguiente paso con fecha), más un correo de seguimiento breve en tu propio tono. Busco la objeción en tu playbook y en los insights de llamadas recientes para que la respuesta esté fundamentada, no improvisada."
version: 1
category: Ventas
featured: no
image: handshake
---


# Manejar una objeción

Manejador de una sola objeción. Dos salidas: replanteamiento en la llamada (corto, verbal) + correo de seguimiento post-llamada (corto, escrito).

## Cuándo usarlo

- "dijeron '{objeción}' en la llamada de {negocio}, redáctame el replanteamiento".
- "cómo manejo '{objeción}'".
- Llamada por `check-my-sales subject=discovery-call` para cualquier OBJECTION que salga en la llamada.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta skill reviso que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña Integraciones, y me detengo.

- **Bandeja de entrada**  -  para tomar muestras de tus correos enviados y calzar el tono del correo de seguimiento post-llamada. Opcional pero recomendado.

Puedo correr esta skill solo con tu playbook y las notas de llamada, así que ninguna conexión es estrictamente obligatoria.

## Información que necesito

Primero leo tu contexto de ventas. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > pegar texto) y espero.

- **Tu playbook de ventas**  -  Obligatorio. Por qué lo necesito: el manual de objeciones y las cuentas ancla fundamentan el replanteamiento. Si falta, pregunto: "Todavía no tengo tu playbook, ¿quieres que lo redacte ahora?"
- **La objeción en sus propias palabras**  -  Obligatorio. Por qué lo necesito: replanteo la frase real, no una paráfrasis. Si falta, pregunto: "¿Qué dijeron, palabra por palabra?"
- **En qué negocio surgió**  -  Obligatorio. Por qué lo necesito: guardo el replanteamiento bajo ese negocio y traigo contexto de la llamada. Si falta, pregunto: "¿Qué prospecto o negocio la planteó?"
- **Muestras de tu tono**  -  Opcional. Por qué lo necesito: hace que el correo post-llamada suene como tú. Si no las tienes, sigo con TBD y uso un tono neutral.

1. **Leer el playbook.** Cargo `context/sales-context.md`. Busco la entrada que coincide en el manual de objeciones. Si falta el playbook, le pido al usuario que corra `set-up-my-sales-info` primero, y me detengo.

2. **Leer el registro.** Cargo `config/context-ledger.json`. El campo `universal.idealCustomer` fundamenta el replanteamiento; las capturas progresivas ahí pueden actualizar la lista inicial de objeciones del playbook.

3. **Revisar call-insights recientes**  -  leo `call-insights/*.md` (los 3 más recientes) buscando un patrón que toque esta objeción. Prefiero replanteamientos textuales que ya funcionaron en llamadas pasadas.

4. **Redactar el replanteamiento para la llamada (3 frases):**

   1. **Reconocer**  -  sin retroceder, sin descartar.
   2. **Replantear** con un ejemplo concreto de cliente o un dato (uso las cuentas ancla de `context/sales-context.md`).
   3. **Proponer el siguiente paso**  -  específico, con plazo definido.

5. **Redactar el correo de seguimiento post-llamada**  -  5 a 8 líneas:

   - Asunto: "Re: {su dolor, en sus palabras}"
   - Apertura: confirmar que los escuchamos.
   - 2-3 viñetas: hechos/pruebas que atienden la objeción específica.
   - Cierre: siguiente paso concreto + fecha.

   Calzo el tono con `config/voice.md` (o capturo muestras en la primera corrida si falta).

6. **Escribir de forma atómica** en `deals/{slug}/objections/{YYYY-MM-DD}-{slug}.md.tmp` → renombrar. Estructura: objeción (textual) · replanteamiento (3 líneas) · correo de seguimiento (cuerpo) · fuentes (playbook + llamadas referenciadas).

7. **Actualizar el registro**  -  si la objeción reveló una variante nueva, la agrego a `universal.idealCustomer.pains` vía lectura-combinación-escritura atómica de `config/context-ledger.json`.

8. **Agregar a `outputs.json`:**

   ```json
   {
     "id": "<uuid v4>",
     "type": "objection",
     "title": "Objection  -  {objeción corta}",
     "summary": "<primera línea del replanteamiento + CTA de seguimiento>",
     "path": "deals/{slug}/objections/{date}-{slug}.md",
     "status": "draft",
     "createdAt": "<ISO>",
     "updatedAt": "<ISO>"
   }
   ```

9. **Resumir.** Imprimo el replanteamiento de 3 frases en línea para que el usuario lo use verbalmente en el próximo contacto. Ruta al artefacto completo.

## Salidas

- `deals/{slug}/objections/{YYYY-MM-DD}-{slug}.md`
- Posiblemente actualiza `config/context-ledger.json`.
- Agrega a `outputs.json` con `domain: "meetings"`, type `objection-reframe`.

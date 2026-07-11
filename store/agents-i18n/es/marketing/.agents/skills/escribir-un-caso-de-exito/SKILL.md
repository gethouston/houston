---
name: escribir-un-caso-de-exito
title: "Escribir un caso de éxito"
description: "Convierto el éxito de un cliente en un caso de éxito que puedes poner en tu sitio o entregarle a ventas. Lo estructuro como desafío, enfoque y resultados con números reales en tu voz. Cualquier número que no pueda verificar queda marcado para que lo confirmes."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [notion, airtable]
---


# Escribir un caso de éxito

## Cuándo usarlo

- Explícito: "redacta un caso de éxito para {customer}", "escribe la historia de {customer}", "convierte esta entrevista en un caso de éxito".
- Implícito: después de que el agente de SDR/ventas marca a un cliente cerrado-ganado que está dispuesto a ser referencia, y el fundador lo aprueba.
- Un caso de éxito por cliente por trimestre es una cadencia razonable.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta skill, reviso que las categorías de abajo estén conectadas. Si falta alguna, te digo cuál es, te pido que la conectes desde la pestaña de Integraciones y me detengo.

- **Base de notas (Airtable, Notion)**: trae la entrevista, el testimonio o el registro de notas del cliente. Obligatoria (o puedes pegar el material fuente).

Si ninguna está conectada y no puedes pegar la entrevista, me detengo y te pido que conectes Airtable o Notion.

## Información que necesito

Primero leo tu contexto de marketing. Por cada campo obligatorio que falte, te hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Tu posicionamiento**: Obligatorio. Por qué lo necesito: los casos de éxito tienen que reforzar el posicionamiento, no desviarse. Si falta, pregunto: "¿Quieres que redacte primero tu posicionamiento? Es una sola skill, toma unos cinco minutos."
- **Tu voz y CTA principal**: Obligatorios. Por qué lo necesito: el CTA de cierre tiene que coincidir con lo que piden todas tus demás páginas. Si falta, pregunto: "Conecta tu bandeja de enviados para que pueda muestrear tu voz, y dime la única acción que un lector debería tomar después de leer el caso de éxito."
- **El cliente**: Obligatorio. Si falta, pregunto: "¿Sobre qué cliente es este caso de éxito, nombre más una descripción de una línea?"
- **La entrevista, testimonio o notas**: Obligatorios. Por qué lo necesito: no voy a fabricar citas ni métricas. Si falta, pregunto: "Sube la grabación de la entrevista, pega el testimonio, o indícame el registro del cliente en Airtable o Notion."
- **Números reales de antes/después**: Obligatorios para un buen caso de éxito. Si falta, pregunto: "¿Qué cambio medible tuvo este cliente, y en qué periodo de tiempo? Si no lo tienes, sigo con TBD."

## Pasos

1. **Leo el documento de posicionamiento**: `context/marketing-context.md`. Si falta, me detengo. Le digo al usuario que corra primero `set-up-my-marketing-info`. Los casos de éxito tienen que reforzar el posicionamiento, sin desviarse.
2. **Leo la configuración**: `config/site.json` (voz / CTAs de marca).
3. **Ubico el material fuente.** Preferencia de modalidad:
   - CRM/hoja de cálculo conectado vía Composio: ejecuto `composio search crm` o `composio search spreadsheet` (por ejemplo, Airtable) para encontrar el registro del cliente + notas de entrevista adjuntas.
   - Transcripción de entrevista o testimonio pegado.
   - URL a un testimonio o reseña publicada.
   Si no hay nada de esto, hago UNA pregunta nombrando las modalidades de arriba.
4. **Extraigo los hechos.** Armo una lista de datos:
   - Nombre del cliente, industria, tamaño, rol de la persona entrevistada.
   - Desafío (dolor específico, en lenguaje textual del cliente cuando sea posible).
   - Métricas del estado anterior (qué fallaba, con qué frecuencia, qué costaba).
   - Enfoque (qué hicieron con el producto, características específicas, cambios de flujo de trabajo).
   - Resultados (números, periodo de tiempo, resultados específicos).
   - Citas destacadas (textuales, atribuidas).
5. **Marco los números faltantes.** Cualquier resultado sin número recibe una marca de TBD para que el fundador lo verifique con el cliente. Nunca invento métricas.
6. **Redacto el caso de éxito** con la estructura clásica:
   - Titular con el resultado destacado (por ejemplo, "Cómo Acme redujo su cancelación en 40%").
   - Resumen de un párrafo.
   - Sección de desafío.
   - Sección de enfoque.
   - Sección de resultados (números primero).
   - De 2 a 3 citas destacadas.
   - Llamado a la acción que coincide con el CTA principal del documento de posicionamiento.
7. **Escribo** en `case-studies/{customer-slug}.md` de forma atómica, con un bloque de front-matter: customer, industry, headlineResult, status.
8. **Agrego a `outputs.json`**: `{ id, type: "case-study", title, summary, path, status: "draft", createdAt, updatedAt }`.
9. **Resumo al usuario**: el resultado destacado, cualquier número TBD que necesite confirmación del fundador/cliente, y la ruta.

## Nunca invento

Nunca fabrico una cita, métrica o resultado del cliente. Si la fuente no tiene el dato, lo marco como TBD. Le hago frente al fundador si quiere "redondear" un número hacia algo más pulido que la realidad.

## Resultados

- `case-studies/{customer-slug}.md`
- Se agrega a `outputs.json` con el tipo `case-study`.

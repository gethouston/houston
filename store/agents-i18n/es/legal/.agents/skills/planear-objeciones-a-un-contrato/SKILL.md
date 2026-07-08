---
name: planear-objeciones-a-un-contrato
title: "Planear objeciones a un contrato"
description: "Después de revisar un contrato, planea exactamente qué puntos objetar. Clasifico los problemas en imprescindibles, deseables y no vale la pena pelear, escribo el texto exacto que puedes pegar en tu correo de contraoferta, y agrego una alternativa en caso de que la otra parte diga que no. Antes necesitas haber revisado el contrato."
version: 1
category: Contratos
featured: no
image: scroll
---

# Planear objeciones a un contrato

## Cuándo usarlo

- "Redacta la estrategia de objeciones para el contrato de {counterparty}" / "¿qué debo objetar?" / "prioriza las objeciones, tengo poco margen de negociación".
- Después de que `review-a-contract` (mode=full) muestra cláusulas Amarillas + Rojas, el fundador necesita una secuencia de negociación.

Ejecútalo una vez por cada versión del contrato después de la revisión. Si la contraparte hace una contraoferta, ejecútalo de nuevo sobre la nueva versión.

## Pasos

1. **Lee el contexto compartido.** Carga `legal-context.md` para conocer la postura de riesgo del fundador y las reglas de escalamiento. Carga `config/posture.json` para las posiciones límite (punto de ruptura) a nivel de cláusula.

2. **Lee la revisión previa.** Busca el archivo correspondiente `contract-reviews/{counterparty-slug}-{YYYY-MM-DD}.md`. Si no existe, detente y pregunta al usuario en lenguaje sencillo: "Todavía no he revisado este contrato. ¿Quieres que lo haga primero?" No sigas hasta que eso esté hecho. Extrae la tabla completa de cláusulas (Verde / Amarilla / Roja + texto actual + estándar de mercado).

3. **Pregúntale al fundador dos cosas si no las sabes.** Ambas en un solo mensaje, no en dos turnos:
   - **Objetivo del trato**: ¿cerrar rápido / proteger la propiedad intelectual / limitar la responsabilidad / mantener margen de negociación para presionar, o conservar flexibilidad para futuras rondas?
   - **Margen de negociación de la contraparte**: ¿quién es la ballena? ¿El cliente lo necesita este trimestre, o hay otros 3 tratos en el pipeline con un ACV similar? Una lectura honesta.

4. **Clasifica cada cláusula Amarilla y Roja en tres niveles:**

   - **Objeciones imprescindibles**: no firmarías sin ellas. Valores por defecto para el fundador en la semana 0: reemplazar el límite de responsabilidad ilimitada por un tope anclado a las cuotas; eliminar la cesión de propiedad intelectual del producto principal; convertir en mutua la indemnización unilateral en nuestra contra; eliminar la excepción de entrenamiento de IA con nuestros datos; eliminar la cláusula de no competencia en nuestra contra. Ajusta según la postura y el margen de negociación del fundador.
   - **Objeciones deseables**: presiona si hay margen, cede si no lo hay. Ejemplos: terminación por conveniencia con 30 días de aviso en lugar de 60, un SLA de notificación de incumplimiento más amplio, derechos de salida / recuperación de datos más amplios.
   - **Prescindibles**: cláusulas Amarillas marcadas "dejar tal cual, vivible". Una razón de una línea por punto para que el fundador sepa por qué no se presiona.

5. **Escribe el lenguaje exacto de la objeción para cada imprescindible.** No "pide un tope de responsabilidad", sino el texto de reemplazo real. Ejemplo:

   > **Cláusula 8.2 (Tope de responsabilidad).** Reemplazar
   > "LA RESPONSABILIDAD DE CADA PARTE SERÁ ILIMITADA" por
   > "LA RESPONSABILIDAD AGREGADA DE CADA PARTE NO EXCEDERÁ LAS CUOTAS
   > PAGADAS O POR PAGAR EN LOS DOCE (12) MESES ANTERIORES AL RECLAMO."
   > Es el estándar de mercado para tratos SaaS en nuestro rango de ACV;
   > la responsabilidad ilimitada es un punto de ruptura.

   Una justificación de una línea por cada imprescindible que el fundador pueda pegar textualmente en el correo de contraoferta.

6. **Para cada imprescindible, incluye una escalera de alternativas.** Si no aceptan el imprescindible, ¿cuál es el siguiente paso aceptable? Ordena de lo mejor para nosotros a lo último aceptable. Ejemplo para el tope de responsabilidad: `1x cuotas anuales` → `cuotas de 12 meses` → `2x cuotas anuales` → `2x cuotas anuales pero solo para excepciones de propiedad intelectual / incumplimiento`.

7. **Redacta el planteamiento de la propuesta.** Frases concretas que el fundador pega en su correo de respuesta:
   - "Podemos firmar esta semana si logramos resolver los tres puntos de abajo; todo lo demás es aceptable."
   - Lista los 3 imprescindibles en línea (objeción + justificación).
   - "Los restantes {N} puntos que señalamos en nuestra revisión son aceptables tal como están."

8. **Marca `attorneyReviewRequired: true`** si:
   - Algún imprescindible requiere lenguaje de propiedad intelectual, valores o privacidad sin una referencia a un estándar de mercado.
   - La contraparte ya rechazó un imprescindible en una ronda anterior (el fundador está considerando aceptar).
   - El trato supera los $100K de ACV.
   - Alguna cláusula en la revisión está marcada `UNKNOWN`.

9. **Redacta el plan (markdown, ~500-800 palabras).** Estructura:

   1. **Encabezado**: contraparte, tipo de contrato, fecha de revisión, objetivo, lectura del margen de negociación.
   2. **Objeciones imprescindibles**: lista numerada. Cada punto: texto actual (citado), texto de reemplazo (textual), justificación (una oración), escalera de alternativas.
   3. **Objeciones deseables**: lista numerada. Cada punto: texto actual, objetivo, justificación de una línea, presionar o ceder según la lectura del margen de negociación.
   4. **Prescindibles**: en viñetas. Una razón de una línea por punto.
   5. **Planteamiento de la propuesta**: párrafo listo para pegar.
   6. **Aviso de revisión por abogado**: sí / no + razón si es sí.
   7. **Siguiente paso**: "enviar esto a la contraparte", "escalar", o "esperar hasta {información específica necesaria}".

10. **Escribe de forma atómica** en `redline-plans/{counterparty-slug}-{YYYY-MM-DD}.md`: primero `{path}.tmp`, luego renombrar.

11. **Agrega a `outputs.json`.** Lee, combina y escribe de forma atómica:

    ```json
    {
      "id": "<uuid v4>",
      "type": "redline-plan",
      "title": "Redline plan  -  <counterparty>",
      "summary": "<2-3 sentences  -  must-have count + the top one + framing>",
      "path": "redline-plans/<slug>-<YYYY-MM-DD>.md",
      "status": "draft",
      "attorneyReviewRequired": <true | false>,
      "createdAt": "<ISO-8601>",
      "updatedAt": "<ISO-8601>"
    }
    ```

12. **Resume para el usuario.** Un párrafo corto en lenguaje sencillo: cuántos imprescindibles hay, el más importante, la línea de propuesta que puede pegar, y el siguiente paso. Nunca nombres archivos ni rutas.

## Resultados

- `redline-plans/{counterparty-slug}-{YYYY-MM-DD}.md`
- Se agrega a `outputs.json` con `type: "redline-plan"`.

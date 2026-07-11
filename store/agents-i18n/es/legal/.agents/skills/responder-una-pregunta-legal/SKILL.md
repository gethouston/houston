---
name: responder-una-pregunta-legal
title: "Responder una pregunta legal"
description: "Obtén una respuesta rápida a una pregunta legal, como '¿necesito un NDA con los inversionistas?' o '¿me aplica el GDPR?'. Recibes un memo breve con la respuesta, el razonamiento, las fuentes y los próximos pasos. Las preguntas sensibles o poco comunes se marcan para que las revise un abogado de verdad."
version: 1
category: Asesoría
featured: yes
image: scroll
integrations: [stripe]
---


# Responder una pregunta legal

## Cuándo usar

- "¿necesito un NDA con los inversionistas?", normalmente no, los inversionistas en etapa de pitch se niegan.
- "¿necesito un DPA con {proveedor}?", depende de los datos y la región.
- "¿me aplica el GDPR?", depende de si tienes visitantes o clientes en la UE y de qué datos manejas.
- "¿puedo usar el logo de este cliente en mi landing page?", depende de la cláusula de derechos de marketing del MSA.
- "¿necesito presentar un 83(b)?", probablemente sí, dentro de los 30 días posteriores a la emisión de las acciones. Plazo estricto.
- Cualquier "¿necesito X?" o "¿me aplica X?" encaja en un memo breve.

## Pasos

1. **Lee el contexto compartido.** Carga `legal-context.md` para conocer la entidad, la geografía de datos de los usuarios actuales, los acuerdos vigentes, la postura de riesgo del fundador y las reglas de escalamiento. Lee también las entradas relevantes anteriores en `advice-memos/`, no vuelvas a responder algo que ya quedó resuelto.

2. **Aclara la pregunta (como máximo una repregunta).** Si la pregunta depende de un dato que no está en el contexto, haz UNA pregunta puntual con la mejor pista de modalidad. Ejemplos:
   - "¿Me aplica el GDPR?" → "¿Tienes analítica en tu landing page y algún visitante de la UE? Si tu herramienta de analítica está conectada, puedo revisarlo en 30 segundos."
   - "¿Necesito un DPA con {proveedor}?" → "¿Qué datos toca {proveedor}: información personal de clientes, datos de pago, datos de empleados o documentos propios de la empresa?"
   No hagas más de una pregunta. Pregunta muy amplia → acótala ("enfoquémonos en {subpregunta}").

3. **Investiga si hace falta.** Para preguntas que citan regulaciones, checklists o estándares del mercado, usa `composio search web-search` (o similar, descúbrelo en tiempo de ejecución) para traer fuentes confiables: el texto primario del estatuto o la regulación, la guía del EDPB, el IRS, la SEC o la USPTO, y checklists legales reconocidos para fundadores (Capbase, Andrew Bosin, Promise Legal, YC, Common Paper). Cita cada fuente en el texto. Nada de "probablemente", declara la respuesta o márcala como DESCONOCIDA.

4. **Redacta el memo (~200-400 palabras, directo, con verbos en primer plano).** Estructura:

   1. **Pregunta**, la pregunta del fundador en una oración, textual si es posible.
   2. **Respuesta corta**, un párrafo. La primera oración es la conclusión ("Sí", "No", "Depende, esta es la regla"). Sin rodeos. Si depende, indica dos o tres caminos posibles y qué decide entre ellos.
   3. **Contexto**, un párrafo: por qué aplica a este fundador. Menciona la entidad (C-corp de Delaware), la etapa (semana 0, previo a ingresos o con un solo cliente), el stack (Stripe, Google Workspace) y cualquier acuerdo vigente o geografía de datos relevante.
   4. **Fuentes citadas**, en viñetas. Cada una con una línea de por qué importa. Estatuto primario > guía del regulador > checklist confiable. De 2 a 5 fuentes, nunca Wikipedia.
   5. **Próximo paso**, una acción concreta en lenguaje simple. Ejemplos: "Redacta un DPA con este proveedor.", "Agrega este proveedor a tu lista de proveedores de privacidad.", "Presenta el 83(b) dentro de {N} días, puedo hacerte seguimiento del plazo."
   6. **Aviso de criterio profesional**, "Esto es un criterio, no una asesoría legal definitiva. Escala con un abogado externo si {condición específica, por ejemplo, los datos son de salud, el cliente es una entidad regulada, o el trato supera los $100,000}."

5. **Marca `attorneyReviewRequired: true`** si la pregunta toca:
   - HIPAA, PCI-DSS, COPPA, datos biométricos, controles de exportación.
   - Transferencias internacionales de datos con un mecanismo no estándar.
   - Decisiones de tratamiento fiscal (elegibilidad QSBS, mecánica de presentación del 83(b) más allá del plazo mismo, crédito por I+D).
   - Ofertas de valores más allá del SAFE estándar o una ronda con precio.
   - Derecho laboral más allá del trío de empleo a voluntad, carta oferta y CIIAA.
   - Cualquier cosa penal, de aplicación regulatoria o cercana a un litigio.

6. **Escribe de forma atómica** en `advice-memos/{slug}-{YYYY-MM-DD}.md`, primero `{path}.tmp` y luego renombra. Slug = versión corta en kebab-case de la pregunta (por ejemplo, `gdpr-applies-to-landing-page`, `do-i-need-nda-with-investors`, `dpa-with-stripe`).

7. **Agrega la entrada a `outputs.json`.** Lee, combina y escribe de forma atómica:

   ```json
   {
     "id": "<uuid v4>",
     "type": "advice-memo",
     "title": "Asesoría, <forma corta de la pregunta>",
     "summary": "<2-3 oraciones, la conclusión y el próximo paso>",
     "path": "advice-memos/<slug>-<YYYY-MM-DD>.md",
     "status": "ready",
     "attorneyReviewRequired": <true | false>,
     "createdAt": "<ISO-8601>",
     "updatedAt": "<ISO-8601>"
   }
   ```

   (Los memos de asesoría salen como `ready`, son fácticos y con fuentes citadas; el fundador decide si actuar, no si aprobar un borrador.)

8. **Resume para el usuario.** Un párrafo corto en lenguaje simple: la conclusión, el próximo paso y si un abogado de verdad debería revisarlo. Nunca menciones nombres de archivo, rutas, ni la ubicación del memo, solo entrega la respuesta.

## Resultados

- `advice-memos/{slug}-{YYYY-MM-DD}.md`
- Se agrega a `outputs.json` con `type: "advice-memo"`.

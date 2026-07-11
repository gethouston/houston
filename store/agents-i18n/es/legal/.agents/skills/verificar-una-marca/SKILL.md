---
name: verificar-una-marca
title: "Verificar una marca"
description: "Verifica rápidamente si un nombre está disponible para usarlo como marca. Busco en la base de datos oficial de marcas de EE. UU. coincidencias exactas, por sonido y por apariencia, y luego califico el riesgo como Bajo, Medio o Alto y te digo qué hacer después. Aviso: esto es una revisión rápida, no una autorización legal completa, para eso necesitas un abogado de marcas de verdad."
version: 1
category: Propiedad intelectual
featured: no
image: scroll
integrations: [firecrawl]
---


# Verificar una marca

No es una opinión de autorización, es un filtro de descarte. El filtro de descarte responde "¿hay un bloqueo obvio?", no "¿es seguro registrarla?". Esa segunda pregunta necesita un abogado de marcas.

## Cuándo usar

- "Haz un filtro de descarte sobre {marca}."
- "¿{nombre} está disponible como marca?"
- Antes de gastar en branding, dominio o logotipo.
- Antes de presentar una solicitud de intención de uso 1(b).

## Pasos

1. **Lee el contexto compartido.** Lee `context/legal-context.md`. Si falta o está vacío, pregunta al usuario en lenguaje simple: "Necesito saber algunos datos básicos de tu empresa primero. ¿Quieres configurarlos ahora?" Luego ejecuta `set-up-my-legal-info` si dice que sí. Detente hasta que eso esté listo.

2. **Confirma la marca y las clases.** El fundador te da:
   - La **marca denominativa** propuesta (el elemento de diseño o logo es aparte si aplica, las marcas de diseño necesitan su propia búsqueda).
   - Las **clases Niza** que quiere. La mayoría de los fundadores de SaaS usan la **Clase 9** (software / apps descargables) + la **Clase 42** (SaaS / plataforma como servicio). El hardware de consumo de marca agrega la **Clase 35** (servicios de venta al por menor) o la clase de producto correspondiente. Si el fundador no está seguro → propón 9 + 42 y confirma.

   Escribe `config/trademark-prefs.json` con `{ classes, lastSearchedAt }` si es la primera vez.

3. **Ejecuta el filtro de descarte contra el USPTO Trademark Center.** Ejecuta `composio search uspto` o `composio search trademark` para el slug de la herramienta; el USPTO Trademark Center (lanzado en enero de 2025) es el sistema oficial. Si no hay herramienta conectada, ejecuta `composio search web-scrape` y consulta directamente `https://tmsearch.uspto.gov/`.

   Cuatro pasadas por clase:

   - **Pasada exacta**, la `marca` como marca denominativa.
   - **Pasada fonética**, equivalentes fonéticos (Kandi vs Candy, Fone vs Phone, Noot vs Newt, etc.).
   - **Pasada visual**, intercambio de letras o transliteración (Lyft vs Lift, Tumblr vs Tumbler).
   - **Pasada de raíz**, busca la raíz si la marca es compuesta (por ejemplo, "BrightCloud" → busca "Bright" y "Cloud").

4. **Clasifica cada resultado.** Por cada resultado captura: número de serie, marca completa, titular, descripción de bienes/servicios, clase, fecha de presentación, estatus (`LIVE` / `PENDING` / `ABANDONED` / `DEAD`). Un resultado LIVE o PENDING en una clase que se solapa es un bloqueo. ABANDONED o DEAD son informativos (aún puede haber un tema de marca de derecho consuetudinario, pero no es un bloqueo de registro).

5. **Evalúa el riesgo.**
   - **Alto**, resultado exacto o fonético LIVE/PENDING en la misma clase. O un resultado LIVE/PENDING con descripción de bienes casi idéntica.
   - **Medio**, resultado exacto LIVE/PENDING en una clase adyacente (por ejemplo, quieres la Clase 42 de SaaS; existe un resultado de la Clase 9 de software). O un resultado fonético/visual LIVE/PENDING en la misma clase. O muchos resultados ABANDONED, lo que indica un campo saturado.
   - **Bajo**, sin resultados LIVE/PENDING en la clase objetivo o clases adyacentes; pocos resultados ABANDONED/DEAD, o bienes totalmente distintos.

6. **Recomienda el siguiente paso.**
   - Bajo → presenta la **solicitud de intención de uso 1(b)** una vez que la marca esté definida, o sigue usándola y presenta la 1(a) cuando esté en comercio. La tarifa del USPTO es de ~$350 por clase en TEAS Plus.
   - Medio → **contrata un abogado de marcas para una autorización completa** antes de presentar; hay estrategias de coexistencia posibles.
   - Alto → **cambia de marca**, o contrata un abogado de marcas para coexistencia o acuerdos de consentimiento. No presentes nada.

7. **Escribe de forma atómica** en `tm-searches/{mark-slug}-{YYYY-MM-DD}.md` con:
   - Marca + clases buscadas + fecha y hora de la búsqueda.
   - Evaluación de riesgo + justificación de una línea.
   - Tabla de resultados (pasada exacta, fonética, visual, de raíz) con número de serie, marca, titular, clase, estatus.
   - Próximo paso recomendado.
   - **Aviso de límites**, textual: "Esto es un filtro de descarte, no una autorización completa. Solo cubre los registros federales del USPTO. No cubre registros estatales, marcas de derecho consuetudinario, marcas extranjeras, ni la disponibilidad de dominios o usuarios en redes sociales. Para resultados de riesgo Alto o antes de presentar, contrata un abogado de marcas."

8. **Agrega la entrada a `outputs.json`**, `{ id, type: "tm-search", title, summary, path, status: "ready", createdAt, updatedAt, attorneyReviewRequired }`. Marca `attorneyReviewRequired: true` en cualquier riesgo **Alto** (siempre) y en cualquier riesgo **Medio** si el fundador quiere seguir adelante.

9. **Resume para el usuario.** Lenguaje simple. Indica el riesgo (Bajo / Medio / Alto), el resultado más importante (quién es el titular, qué vende), y el próximo paso ("presenta cuando estés listo" / "habla primero con un abogado de marcas" / "cambia de marca"). Nunca menciones archivos ni rutas.

## Resultados

- `tm-searches/{mark-slug}-{YYYY-MM-DD}.md`
- Se agrega a `outputs.json` con `type: "tm-search"`.

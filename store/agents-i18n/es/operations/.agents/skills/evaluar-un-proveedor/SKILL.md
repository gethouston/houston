---
name: evaluar-un-proveedor
title: "Evaluar un proveedor"
description: "Haz la debida diligencia sobre un proveedor antes de firmar. Elige lo que necesitas: una evaluación de encaje que los califica del 1 al 10 según tu rúbrica, con nivel de riesgo y recomendación, o una verificación de cumplimiento que confirma sus marcos de referencia, identifica a los responsables de seguridad y muestra incidentes públicos. Cada afirmación está respaldada por una fuente."
version: 1
category: Operaciones
featured: no
image: clipboard
integrations: [linkedin, firecrawl, perplexityai]
---


# Evaluar un proveedor

Una sola habilidad para la debida diligencia de proveedores. El parámetro `aspect` elige el ángulo: una evaluación de encaje comercial contra tu rúbrica de proveedores, o un informe de investigación de cumplimiento con fuentes públicas. Ambos se basan en tu contexto operativo para que los umbrales de riesgo coincidan con tu postura.

## Parámetro: `aspect`

- `fit` - debida diligencia comercial basada en rúbrica. Califica al proveedor del 1 al 10 contra tu rúbrica, asigna un nivel de riesgo (verde / amarillo / rojo), muestra fortalezas, preocupaciones, preguntas para la primera llamada y una recomendación. Salida: `evaluations/{supplier-slug}.md`.
- `compliance` - investigación de cumplimiento con fuentes públicas. Cataloga los marcos de referencia que afirma tener, los triangula contra verificación independiente, identifica a los responsables de seguridad y enumera incidentes de los últimos 3 años. Cada afirmación está citada. Salida: `compliance-reports/{company-slug}.md`.

Tú nombras el aspecto en lenguaje sencillo ("evalúa a Stripe", "¿Vercel es un buen encaje?", "verificación de cumplimiento de Mongo", "¿Notion está limpio?") -> lo infiero. Si es ambiguo, hago UNA pregunta que nombre ambas opciones.

## Cuándo usarla

**fit:**
- "evalúa a {proveedor} para {producto / servicio}"
- "califica a estos proveedores según nuestros criterios"
- "¿{proveedor} es un buen encaje para {nuestro caso de uso}?"
- Invocada desde `score-an-inbound` cuando la propuesta entrante es de un proveedor.

**compliance:**
- "haz una debida diligencia de cumplimiento sobre {proveedor}"
- "¿la postura de cumplimiento de {empresa} es real?"
- "qué marcos de referencia tiene realmente {proveedor}"
- Invocada como subpaso de `aspect=fit` para proveedores sensibles al riesgo (procesadores de datos, infraestructura, servicios financieros).

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta habilidad verifico que las categorías de abajo estén vinculadas. Si falta alguna, nombro la categoría, te pido conectarla desde la pestaña de Integraciones y me detengo.

- **Investigación web** (Firecrawl, Exa, Perplexity) - Requerido (ambos aspectos). Para `fit`: obtiene el sitio del proveedor, precios, casos de éxito, noticias recientes. Para `compliance`: obtiene páginas de confianza, páginas de seguridad, cobertura de noticias, y triangula las afirmaciones sobre marcos de referencia.
- **Bandeja de entrada** (Gmail, Outlook) - Opcional para `fit`. Muestra correspondencia previa para que no empiece de cero. No se usa para `compliance`.
- **Red social / profesional** (LinkedIn) - Opcional para `compliance`. Me permite confirmar que un CCO / CISO nombrado es real y está activo. No se usa para `fit`.

Si no hay ningún proveedor de investigación web conectado, me detengo y te pido conectar un proveedor de investigación primero.

## Información que necesito

Primero leo tu contexto operativo. Por cada campo requerido que falte hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo adjunto > URL > pegar) y espero.

- **Postura frente a proveedores** - Requerido (ambos aspectos). Por qué lo necesito: define qué tan estricto soy con las señales de riesgo (`fit`) y qué cuenta como una alerta roja material (`compliance`). Si falta, pregunto: "¿Cómo abordas a los proveedores: conservador, equilibrado o rápido?"
- **Para qué los estás evaluando** - Requerido para `fit`. Por qué lo necesito: un procesador de pagos y una agencia de diseño se califican en cosas distintas. Si falta, pregunto: "¿Para qué estás considerando a este proveedor, y cómo se vería el éxito en 6 meses?"
- **Rúbrica de proveedores** - Opcional para `fit`. Por qué lo necesito: me permite calificar contra tus criterios, no uno genérico. Si no la tienes, sigo adelante con la rúbrica por defecto y la nombro en la salida.
- **Prioridades activas** - Requerido para `fit`. Por qué lo necesito: define la puntuación de encaje con las prioridades. Si falta, pregunto: "¿Cuáles son las 2 a 3 cosas en las que la empresa está enfocada este trimestre?"
- **Empresa a investigar** - Requerido para `compliance`. Por qué lo necesito: la habilidad apunta a una empresa a la vez. Si falta, pregunto: "¿A qué empresa debo hacerle la verificación de cumplimiento?"
- **Límites innegociables** - Opcional para `compliance`. Por qué lo necesito: me permite ponderar más ciertos marcos de referencia (HIPAA, PCI, SOC2) cuando te importan. Si no los tienes, sigo adelante con TBD y muestro cada vacío que encuentre.

## Pasos

### Pasos compartidos (ambos aspectos)

1. **Leo `context/operations-context.md`.** La postura frente a proveedores, los límites innegociables y las prioridades activas fijan los umbrales de severidad. Si falta: me detengo, pido al usuario que corra `set-up-my-ops-info` primero.

### Bifurco según `aspect`:

#### `fit`

2. **Leo `config/supplier-rubric.md`.** Si falta, uso la rúbrica por defecto definida en `data-schema.md` (encaje / señales de calidad / calidad de referencias / señales de riesgo / fricción para empezar).

3. **Leo `config/procurement.json`** - el apetito de riesgo + la autoridad de firma fijan los umbrales de severidad.

4. **Reúno evidencia.**
   - **Superficie propia del proveedor** - `composio search web-scrape` -> obtengo el sitio web, página de precios, documentación, casos de éxito.
   - **Perfil público** - fundadores, tamaño/etapa, clientes destacados, noticias recientes. Uso `composio search research` o `web-search`.
   - **Correspondencia previa** - `composio search inbox` -> busco el nombre o dominio del proveedor en la bandeja del fundador.
   - **Referencias que puedo triangular** - casos de éxito públicos con nombres identificables; señalo si alguno está en los Contactos clave del contexto operativo.
   - **Verificación rápida de cumplimiento** - corro esta habilidad con `aspect=compliance` como subpaso para cualquier proveedor sensible al riesgo (procesadores de datos, infraestructura, proveedores de servicios financieros).
   - **Señal de precios** - lo que se pueda descubrir. Si está oculta detrás de un proceso de ventas, lo anoto.

5. **Califico contra la rúbrica.** Por criterio:
   - Calificación 1-5 (o la escala que indique la rúbrica).
   - 1-2 líneas de evidencia con URLs de fuente.
   - Marca explícita de `INSUFFICIENT-EVIDENCE` si no hay datos, nunca adivino.

   Calculo la puntuación total (suma ponderada según la rúbrica) sobre 10.

6. **Asigno nivel de riesgo.**
   - **Verde** - total >= 8 Y sin alertas rojas en el criterio de señales de riesgo.
   - **Amarillo** - total entre 6 y 7.9 O una preocupación material.
   - **Rojo** - total < 6 O cualquier violación de un límite innegociable (manejo de datos, incidente de cumplimiento, tergiversación evidente).

7. **Produzco la salida** (guardo en `evaluations/{supplier-slug}.md`):
   - **Resumen** - 2 oraciones: quiénes son + qué hacen.
   - **Rúbrica y tabla de puntuación** - criterio | calificación | evidencia (con URLs).
   - **Fortalezas** - 3 viñetas, la más convincente primero.
   - **Preocupaciones** - 3 viñetas, la más material primero.
   - **Nivel de riesgo** - con 1 línea de razón.
   - **Preguntas para la primera llamada** - 5 a 8 preguntas concretas que cierren vacíos de evidencia y/o expongan riesgo oculto.
   - **Recomendación** - `Proceder` / `Descartar` / `Conseguir más información` con justificación de 3 líneas.
   - **Decisión del fundador** - en blanco; el fundador la completa.

8. **Escrituras atómicas** - `*.tmp` -> renombrar.

9. **Agrego a `outputs.json`** con `type: "supplier-evaluation"`, estado "draft" (solo el fundador lo marca `ready` después de decidir).

10. **Resumo al usuario** - nivel de riesgo + puntuación total + lo #1 que el fundador debe resolver antes de decidir.

#### `compliance`

2. **Reúno señales públicas.**
   - **Marcos de referencia que afirma tener en su superficie** - `composio search web-scrape` -> obtengo la página de confianza, página de seguridad, política de privacidad. Catalogo las afirmaciones (SOC2 Type II, ISO 27001, HIPAA, GDPR, PCI-DSS, etc.).
   - **Verificación independiente** - para cada afirmación, triangulo: ¿lo confirma el proveedor de trust center (TrustArc, Vanta, Drata)? ¿Un comunicado de prensa nombra a un auditor específico? ¿Existe un ID de reporte o portal de confianza? Uso `composio search research` con consultas específicas.
   - **CCO / CISO / responsable de seguridad nombrado** - identifico a la persona, enlazo su LinkedIn si se encuentra (`composio search social` o `web-search`).
   - **Incidentes públicos de los últimos 3 años** - brechas, divulgaciones ante la SEC, demandas colectivas, acciones regulatorias (FTC, ICO, fiscalías estatales). Uso `composio search news` + `web-search` con consultas puntuales.
   - **Postura legal / regulatoria** - ¿hay litigios abiertos que nombren a la empresa como demandada? ¿Presentaciones ante la SEC si es pública?

3. **Reviso los vacíos entre la afirmación y la evidencia.**
   - Afirma tener SOC2 pero no hay confirmación independiente en ningún lado -> lo señalo.
   - Nombra a un responsable pero no tiene LinkedIn ni presencia pública -> lo señalo.
   - Silencio sobre un marco que su categoría normalmente requiere (p. ej. un SaaS de salud sin mención de HIPAA) -> lo señalo.

4. **Produzco la salida** (guardo en `compliance-reports/{company-slug}.md`):
   - **Resumen** - 1 párrafo: quiénes son + su postura de cumplimiento en una línea.
   - **Marcos de referencia que afirma tener** - tabla: marco | fuente de la afirmación | verificación independiente (Sí/No con URL) | notas.
   - **Responsables de seguridad nombrados** - nombre, cargo, LinkedIn, antigüedad si se encuentra.
   - **Incidentes públicos (últimos 3 años)** - lista cronológica, cada uno con URL de fuente + descripción de 1 línea.
   - **Vacíos entre la afirmación y la evidencia** - lista de viñetas, la más material primero.
   - **Resumen en forma de recomendación** - NO es una opinión legal: "en su superficie pública se lee como {sólido / adecuado / débil / preocupante}" con 2-3 cosas específicas por verificar antes de firmar.
   - **Cada afirmación cita su URL de fuente.** Sin afirmaciones sin citar.

5. **Escrituras atómicas** - `*.tmp` -> renombrar.

6. **Agrego a `outputs.json`** con `type: "compliance-report"`, estado "ready".

7. **Resumo al usuario** - el resumen en forma de recomendación + el vacío #1 que el fundador debe cerrar antes de firmar.

## Lo que nunca hago

- **Contactar al proveedor.** Las preguntas para la primera llamada son para el fundador. Redactar el mensaje de contacto es otra habilidad (`draft-a-message type=vendor`).
- **Comprometerme con una decisión.** Yo recomiendo; el fundador decide.
- **Calificar sin rúbrica.** Si no existe una rúbrica y el fundador no proporciona una, uso la rúbrica por defecto y la nombro en la salida.
- **Emitir una opinión legal.** "Se ve adecuado en su superficie pública" es lo más lejos que llego. La revisión legal es trabajo del abogado del fundador.
- **Tratar una afirmación de la página de confianza como prueba.** Cada afirmación de marco de referencia necesita al menos una señal independiente, de lo contrario se señala.
- **Obtener datos no públicos.** Si está detrás de un inicio de sesión, un portal de confianza con NDA, o una solicitud específica, lo anoto como "solicitar al proveedor" en vez de extraerlo.

## Salidas

- `evaluations/{supplier-slug}.md` (aspect=fit) -> se agrega a `outputs.json` con `type: "supplier-evaluation"`, estado "draft".
- `compliance-reports/{company-slug}.md` (aspect=compliance) -> se agrega a `outputs.json` con `type: "compliance-report"`, estado "ready".

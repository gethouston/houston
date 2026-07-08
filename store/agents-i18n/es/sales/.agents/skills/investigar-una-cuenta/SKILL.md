---
name: investigar-una-cuenta
title: "Investigar una cuenta"
description: "Investigo una cuenta objetivo o contacto con la profundidad que necesites: una calificación de 30 segundos a partir de una URL, un informe completo con fuentes citadas que incluye rastreo del sitio y doce semanas de noticias, un enriquecimiento de una persona específica, o una búsqueda de conexiones cercanas en tu CRM y LinkedIn. Cada afirmación cita una fuente real, sin noticias, rondas de inversión ni conexiones inventadas."
version: 1
category: Ventas
featured: no
image: handshake
integrations: [gmail, hubspot, salesforce, attio, linkedin, firecrawl, perplexityai]
---


# Investigar una cuenta

Una sola skill, cuatro formatos de investigación. El parámetro `depth` define el recorrido. Comparten la disciplina de citar fuentes y "nunca inventar un hecho".

## Parámetro: `depth`

- `quick-qualify`: lectura de 30 segundos de una sola URL. Un rastreo, una decisión (GOOD-FIT / BORDER / OUT), un ángulo si es GOOD-FIT. Triaje rápido, no un informe.
- `full-brief`: informe citado de varias pasadas sobre una cuenta con nombre: rastreo del sitio, noticias recientes (12 semanas), detección de stack tecnológico, escaneo de redes sociales, señales de intención. Alimenta la prospección y la preparación de llamadas.
- `enrich-contact`: persona con nombre: firmográficos, contexto del rol, línea jerárquica si es identificable, publicaciones o charlas recientes, señales disparadoras. Para personalizar la prospección.
- `warm-paths`: presentaciones de primer grado: busco en LinkedIn, Gmail o CRM conectados a personas que conozcan a alguien en la cuenta objetivo. Clasifico los caminos por fuerza.

Si el pedido del usuario implica la profundidad ("lectura rápida", "profundiza", "enriquece a esta persona", "a quién conozco ahí"), la infiero. Si no, hago UNA pregunta que nombre las 4 opciones.

## Cuándo usarla

- Disparadores explícitos en la descripción.
- Implícito: dentro de `write-my-outreach stage=cold-email` (el correo en frío necesita una señal, esta skill la encuentra) y `prep-a-meeting type=call` (la llamada necesita un informe).

## Conexiones que necesito

Todo el trabajo externo lo hago a través de Composio. Antes de ejecutar esta skill, verifico que las categorías de abajo estén conectadas. Si falta alguna, digo cuál es, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Rastreo**: leo el sitio de la empresa, sus páginas de producto, señales de stack tecnológico. Obligatorio para `quick-qualify` y `full-brief`.
- **Búsqueda / investigación**: obtengo noticias recientes, rondas de inversión, contrataciones para `full-brief` y `enrich-contact`. Obligatorio para esas profundidades.
- **Redes sociales**: leo el perfil público de LinkedIn y sus publicaciones para `enrich-contact` y `warm-paths`. Obligatorio para esas profundidades.
- **CRM**: cruzo conexiones de primer grado y contactos previos para `warm-paths`. Obligatorio para esa profundidad.
- **Bandeja de entrada**: cruzo con quién te has escrito por correo en la cuenta objetivo para `warm-paths`. Opcional.

Si ninguna de las categorías obligatorias para la profundidad elegida está conectada, me detengo y te pido que conectes Firecrawl primero, ya que la mayoría de las profundidades parten de la lectura del sitio.

## Información que necesito

Primero leo tu contexto de ventas. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Tu playbook de ventas**: obligatorio. Por qué lo necesito: tu perfil de cliente ideal y tus diferenciadores fundamentan la decisión de calificación y el enfoque del informe. Si falta, pregunto: "Todavía no tengo tu playbook. ¿Quieres que lo redacte ahora?"
- **Nombre o URL de la empresa objetivo**: obligatorio para `quick-qualify`, `full-brief`, `warm-paths`. Por qué lo necesito: el rastreo y la búsqueda de noticias se anclan ahí. Si falta, pregunto: "¿Qué empresa debo investigar? Pega la URL de su página de inicio o dime el nombre."
- **Nombre y empresa de la persona objetivo**: obligatorio para `enrich-contact`. Por qué lo necesito: el enriquecimiento se ancla a un perfil real de LinkedIn. Si falta, pregunto: "¿A quién debo enriquecer? Nombre completo y empresa."
- **CRM conectado**: obligatorio para `warm-paths`. Por qué lo necesito: cruzo tus contactos previos y clientes en común. Si falta, pregunto: "Conecta tu CRM (HubSpot, Salesforce, Attio, Pipedrive o Close) para que pueda encontrar caminos cálidos."

## Pasos

1. **Leo el registro de contexto y el playbook.** Reúno los campos obligatorios que falten (una pregunta cada uno, empezando por la mejor modalidad). Escribo de forma atómica.

2. **Descubro herramientas vía Composio.** `composio search web-scrape` / `composio search search-research` / `composio search crm` / `composio search linkedin` según la profundidad. Si no hay herramienta conectada para una categoría obligatoria, nombro la categoría a conectar y me detengo.

3. **Me ramifico según la profundidad.**
   - `quick-qualify`: rastreo la URL (una sola solicitud). Extraigo: a
     qué se dedican, a quién le venden, señal de tamaño de equipo, señal
     de stack tecnológico. Aplico los descalificadores del playbook.
     Salida: **GOOD-FIT** / **BORDER** / **OUT** más una razón de una
     frase y un ángulo (un solo dolor del playbook que mejor les calce).
     Guardo algo compacto en `leads/{slug}/qualify-{YYYY-MM-DD}.md` (~150
     palabras máximo).
   - `full-brief`: ejecuto el rastreo, busco noticias de las últimas 12
     semanas (rondas de inversión, contrataciones, lanzamientos de
     producto, cambios de liderazgo), detecto el stack tecnológico
     (señales estilo BuiltWith vía rastreo), escaneo las publicaciones
     de LinkedIn de la empresa. Estructura: **Panorama** (un párrafo) →
     **Señales recientes** (5 a 8 puntos, cada uno citado con URL y
     fecha) → **Stack tecnológico** (5 a 10 señales) → **Hipótesis del
     comité de compra** (tomadas de LinkedIn cuando estén disponibles) →
     **Ángulos para la prospección** (3 ángulos ordenados, cada uno
     ligado a una señal citada). Guardo en
     `accounts/{slug}/brief-{YYYY-MM-DD}.md`.
   - `enrich-contact`: busco a la persona vía LinkedIn y enriquecimiento
     de CRM o correo conectados. Capturo: cargo, empresa, antigüedad,
     empresas anteriores, publicaciones/charlas/podcasts visibles de los
     últimos 6 meses, señal disparadora (rol nuevo, ponencia, prensa).
     Guardo en `leads/{slug}/enrichment-{YYYY-MM-DD}.md`.
   - `warm-paths`: vía LinkedIn (Composio), busco conexiones de primer
     grado en la empresa objetivo. Cruzo con el CRM en busca de caminos
     por cliente o inversionista en común. Clasifico: **Fuerte**
     (conexión cercana, contacto reciente), **Media** (vínculo débil,
     desactualizado), **Débil** (solo tercer grado). Redacto un pedido de
     presentación por cada camino fuerte. Guardo en
     `leads/{slug}/warm-paths-{YYYY-MM-DD}.md`.

4. **Cito cada afirmación.** Ningún hecho sin cita. Cualquier afirmación sin URL o referencia a un campo del CRM queda marcada `(hypothesis - verify)`.

5. **Agrego una entrada en `outputs.json`**: leo, combino y escribo de forma atómica: `{ id (uuid v4), type: "account-brief" | "contact-enrichment" | "warm-paths" | "lead-batch" (for quick-qualify), title, summary, path, status: "ready", createdAt, updatedAt, domain: "outbound" }`.

6. **Resumo al usuario.** El hallazgo principal y la ruta. Sugiero la siguiente skill ("¿`write-my-outreach stage=cold-email` usando el ángulo #1?" o "¿`prep-a-meeting type=call` si esto se convierte en una reunión?").

## Lo que nunca hago

- Inventar noticias, rondas de inversión, contrataciones, datos de stack tecnológico o conexiones. Cada afirmación cita su fuente.
- Rastrear datos privados. Solo perfil público de LinkedIn, sitio de la empresa y noticias públicas.
- Enriquecer la vida personal del contacto más allá de su huella profesional.

## Resultados

- `quick-qualify` → `leads/{slug}/qualify-{YYYY-MM-DD}.md`
- `full-brief` → `accounts/{slug}/brief-{YYYY-MM-DD}.md`
- `enrich-contact` → `leads/{slug}/enrichment-{YYYY-MM-DD}.md`
- `warm-paths` → `leads/{slug}/warm-paths-{YYYY-MM-DD}.md`
- Agrega una entrada en `outputs.json`.

---
name: buscar-candidatos
title: Buscar candidatos
description: "Obtengo una lista clasificada de candidatos para una vacante abierta, desde GitHub, LinkedIn, comunidades o colaboradores de código abierto. Evalúo a cada uno según la rúbrica del puesto para que no tengas que leer 200 perfiles de LinkedIn. También puedes usar esta habilidad para crear la rúbrica de una nueva vacante antes de buscar candidatos."
version: 1
category: Personal
featured: yes
image: busts-in-silhouette
integrations: [github, linkedin, firecrawl]
---


# Buscar candidatos

## Cuándo usarla

- Explícito: "encuentra candidatos para {puesto}", "busca ingenieros en GitHub", "arma una lista de búsqueda para {puesto}", "busca 20 candidatos para {puesto} desde {señal}".
- Variante de creación de rúbrica: "actualiza la rúbrica del {puesto}", "define los requisitos indispensables para la vacante de {puesto}": pregunto una vez por el nivel objetivo, los 3 requisitos indispensables principales, las 3 cualidades deseables principales, 2 a 3 señales de alerta, escribo `reqs/{role-slug}.md`, y me detengo ahí (sin hacer la búsqueda) para que cualquier otra habilidad de contratación lea la rúbrica primero.
- Implícito: lo inicia el founder al arrancar una ronda de contratación, o durante una sesión de planificación de vacantes.
- Seguro por puesto y por señal. Mantengo las listas cortas (máximo 30 por pasada) para que las clasificaciones tengan sentido.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta habilidad reviso que las categorías de abajo estén conectadas. Si falta alguna, la nombro, te pido que la conectes desde la pestaña de Integraciones y me detengo.

- **Scraping web (Firecrawl)**: para traer perfiles públicos y páginas de señal. Obligatorio.
- **Ingeniería (GitHub)**: para evaluar colaboradores de código abierto y leer señales de repositorios. Obligatorio cuando la fuente es GitHub.
- **Scraping web (LinkedIn)**: para evaluar perfiles públicos de LinkedIn. Obligatorio cuando la fuente es LinkedIn.
- **ATS (Ashby, Greenhouse, Lever, Workable)**: para descartar duplicados contra el pipeline existente. Opcional.

Si ninguna de las categorías obligatorias está conectada, me detengo y te pido que conectes Firecrawl primero.

## Información que necesito

Primero leo tu contexto de personal. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Rúbrica del puesto**: Obligatorio. Por qué lo necesito: evalúo a cada candidato contra tus requisitos indispensables. Si falta, pregunto: "¿Para qué puesto estamos buscando, en qué nivel, y cuáles son tus tres requisitos indispensables principales?"
- **Fuente de señal**: Obligatorio. Por qué lo necesito: necesito un lugar de dónde traer nombres. Si falta, pregunto: "¿De dónde debería buscar? ¿Una organización de GitHub, una búsqueda en LinkedIn, una lista de comunidad, o una lista de asistentes a una conferencia?"
- **Empresas a excluir**: Opcional. Por qué lo necesito: mantiene fuera de la lista a personas que ya descartaste antes. Si no lo tienes, sigo con TBD.

## Pasos

1. **Leer el documento de contexto de personal** en `context/people-context.md`. Si falta o está vacío, le digo al usuario: "Primero necesito tu contexto de personal, corre la habilidad set-up-my-people-info." Me detengo. Extraigo el marco de niveles y las notas existentes sobre la forma del equipo para el puesto objetivo.
2. **Leer la vacante.** Busco `reqs/{role-slug}.md`. Si falta, hago UNA pregunta puntual ("¿Cuál es el nivel objetivo y los 3 requisitos indispensables principales para {puesto}? Voy a guardar una rúbrica corta en `reqs/{role-slug}.md` y continuar."). La escribo y continúo.
3. **Leer el registro.** `config/context-ledger.json`: el ATS conectado (para descartar duplicados más adelante) y la lista de vacantes abiertas (`domains.people.reqs`).
4. **Confirmar la fuente de señal** nombrada (repositorio u organización de GitHub, URL de búsqueda de LinkedIn, publicación de comunidad o foro, lista de asistentes a conferencia, gráfico de colaboradores de código abierto). Si no se nombra ninguna, hago una pregunta puntual.
5. **Descubrir herramientas vía Composio.** Corro `composio search web-scrape` para scraping de LinkedIn o perfiles públicos, y `composio search ats` si se consulta el ATS para descartar duplicados. Si la categoría obligatoria no está conectada, le digo al usuario cuál conectar desde Integraciones. Me detengo.
6. **Traer candidatos.** Ejecuto los slugs de herramientas descubiertos contra la fuente de señal. Tope de aproximadamente 30 resultados. Por candidato, capturo: nombre, URL de perfil o señal, rol y empresa actual, antigüedad, habilidades clave observables en la señal, una nota de una línea sobre "por qué esta señal es relevante".
7. **Evaluar contra la rúbrica.** Por candidato, marco los requisitos indispensables cumplidos o faltantes según la rúbrica del paso 2. Produzco una banda de ajuste de 0 a 3: **fuerte / posible / débil**. Muestro hasta 3 señales de alerta por candidato (patrón de antigüedad, geografía o autorización si está declarada, superposición con empresas excluidas según instrucción del founder). Nunca infiero atributos de clase protegida.
8. **Escribir** la lista de búsqueda en `sourcing-lists/{role-slug}-{YYYY-MM-DD}.md` de forma atómica (`*.tmp` → renombrar). Estructura: Resumen del puesto (nivel y requisitos indispensables de la rúbrica) → Top 5 contactos de mayor convicción → Tabla clasificada con todos los candidatos (nombre, enlace, banda de ajuste, razón en una línea, señales de alerta).
9. **Agregar a `outputs.json`**: leo el arreglo existente, agrego `{ id, type: "sourcing", title, summary, path, status: "draft", createdAt, updatedAt }`, escribo de forma atómica.
10. **Resumir al usuario**: un párrafo nombrando los top 5 contactos, la ruta a la lista completa, y la categoría o herramienta usada.

## Nunca inventar

Cada candidato debe rastrearse a una señal real y verificable con URL. Si el perfil es privado, da 404, o es ambiguo, marco ese campo del candidato como DESCONOCIDO, sin adivinar antigüedad, título ni habilidades.

## Resultados

- `sourcing-lists/{role-slug}-{YYYY-MM-DD}.md`
- Se agrega a `outputs.json` con tipo `sourcing`.

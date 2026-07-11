---
name: evaluar-a-un-candidato
title: "Evaluar a un candidato"
description: "Evalúo a un candidato frente a una vacante abierta. Pega un currículum o comparte una URL de LinkedIn, y te doy un puntaje según la rúbrica, la evidencia detrás de él, las señales de alerta y qué explorar en las entrevistas. Se ramifica según `source`: `resume` o `linkedin`."
version: 1
category: Personal
featured: yes
image: busts-in-silhouette
integrations: [googlesheets, googledrive, linkedin, firecrawl]
---


# Evaluar a un Candidato

Dos rutas, una misma salida: un archivo de candidato por postulante,
calificado contra la rúbrica del puesto. Elige `source` según lo que
tengas a mano.

## Cuándo usarla

- `source=resume`: "revisa este currículum", "revisa la pila de
  currículums para {role}", "clasifica estos currículums", "quién es
  el más fuerte del montón". Se admite tanto individual como por
  lote.
- `source=linkedin`: "califica {LinkedIn URL}", "¿es apto el
  candidato para {role}?", "puntúa este perfil", "0-100 en este
  LinkedIn". Uno por invocación. Por lote: se corre varias veces.

Ambas rutas encadenan con `preparar-a-un-entrevistador` y
`resumir-un-proceso-de-entrevistas`, que esperan que exista
`candidates/{slug}.md`.

## Conexiones que necesito

Realizo el trabajo externo a través de Composio. Antes de correr esta
habilidad, verifico que las categorías de abajo estén conectadas. Si
falta alguna, nombro la categoría, te pido que la conectes desde la
pestaña de Integraciones, y me detengo.

- **Archivos (Google Drive)**: recoger los PDF de currículum que
  sueltes. Obligatoria cuando la fuente es currículum.
- **Extracción web (Firecrawl)**: leer URLs públicas de LinkedIn o
  de perfil. Obligatoria cuando la fuente es LinkedIn.
- **Hojas de cálculo (Google Sheets, Airtable)**: escribir de vuelta
  la pila clasificada si quieres una. Opcional.
- **ATS (Ashby, Greenhouse, Lever, Workable)**: deduplicar y escribir
  de vuelta el estado del candidato. Opcional.

Si ninguna de las categorías obligatorias está conectada, me detengo
y te pido que conectes la que corresponde a tu fuente.

## Información que necesito

Primero leo tu contexto de personal. Por cada campo obligatorio que
falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app
conectada > archivo > URL > texto pegado) y espero.

- **Rúbrica del puesto**: Obligatoria. Por qué la necesito: califico a cada candidato contra tus imprescindibles. Si falta, pregunto: "¿Para qué puesto y nivel es este candidato, y cuáles son tus tres principales imprescindibles?"
- **Currículum o perfil**: Obligatorio. Por qué lo necesito: no tengo nada que evaluar sin él. Si falta, pregunto: "Suelta el currículum en tu carpeta de Drive conectada, o pega la URL de LinkedIn."
- **Nombre del candidato**: Opcional. Por qué lo necesito: para archivar bien bajo el slug correcto. Si no lo tienes, lo tomo del currículum o del perfil y sigo adelante.

## Parámetro: `source`

- `resume`: analiza PDF(s) de currículum desde Google Drive / Dropbox
  conectado (o archivos pegados) vía la herramienta de documentos de
  Composio. Admite lotes: N currículums → cada uno con su propio
  registro Y un resumen clasificado. Banda de salida: **aprueba /
  en el límite / rechaza**.
- `linkedin`: extrae LinkedIn o una URL de perfil público vía la
  herramienta de extracción web de Composio (Firecrawl). Salida:
  0-100 total más 4 a 6 subpuntajes (ajuste de nivel, ajuste de
  dominio, alcance, antigüedad, señal cultural) con evidencia del
  perfil citada por cada subpuntaje.

## Pasos

1. **Leer el registro**, llenar los vacíos con UNA pregunta puntual.
2. **Leer `context/people-context.md`.** Si falta o está vacío, te
   digo: "Primero necesito el contexto de personal, corre la
   habilidad configurar-mi-informacion-de-personal." Me detengo.
   Obtengo el marco de niveles para el nivel objetivo.
3. **Leer la vacante.** Abro `reqs/{role-slug}.md` para la rúbrica
   de criterios. Si falta, hago UNA pregunta puntual ("¿Qué puesto?
   ¿Cuáles son los 3 imprescindibles?") y escribo
   `reqs/{role-slug}.md`.
4. **Ramificar según `source`:**

   - **Si `source = resume`:**
     1. Ubicar los currículums. Si están adjuntos o la carpeta está
        conectada, corro `composio search docs` para descubrir el
        slug de la herramienta de documentos (Google Drive /
        Dropbox) y listar los PDF. Si se pegaron rutas, las uso. Si
        no hay ninguna de las dos, hago UNA pregunta nombrando la
        mejor modalidad ("Conecta Google Drive / Dropbox desde
        Integraciones, o pega los archivos de currículum.") y me
        detengo.
     2. Analizar cada currículum. Ejecuto el slug de documentos para
        extraer el texto. Obtengo campos estructurados por
        candidato: nombre, contacto; educación (escuela, título,
        fechas); puestos (empresa, título, fechas, antigüedad);
        habilidades (declaradas e inferidas de las descripciones de
        puesto); proyectos o publicaciones destacadas. Marco los
        campos ambiguos como DESCONOCIDO, nunca infiero.
     3. Evaluar contra la rúbrica. Por candidato, califico cada
        criterio como aprueba / en el límite / rechaza, con una
        razón de una línea que cite evidencia del currículum (o
        "no indicado en el currículum" → DESCONOCIDO). Banda
        general. De 3 a 5 señales de alerta (patrón de antigüedad,
        vacío de habilidades frente a los imprescindibles, huecos
        sin explicar). Nunca marco atributos de clase protegida.
     4. Escribir un registro por postulante en
        `candidates/{candidate-slug}.md` (slug = kebab-case
        `{first-last}`). Si el archivo existe, agrego una nueva
        sección con fecha `## Screen {YYYY-MM-DD}`, nunca
        sobrescribo. Por sección: campos estructurados → puntaje de
        la rúbrica → banda general → señales de alerta → siguiente
        paso sugerido (entrevistar / rechazar con justificación).
        Escritura atómica.
     5. Más de un currículum → construyo una tabla resumen
        clasificada (nombre → banda → razón de una línea → ruta del
        candidato), la incluyo en el texto de resumen de
        `outputs.json`.

   - **Si `source = linkedin`:**
     1. Analizar la URL. Acepto LinkedIn o cualquier URL de perfil
        público. Derivo `{candidate-slug}` de la URL o del nombre
        indicado (kebab-case `first-last`).
     2. Descubrir la herramienta de extracción: `composio search
        web-scrape`. Si nada está conectado, te digo qué categoría
        conectar y me detengo.
     3. Extraer. Ejecuto el slug. Obtengo: título y empresa actual
        más antigüedad; puestos previos (empresa, título, fechas,
        antigüedad); educación; habilidades (declaradas e inferidas
        del puesto o titular); actividad reciente (publicaciones,
        artículos, ponencias); ubicación si se indica. Marco los
        campos ambiguos como DESCONOCIDO. Si la extracción está
        vacía o bloqueada, lo digo y pido que peguen el resumen del
        perfil.
     4. Calificar de 0 a 100 contra la rúbrica. Lo divido en 4 a 6
        subpuntajes (por ejemplo, ajuste de nivel, ajuste de
        dominio, señal de alcance, señal de antigüedad, señal
        cultural). Cada subpuntaje de 0 a 25 con una razón de una
        línea que cite evidencia del perfil. Total ≤ 100.
     5. Produzco: resumen de antecedentes (3 a 5 frases), total y
        subpuntajes con razonamiento, de 3 a 5 señales de alerta
        para explorar en entrevistas. Nunca infiero atributos de
        clase protegida.
     6. Escribir en `candidates/{candidate-slug}.md`. Si el archivo
        existe, agrego `## LinkedIn Score {YYYY-MM-DD}`, nunca
        sobrescribo. Si no existe, lo creo con un encabezado y luego
        la sección de puntaje. Escritura atómica.

5. **Agregar a `outputs.json`** con:
   ```json
   {
     "id": "<uuid v4>",
     "type": "candidate-evaluation",
     "title": "<source>: <nombre del candidato o total del lote>",
     "summary": "<2-3 frases; para lotes: conteos por banda + los 3 principales>",
     "path": "candidates/<candidate-slug>.md",
     "status": "draft",
     "createdAt": "<ISO>",
     "updatedAt": "<ISO>",
     "domain": "hiring"
   }
   ```
   Corridas de currículums por lote → una entrada por lote con
   `path: "candidates/"`.
6. **Resumir.** Un párrafo.
   - `resume`: cuántos se revisaron, desglose por banda, los 3
     principales nombrados con sus rutas de archivo.
   - `linkedin`: puntaje total, las 2 razones principales de alto o
     bajo puntaje, las 2 señales de alerta principales, ruta del
     archivo del candidato.

## Salidas

- `candidates/{candidate-slug}.md` por postulante (agregado, creado
  si falta).
- Se agrega a `outputs.json` con `type: "candidate-evaluation"`,
  `domain: "hiring"`.

## Lo que nunca hago

- Inferir o calificar atributos de clase protegida (raza, género,
  edad 40+, embarazo, discapacidad, religión, origen nacional,
  orientación sexual, condición de veterano). Solo la rúbrica de
  criterios objetivos.
- Inventar credenciales, referencias, o afirmaciones. Currículum o
  LinkedIn escaso o bloqueado → marco DESCONOCIDO, pido que peguen
  el texto.
- Sobrescribir secciones previas del candidato, siempre agrego
  secciones con fecha.
- Comprometerme a contratar o no contratar. Esa decisión es tuya; yo
  clasifico y señalo.

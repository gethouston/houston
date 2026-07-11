---
name: investigar-mi-seo
title: "Investigar mi SEO"
description: "Construyo la base de SEO que necesitas para posicionar. Elige el enfoque: investigación de palabras clave que agrupa términos por intención y dificultad y define los pilares que vale la pena dominar, o un plan de backlinks que encuentra sitios objetivo y redacta un pitch personalizado para cada uno. Ambos basados en tu posicionamiento para que persigas el tráfico correcto."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [semrush, ahrefs, firecrawl]
---


# Investigar mi SEO

Una sola skill para los dos trabajos fundacionales de investigación de SEO. El parámetro `focus` elige si estás construyendo clusters de palabras clave o un plan de outreach de backlinks. Ambos leen primero tu posicionamiento para que cada recomendación regrese a tu cliente ideal y a tu categoría.

## Parámetro: `focus`

- `keywords`: agrupa términos por intención y dificultad vía Semrush/Ahrefs, marca los 3 pilares que vale la pena dominar, redacta briefs de cluster. El `keyword-map.md` vivo agrega cada cluster nuevo. Resultado: `keyword-clusters/{cluster-slug}.md` + actualiza `keyword-map.md`.
- `backlinks`: identifica de 15 a 30 sitios objetivo vía SERP + herramienta de backlinks, los clasifica por esfuerzo, redacta un correo de pitch personalizado para cada uno. Resultado: `backlink-plans/{YYYY-MM-DD}.md`.

Tú nombras el enfoque en lenguaje simple ("encuentra palabras clave para {topic}", "arma un mapa de palabras clave", "a quién le pedimos enlaces", "plan de link building") y yo lo infiero. Si es ambiguo, hago UNA pregunta nombrando ambas opciones.

## Cuándo usarlo

**keywords:**
- Explícito: "encuentra palabras clave para {topic}", "arma un mapa de palabras clave", "qué deberíamos posicionar", "investigación de palabras clave sobre {topic}", "dame un cluster para {seed term}".
- Implícito: me llama `write-a-post` cuando falta una palabra clave objetivo, o `check-my-marketing` (subject=content-gap) para dimensionar oportunidades de brecha.
- Se corre muchas veces, un cluster por invocación. El `keyword-map.md` vivo agrega cada cluster nuevo.

**backlinks:**
- Explícito: "encuentra backlinks", "a quién le pedimos enlaces", "plan de link building", "sitios objetivo de backlinks para {topic}", "prospección de enlaces".
- Implícito: dentro de un plan de lanzamiento cuando se necesita amplificación externa.
- Cadencia semanal o por campaña.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta skill, reviso que las categorías de abajo estén conectadas. Si falta alguna, te digo cuál es, te pido que la conectes desde la pestaña de Integraciones y me detengo.

- **SEO (Semrush o Ahrefs)**: Obligatoria (ambos enfoques). Para `keywords`: trae volúmenes, dificultad e intención de cada término. Para `backlinks`: encuentra los sitios objetivo que vale la pena contactar y califica su autoridad.
- **Web scrape (Firecrawl)**: Obligatoria para `backlinks` (lee las publicaciones recientes del objetivo para que el pitch mencione trabajo real, no un halago genérico). No se necesita para `keywords`.
- **Bandeja de entrada (Gmail, Outlook)**: Opcional para `backlinks` (muestrea tu voz para los correos de pitch; los borradores se sienten planos sin esto). No se necesita para `keywords`.

Si no hay herramienta de SEO conectada, me detengo y te pido que conectes Semrush o Ahrefs (o pega una lista base de términos para `keywords`).

Si ni Ahrefs ni Semrush están conectados para `backlinks`, me detengo y te pido que conectes uno de los dos.

## Información que necesito

Primero leo tu contexto de marketing. Por cada campo obligatorio que falte, te hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Tu posicionamiento**: Obligatorio (ambos enfoques). Por qué lo necesito: el cliente ideal y el encuadre de categoría deciden qué palabras clave vale la pena posicionar (`keywords`) y qué sitios son relevantes frente a ruido (`backlinks`). Si falta, pregunto: "¿Quieres que redacte primero tu posicionamiento? Es una sola skill, toma unos cinco minutos."
- **El dominio de tu sitio web**: Obligatorio (ambos enfoques). Por qué lo necesito: para `keywords` reviso qué ya posicionas para no proponer palabras clave que ya tienes; para `backlinks` reviso quién ya te enlaza para no contactar sitios que ya te cubren. Si falta, pregunto: "¿Cuál es tu sitio web? Pega la URL."
- **El tema semilla**: Obligatorio para `keywords`. Por qué lo necesito: un cluster por ejecución, no quiero adivinar. Si falta, pregunto: "¿Cuál es el tema o término semilla alrededor del cual quieres un cluster de palabras clave?"
- **Tu voz**: Obligatoria para los correos de pitch de `backlinks`. Si falta, pregunto: "Conecta tu bandeja de enviados para que pueda igualar tu voz, o pega dos o tres correos que hayas enviado."
- **Tema o ángulo para el pitch**: Opcional para `backlinks`. Si falta, pregunto: "¿Sobre qué ángulo quieres que redacte el pitch? Si no tienes preferencia, sigo con tu posicionamiento base."

## Pasos

### Pasos compartidos (ambos enfoques)

1. **Leo el documento de posicionamiento**: `context/marketing-context.md`. Si falta, me detengo. Le digo al usuario que corra primero `set-up-my-marketing-info`.
2. **Leo la configuración**: `config/site.json`, `config/tooling.json`.
3. **Descubro la herramienta**: `composio search keyword` (con respaldo `composio search seo`) para `keywords`; `composio search backlink` (con respaldo `composio search seo`, último recurso `composio search web`) para `backlinks`. Elijo el primer slug conectado que coincida.

### Ramificación según `focus`:

#### `keywords`

4. **Verifico si hay herramienta de SEO conectada.** Si no hay ninguna herramienta de palabras clave conectada, hago UNA pregunta: "Conecta una herramienta de palabras clave en la pestaña de Integraciones (Semrush / Ahrefs / etc.) o pega una lista base de términos que crees que importan, ¿cuál prefieres?"
5. **Construyo el cluster** para el tema solicitado:
   - Expando la semilla a entre 15 y 40 términos relacionados (cabeza + long-tail).
   - Traigo por término: volumen de búsqueda, dificultad de palabra clave, intención de SERP (informacional / comercial / navegacional / transaccional).
   - Agrupo en subclusters por intención o subtema.
   - Puntúo la prioridad de cada término: `(volumen / dificultad) x ajuste-a-la-intención x ajuste-al-cliente-ideal`. El ajuste al cliente ideal se basa en el documento de posicionamiento.
6. **Escribo el detalle por cluster** en `keyword-clusters/{cluster-slug}.md` de forma atómica. Estructura: resumen del cluster, justificación de cliente ideal/posicionamiento, tabla de subclusters (término / volumen / dificultad / intención / prioridad), las 3 primeras publicaciones recomendadas para redactar.
7. **Agrego a `keyword-map.md`** (documento vivo en la raíz del agente). Si falta el archivo, lo creo con un preámbulo breve. Agrego una sección nueva para este cluster con enlace al archivo de detalle por cluster + los 5 términos de mayor prioridad. Escritura atómica: leo, agrego en memoria, escribo `*.tmp`, renombro.
8. **Agrego a `outputs.json`**: `{ id, type: "keyword-map", title, summary, path: "keyword-clusters/{slug}.md", status: "draft", createdAt, updatedAt }`.
9. **Resumo al usuario**: nombro los 3 términos de mayor prioridad, marco la mejor primera publicación para redactar, enlazo tanto el detalle del cluster como el `keyword-map.md` actualizado.

#### `backlinks`

4. **Leo `config/voice.md`** si existe (para el tono del correo de pitch). Si falta la voz, hago UNA pregunta: "Conecta tu bandeja de enviados vía Composio para que pueda igualar tu voz, o pega de 2 a 3 correos que hayas enviado, ¿cuál prefieres?"
5. **Construyo la lista de objetivos** (de 15 a 30 prospectos). Cada objetivo:
   - Dominio + página/autor específico a contactar.
   - Por qué ellos: relevancia temática, Domain Authority (o métrica equivalente), comportamiento pasado de enlazar a productos similares, superposición con el cliente ideal.
   - Tipo de oportunidad de enlace: guest post / página de recursos / reemplazo de enlace roto / adición a lista de "mejores X" / ronda de expertos / podcast.
6. **Clasifico la lista**: Nivel 1 (alto valor, alto esfuerzo), Nivel 2 (medio/medio), Nivel 3 (victorias rápidas). Apunto a un aproximado de 5 / 10 / 10.
7. **Redacto los correos de pitch por objetivo.** Cada objetivo produce un pitch conciso (menos de 150 palabras): un halago específico ligado a una publicación real suya, un intercambio de valor, un CTA suave. Ajusto la voz a `config/voice.md` (si está disponible) y al posicionamiento del documento compartido.
8. **Escribo** en `backlink-plans/{YYYY-MM-DD}.md` de forma atómica. Estructura: resumen ejecutivo → objetivos de Nivel 1 (tabla + pitch por objetivo) → Nivel 2 → Nivel 3 → recomendación de cadencia de outreach.
9. **Agrego a `outputs.json`**: `{ id, type: "backlink-plan", title, summary, path, status: "draft", createdAt, updatedAt }`.
10. **Resumo al usuario**: cantidad por nivel, los 3 objetivos más prometedores y la ruta. Le recuerdo al usuario: se requiere su aprobación antes de que cualquier pitch se envíe de verdad (la skill redacta, no envía).

## Lo que nunca hago

- Estimar volumen/dificultad sin resultado de herramienta. Si la herramienta devuelve datos parciales, marco los vacíos como TBD.
- Fabricar la intención de SERP: leo la SERP real cuando la herramienta puede consultarla.
- Fabricar el trabajo pasado del destinatario o los intereses editoriales de la publicación. Cada halago se liga a una URL real.
- Marcar como TBD las métricas de dominio que la herramienta no devolvió, nunca las invento.
- Enviar, publicar o postear cualquier pitch: el fundador lo entrega. Cada correo de outreach es un borrador que tú apruebas.

## Resultados

- `keyword-clusters/{cluster-slug}.md` (focus=keywords, detalle por cluster)
- `keyword-map.md` (focus=keywords, documento vivo en la raíz del agente, se agrega en cada ejecución)
- `backlink-plans/{YYYY-MM-DD}.md` (focus=backlinks)
- Todos se agregan a `outputs.json` con el `type` correspondiente: `"keyword-map"` | `"backlink-plan"`.

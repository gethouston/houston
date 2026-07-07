---
name: planear-mi-semana-en-redes
title: "Planear mi semana en redes"
description: "Construyo tu plan de publicaciones en redes sociales para la semana. Lleno de lunes a viernes en tus plataformas activas con una mezcla de publicaciones originales, contenido reutilizado y bloques de interacción. Sin ángulos repetidos, sin relleno genérico."
version: 1
category: Marketing
featured: yes
image: megaphone
integrations: [linkedin, twitter, reddit, youtube]
---


# Planear Mi Semana En Redes

## Cuándo usarlo

- Usuario: "planea las redes de esta semana" / "calendario de redes" / "qué debería
  publicar la próxima semana" / "contenido para {plataforma} esta semana".
- Semanal, se puede convertir en rutina (lunes 9am).

## Conexiones que necesito

Hago el trabajo externo a través de Composio. Antes de correr esta skill reviso que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Plataformas sociales (LinkedIn, X, Reddit)**, las plataformas para las que planeo espacios. Necesario para las plataformas en tu mezcla activa.
- **YouTube**, opcional, me permite traer videos recientes como candidatos para reutilizar.

Si ninguna de tus plataformas sociales activas está conectada, me detengo y te pido que conectes al menos aquella en la que publicas más.

## Información que necesito

Primero leo tu contexto de marketing. Por cada campo requerido que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Tu posicionamiento**, Necesario. Por qué lo necesito: cada espacio tiene que conectar con tu categoría y tu cliente ideal, no ser contenido genérico. Si falta, pregunto: "¿Quieres que primero redacte tu posicionamiento? Es una skill, toma unos cinco minutos."
- **Tu voz**, Necesario. Por qué la necesito: el calendario nombra ángulos y ganchos, esos tienen que sonar como tú. Si falta, pregunto: "Conecta tu bandeja de enviados para que pueda tomar una muestra de tu voz, o pégame dos o tres cosas que hayas escrito."
- **Tus plataformas activas y temas**, Necesario. Por qué lo necesito: no voy a planear para plataformas en las que no publicas. Si falta, pregunto: "¿En qué plataformas publicas, y qué temas quieres que vaya rotando?"
- **Frecuencia de publicación**, Opcional, por defecto LinkedIn 3 / X 5 / Reddit 2 por semana. Si falta, pregunto: "¿Cuántas publicaciones por semana por plataforma quieres como meta? Si no tienes un número, sigo con el valor por defecto."

## Pasos

1. **Leer el documento de posicionamiento**:
   `context/marketing-context.md`. Si falta o está
   vacío, me detengo y le digo al usuario que corra `set-up-my-marketing-info` primero.

2. **Leer `config/platforms.json`, `config/voice.md`,
   `config/topics.json`, `config/calendar-cadence.json` (si existe).**
   Si `calendar-cadence.json` falta, hago una pregunta puntual:
   > "¿Cuántas publicaciones por semana por plataforma quieres como meta?
   > Por defecto: LinkedIn 3, X 5, Reddit 2. Voy a guardar esto en
   > `config/calendar-cadence.json`."
   Capturo la respuesta, continúo.

3. **Lectura entre agentes, candidatos para reutilizar.** Leo
   `outputs.json` (si existe). Filtro por `type` en
   `blog-post`, `case-study`, `repurposed` creados en los últimos 14
   días. Se convierten en espacios candidatos (por ejemplo, entrada de blog → destacado
   de LinkedIn, YouTube → hilo de X). Si el archivo falta, salto el
   paso, sin error.

4. **Determinar el rango de la semana.** Por defecto: próximo lun-vie (usar
   semana ISO; la semana de hoy si es antes del miércoles, la próxima semana si es miércoles en adelante). Respetar
   el rango explícito que dé el usuario.

5. **Construir el plan.** Para cada espacio de día × plataforma:
   - Elegir tema de `config/topics.json` (rotar entre temas).
   - Elegir formato: publicación original / hilo / reutilización / respuesta /
     bloque de interacción (15 min de lectura rápida + comentar en 5 publicaciones).
   - Respetar la frecuencia de `config/calendar-cadence.json`.
   - Meta de mezcla: ~60% original, 20% reutilizado, 20%
     interacción / respuestas.
   - Sugerencia de hora del día (LinkedIn 8-10am hora local, X 11am / 4pm, Reddit
     en la noche). Solo como nota, no programar.

6. **Escribir el detalle de la semana** en `social-calendars/{YYYY-WNN}.md`
   de forma atómica. Estructura del archivo:
   ```markdown
   # Calendario de Redes  -  {YYYY}-W{NN}

   **Rango:** {fecha lun} → {fecha vie}
   **Frecuencia:** {desde la configuración}
   **Temas en rotación:** {lista}

   ---

   ## Lunes

   - **LinkedIn  -  original** · tema: {slug} · ángulo: {una línea} ·
     skill sugerida: `draft-linkedin-post`
   - **X  -  bloque de interacción (15 min)** · comentar en 5 publicaciones de
     {cuentas / hashtags}
   ...

   ## Martes
   ...

   (Vie)

   ---

   ## Candidatos para reutilizar traídos de SEO
   - {título} ({type}, creado {fecha}) → {plataforma + formato destino}
   ```

7. **Agregar una sección resumen breve** (lo más nuevo arriba) al documento vivo
   `social-calendar.md` en la raíz del agente. Estructura:
   ```markdown
   ## Semana {YYYY}-W{NN}  -  {fecha lun} a {fecha vie}
   - LinkedIn: {N} originales + {M} bloques de interacción
   - X: {N} hilos + {M} respuestas
   - Reddit: {N} respuestas
   - Reutilización: {N} candidatos traídos
   - Detalle completo: [social-calendars/{YYYY-WNN}.md](social-calendars/{YYYY-WNN}.md)
   ```
   Leer el archivo existente, agregar al inicio (no sobrescribir), escritura atómica.

8. **Agregar a `outputs.json`**, nueva entrada, `type:
   "social-calendar"`, `title: "Social calendar  -  {YYYY-WNN}"`,
   `path: "social-calendars/{YYYY-WNN}.md"`, `status: "draft"`.

9. **Resumir para el usuario**, un párrafo: rango de la semana, total
   de espacios por plataforma, invitación: "¿Quieres que redacte alguno de estos
   ahora? Dime `redacta el LinkedIn del lunes según el calendario`."

## Resultados

- `social-calendars/{YYYY-WNN}.md`
- Agrega la sección de la semana a `social-calendar.md` (documento vivo).
- Agrega a `outputs.json` con `{ id, type: "social-calendar",
  title, summary, path, status: "draft", createdAt, updatedAt }`.

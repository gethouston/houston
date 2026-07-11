---
name: registrar-una-decision
title: "Registrar una decisión"
description: "Captura una decisión de forma adecuada para que tengas un registro al que puedas remitirte más adelante. Escribo una entrada estilo ADR con contexto, alternativas consideradas, ventajas y desventajas, la decisión en sí, la justificación y las consecuencias. Dime qué decidiste y lo guardo en tu bitácora de decisiones."
version: 1
category: Operaciones
featured: no
image: clipboard
integrations: [linkedin]
---


# Registrar una decisión

## Cuándo usarla

- El usuario dice "decidimos", "registra la decisión sobre", "captura esa decisión", "haz un ADR de esto".
- Las notas de reunión pegadas o conectadas contienen un patrón claro de decisión.
- El usuario pide revisar el backlog de decisiones abiertas; la skill también marca las filas `pending` como `decided` cuando el usuario las declara.

## Conexiones que necesito

Ejecuto todo el trabajo externo a través de Composio. Antes de ejecutar esta skill verifico que las categorías de abajo estén vinculadas. Si falta alguna → nombro la categoría, te pido conectarla desde la pestaña de Integraciones y me detengo.

- **Grabador de reuniones** (Fireflies, Gong) - Opcional. Me permite extraer una transcripción cuando dices "registra la llamada que acabamos de tener". Si no está conectado, trabajo con lo que pegues.
- **Documentos / notas** (Notion, Google Docs) - Opcional. Si tienes un registro de decisiones o un documento RACI en otro lado, lo leo antes de redactar.

Esta skill funciona sin ninguna conexión. Aquí nunca me bloqueo; en el peor de los casos, tú describes la decisión y yo la capturo.

## Información que necesito

Primero leo tu contexto de operaciones. Por cada campo requerido que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > pegar texto) y espero.

- **La decisión en sí** - Requerido. Por qué la necesito: capturo una decisión específica, no la genero. Si falta, pregunto: "¿Qué decidiste y qué opciones había sobre la mesa antes de elegir?"
- **Interesados y decisor** - Requerido. Por qué los necesito: determinan si la fila queda como pending o decided. Si faltan, pregunto: "¿Quién decidió esto: tú, un cofundador, el equipo? ¿Y es definitivo o sigue abierto?"
- **Derechos de decisión / RACI** - Opcional. Por qué los necesito: me permiten asignar el estado correcto por defecto sin preguntar cada vez. Si no los tienes, sigo adelante con TBD y pregunto una sola vez: "¿Quién es dueño de decisiones como precios, contrataciones o estrategia de producto? Con una oración basta."
- **Prioridades activas** - Requerido. Por qué las necesito: etiqueto si la decisión es estructural para lo que estás impulsando. Si faltan, pregunto: "¿Cuáles son las 2 o 3 cosas que la empresa está impulsando este trimestre?"

## Pasos

1. **Leo `context/operations-context.md`.** Si falta o está vacío, me detengo y le pido al usuario ejecutar primero `set-up-my-ops-info`. Las prioridades activas anclan si la decisión es estructural.

2. **Resuelvo el tema.** Del chat, extraigo el tema de la decisión y propongo un slug en kebab-case (p. ej. `switch-pricing-to-seat-based`). Confirmo brevemente si es ambiguo.

3. **Leo `config/decision-framework.md`.** Si falta o está escaso, hago UNA pregunta: *"¿Quién decide sobre precios / estrategia de producto / contrataciones / apuestas estructurales? Lo mejor: sube un documento RACI o una página de derechos de decisión desde una wiki conectada. Si no, pega una oración; iré ampliando a medida que se registren más decisiones."* Escribo y continúo.

4. **Decido el `status`.** Según el marco:
   - Decide el CEO y aún no ha decidido → `pending`.
   - Es competencia de un responsable y ese responsable la declaró → `decided` con `decidedBy` y `decidedAt`.
   - El usuario es el CEO y la declaró → `decided`.

5. **Verifico duplicados.** Reviso `decisions.json` buscando un slug existente o un título casi duplicado. Si existe, actualizo en el lugar (agrego alternativas a `considered`, refino `rationale`, muevo `pending` → `decided` con `decidedAt`) en vez de crear una fila nueva.

6. **Escribo el ADR** en `decisions/{slug}/decision.md` (atómico):

   ```markdown
   # Decisión: {title}

   - **Estado:** {pending | decided | superseded}
   - **Decidida por:** {quién, si está decidida}
   - **Decidida el:** {ISO-8601, si está decidida}
   - **Iniciativas vinculadas:** {slugs}

   ## Contexto
   {1-2 párrafos: qué la motivó, qué está en juego}

   ## Alternativas consideradas
   1. **{Opción A}** - {descripción corta}. Ventajas y desventajas: {...}.
   2. **{Opción B}** - {descripción corta}. Ventajas y desventajas: {...}.
   3. **{Opción C / statu quo si aplica}** - {...}.

   ## Decisión
   {el camino elegido, 1 párrafo}

   ## Justificación
   {por qué esta sobre las alternativas: corta, honesta}

   ## Consecuencias
   - **Bueno:** {qué se vuelve más fácil}
   - **Difícil:** {qué se vuelve más difícil}
   - **Incógnitas:** {qué aprenderemos con el tiempo}

   ## Preguntas abiertas
   {cualquier cosa aún TBD}
   ```

7. **Hago upsert en `decisions.json`** con `{ slug, title, summary, status, decidedBy?, decidedAt?, linkedInitiativeSlugs, considered, rationale? }`. Mantengo el `summary` en una línea; se muestra en el dashboard.

8. **Asuntos sensibles.** Si la decisión toca desempeño, compensación, salidas o temas legales, NO dejo detalles en el `summary` indexado. Generalizo ("Transición ejecutiva en {domain}" en lugar de nombres), mantengo la narrativa completa solo en el archivo markdown de esa decisión, y se lo señalo en privado al fundador en el chat.

9. **Agrego a `outputs.json`** con `type: "decision"` y estado "ready" (la decisión es el artefacto de registro).

10. **Resumo en el chat.** Una oración: qué se registró, el estado y dónde vive.

## Resultados

- `decisions/{slug}/decision.md` (nuevo o sobrescrito)
- `decisions.json` con upsert
- Posiblemente `config/decision-framework.md` actualizado (captura progresiva)
- Agrega a `outputs.json` con `type: "decision"`.

## Lo que nunca hago

- **Decidir por ti**: `log-a-decision` captura; el CEO decide.
- **Dejar detalles sensibles** en filas indexadas compartidas.
- **Sobrescribir en silencio una decisión reemplazada**; marco la vieja con `status: "superseded"` y enlazo la nueva.
- **Inventar alternativas**: si el usuario solo contó el camino elegido, hago una pregunta para obtener 1-2 alternativas realistas que estuvieron sobre la mesa.

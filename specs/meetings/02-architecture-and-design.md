# Houston Meetings — Arquitectura y Diseño Técnico

> **Documento 2 de 3.** Define CÓMO se construye. Asume que leíste
> `01-vision-and-features.md`. El plan de ejecución por fases está en
> `03-implementation-plan.md`.
>
> **Antes de tocar nada:** lee `CLAUDE.md` del repo + `knowledge-base/architecture.md`
> + `knowledge-base/files-first.md` + `knowledge-base/engine-protocol.md`. Esta
> feature respeta esas reglas (library boundary, files-first, no silent failures,
> i18n, no backwards-compat interno).

---

## 1. Mapa de capas

Houston = **app/ (Tauri + React)** ↔ **engine/ (Rust, axum HTTP+WS)** ↔
**ui/ (@houston-ai/* React)**. El engine corre como subproceso del app y se
habla por HTTP/WS. Toda la lógica de dominio vive en el engine; el app solo
tiene glue de OS (abrir webview, etc.).

La feature toca las tres capas:

```
┌─────────────────────────────────────────────────────────────────────┐
│  app/ (Tauri Rust)  — glue de OS: abrir webview Meet, inyectar JS,   │
│                       pollear captions, bombear audio TTS            │
│  app/ (React)       — página Meetings, formulario join, cards, panel │
├─────────────────────────────────────────────────────────────────────┤
│  engine/ (Rust)     — dominio: Meetings CRUD, buffer de captions,    │
│                       post-procesamiento (resumen → tareas → memoria)│
├─────────────────────────────────────────────────────────────────────┤
│  ui/ (React)        — (opcional) cards reutilizables si aplica       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Data model — `.houston/meetings/`

Sigue el patrón files-first de Houston (ver `knowledge-base/files-first.md`).
Cada agente tiene su `.houston/`. Añadimos un tipo nuevo `meetings`.

```
~/.houston/workspaces/<Workspace>/<Agent>/.houston/
  meetings/
    meetings.json              # Meeting[] — índice de todas las reuniones del agente
    meetings.schema.json       # JSON Schema (seeded en cada open)
    <meeting-id>/
      transcript.md            # líneas de caption: "**Speaker:** texto"
      summary.md               # resumen post-reunión (markdown, lo escribe el agente)
```

### 2.1 Schema `Meeting` (ui/agent-schemas/src/meetings.schema.json)

Crear el schema nuevo. Es la fuente de verdad. Se embebe en Rust vía
`include_str!` en `houston-agent-files::schemas` y se siembra en disco en cada
open (igual que `activity.schema.json`).

```jsonc
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Meetings",
  "type": "array",
  "items": {
    "type": "object",
    "required": ["id", "title", "meet_url", "status", "created_at"],
    "properties": {
      "id":            { "type": "string" },
      "title":         { "type": "string" },
      "meet_url":      { "type": "string" },
      "bot_name":      { "type": "string" },
      "status":        { "type": "string",
                         "enum": ["upcoming", "live", "processing", "completed", "error"] },
      "context":       { "type": "string" },   // contexto pre-cargado por el usuario
      "participants":  { "type": "array", "items": { "type": "string" } },
      "caption_count": { "type": "integer" },
      "action_items_count": { "type": "integer" },
      "summary_ready": { "type": "boolean" },
      "error_message": { "type": ["string", "null"] },
      "scheduled_at":  { "type": ["string", "null"] }, // RFC3339, para upcoming
      "started_at":    { "type": ["string", "null"] },
      "ended_at":      { "type": ["string", "null"] },
      "created_at":    { "type": "string" },
      "updated_at":    { "type": "string" }
    }
  }
}
```

Registrar el schema:
- Añadir el archivo en `ui/agent-schemas/src/meetings.schema.json`.
- Exportarlo en `ui/agent-schemas/src/index.ts`.
- Añadir el `include_str!` en `engine/houston-agent-files/src/schemas.rs` (mirar
  cómo lo hace `activity.schema.json` y replicar para `meetings`).
- Asegurar que `seed_schemas` escribe `.houston/meetings/meetings.schema.json`.

> Como el schema se re-escribe en cada open, añadir el tipo llega a usuarios
> existentes sin migración. Pero igual: `houston_agent_files::migrate_agent_data`
> debe crear `meetings/meetings.json` vacío (`[]`) si no existe, idempotente.

### 2.2 Tipo Rust (`Meeting`)

Vive en `engine/houston-engine-core/src/meetings.rs` (módulo nuevo) o, si se
quiere mantener el patrón de DTOs, en `houston-engine-protocol`. Usar enum para
el status (regla de type-safety del repo: status SIEMPRE es enum con
Display/FromStr, nunca string suelto).

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MeetingStatus {
    Upcoming,
    Live,
    Processing,
    Completed,
    Error,
}
// impl Display + FromStr.
```

### 2.3 Tipo TS (wire)

En `ui/engine-client/src/types.ts`, espejo manual del DTO Rust (el repo aún no
tiene codegen; se mantiene a mano y CI falla si derivan). Discriminated union
para el status.

---

## 3. Engine — rutas REST

Patrón: rutas bajo `/v1/*`, nouns plurales, acciones no-CRUD como sub-POST.
Cada ruta mutante emite el `HoustonEvent` correspondiente al bus broadcast.
Wire en `engine/houston-engine-server/src/lib.rs`. Tests de integración: un
archivo por módulo en `engine/houston-engine-server/tests/`.

Crear `engine/houston-engine-server/src/routes/meetings.rs`:

| Método | Path | Descripción |
|--------|------|-------------|
| GET    | `/v1/meetings?agent_path=` | Lista reuniones de un agente |
| POST   | `/v1/meetings`             | Crea reunión (estado inicial `upcoming` o `live`) |
| PATCH  | `/v1/meetings/:id`         | Actualiza (status, participantes, counts) |
| DELETE | `/v1/meetings/:id`         | Borra reunión |
| POST   | `/v1/meetings/:id/captions`| Append de líneas de caption (lo llama el app) |
| POST   | `/v1/meetings/:id:start`   | Marca `live`, setea `started_at` |
| POST   | `/v1/meetings/:id:end`     | Marca `processing` y dispara post-procesamiento |

Para listar **todas** las reuniones del workspace (la página global), seguir el
patrón de `conversations/list-all`: un POST que recibe los `agent_path` de todos
los agentes y agrega. Alternativa simple para v1: el frontend hace `GET
/v1/meetings?agent_path=` por cada agente y mergea. (Decidir según tiempo;
empezar con el merge en frontend está bien.)

### 3.1 Buffer de captions

`POST /v1/meetings/:id/captions` recibe `{ lines: [{ speaker, text, ts_ms }] }`.
El engine:
1. Dedup contra lo ya guardado (mismo speaker+text consecutivo).
2. Append a `.houston/meetings/<id>/transcript.md` (escritura atómica: temp + rename).
3. Actualiza `caption_count` y `participants` en `meetings.json`.
4. Emite `MeetingCaptionsAppended` (o reusa `MeetingChanged`) para que la UI
   actualice el contador en vivo.

### 3.2 Post-procesamiento (`:end`)

Este es el corazón "agentico". Al recibir `:end`:
1. Status → `processing`, emitir evento.
2. Lanzar una **sesión del agente** (igual que una misión normal: el engine ya
   sabe correr `claude -p` sobre un agente — ver `sessions::start` y
   `routines::runner`). Usar el agente dueño de la `Meeting`.
3. El prompt de esa sesión es un PROMPT FIJO de post-procesamiento + el
   transcript completo + el contexto de la reunión. Ese prompt instruye al
   agente a:
   - Escribir `summary.md`.
   - Crear una `Activity` (misión) por cada action item, vía las herramientas
     de archivo que el agente ya tiene (escribe `.houston/activity/activity.json`).
   - Guardar decisiones clave en `.houston/learnings/learnings.json`.
   - (Opcional) Redactar borradores de email con Composio Gmail.
4. Al terminar la sesión: status → `completed`, `summary_ready = true`,
   `action_items_count`, emitir evento.

> **Reuso clave:** NO inventamos un runner nuevo. El post-procesamiento es una
> sesión de agente más, con un prompt especializado. Mirar cómo `routines::runner`
> dispara una sesión detached y sigue su estado por eventos, y replicar ese shape.

### 3.3 Eventos nuevos

En `engine/houston-ui-events` (o donde vivan los `HoustonEvent`), añadir:
- `MeetingChanged { agent_path, meeting_id }` — invalida la query de meetings.
- `MeetingStatusChanged { agent_path, meeting_id, status }` — para el indicador en vivo.

Y un topic nuevo en el protocolo: `meetings:{agent}` (ver tabla de topics en
`knowledge-base/engine-protocol.md`). El firehose `*` ya los entrega al desktop.

---

## 4. App (Tauri Rust) — el webview de Meet

Esta es la parte copiada de OpenHuman. Referencias exactas (LEERLAS):
- `openhuman/app/src-tauri/src/meet_call/mod.rs` — abrir webview top-level a Meet.
- `openhuman/app/src-tauri/src/meet_audio/captions_bridge.js` — scraper de captions.
- `openhuman/app/src-tauri/src/meet_audio/caption_listener.rs` — poll loop.
- `openhuman/app/src-tauri/src/meet_audio/audio_bridge.js` — monkey-patch gUM (fase 2).
- `openhuman/app/src-tauri/src/meet_audio/speak_pump.rs` — bombeo PCM (fase 2).

### 4.1 Diferencia crítica: WebView2 vs CEF

OpenHuman usa CEF y maneja la inyección por CDP (`Page.addScriptToEvaluateOnNewDocument`).
**Houston/Tauri en Windows usa WebView2** (Chromium de Microsoft). Tauri 2 da
una API más simple:

- `WebviewWindowBuilder::new(...).initialization_script(JS)` inyecta JS **antes**
  de que cargue cualquier página, en cada navegación. Esto reemplaza el truco de
  CDP `addScriptToEvaluateOnNewDocument`. Es lo que necesitamos para que el
  monkey-patch de `getUserMedia` corra antes de que Meet pida el micrófono.
- Para LEER captions desde Rust: `webview.eval(js)` corre JS pero no devuelve
  valor directo en todas las versiones. Patrón robusto: el `captions_bridge.js`
  acumula captions en una cola y las **empuja** al backend Tauri vía
  `window.__TAURI__` / un canal IPC, en vez de que Rust las "drene". Es decir,
  invertir el flujo respecto a OpenHuman: el JS hace push, no Rust hace pull.
  - Opción A (recomendada): el bridge llama a un comando Tauri expuesto
    (`invoke("meeting_push_captions", {...})`) cada vez que junta líneas nuevas.
  - Opción B: usar `with_web_context` + `ipc` postMessage.
  - Verificar la API exacta de Tauri 2 para IPC desde un webview secundario.
    Documentar la elección en el código.

### 4.2 Comandos Tauri nuevos

Crear `app/src-tauri/src/commands/meetings.rs` (registrar en `commands/mod.rs` y
en el builder de Tauri). Solo glue de OS, sin lógica de dominio:

```rust
// Abre el webview a la URL de Meet, data dir aislado, inyecta el/los bridge(s).
#[tauri::command]
async fn meeting_open_window(app, args: OpenArgs) -> Result<String, String>;
//   args: { meeting_id, meet_url, bot_name }

// Cierra el webview de una reunión.
#[tauri::command]
async fn meeting_close_window(app, meeting_id: String) -> Result<(), String>;

// Recibe captions empujadas desde el bridge JS y las reenvía al engine
// (POST /v1/meetings/:id/captions). NO guarda nada localmente.
#[tauri::command]
async fn meeting_push_captions(meeting_id: String, lines: Vec<CaptionLine>) -> Result<(), String>;
```

### 4.3 captions_bridge.js (adaptado)

Copiar la lógica de `openhuman/.../captions_bridge.js`:
- Auto-clic en "Turn on captions" (varias variantes de aria-label).
- `MutationObserver` + poll de 250ms sobre `[aria-label="Captions"]`.
- Dedup por speaker+text.

**Cambio:** en vez de exponer `window.__openhumanDrainCaptions()` para que Rust
drene por CDP, el bridge **empuja** las líneas nuevas llamando al comando Tauri
(`meeting_push_captions`) cada ~500ms. Adaptar el final del script a la API IPC
de Tauri 2.

### 4.4 ¿Ventana visible u oculta?

OpenHuman la pone off-screen (`Y = -30000`) para que el renderer arranque pero
el usuario no la vea. En Houston, **decisión de producto**: para la demo es más
impresionante mostrar la ventana de Meet (el jurado ve a "Houston" en la lista
de participantes). Default v1: **ventana visible** que el usuario puede minimizar.
Dejar el off-screen como opción documentada.

### 4.5 Join automático del lobby (fase 1.5, opcional)

Meet pide nombre y "Pedir unirse". OpenHuman tiene un `meet_scanner` que
automatiza esto por CDP. En Tauri 2/WebView2 se puede hacer con
`initialization_script` que: rellena el input de nombre con `bot_name` y clickea
el botón de unirse cuando aparecen. Es frágil (el DOM de Meet cambia). Para v1
es aceptable que el usuario haga el join manual la primera vez (la ventana está
visible). Automatizar es mejora.

---

## 5. App (React) — la página Meetings

### 5.1 Navegación (sidebar + viewMode)

- `app/src/stores/ui.ts`: `viewMode` ya es un `string` libre. Añadir `"meetings"`
  como valor válido del nivel top (junto a `dashboard`/`connections`/`settings`).
  Actualizar la lógica `isTopLevel` / `isAgentView` en `workspace-shell.tsx` y
  `sidebar.tsx` para incluir `"meetings"`.
- `app/src/components/shell/sidebar.tsx`: añadir un `navItem` nuevo:
  ```tsx
  { id: "meetings",
    label: t("shell:sidebar.meetings"),
    icon: <Video className="h-4 w-4" />,  // lucide-react
    onClick: () => setViewMode("meetings") }
  ```
- `app/src/components/shell/workspace-shell.tsx`: cuando `viewMode === "meetings"`,
  renderizar `<MeetingsPage />` (igual que hoy renderiza `<Dashboard />` para
  `"dashboard"`).

### 5.2 Componentes nuevos

```
app/src/components/meetings/
  meetings-page.tsx        # contenedor: 3 columnas + botón "Nueva reunión"
  meeting-card.tsx         # tarjeta de una reunión (varía por status)
  meeting-detail-panel.tsx # panel lateral: resumen, tareas, emails, transcript
  join-meeting-dialog.tsx  # formulario: url, bot name, agente, contexto
  use-meetings.ts          # TanStack Query hook (lista + invalidación por evento)
```

### 5.3 Reactividad (obligatoria — ver CLAUDE.md)

- `use-meetings.ts`: `useQuery(["meetings", workspaceId], ...)` que llama al
  engine vía `@houston-ai/engine-client`.
- `app/src/hooks/use-agent-invalidation.ts`: mapear `MeetingChanged` /
  `MeetingStatusChanged` → invalidar `["meetings", ...]`. Mirar cómo mapea
  `ActivityChanged` y replicar.
- Nada de load-on-mount-only. El contador de captions en vivo se actualiza por
  evento.

### 5.4 Reuso de board

Evaluar usar `@houston-ai/board` (`KanbanItem`, `KanbanColumn` de
`ui/board/src/types.ts`) para las 3 columnas. Si el shape de `Meeting` mapea
limpio a `KanbanItem` (id, title, subtitle, status, tags, metadata), usarlo. Si
no, un grid de cards CSS simple es aceptable — pero NO duplicar lógica de board
que ya existe.

---

## 6. Fase 2 — el agente HABLA (speak path)

Solo después de que ESCUCHAR + post-procesamiento funcionen end-to-end.

### 6.1 audio_bridge.js (monkey-patch getUserMedia)

Copiar de `openhuman/.../audio_bridge.js`. Inyectar vía
`initialization_script` (corre antes de que Meet llame `getUserMedia`):
- Construye un grafo Web Audio 16kHz mono con `MediaStreamAudioDestinationNode`.
- Reemplaza `navigator.mediaDevices.getUserMedia` para devolver ese stream como
  "micrófono".
- Expone `window.__houstonFeedPcm(b64)` para recibir audio sintetizado.

### 6.2 TTS — texto a voz

Houston no tiene TTS hoy. Opciones (el usuario tiene cuentas):
- **Deepgram Aura** (hay skill `deepgram` disponible; buena latencia). Recomendado.
- OpenAI TTS.
- ElevenLabs.

El engine necesita una ruta nueva o el app llama al TTS directo. Decisión
limpia: el **engine** sintetiza (mantiene API keys server-side, frontend-agnostic):
```
POST /v1/meetings/:id/speak  { text }  → genera PCM, lo encola para el app
GET  /v1/meetings/:id/speech            → el app drena PCM16LE base64
```
El app bombea ese PCM al webview vía `__houstonFeedPcm` cada ~100ms (copiar
`speak_pump.rs`).

### 6.3 Cuándo habla — wake gate + privacidad

Copiar la lógica de `openhuman/src/openhuman/meet_agent/`:
- Wake-word: el bot responde cuando un caption contiene su nombre (o frase
  configurable). Sin wake-word, el bot escucha callado.
- Self-echo filter: descartar captions cuyo speaker es el bot.
- Gate de privacidad fail-closed: solo el dueño activa turnos con herramientas.
- Rate limiting contra el re-emit de captions de Meet (dedup, cooldown,
  min-turn-gap). Meet re-emite la misma línea cada ~250ms.
- Limpiar el output para voz: quitar markdown, reasoning, capar longitud
  (`strip_for_speech` / `cap_for_speech` en el repo de OpenHuman).

### 6.4 Turno de habla (orquestación)

```
caption con wake-word
  → gate (dueño? no es eco? no en cooldown?)
  → sesión del agente con: contexto reunión + transcript reciente + herramientas
  → respuesta de texto
  → strip + cap para voz
  → POST /v1/meetings/:id/speak (TTS → PCM)
  → app drena y bombea al webview
  → todos en la call escuchan
```

> Latencia: usar el modelo más rápido disponible para turnos en vivo
> (`hint:fast` en OpenHuman). En Houston, considerar Haiku/Sonnet para el turno
> en vivo y dejar el post-procesamiento (resumen) a un modelo más fuerte.

---

## 7. Reglas que NO se rompen (del CLAUDE.md de Houston)

- **Library boundary:** nada app-específico en `ui/`. Props over stores. Sin
  `@/` aliases en `ui/`. Sin tipos de app en `ui/`.
- **Engine boundary:** el engine no sabe de Tauri ni React. El TTS, las rutas,
  el dominio viven en el engine como librería pura.
- **Files-first + reactividad:** todo dato en `.houston/` reacciona a cambios
  (file watcher + eventos). El watcher ya corre sobre `.houston/`; añadir
  `meetings/` no requiere config extra.
- **No silent failures:** cada error de acción del usuario → toast con Report bug.
- **Type safety:** status como enum (Rust) / discriminated union (TS).
- **i18n:** en/es/pt. Strings nuevos en `app/src/locales/<lang>/`, registrar
  namespace si hace falta, tipos en `react-i18next.d.ts`. Sin em dashes.
- **File size:** 200 líneas/archivo (sin tests), CSS 500. Extraer módulos.
- **Tests obligatorios:** cada feature con tests. Engine → `cargo test`. TS →
  `pnpm typecheck` + tests donde aplique.

---

## 8. Flujo end-to-end (resumen visual)

```
Usuario → "Nueva reunión" (url, bot name, agente, contexto)
   │
   ▼
React: POST /v1/meetings  →  engine crea Meeting(status=live)
   │                              │ emite MeetingChanged
   ▼                              ▼
React: invoke meeting_open_window   UI lista la reunión en "En vivo"
   │
   ▼
Tauri abre webview Meet + inyecta captions_bridge.js (+ audio_bridge.js en fase 2)
   │
   ▼ (cada 500ms)
bridge JS empuja captions → invoke meeting_push_captions
   │
   ▼
Tauri → POST /v1/meetings/:id/captions → engine append transcript.md + counts
   │                                          │ emite MeetingChanged
   ▼                                          ▼
(fase 2) wake-word → agente → TTS → PCM    UI actualiza contador en vivo
                                  → webview → call escucha
   │
   ▼  usuario aprieta "Salir"
React: POST /v1/meetings/:id:end + invoke meeting_close_window
   │
   ▼
engine: status=processing → corre sesión de agente con prompt de post-proceso
   │   agente escribe summary.md + crea Activities + guarda learnings + draft emails
   ▼
engine: status=completed → emite MeetingStatusChanged
   │
   ▼
UI mueve la card a "Completadas"; panel muestra resumen + tareas + emails + transcript
```
</content>

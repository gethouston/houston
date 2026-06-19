# Houston Meetings — Plan de Implementación

> **Documento 3 de 3.** Pasos incrementales y testeables. Asume `01-vision-and-features.md`
> y `02-architecture-and-design.md` leídos.
>
> **Para Claude Code:** este plan está ordenado para que cada fase sea
> **probable en aislamiento** antes de pasar a la siguiente. NO saltes fases.
> Library/engine antes que app. Corre los checks al final de cada fase. Sigue el
> protocolo de fases del `CLAUDE.md` del repo (Understand → Challenge → Plan →
> Execute → Test → Verify). Pide aprobación antes de avanzar de fase grande.

---

## Cómo trabajar este plan

- Cada **Fase** es un chunk con un objetivo verificable. Marca los `[ ]` al terminar.
- Cada fase termina con un **Check** (cómo probar que funciona) antes de seguir.
- Worktree workflow: commits en la branch del worktree, PR a main, squash merge.
  Un PR por fase grande (o por par de fases pequeñas).
- Si una fase revela que el diseño está mal, PARA y reporta — no parches.

### Comandos de verificación (del CLAUDE.md)

| Área | Comando |
|------|---------|
| ui/ TS | `pnpm typecheck` |
| engine/ | `cargo test --workspace` y `cargo build --workspace` |
| engine/ Win check | `cargo check --target x86_64-pc-windows-gnu -p houston-engine-server` |
| app/ TS | `cd app && pnpm tsc --noEmit` |
| app/ Rust | `cd app/src-tauri && cargo check` |
| app/ i18n | `cd app && pnpm check-locales` |

> Recordar: si tocas `engine/**`, corre `cargo build -p houston-engine-server`
> ANTES del próximo `pnpm tauri dev` (el sidecar no se recompila solo).

---

## FASE 0 — Reconocimiento (no escribir código)

Objetivo: confirmar que el diseño encaja con el código real antes de tocar nada.

- [ ] Leer `CLAUDE.md`, `knowledge-base/architecture.md`, `files-first.md`,
      `engine-protocol.md`, `agent-manifest.md`.
- [ ] Leer cómo está implementado `activity` de punta a punta como plantilla:
      - Schema: `ui/agent-schemas/src/activity.schema.json`
      - Embed: `engine/houston-agent-files/src/schemas.rs`
      - Rutas: `engine/houston-engine-server/src/routes/agent_files.rs` (o donde
        viva activities) + `lib.rs`
      - Eventos: dónde se emite `ActivityChanged`
      - Frontend hook: `app/src/hooks/queries` + `use-agent-invalidation.ts`
- [ ] Leer cómo `routines::runner` dispara una sesión de agente detached y sigue
      su estado (plantilla para el post-procesamiento).
- [ ] Leer los archivos de referencia de OpenHuman (rutas en doc 2, sección 4).
- [ ] Confirmar la API de Tauri 2 para: (a) abrir un `WebviewWindow` secundario,
      (b) `initialization_script`, (c) IPC `invoke` desde ese webview secundario.

**Check:** escribir 5 líneas confirmando que el diseño del doc 2 encaja, o
listando los ajustes necesarios. No avanzar hasta tener esto claro.

---

## FASE 1 — Engine: data model + CRUD (sin app, sin UI)

Objetivo: el engine sabe guardar y listar reuniones. Probable con `curl` / tests.

- [ ] Crear `ui/agent-schemas/src/meetings.schema.json` (ver doc 2 §2.1).
- [ ] Exportarlo en `ui/agent-schemas/src/index.ts`.
- [ ] Embeber con `include_str!` en `engine/houston-agent-files/src/schemas.rs`.
- [ ] Asegurar `seed_schemas` escribe `.houston/meetings/meetings.schema.json`.
- [ ] En `houston_agent_files::migrate_agent_data`: crear `meetings/meetings.json`
      = `[]` si no existe (idempotente).
- [ ] Tipo `Meeting` + `MeetingStatus` (enum con Display/FromStr) en
      `engine/houston-engine-core/src/meetings.rs` (módulo nuevo).
- [ ] DTO espejo en `ui/engine-client/src/types.ts` (discriminated union de status).
- [ ] Crear `engine/houston-engine-server/src/routes/meetings.rs` con:
      GET `/v1/meetings?agent_path=`, POST `/v1/meetings`, PATCH `/v1/meetings/:id`,
      DELETE `/v1/meetings/:id`.
- [ ] Wire en `engine/houston-engine-server/src/lib.rs`.
- [ ] Evento `MeetingChanged { agent_path, meeting_id }` en el bus + topic
      `meetings:{agent}` en el protocolo. Emitir en cada ruta mutante.
- [ ] Tests de integración en `engine/houston-engine-server/tests/meetings.rs`:
      crear, listar, actualizar status, borrar.

**Check:**
```
cargo test --workspace
cargo build --workspace
# Manual: arrancar el engine, crear una meeting por POST, listarla por GET.
```

---

## FASE 2 — Engine: captions + ciclo de vida

Objetivo: el engine acumula transcript y maneja start/end. Sin post-proceso aún.

- [ ] POST `/v1/meetings/:id/captions` `{ lines: [{speaker, text, ts_ms}] }`:
      dedup, append a `transcript.md` (atómico), actualizar `caption_count` y
      `participants`, emitir `MeetingChanged`.
- [ ] POST `/v1/meetings/:id:start`: status → `live`, `started_at`, emitir evento.
- [ ] POST `/v1/meetings/:id:end`: status → `processing`, `ended_at`, emitir
      evento. (El post-procesamiento real llega en Fase 5 — por ahora solo deja
      la reunión en `processing` y, temporalmente, pásala a `completed` con un
      summary placeholder para poder probar la UI.)
- [ ] Tests: append de captions dedup correcto; transcript.md bien formado;
      transiciones de status válidas.

**Check:**
```
cargo test --workspace
# Manual: POST captions varias veces, verificar transcript.md y caption_count.
```

---

## FASE 3 — App React: página Meetings (con datos del engine, sin webview)

Objetivo: ver la página, crear reuniones a mano, verlas en columnas. Sin Meet aún.

- [ ] `app/src/stores/ui.ts`: aceptar `viewMode === "meetings"` como top-level.
- [ ] `sidebar.tsx`: nav item "Meetings" (icono `Video` de lucide-react).
- [ ] `workspace-shell.tsx`: render `<MeetingsPage />` cuando `viewMode==="meetings"`;
      ajustar `isTopLevel`/`isAgentView`.
- [ ] `app/src/components/meetings/use-meetings.ts`: TanStack Query que lista
      reuniones de todos los agentes del workspace (merge en frontend está OK v1).
- [ ] `use-agent-invalidation.ts`: `MeetingChanged` → invalida `["meetings", ...]`.
- [ ] `meetings-page.tsx`: 3 columnas (Próximas / En vivo / Completadas) +
      botón "Nueva reunión".
- [ ] `meeting-card.tsx`: varía por status (pulsante si live, check si completed,
      calendario si upcoming, rojo si error).
- [ ] `join-meeting-dialog.tsx`: form (url, bot name, selector de agente,
      textarea contexto). Valida URL de Meet. Al confirmar → POST `/v1/meetings`
      (status `live`) + (Fase 4) abrir webview.
- [ ] `meeting-detail-panel.tsx`: resumen + tareas + transcript (placeholder OK).
- [ ] i18n: strings en `app/src/locales/{en,es,pt}/` (namespace `meetings` nuevo;
      registrar en `app/src/lib/i18n.ts` + `app/src/types/react-i18next.d.ts`).

**Check:**
```
cd app && pnpm tsc --noEmit
cd app && pnpm check-locales
pnpm tauri dev  # ver la página, crear meeting manual, verla en columna live
```

---

## FASE 4 — App Tauri: abrir Meet + capturar captions (EL NÚCLEO)

Objetivo: Houston entra a un Meet real y el transcript aparece en vivo en la UI.

- [ ] `app/src-tauri/src/commands/meetings.rs` (registrar en `commands/mod.rs` +
      builder Tauri):
      - `meeting_open_window(meeting_id, meet_url, bot_name)` — abre `WebviewWindow`
        a la URL, data dir aislado por `meeting_id`, inyecta el bridge vía
        `initialization_script`.
      - `meeting_close_window(meeting_id)`.
      - `meeting_push_captions(meeting_id, lines)` — reenvía al engine
        (POST `/v1/meetings/:id/captions`). Solo glue, sin lógica.
- [ ] `app/src-tauri/src/meetings/captions_bridge.js` — adaptar de OpenHuman:
      auto-enable captions, MutationObserver + poll, dedup, y **push** vía
      `invoke("meeting_push_captions", ...)` cada ~500ms (no drain por CDP).
- [ ] `join-meeting-dialog.tsx`: tras POST `/v1/meetings`, llamar
      `invoke("meeting_open_window", ...)`.
- [ ] Botón "Salir" en la card live → `invoke("meeting_close_window")` + POST
      `/v1/meetings/:id:end`.
- [ ] Manejo de errores: si no abre el webview → toast con Report bug.

**Check (la prueba de fuego):**
```
cd app/src-tauri && cargo check
pnpm tauri dev
# 1. Crear un Meet real (meet.google.com) en otra cuenta/dispositivo.
# 2. "Nueva reunión" en Houston con ese link.
# 3. Houston abre el webview, aparece como participante.
# 4. Habla en la call → ver captions llegando al transcript en vivo en la UI.
```

---

## FASE 5 — Engine: post-procesamiento agentico (LA MAGIA)

Objetivo: al salir, el agente convierte el transcript en resumen + tareas + memoria.

- [ ] En `:end`, tras marcar `processing`, lanzar una sesión de agente detached
      (plantilla: `routines::runner`). Usar el agente dueño de la `Meeting`.
- [ ] Prompt fijo de post-procesamiento (vive en el engine o lo pasa el app como
      systemPrompt) que instruye al agente a, en una sola corrida:
      1. Escribir `.houston/meetings/<id>/summary.md`.
      2. Crear una `Activity` por cada action item (escribe `activity.json`).
      3. Guardar decisiones clave en `learnings.json`.
      4. (Opcional) Redactar borradores de email con Composio Gmail.
- [ ] Al terminar la sesión: status → `completed`, `summary_ready=true`,
      `action_items_count`, emitir `MeetingStatusChanged`.
- [ ] Manejo de fallo de la sesión: status → `error`, `error_message`, toast.
- [ ] `meeting-detail-panel.tsx`: leer `summary.md` real + linkear a las
      Activities creadas + mostrar transcript completo.
- [ ] Tests: el prompt produce las escrituras esperadas (mockear la sesión o
      probar con un transcript fixture pequeño).

**Check:**
```
cargo test --workspace
pnpm tauri dev
# Reunión real corta → "Salir" → ver:
#   - card pasa a "Completadas"
#   - resumen en el panel
#   - misiones nuevas en el board del agente
#   - learnings actualizados
```

---

## FASE 6 — App Tauri: el agente HABLA (speak path)

Objetivo: el agente responde por voz cuando le hablan en la call. Solo tras
Fases 1-5 sólidas.

- [ ] `app/src-tauri/src/meetings/audio_bridge.js` — adaptar de OpenHuman:
      monkey-patch `getUserMedia`, grafo Web Audio 16kHz, `window.__houstonFeedPcm`.
      Inyectar vía `initialization_script` (antes que Meet pida micrófono).
- [ ] Engine TTS: POST `/v1/meetings/:id/speak {text}` → PCM; GET
      `/v1/meetings/:id/speech` → drena PCM16LE base64. Proveedor: Deepgram Aura
      (hay skill `deepgram`) u OpenAI TTS. API key server-side.
- [ ] `app/src-tauri/src/meetings/speak_pump.rs` — adaptar de OpenHuman: cada
      ~100ms drena `/speech` y feed al webview vía `__houstonFeedPcm`.
- [ ] Wake gate + privacidad (adaptar `openhuman/src/openhuman/meet_agent/`):
      wake-word, self-echo filter, gate fail-closed (solo dueño usa herramientas),
      rate limiting contra re-emit de captions, `strip_for_speech`/`cap_for_speech`.
- [ ] Orquestación del turno: caption con wake-word → gate → sesión de agente
      (modelo rápido) → texto → strip → /speak → pump → call escucha.
- [ ] Indicador "Houston está hablando" en la card live.
- [ ] Manejo de errores: TTS falla → el bot dice una frase canned, no crashea;
      toast con Report bug.

**Check:**
```
cd app/src-tauri && cargo check
pnpm tauri dev
# Reunión real → decir el nombre del bot + una pregunta →
# escuchar al agente responder por voz en la call.
```

---

## FASE 7 — Pulido, tests, docs

- [ ] Self-audit RULE 0: ¿dónde corté camino? Arreglar.
- [ ] Tests faltantes (engine + TS).
- [ ] Verificar i18n completo (en/es/pt), sin em dashes, `pnpm check-locales` verde.
- [ ] Verificar límites de archivo (200 líneas, CSS 500) — extraer si hace falta.
- [ ] Verificar boundaries: nada app-específico en ui/, engine sin Tauri/React.
- [ ] Docs: añadir `knowledge-base/meetings.md` (nuevo) explicando la feature, el
      data model, los dos paths (listen/speak), y los gotchas (re-emit de Meet,
      gate fail-closed, WebView2 vs CEF). Linkear desde el dispatch table de
      `CLAUDE.md`.
- [ ] Verificación visual de la página y las cards (fidelidad de diseño).

**Check:** todos los comandos de verificación en verde + demo end-to-end completa.

---

## Orden de PRs sugerido

1. PR 1 — Fase 1 + Fase 2 (engine data model + captions + lifecycle).
2. PR 2 — Fase 3 (página React con datos).
3. PR 3 — Fase 4 (webview Meet + captura en vivo). **El hito demo-able.**
4. PR 4 — Fase 5 (post-procesamiento agentico).
5. PR 5 — Fase 6 (speak path).
6. PR 6 — Fase 7 (pulido + docs).

Para la hackathon, el mínimo presentable es **hasta PR 3** (Houston entra y
captura) o, ideal, **hasta PR 4** (entra, captura, y te deja las tareas). El
speak path (PR 5) es el "wow" final si hay tiempo.

---

## Riesgos conocidos (decidir cuando aparezcan, no antes)

| Riesgo | Mitigación |
|--------|------------|
| DOM de captions de Meet cambia | Apoyarse en `aria-label="Captions"` (estable por a11y), fuzzy match de fallback. |
| IPC desde webview secundario en Tauri 2 | Confirmar API en Fase 0; fallback: postMessage + listener. |
| `getUserMedia` patch no corre a tiempo | `initialization_script` corre a document-start; verificar; reload como backstop. |
| Latencia del turno de voz | Modelo rápido (Haiku/Sonnet) para turnos en vivo; modelo fuerte solo para el resumen. |
| Meet re-emite captions cada 250ms | Dedup + cooldown + min-turn-gap (copiar de OpenHuman). |
| Join del lobby frágil | v1: join manual con ventana visible. Auto-join = mejora. |
</content>

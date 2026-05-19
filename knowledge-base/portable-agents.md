# Portable Agents (Share with a friend)

How a Houston user packages an agent into a single file and a recipient
imports it into their workspace. Engine-side feature; the wizards live in
`app/`.

## Format

`.houstonagent` = zip with this layout:

```text
manifest.json                      # version, agent meta, counts, anonymized flag
CLAUDE.md                          # optional — always rides along when present
.agents/skills/<slug>/SKILL.md     # zero or more
routines.json                      # always present; may be []
learnings.json                     # always present; may be []
```

Sessions, chat DB, mode overlays, watcher state, OS keychain, provider
tokens — never in the zip by construction. The writer only knows the four
shareable surfaces. New surfaces must be added to
`houston_engine_core::portable::export::gather_inventory` explicitly.

Format versioning lives in `manifest.format_version` (currently `1`).
Older Houston builds reject anything they don't recognise; newer builds
treat unknown entries as forward-compat (logged, ignored).

## Crate boundaries

| Crate | Role |
|-------|------|
| `houston-agent-portable` | Pure format. Zip writer + reader + selection + manifest schema. No engine deps. |
| `houston-engine-core::portable::export` | Reads CLAUDE.md / skills / routines / learnings off disk into the portable inventory, builds the zip. |
| `houston-engine-core::portable::import` | Parses uploaded zip, caches it by `package_id` (in-memory, 15-min TTL), materialises a real workspace agent on install. |
| `houston-engine-core::portable::anonymize` | Regex-based redaction pass (emails, paths with username, phones, URLs, Slack handles). Trait-based — Haiku impl is the v2 upgrade. |
| `houston-engine-core::portable::scan` | Heuristic threat scan (exfiltration, prompt injection, tool abuse, suspicious shell, external callback). Trait-based — Haiku impl is v2. |
| `houston-engine-server::routes::portable` | HTTP surface. |

## Wire protocol

All routes accept `?agentPath=` (camelCase) for per-agent endpoints.

### Export (per-agent)

```http
GET  /v1/agents/portable/preview?agentPath=...
POST /v1/agents/portable/package?agentPath=...
POST /v1/agents/portable/anonymize?agentPath=...
```

Preview returns an `InventoryPreview` (summary-shape — skill frontmatter
parsed, routine prompts truncated, CLAUDE.md down to a 280-byte excerpt +
byte count). Package returns `application/zip` bytes ready to land on
disk. Anonymize returns per-item before/after diffs the wizard renders
side-by-side.

### Import (workspace-scoped)

```http
POST /v1/store/imports/preview   # body: raw zip bytes
POST /v1/store/imports/scan      # body: { packageId }
POST /v1/store/imports/install   # body: InstallRequest
```

Preview registers the upload in the in-memory cache and returns
`{ packageId, manifest, preview }`. Scan and install operate against the
cached `packageId` so the file isn't re-uploaded between wizard screens.

## UI wiring

### Export wizard

- Entry: agent row `...` menu in the sidebar → "Share with a friend".
- Component: `app/src/components/portable/export-wizard.tsx`.
- Store flag: `useUIStore.shareAgentId` (the agent id queued for the
  wizard, or null).
- 3 screens:
  1. Pick items (CLAUDE.md is implicit; skills, routines, learnings
     per-item checkboxes).
  2. Optional anonymize, side-by-side diffs, accept / skip per item.
  3. Save → Tauri `save_portable_agent` writes bytes to user-picked path.

### Import wizard

- Entry: New Agent modal → "From a friend" card at the top of the Store
  grid (also routable via `useUIStore.setImportFromFriendOpen`).
- Component: `app/src/components/portable/import-wizard.tsx`.
- Store flag: `useUIStore.importFromFriendOpen`.
- 6 screens:
  1. Upload + optional threat scan.
  2. Name + color.
  3. Skills picker.
  4. Routines picker.
  5. Learnings picker.
  6. Required integrations (mirrors the Connections page, filtered to
     toolkits the selected items reference).

The recipient gets their OWN per-item checkboxes regardless of what the
sender included — defence in depth.

## Tauri side

Two OS-native commands. They shell out to `osascript` (macOS) /
PowerShell (Windows) so we don't take a `tauri-plugin-dialog` dep.

| Command | Purpose |
|---------|---------|
| `save_portable_agent` | Show save dialog, write bytes to chosen path, return path. |
| `open_portable_agent` | Show open dialog, read bytes, return them. |

Both live in `app/src-tauri/src/commands/portable.rs`.

## Trust contract — what NEVER leaks

`gather_inventory` reads four specific paths. Anything else under the
agent root is invisible to it:

- `.houston/sessions/**` — provider session IDs, including legacy flat
  `<session_key>.sid`.
- Chat DB (lives under `~/.houston/db/houston.db`, not the agent).
- `.houston/prompts/modes/**` — user's mode overlays.
- `.houston/connections.json` — Composio connection state.
- `.source.json`, `.migrations.json` — bundled-package metadata.
- Any other dot-file or future surface that doesn't match the four
  shareable paths.

The integration test
`engine/houston-engine-server/tests/portable.rs::package_returns_zip_bytes_excluding_sessions`
plants a `secret-session-id` in `.houston/sessions/` and asserts it is
absent from the response body, making this property part of the test
suite rather than a comment.

## Anonymize + scan: v1 is regex, v2 is LLM

Both passes use heuristic regex matching today. The traits accept a
provider object so a Haiku-driven implementation can swap in without
changing the wire contract or the wizard. When that lands:

- `AnonymizeProvider::anonymize_text(text) -> redacted`
- `ScanProvider::scan_body(body) -> [findings]`

The wizard does not surface a "Houston says it's safe" affirmative — the
scan banner only ever shows "found nothing obvious" or "flagged N
items", with the disclaimer that the review may have missed concerns.
False negatives are not recoverable; we frame accordingly.

## Open follow-ups

- Routines need an integrations picker UI so user-authored routines (not
  just packaged ones from the Store) can declare their toolkits. The
  data field exists everywhere; the UI just defaults to `[]`. Tracked
  as a separate task.
- Anonymize / scan are regex-based; Haiku integration is the v2 upgrade.
- Short-link sharing through `tunnel.gethouston.ai` is a v2 option
  (skip the "email a file" step entirely).
- Section-level CLAUDE.md picking — today the whole file is in-or-out.

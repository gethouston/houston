# Portable Agents (Export a copy / import a shared agent)

How a Houston user packages an agent into a single `.houstonagent` file and a
recipient imports it into their workspace. Pure format work lives in
`packages/domain`; the host exposes the routes; the wizards live in `app/`.

## Format

`.houstonagent` = zip written by `packAgent` (`packages/domain/src/portable.ts`,
fflate):

```text
manifest.json                  # always
CLAUDE.md                      # optional — present whenever the agent has one
skills/<slug>/SKILL.md         # one per included skill
routines.json                  # only when at least one routine is included
learnings.json                 # only when at least one learning is included
```

- **Four surfaces by construction.** Sessions, chat DB, mode overlays, watcher
  state, OS keychain, provider tokens can't get in: `packAgent` takes a
  `PortableContent` (`claudeMd`, `skills`, `routines`, `learnings`) and nothing
  else, and the only thing that fills it is `gatherPortableContent`
  (`packages/host/src/routes/portable-content.ts`), which reads exactly
  `CLAUDE.md`, the named skills, routines, and learnings off the vfs. A new
  shareable surface must be added there explicitly.
- **Provenance is stripped on BOTH legs.** Learnings lose `taught_by` /
  `mission_id` / `mission_title`; routines lose `setup_activity_id` /
  `created_by`. Those name people and conversations in the *exporter's*
  workspace — meaningless and not ours to publish on the other side. Applied on
  pack AND unpack, so a hand-built archive can't smuggle them in either.
- **Versioning** is `manifest.formatVersion` (`PORTABLE_FORMAT_VERSION = 1`,
  `packages/protocol/src/domain/portable.ts`). `unpackAgent` throws with an
  upgrade hint on a higher version and on a missing/unparseable manifest;
  malformed routine/learning entries are dropped rather than installed-then-vanished.
- Manifest fields: `agentName`, `description?`, `exporter?`, `houstonVersion`,
  `createdAt`, `anonymized`, `formatVersion`.

## Wire protocol

Agent-scoped routes take the agent id **in the path** and dispatch through
`packages/host/src/routes/agents.ts`. There is no `?agentPath=` query param.

### Export (agent-scoped)

```http
GET  /agents/{agentId}/portable/preview      # routes/portable-preview.ts
POST /agents/{agentId}/portable/export       # routes/portable.ts → application/zip
POST /agents/{agentId}/portable/anonymize    # routes/portable-anonymize.ts
```

Preview returns a summary-shape `PortableInventoryPreview` (skill frontmatter
parsed, routine prompts truncated, CLAUDE.md excerpted). Export's body is
`{ selection, overrides?, meta? }` — `overrides` carries the anonymize diffs the
user accepted, `meta.anonymized` stamps the manifest — and the response is the
zip bytes. Anonymize returns per-item before/after diffs the wizard renders
side-by-side; it is read-only (nothing on the agent changes).

### Import (account-level)

```http
POST /v1/portable/preview          # raw zip bytes → { manifest, inventory }
POST /v1/portable/install          # { archive: base64, agentName } → new agent
POST /v1/portable/fetch-from-store # { url|slug } → { manifest, content }
```

`/v1/store/imports/*` does not exist.

### No server-side cache — unpacking is IN-BROWSER

The shipped client never uploads the zip. `packages/web/src/engine-adapter/portable.ts`:

- `previewUpload` runs `unpackAgent` **in the browser** and parks the package in
  an in-memory `uploads` Map under a `crypto.randomUUID()` `packageId`.
- `scanUpload` runs the same pure `scanContent` from `@houston/domain` over the
  parked package — no round-trip.
- `install` filters the parked package by the wizard's selection and creates an
  ordinary agent with the content as its seed payload (`POST /agents` via
  `createAgent`), then drops the entry.

So there is no TTL, no staged upload, and no pod-volume storage on cloud — the
same pipeline works on desktop and hosted. The host's own `/v1/portable/*`
routes run the identical `@houston/domain` code for any client that does want a
server-side path.

## UI wiring

### Export wizard — 5 steps

- Entry: sidebar agent row `...` menu → **"Export a copy"** (`portable:exportMenu`),
  wired as `onShareAgent` in `use-sidebar-teams-model.ts`.
- Component: `app/src/components/portable/export-wizard.tsx` (orchestrator +
  footer; step bodies are sibling files).
- Store flag: `useUIStore.shareAgentId` (the agent id queued for the wizard, or null).
- Steps (`type Step`), dots follow the active path:
  `pick → anonymize → review → { Save file | listing → share }`.
  An already-published agent opens straight into `ManagePublication`
  (update / remove) instead of `pick`.
- Save goes through the Tauri `save_portable_agent` command.

### Import wizard — 5 steps

- Component: `app/src/components/portable/import-wizard.tsx`.
- Store flag: `useUIStore.importFromFriendOpen`. Opened by the Agent Store's
  one-click install (`store-view/use-store-install.ts`) and the
  `houston://store/install` deep link (`app/src/lib/store-install-deeplink.ts`),
  which seed it via the one-shot `importSeedPreview`. There is no longer a
  "from a friend" card in the New Agent dialog (PRODUCT-1171).
- Steps (`type StepId`): `upload | name | skills | routines | learnings`.
  1. Upload a `.houstonagent` (or paste a store link) + optional threat scan.
  2. Name + color + provider/model (helmet preview).
  3. Skills picker    — skipped when the package has none.
  4. Routines picker  — skipped when the package has none.
  5. Learnings picker — skipped when the package has none.
- There is **no integrations screen**.

The recipient gets their OWN per-item checkboxes regardless of what the sender
included — defence in depth. CLAUDE.md always rides along; the wizard exposes no
toggle for it.

## Tauri side

Two OS-native commands in `app/src-tauri/src/commands/portable.rs`:

| Command | Purpose |
|---------|---------|
| `save_portable_agent` | Save dialog, write bytes to the chosen path, return path. |
| `open_portable_agent` | Open dialog, read bytes, return them. |

The dialogs themselves are `super::dialogs::{save_dialog, open_dialog}`
(`commands/dialogs.rs`), shared with the Files-tab download command: they shell
out to `osascript` on macOS and PowerShell/WinForms on Windows so we don't take
a `tauri-plugin-dialog` dep. Other platforms return a clear "not implemented"
error.

## Publish to the Agent Store (the hosted path)

Beside "email a file" there is a second destination for the same gathered
content: publish it to the public Agent Store at `agents.gethouston.ai`. Instead
of writing a `.houstonagent` zip, the host turns the portable content into an
AgentIR and the app POSTs it to the gateway, which hands back a share URL anyone
can install from. The recipient side reuses this doc's import wizard verbatim (a
store link resolves to the same portable content shape via
`POST /v1/portable/fetch-from-store`). Full architecture, the AgentIR 2.0.0
shape, the store API + host publish routes, and the visibility model live in
`knowledge-base/agent-store.md`.

The one piece of store state that stays on the machine is the **publication
record** at `<agentRoot>/.houston/store-publication/store-publication.json`. It
carries NO secret (ownership is account-based via the user's GCIP bearer, no
manage token) and is machine-local by construction: it is not one of the four
surfaces `gatherPortableContent` reads, so it can never ride out in an export.

## Trust contract — what NEVER leaks

`gatherPortableContent` reads four specific things. Anything else under the
agent root is invisible to it:

- `.houston/sessions/**` and `.houston/runtime/sessions/**` — provider session
  IDs, including legacy flat `<session_key>.sid`.
- Chat DB (lives under `~/.houston/db/houston.db`, not the agent).
- `.houston/prompts/modes/**` — the user's mode overlays.
- `.houston/connections.json` — Composio connection state.
- `.source.json`, `.migrations.json` — bundled-package metadata.
- `.houston/store-publication/store-publication.json` — the Agent Store
  publication pointer.
- Any other dot-file or future surface that isn't one of the four shareable ones.

The property is enforced by construction (the gatherer names its four reads) and
pinned by tests: `packages/domain/src/portable.test.ts` —
`"an empty selection packs just the manifest"`,
`"machine/account-local routine keys never cross the share boundary"`,
`"a shared learning carries its text, never its provenance"` — plus the host's
round-trip and selection tests in `packages/host/src/routes/portable.test.ts`.

## Anonymize (AI, shipped) + scan (regex v1)

**Anonymize runs a real model pass** (PRODUCT-727). `POST .../portable/anonymize`
gathers the selected content, regex-pre-redacts it (`packages/domain/src/anonymize.ts`
plus the secret redactor, so the model never sees raw emails, paths, or
credentials), then runs the AI redactor inside the agent's own runtime
(`packages/runtime/src/session/anonymize.ts`) where the provider credential
lives; `packages/domain/src/anonymize-ai.ts` flattens items out and merges the
model's redactions back into the wizard's side-by-side diffs. When the AI pass
can't run — no channel support, no provider connected, unparseable reply — the
regex-only result ships **with the reason** (`mode: "patterns"`, `aiError`) so
the wizard can say so. No silent downgrade.

**The threat scan is still v1 heuristics** (`packages/domain/src/scan.ts`):
exfiltration, prompt injection, tool abuse, suspicious shell, external callback.
Calibration leans noisy — false positives are dismissible, false negatives are
not.

The wizard never surfaces a "Houston says it's safe" affirmative. The scan
banner only ever shows "found nothing obvious" or "flagged N items", carrying
the disclaimer that the review may have missed concerns.

# Paths: `.houston/runtime/**` and root-level objects

`dataRel` = `workspaces/<Ws>/<Agent>/.houston/runtime` on the standing layout.
Same columns as [paths.md](paths.md); flags point into
[divergences.md](divergences.md).

## Conversations and sessions

| Path | Source of truth | Worker reads from | Worker writes to | Projected doc | Served asleep from | Claim | Flags |
|---|---|---|---|---|---|---|---|
| `conversations/<encodeURIComponent(cid)>.json` (whole file rewritten per append; no index file, listing is a dir scan) | authority `file`: store. Authority `database`: Postgres `conversations` + `conversation_messages` (`conversation_turns` is the idempotency spine); the file is still written | T: hydrate. O(conversation): hydrate. O(route/settings/credential): excluded | T: store, only its own `<cid>.json`. O(conversation): store (rename/delete) | transcript rows, not a doc. T: user row eagerly on the `user` frame, assistant row after sync-back (`PUT .../transcripts/.../conversations/<cid>` with claim headers). O(conversation): mirrors rename/delete. P: `HttpTranscriptShadow` queue | `GET conversations`: Postgres when `database` (not asleep-gated). `GET conversations/<cid>/messages`: Postgres; missing conversation is a gateway 404, no wake. `PATCH`/`DELETE`: O(conversation). `POST .../messages`: pool send. `.../events`: turnlog tail | conversation id | D8 D9 D10 D11 |
| `sessions/<cid>/<ts>_<sid>.jsonl` (pi session; file appears only once an assistant message exists) | store | T, O(conversation): hydrate. Others excluded | T: store, its own `sessions/<cid>/**`. O(conversation) delete removes the dir | none | no gateway read or write | conversation id | - |
| `backends/claude/sessions.json` (conversation to Claude SDK session map) | store; the transcripts it points to live outside the agent dir under `claude-login/projects/**` | hydrate | never (out of every T/O scope) | none | n/a | - | D1 |

## Provider selection and endpoints

| Path | Source of truth | Worker reads from | Worker writes to | Projected doc | Served asleep from | Claim | Flags |
|---|---|---|---|---|---|---|---|
| `settings.json` (`{activeProvider?, models?, effort?}`) | store | T: hydrate, read by `resolveTurnModel`. O(settings/credential/conversation): hydrate. O(route): excluded. The gateway dispatcher also GETs this single object to pick the provider for a pool turn | T: never. O(settings): store, exactly this file plus `custom-endpoint.json` | none. It feeds `isActive`/`activeModel` in the `providers` view, but a settings op returns `events: []`, so nothing re-captures | `PUT settings`, `POST settings/claim`: O(settings). `claim` carries the gateway-computed connected set because a worker has no `auth.json` | agent-ops | D2 D18 |
| `custom-endpoint.json` (OpenAI-compatible endpoint, no api key inside) | store; org-shared twin is a Postgres row served at the pod shared-endpoint route | as `settings.json`; T reads it in `buildActiveCustomModel` | O(settings): store | none | `POST providers/openai-compatible`: wake | agent-ops | D2 W3 |
| `qwen-region.json` (written beside the key on a Qwen connect) | store | T: hydrate, read per turn | never: not in `settingsOpFiles`, which is why a Qwen api-key op declines to the pod | none | Qwen `credential/api-key`: declines, wakes | - | D2 |
| `models.json` (pi `ModelRuntime` store) | store | T: hydrate | T: written locally, never synced back | none | n/a | - | D1 |

## Credentials (never in the store)

| Path | Source of truth | Worker reads from | Worker writes to | Projected doc | Served asleep from | Claim | Flags |
|---|---|---|---|---|---|---|---|
| `auth.json` | gateway credential tables (`org_credentials`, `user_credentials`); the file is a per-process materialisation | never hydrated (unconditional suffix exclude). T and title ops write it locally from the credential that rides the request | never | none | `auth/status`: synthesized from the `providers` view plus credential store plus connect flows. `credential/capture`, `credential/forget`, `auth/<p>/logout`: credential store, no flag needed. `credential/api-key`: O(credential), writes only to the credential store | agent-ops (op); the claim explicitly denies the key | D3 W4 |
| `auth-users/<sha256(sub)[:16]>.json`, `.served-providers.json`, `.claude-storage/` (per-member scope on team pods) | credential tables | never hydrated (segment exclude, not caller-configurable) | never | none | as above | denied | W4 |
| `served-providers.json` (serve-path provenance) | pod-local | hydrated (not excluded) | never | none | n/a | - | W4 |

## Diagnostics that ride the sync

| Path | Source of truth | Worker reads from | Worker writes to | Projected doc | Served asleep from | Claim | Flags |
|---|---|---|---|---|---|---|---|
| `runtime.log` (append-only, inside the data dir) | pod-local, but excluded by nothing | hydrated on every T and every non-route O | never from T/O; P uploads it on every sync tick | none | n/a | - | D17 |
| `token-usage.json` (rewritten after every turn on P) | store | hydrated | never from T/O | none; `providers/usage` view reads it on P | `GET providers/usage`: view doc | - | D3 |

## Root-level objects (same prefix, outside any agent dir)

| Path | Source of truth | Worker reads from | Worker writes to | Projected doc | Served asleep from | Claim | Flags |
|---|---|---|---|---|---|---|---|
| `custom-integrations.json` (custom integration definitions) | store | hydrated on T and O | never from T/O; P syncs it | view `custom_definitions` (captured `GET integrations/custom/definitions`), refreshed on `CustomIntegrationsChanged` | `GET integrations/custom/definitions`: view doc. Writes (`integrations/custom/*`): wake | - | D3 |
| `custom-integration-secrets.json` | gateway custody (remote secret store) on managed pods; the file is migrated and deleted at boot | hydrated if present | never | none | n/a | - | W5 |
| `agents/` (installed agent-config library) | store | hydrated | never | none | n/a | - | - |
| `credentials.json`, `claude-login/.credentials.json`, `db/`, `shared-mirror/` | pod-local | excluded from P's hydrate and sync; a claimed turn carries only `DEFAULT_EXCLUDES`, so they would land on a worker if a pod ever uploaded them | never | none | n/a | - | D18 |
| `ws/<workspaceId>/preferences.json` (`locale`, `timezone`, `sidebar_layout`, `legal_acceptance`) | store, above the agent prefixes | not under the agent root; no op reaches it | never | none | not audited here: `/v1/workspaces/*` and `/v1/preferences/*` are account routes, outside the agent dispatch chain | - | - |

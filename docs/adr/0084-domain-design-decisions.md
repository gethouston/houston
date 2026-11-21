# Domain: design decisions

Covers `packages/domain/`: the pure domain layer over a keyed text store (`.houston` layout, schemas, cron, activities, agents, portable packages). Short file paths are relative to `packages/domain/src/`.

## Pure domain over a keyed text store

The domain's only I/O dependency is a keyed text store. The host's Vfs (memory, GCS, filesystem) satisfies it structurally, so the same domain code runs over GCS prefixes in cloud and real directories locally. Callers supply identity and the clock; domain functions stay pure.

Lives in `packages/domain/src/store.ts`, `layout.ts`.

## One JSON parse rule for every reader

Every reader of a `.houston` doc (pod read paths, doc-shadow projection, pooled-turn doc publish) parses through one function so doc-served and pod-served answers never drift. A missing file returns the fallback. A leading byte-order mark is stripped, since agents, users and editors write files and `JSON.parse` rejects a BOM. A file that exists but does not parse throws with the key named instead of resetting, because a silent reset destroys the user's data on the next save. Writes are pretty-printed with a trailing newline because people and agents read these files directly.

Lives in `store.ts` (`readJsonDoc`, `parseDocText`, `writeJsonDoc`).

## Lossless JSON salvage

Some broken docs lose nothing and are repaired: a complete value followed by trailing bytes (an overlapped write leaving a second partial copy), a raw control character inside a string (an agent's in-place edit of a long prompt), and an unescaped `"` inside a string that is not followed by a token JSON allows after a string. The repairs run in turn because these shapes appear together. Host writes are `JSON.stringify` plus atomic rename, so only outside writers produce them. Anything mangled beyond a lossless repair keeps the throw. The next save rewrites the file clean.

Lives in `packages/domain/src/json-salvage.ts`.

## Tolerant normalization with diagnostics

Agents write `.houston` files with file tools, so readers tolerate junk: entries missing identity are dropped and reported, unknown activity statuses are kept for forward compatibility, malformed mentions, contributors, server-stamped fields and manifest fields are dropped per field. Every drop surfaces a diagnostic; nothing is lost silently. A non-object `config.json` or preferences doc reads as empty rather than crashing boot.

Lives in `activities.ts`, `mentions.ts`, `contributors.ts`, `activity-stamps.ts`, `skills-manifest.ts`, `config.ts`, `preferences.ts`.

## Routine reads keep trigger routines

`normalizeRoutines` keeps a routine with a valid `trigger` and no schedule, keeps the schedule-only shape, and drops with a diagnostic any entry with both, neither, or a malformed trigger. Every save writes back only the survivors, so a reader that dropped schedule-less entries would delete trigger automations. Setting one wake mechanism clears the other, and a `null` wake key clears that side without being written (the editor sends `{schedule, trigger: null}` on every cron save). Removed keys (`timezone`, `description`) are dropped on read and ignored on update. `created_by`, `auto_paused` and `snoozed` are engine-owned: an update body can never write them, and `...current` keeps `created_by` when no verified actor is known. Pins absent mean inherit the agent's config at dispatch.

Lives in `routines.ts`, `routine-edit.ts`.

## Per-document write serialization

Every whole-file doc mutation is load, modify, save, so two concurrent writers of one doc would drop an edit (a double-fired first message once lost a board entry 70 ms apart). Writers of the same key queue on a promise chain, different keys never contend, a rejection reaches its caller without wedging the chain, and a finished tail drops its entry so the map does not grow. In-process serialization is enough because one process writes a given doc. It lives in domain because domain writers and host writers lock the same docs. Preferences writes are read-modify-write of one key under this lock.

Lives in `doc-lock.ts`, `preferences.ts`, `heartbeat.ts`.

## Preferences and heartbeat sit above agent prefixes

Preferences live at `ws/<workspaceId>/preferences.json` and the heartbeat at `ws/<workspaceId>/heartbeat.json`, above agent prefixes, so deleting an agent never touches them. Locally the FsVfs roots at the workspaces directory, so this segment is a real folder beside workspaces and anything enumerating workspaces must skip it. An absent heartbeat doc is the default (on, 08:00, never run), so no migration is needed. A bad `time` falls back to the default without forgetting that today's briefing ran.

Lives in `preferences.ts` (`PREFERENCES_SEGMENT`), `heartbeat.ts`.

## Morning briefing: seen keys, not timestamps

The briefing fires only when there is news, judged by seen keys. Each item has a key `<kind>:<agent>/<rest>` with a workspace-qualified agent id, so same-named agents in two workspaces never collide; a re-pause gets a new `auto_paused.at` and so a new key. `seen` updates only when the briefing turn finishes with a reply; admission claims the day and shows `delivered`, a failed turn keeps `seen`. Agents whose docs could not be read keep their seen keys. Sections keep a capped number of items, unseen oldest first so a cap only holds back the newest for next time, items without a timestamp count as oldest so they never starve. An empty snapshot records "quiet" and makes no model call. The cloud gateway's scheduler implements the same rule and must stay identical.

Lives in `heartbeat-news.ts`, `heartbeat-sections.ts`, `heartbeat-snapshot.ts`, `heartbeat-briefing.ts`.

## Heartbeat clock

The runtime does not know the user's timezone, so the host computes the local date and time with Intl (DST is whatever the zone database says) and the prompt carries it. The zone is the account-wide `timezone` preference, else the host zone; an invalid zone must not stop a briefing. Due means at or past the chosen time and not yet run on this local date, so a missed day is never replayed.

Lives in `heartbeat-clock.ts`, `heartbeat-prompt.ts`.

## Cron evaluation

Cron math is pure and shared by every deployment. All routines fire in the single account-wide zone. `@every` intervals sit on an epoch grid and ignore the zone; cron's `*/16` restarts at :00 each hour while an interval keeps its cadence. Intervals longer than a week are refused, and an interval that divides its parent unit is written as cron so older readers understand it. Plan floors judge a cron by its smallest real gap, the way the gateway does, sampled from a fixed start so every device agrees. A bad timezone only surfaces when a date is computed, so validation forces one `nextRun()`. Trigger routines have no schedule and the scanner skips them. A snoozed routine's window starts 1 ms before the snooze end, so a fire exactly at the reset runs and skipped fires never catch up.

Lives in `schedule.ts`, `schedule-interval.ts`, `schedule-gap.ts`.

## Routine run completion

A run is silent when the trimmed response starts or ends with the sentinel token (case-sensitive) and `suppress_when_silent` is set. The summary strips the token and caps at 200 characters. The run-history cap lives in protocol so the object sync's merge applies the same rule. A surfaced run reuses the activity keyed by the routine's conversation. A run stays in flight only for `ROUTINE_RUN_TIMEOUT_MS`; past it reconcile errors it and the pooled worker's busy gate stops honouring it.

Lives in `schedule.ts`, `routine-runs-doc.ts`, `routine-run-in-flight.ts`.

## Fired routine prompt

A fired run is framed as an execution, because a prompt that reads like a scheduling ask ("Every hour, post two quotes") otherwise triggers the product prompt's routine-creation guidance and the agent saves a duplicate routine. Trigger payloads are third-party content and trigger runs use Autopilot with live tools, so the event block is delimited and labelled as data, never instructions, and `</` inside embedded JSON strings becomes `<\/` (same JSON semantics) so a payload cannot close the block early.

Lives in `routine-prompt.ts`.

## Auto-pause after repeated fixable failures

A routine whose latest runs all failed on the same wall a person must clear (no account, expired login, no credits, a model the account cannot run) stops firing until resumed, because each fire is a paid sandbox turn. The threshold is 10 consecutive same-kind failures: on 30 days of fleet data 10 paused 444 routines and cut 84% of failed-turn spend, 5 saved only 2% more while pausing twice as many routines that recovered on their own, and 20 let a daily routine fail for three weeks. It is a count, not a time. The streak is read from `routine_runs.json`, which both execution paths already write, so no counter lives elsewhere. Rate limits, outages, network blips and overflowing conversations do not count; expired fires neither add to nor break a streak; a usage limit snoozes instead.

Lives in `routine-auto-pause.ts`.

## Snooze on usage limits

A usage-limit failure holds the routine until the provider's reset, which clears by itself. With no usable reset the hold is one hour (at most twelve fires a day for a 5-minute routine); a reset further than a week out is a misread and is capped. Only scheduled routines snooze, only runs on the creator's own account count, only while the run still describes the routine (no later edit, same provider and model through the routine pin mapping), and a longer existing hold is kept. `updated_at` is left alone because it starts the auto-pause streak. A run that answers on the creator's account lifts the snooze; a model or provider change and a resume clear it.

Lives in `routine-snooze.ts`, `routine-edit.ts`.

## Conversation addresses for records

Mission and routine conversations have product-decided ids, defined once so guards can tell them from chats the person started. macOS and Windows resolve file names case-insensitively, so `ACTIVITY-m1` and `activity-m1` are one transcript and are treated as one. A mission is addressed by its explicit `session_key` and by the convention id, both on purpose. Routine runs use one conversation per routine (`shared`, default) or a fresh one per run (`per_run`). The conversation's turn mode comes from the mission card's `mode`; junk is not a mode.

Lives in `conversation-keys.ts`, `conversation-mode.ts`.

## Skills on disk

Skills live at `<root>/.agents/skills/<slug>/SKILL.md`, the same folders pi loads. Identity is the directory slug, not frontmatter `name:`, because detail loading and `GET /skills/<slug>` resolve by directory; the title is display-only so a drifting title never 404s. YAML 1.1 reads `featured: yes` as true and YAML 1.2 as the string "yes"; both exist in user files and are normalized. A nested helper file is not a skill. Workspace-shared skills live at the shared root (cloud `ws/<org>/shared`, local `<Workspace>/.shared`) with the same layout; a per-agent manifest in agent data selects which it loads.

Lives in `skills.ts`, `layout.ts`, `skills-manifest.ts`.

## Skill workflow parsing

The app shows a Houston-authored skill's marked workflow section as steps. Bodies are hand-written, so many shapes are accepted: bold titles, spaced dashes or colons as separators, subheadings when there is no list. Long titles move their tail into the detail at the latest clause boundary. Heading numbering is dropped because the panel numbers steps. Only a bold title can carry a `[toolkit]` or `[toolkit:ACTION]` tag, and a toolkit needs a letter so `[2024]` is not a tag. Regex lookbehinds anchor at the start of a run so long runs of spaces or dots are not rescanned from every position. The bundled catalog is the parser's real corpus.

Lives in `skill-workflow.ts`, `skill-workflow-text.ts`, `skill-workflow-tag.ts`.

## Job description file

`CLAUDE.md` is a YAML frontmatter block (`industry`, `role`) plus the free description. Unknown keys and known keys holding a map or list ride along in file order so a rewrite never drops another writer's work; a carried key the user has since answered is dropped because two lines under one key corrupt YAML. A body that only opens with `---` is plain text. A BOM or leading blank line above the fence is tolerated. Both fields blank and nothing to carry means no block. The serializer keeps one line per key. Typed answers are capped like agent names, counted in code points, invisible formatting stripped first.

Lives in `job-description.ts`, `job-description-yaml.ts`, `job-role.ts`.

## First day

The first-day prompt is built on the host so every surface sends the same words. Its language directive is explicit because the whole first message is hidden and a new agent has no chat to infer language from. The user has already read the hello (rendered from the name and job), so the prompt quotes it back and forbids greeting again. Ideas lead with repeatable work offered as tappable options, since a process the agent owns becomes a saved skill. The setup task carries a `houston:`-namespaced mode sentinel that cannot collide with a user mode. First-day config fields are host-owned once the agent exists: incoming writes keep the stored values, because a surface writes the whole config from a possibly older read. The config seed rides in the create request.

Lives in `first-day-prompt.ts`, `first-day-greeting.ts`, `first-day-mode.ts`, `first-day-config.ts`, `first-day.ts`.

## Legacy setup directive

Earlier builds wrote a marked "send one real email now" section into `CLAUDE.md` and only removed it when the flow ended. The cleanup removes complete marked sections idempotently and leaves a begin marker with no end alone, since guessing where user text resumes is worse.

Lives in `legacy-setup-directive.ts`.

## Agent names

One rule for every layer. Names are directory names, so path separators, `..`, control characters and a leading dot (which the directory scan skips) are refused. Two names collide when trimmed, NFC-composed (APFS treats composed and decomposed as one) and lowercased (macOS and Windows) keys match. The AI Manager's name is reserved so "ask Houston" stays unambiguous; containing it is fine, and an agent already holding it keeps it on rename.

Lives in `agent-name.ts`.

## Agent colours

Ten palette ids in wheel order, which is the display order of every picker, so too-close neighbours are visible. Domain owns them because the UI pairs them with token hexes and the host validates assistant colour values against them.

Lives in `agent-color-ids.ts`.

## Provider dialect and visibility

Houston shows OpenAI's Codex subscription as `openai`; pi and every stored pin call it `openai-codex`. All presentation translates through one map so icon and label never disagree. Unknown ids pass through because the pi catalog is open (about 35 providers and drifting). Hidden providers are dropped before the rename: pi's raw api-key `openai` (collides with the rename), retired cards, and providers that cannot connect with a single pasted key. Regional deployments are hidden when the standard deployment ships, unless the regional one is the only one or its parent is itself dropped.

Lives in `provider-dialect.ts`, `provider-visibility.ts`, `provider-ids.ts`.

## Provider and model migration

Stored `(provider, model)` pairs migrate through one pure, table-driven ladder. Lookups use `hasOwn` because the tables are object literals and a stored `constructor` would otherwise read a prototype function. Known ids pass, legacy aliases map at the same tier and never upgrade (a retired Claude id maps to its own family's lineup model; Spark maps to the small tier; renames keep Pro on Pro), open-catalog gateways pass any id through, and an unmappable model drops so the provider's default applies. Any substitution, including a config gaining a model, is reported as a diagnostic. The fallback provider is Codex, the cloud default. Aliases are per provider because the same bare id means different things on different providers. Alias rows record which pi release dropped which id and why the successor is the same price tier.

Lives in `provider-model.ts`, `model-aliases.ts`, `model-aliases-gateways.ts`, `provider-valid-models.ts`, `routine-pin.ts`, `minimax-retired.ts`.

## Default model per provider

One default per provider shared by picker, runtime and migrations. Each default must be a row the provider actually serves, because a default the backend refuses breaks every provider-only pin and, for providers whose key verifier probes the default, breaks connect itself. Notable rows: Codex's cheapest served gpt-6 tier (also stated as `CODEX_DEFAULT_MODEL` in the runtime and pinned together by a test); Bedrock uses the `global.` inference-profile id because Claude 4.x is served only through profiles; MiniMax uses the one model both key kinds serve; NVIDIA serves models per account, so the default and the verifier fallbacks must stay in sync; Alibaba, Mistral and Azure need explicit rows because pi's alphabetical first row is wrong. `openai-compatible` is absent, not empty, because an empty string stops every `?? models[0]` fallback.

Lives in `provider-default-models.ts`.

## Provider and model choice from agent input

Identifiers are never guessable: an agent that wrote "codex" or "openai" once got `unknown provider` with no hint. One resolver accepts ids, display names and aliases case-insensitively and otherwise refuses with the connected options listed, so the tool and the host route share one vocabulary. Spoken model names ("Luna", "Opus 4.6", "sonnet") resolve by in-order word runs, and a bare family name takes the newest row (table order is behaviour) and says which it picked. Retired names resolve to nothing. Lists are capped with named rows first and a count of the rest.

Lives in `provider-choice.ts`, `provider-model-display.ts`, `model-display-names.ts`, `model-humanized-name.ts`.

## Model display names

One table of user-facing names keyed by canonical id, newest first within a family. Copilot rows name the lab because one plan serves several. Uncurated ids get a derived name: consecutive digit segments form one version (`4-5` is 4.5), a trailing 8-digit date reads as ISO, vendor prefixes drop, acronyms upper-case.

Lives in `model-display-names.ts`, `model-humanized-name.ts`.

## Subpath imports for plain Node loading

Leaf modules (`provider-dialect`, `model-humanized-name`, `job-description-yaml`, `job-role`, the first-day prompt's dependencies, the capability index renderer) are imported by package subpath, not extensionless relative paths, because the catalog generator, app unit tests and the e2e fake host load them under plain `node --experimental-strip-types`, which does not resolve extensionless specifiers, and domain emits so `allowImportingTsExtensions` is unavailable.

Lives in those modules' import lines.

## Portable agent packages

A `.houstonagent` is a zip of shareable content; packing is pure and the host filters and does I/O. Unpack runs routines through the same normalization as the store read so an entry the store would drop never reaches the preview. Machine- and account-local keys do not travel: setup chat ids, `created_by`, a learning's `taught_by` and source mission, a routine's webhook `key_prefix`. Installed routines get fresh ids, because the gateway's trigger and webhook tables are keyed by `routine_id` alone and two agents sharing one would fight over the row; the old-to-new map lets the caller carry routine chats across.

Lives in `portable.ts`, `portable-edit.ts`, `portable-strip.ts`, `portable-install-identity.ts`.

## Package scan

The scan of uploaded packages is a pattern-based port of the Rust engine's `portable/scan.rs`. The disclaimer field stays on the wire for protocol compatibility while the app renders its localized copy, so both must say the same. The curl pattern stops at the next `curl` to avoid rescanning the rest of the body.

Lives in `scan.ts`.

## Reactivity classification

One mapping from agent-relative path to event, shared by the host's file watcher and the engine adapter's write-through echo so they never disagree. `routine_runs` is tested before `routines` because of the prefix overlap. `.git/**` and `.DS_Store` raise nothing.

Lives in `reactivity.ts`.

## Mentions aggregate

Mentions are latest per person, never a log, capped by dropping the oldest `at` first and restoring file order. ISO `at` strings order lexicographically. Re-stamping the same person, instant and author returns the same reference so the caller skips the write.

Lives in `mentions.ts`.

## Activity updates

`null` provider or model deletes the pin so the engine's resolution applies. PATCH bodies are unchecked input at runtime: an old top-level `{kind, questions}` interaction shape has no `steps` and is ignored, and closing a mission answers what it waited on. Both rules live once in protocol.

Lives in `activities.ts`.

## Assistant coordinator handshake

Whether a runtime is the coordinator is decided by the host, which stamps one environment variable at spawn, never inferred from the working directory (a managed pod provisions the assistant under `/workspace` with an ordinary name). Anything other than the exact value means not coordinator. The host also stamps the comma-joined names of operations this deployment does not serve (catalog names are `[A-Za-z0-9.]+`, asserted by a test), so the manager does not offer gateway-only features on a desktop. Uploads land in one folder that the runtime opens to the coordinator, so its name is shared in domain.

Lives in `assistant-role.ts`, `assistant-deployment.ts`, `uploads-dir.ts`.

## Assistant catalog shape and callability

The catalog wire shape is written by `pnpm gen:assistant-catalog` and embedded in the host. Paths are full and sent verbatim. Parameters carry where their values come from (the listing operation, the live directory the host resolves against) because a schema says the shape, not which value. One predicate decides what the assistant may offer: `hidden` operations are never listed, described or called, and `route: null` operations are refused by the dispatcher, so listing them would promise actions the build cannot perform. The capability index is rendered by one function at generation time and at runtime over the served subset, so wording cannot drift. Cards for hidden operations are named in user words, `request_hands_on` names screens per surface.

Lives in `assistant-catalog-types.ts`, `assistant-catalog-callable.ts`, `assistant-capability-index-render.ts`, `assistant-hands.ts`.

## Interrupted turn resume age

An interrupted turn is rerun automatically only within two hours: long pod turns ran about 31 minutes before eviction plus up to 8 minutes of drain, and a desktop relaunched days later must not spend tokens on last week's task. Past it the chat keeps the "say continue" line.

Lives in `turn-resume-age.ts`.

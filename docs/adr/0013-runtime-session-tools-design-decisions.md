# Runtime session tools: design decisions

Decisions and external constraints behind the custom tools the pi runtime gives an agent (`packages/runtime/src/session/tools`). Grouped by tool family. Each section states the rule, the reason, and where it lives.

## Shared conventions

### Refusals are results, not throws
A thrown exception reaches the model as one opaque string, and most tool failures are things the model can correct on its own turn (it named the wrong agent, left a param out, searched for nothing). So the assistant family, the mission tools and their siblings return a result carrying a named code and a sentence that says what to do next. The text leads with `ERROR` so a model skimming the transcript cannot read a refusal as a success. `assistant-result.ts` (`AssistantErrorCode`, `assistantErrorResult`), `tool-error.ts` (`SessionToolErrorCode`, `toolErrorResult`).

### Not-done results are marked errors on the wire
A tool that refuses by returning a result looks like a success to the agent loop. `reportsNotDone` keys on `details.ok === false`, and the backends mark such a call an error on the wire, so every surface sees the call did not happen. `assistant-result.ts` (`reportsNotDone`), `browser/errors.ts`.

### Host error bodies are relayed verbatim
The host's error bodies for the proxying tools (invalid URL, duplicate name, bad cron, memory full, unknown agent) are written to be agent-actionable, so they are relayed as the refusal text and the model can explain or self-correct. `custom-integrations.ts`, `save-routine.ts`, `save-learning.ts`, `mission-transcript.ts`, `tool-error.ts` (`hostErrorFrom`).

### Tool names travel with tool objects
pi exposes only the intersection of the allowlist names and the registered tool objects; a name with no object behind it is invisible to the model with no error anywhere. Each tool module exports its name constant beside the object, and the assistant family builds `houston_recall` alongside the catalog tools so the object list cannot drift from `ASSISTANT_TOOL_NAMES`. Name-only modules (`mission-tool-names.ts`, `browser/name.ts`) exist so tool selection can name a tool without loading its body and transport. `assistant.ts` (`makeAssistantTools`), `integrations.ts`, `custom-integrations.ts`, `ask-user.ts`, `suggest-reusable.ts`, `plan-ready.ts`.

### Mode is read live at execute time
A session's toolset is built once per turn, and the user can flip the Mode pill while the turn runs. Tools that change something read the live mode when they execute: integration execute and connect, custom-integration add, `run_code`, `edit`/`write` and non-read `houston_call` refuse once the chat is in Plan; `ask_user` refuses once it is in Autopilot. A session built in plan mode never exposes the mutating tools, so these gates only fire on a mid-turn switch. `request_credential` re-checks after its awaited pre-flight, since the switch can land during the round trip. The host also checks the live mode before a write. `assistant-plan-gate.ts`, `clamped-fs.ts`, `integrations.ts`, `custom-integrations.ts`, `run-code.ts`, `ask-user.ts`, `request-credential.ts`, `assistant-call.ts`.

### Acting identity and conversation come from the turn scope
The acting-as header and the conversation id ride request headers taken from the turn's AsyncLocalStorage scope, never from tool arguments: the host stamps attribution and provenance from them and enforces self and depth guards, none of which an agent may author. Absent outside a turn, the host acts as the owner and stamps nothing. `integrations.ts` (`post`), `mission-call.ts`, `save-routine.ts`, `save-learning.ts`.

### Proxying tools hold no secret
Every host-proxying tool (integrations, custom integrations, missions, routines, learnings, `houston_call`) carries only the per-sandbox HMAC token to a `/sandbox/*` route. The host, or the cloud gateway behind it, holds the provider keys and makes the real call, so nothing on the agent's machine can hand a secret to the model. `sandbox-fetch.ts`, `integrations.ts`, `custom-integrations.ts`, `missions.ts`, `assistant-call.ts`.

## Connected apps (integrations*.ts)

### Host signals are classified on the stable code, never the bare status
The host tags its own actionable states with a `code` on the JSON error body: `signin_required` (409), `integrations_not_configured` (503), `toolkit_not_allowed` (403), `not_assigned` (403). A relayed upstream failure during an outage carries the upstream status and body and no code, so classification keys on the code and anything uncoded falls through to the generic error. `signin_required` queues a sign-in step in this turn's interaction flow; `toolkit_not_allowed` and `not_assigned` are user-fixable permission states turned into returned guidance (both tools handle `not_assigned`). `integrations.ts` (`signalCode`, `ToolkitNotAllowedError`, `NoAgentAccessError`, `makeIntegrationTools`).

### A stale action slug is recovered by searching again
Composio's `Tool_ToolNotFound` means the executed slug does not exist at the current tool version: a search result remembered from earlier in a long chat, or an invented name. The provider 404 arrives wrapped in a relayed 5xx (502 via the gateway, 500 via the direct adapter) whose body keeps the slug verbatim, so the slug is the key, not the status. The tool returns the mechanical recovery (search again, use a fresh slug) so the task completes in the same chat instead of the model telling the user integrations are broken. `integrations.ts` (`ActionNotFoundError`).

### Unclassified refusals are redacted
A 4xx body is gateway or provider JSON written for engineers; the model paraphrases whatever it is given straight at the user. So an unclassified 4xx keeps only its status and any unrecognized code; a 5xx keeps its body, which is diagnostic. The `not_assigned` guidance is Houston's own sentence naming where a manager fixes access, because the gateway's wording is internal jargon. `integrations.ts` (`makeIntegrationTools`, `NO_AGENT_ACCESS_GUIDANCE`).

### Toolkit slugs are normalized
A toolkit slug is trimmed and lowercased to match the connection and catalog lists the app's connect card compares against (`normalizeToolkitSlug` in the app). A raw comparison misses a real connection and leaves the card stuck on "Connect". `integrations.ts` (`normalizeToolkitSlug`).

### Result ceilings
Both backends cut a long tool result to its first 8k characters and save the whole result in the agent folder (`session/tool-results/cap.ts`), so the execute ceiling only bounds that file and the session record; app APIs can return documents over 1 MB. Search results get a much tighter backstop (about 24 KB): they are a pick-list and must fit the tool-result budget. Because only the head is guaranteed to be read, the rules and notes lead a search result and per-row detail is spent on the best matches first, with rows past the cap counted rather than rendered. `integrations.ts` (`MAX_RESULT_CHARS`, `boundResultText`), `integrations-search-result.ts`, `integrations-render.ts`, `integrations-schema-details.ts`.

### App JSON is rendered one record per line
An app result stays on one line when it fits, otherwise opens one level with a one-space indent. Two-space pretty printing spent 30 to 57 percent of typical app payloads on whitespace, so fewer records fit the head; short lines still matter because the model reads a spilled result by line offset. Depth is bounded because each level re-stringifies its subtree. `integrations-json.ts`.

### Provider schemas are walked with a depth bound
Schemas are provider data, and custom MCP schemas can nest thousands of levels, which overflows the stack. Schema walks resolve references against the original root with a depth bound and stop at value keys (`default`, `examples`, `enum`). `integrations-schema-node.ts`, `integrations-schema.ts`, `integrations-file-params.ts`, `integrations-render.ts`.

### File arguments read as a workspace path
Composio describes file arguments as `{ name, mimetype, s3key }`, and agents put their own path in `s3key`, so every attachment upload failed. The host stages a workspace file itself (`packages/host/src/integrations/file-staging.ts`), so the model is shown a plain path string, the same rewrite Composio's own SDK applies for agents. `integrations-file-params.ts`.

### The search scope decides what may be claimed
The host sets `unscopedFallback` when the `app` scope matched no known app and the results are an unscoped retry (other apps' actions), and `scopeIgnored` when a gateway ignored the scope. In either case the result leads with a note so the model does not present another app's action as the named app's, and an empty result under `scopeIgnored` never becomes a confident "no such app". `integrations-search-notes.ts`, `integrations.ts`.

### App status drives the speech act
The host's per-result app status (connected, connectable, blocked, unknown), not the raw `connected` boolean, decides whether the model offers a connection, sends the user to their admin, or says the app does not exist. `integrations-render.ts` (`AppStatus`).

### Account choice
The account-choice rules ride only on a search result listing several accounts. Accounts are described by identity label, else connection date in UTC (the runtime does not know the user's time zone), else an ordinal; two unnamed accounts from the same day carry their order within the day. `integrations-accounts.ts`.

### App refusals no retry can fix
Composio relays a connected app's refusal as free text in a `successful: false` result, and its `auth_refresh_required` flag stays false even for a revoked token, so the message is the only signal. Left unclassified, the model reads the failure as transient and repeats the call indefinitely. Each pattern is anchored on a real refusal body (the tests pin them); the hint for a classified refusal says not to retry and names the one way forward. Hint order is a classified refusal, then a missing connection, then a missing permission, then the parameter-lookup hint. `integrations-failure-class.ts`, `integrations.ts`.

### Reconnect cards: only for a known toolkit, once per app per conversation
A reconnect card names a toolkit only when `integration_search` reported it: the slug's first segment is wrong for multi-word toolkits (`MICROSOFT_TEAMS_*`), so a guess only names the app in prose. At most one card per app per conversation: a client that predates the step's `reconnect` flag shows a plain connect card, Composio still reports the dead connection active, and the loop of card, retry and refusal never ends. Earlier offers are found in the persisted transcript by a stable phrase, and in process memory for the Claude bridge, which hands tools no session. After the first card the user is sent to the Integrations page. `integrations-failure-class.ts`, `integrations-reconnect-once.ts`, `integrations-missing-permission.ts`.

### Missing permissions depend on why
Gmail settings writes accept only the `gmail.settings.basic` or `gmail.settings.sharing` scopes, which Composio's managed Gmail app never requests, so no reconnect helps and the guidance is manual steps (settings reads and forwarding also accept `mail.google.com` and are excluded). Other Google refusals are usually an unticked box at sign-in, so one reconnect card is offered; a refusal that survives it falls back to manual steps. Slack consent is all-or-nothing, so the person reconnects from Integrations. `integrations-missing-permission.ts`.

### The connect and credential hand-offs never block Autopilot
`request_connection` and `request_credential` record a step and end the turn with a card; the live connection or saved key auto-continues the run. A missing connection or key is the one thing autonomy cannot produce, so both stay available in Autopilot and only Plan withholds them. `request_connection` is built standalone because it needs no transport, so an assistant-only runtime can expose it. `integrations.ts` (`makeRequestConnectionTool`), `request-credential.ts`, `session/tool-selection.ts`.

### Custom integrations
The agent interviews the user and drives detect and add through the host's `/sandbox/integrations/custom/*`; the secret travels only through the card `request_credential` queues, which posts straight to the host and never enters the transcript. A slug is resolved on the host before a card is queued: a card for a slug with no definition renders but every save answers 404, a dead end the model can avoid if refused first. The setup procedure arrives in the tool results of the setup itself rather than the always-sent product prompt, so it costs nothing on turns that never set one up, and the closing step rides every result that ends the setup so it survives into the turn the saved key starts. `custom-integrations.ts`, `request-credential.ts`, `custom-integration-steps.ts`.

### Which credential surface a runtime gets
Both backends build their toolsets separately (`session/host-tools.ts`, `backends/claude/mcp-tool-set.ts`), so the choice is made in one function. The coordinator asks for keys through its own catalogued read and gets none of the custom-integration setup tools; every other runtime gets the setup family with its own `request_credential`; a runtime with no host gets nothing. `credential-tools.ts` (`credentialTools`).

## File tools (clamped-fs.ts, fs-guard*.ts)

### Workspace-clamped tools shadow pi's built-ins
pi's default read, ls, grep, find, edit and write resolve absolute paths, `~`, a leading `@` and `file://` URLs as given. Custom tools with the same names replace them (pi registers customs after built-ins). The outer wall resolves the model's path the way pi does, checks it lexically and symlink-resolved, and rewrites the tool's path param to the clamped result, so a normalization difference from pi cannot leave an allowed root; grep and find spawn rg and fd on that path, so it is their only wall. The inner wall routes edit, write, ls and grep filesystem access through guarded `operations` that re-check every path pi hands them. find keeps its fd engine because an `operations.glob` override would replace it. rg and fd run without `--follow`. An out-of-bounds path throws; it never reads as "does not exist". `clamped-fs.ts`, `fs-guard.ts` (`WorkspaceGuard.clamp`, `WorkspaceGuard.assertWritable`).

### Credential files are denied by path segment
The runtime's dataDir sits inside the workspace (`<agentDir>/.houston/runtime`), so `auth.json`, `auth-users/<hash>.json` and `claude-login/.credentials.json` resolve to legal in-workspace paths; on a shared team pod one agent could otherwise read every member's provider tokens. A deny list of segments applies under every allowed root, for reads and writes. Matching by segment survives layout changes and deliberately over-denies a user file that happens to be named `auth.json`. Segments are judged relative to the root they sit in, so a `claude-login` directory above the root cannot deny the whole tree. `fs-guard-containment.ts` (`DENIED_SEGMENTS`, `isCredential`).

### Names are compared the way the filesystem opens them
APFS and NTFS are case-insensitive by default, so names are case-folded (NFKC, which only ever refuses more). Windows opens `auth.json` for `auth.json::$DATA`, `auth.json:stream` and `auth.json.`, so stream suffixes and trailing dots or spaces are stripped from every segment on every platform for the credential rule; the path handed to the tool drops a stream suffix only on Windows, because elsewhere `:` is an ordinary name character. `fs-guard-paths.ts` (`foldName`, `stripStream`), `fs-guard-containment.ts` (`windowsName`).

### Order of checks and the proven path
Lexical containment runs first, so a path outside every root reads as out of bounds rather than denied, and the credential rule runs on the cheap lexical form before any syscall. The symlink-resolved form is then judged too, so a link inside a root cannot stand in for a credential file. The real path is the realpath of the deepest existing ancestor joined with the missing tail, so writes to new paths work. The guard returns the proven real path, not the requested one, so a link repointed between check and open changes nothing. `fs-guard-containment.ts` (`assertContained`), `fs-guard-paths.ts` (`realNearest`).

### Shared and read-only roots
The org-shared mirror is a writable root: agent edits to shared skills are edits of the org original by design, and deletion stays a human act in the UI. A pooled turn reads its org's shared skills from a throwaway snapshot, a read-only root, and a write there is refused with a message that the skill is used as it is. Protected domain stores, including the flat pre-v0.4 file the boot migration moves into the store, are changed only through their tools. `fs-guard.ts`, `fs-guard-errors.ts`.

### The narrowed wall for single-document runtimes
A runtime whose job is one document (the coordinator's memory) gets `allowedFiles` and `readableDirs` instead of whole-workspace containment, so text arriving in an attachment cannot rewrite a shared skill or the runtime's own records. Being listed is necessary, never sufficient: the path must still land inside the workspace and must not be credential material, and a listed path is matched lexically or after symlinks resolve, so neither a link nor a `..` detour can stand in for one. Readable folders are stored relative to the root and joined at check time, because an upload folder appears with the first upload, long after the guard is built. A folder match compares the real path against the canonical root, so a folder that is a link pointing elsewhere is refused. A readable folder without narrowing is a policy bug and is rejected at construction. Writes into a readable folder are always refused so one attachment cannot rewrite the next. `fs-guard-narrow.ts`, `fs-guard-errors.ts`.

### Refusal messages
Out-of-bounds, not-allowed and denied are separate error types because callers distinguish them. Each message reaches the model verbatim, so it is plain language, echoes only the path the model supplied, and the not-allowed message says what is allowed. `fs-guard-errors.ts`.

## Shell and code execution

### Bash runs with an allowlisted environment
pi's built-in bash copies `process.env` into the child, and every deployment's environment holds operational tokens (`HOUSTON_POOL_WORKER_TOKEN`, `HOUSTON_SANDBOX_TOKEN` and the control-plane URL); one `echo` would hand them to the model, on desktop as much as in the cloud. The `bash` tool shadows pi's by name and builds the child env from `{}` plus an allowlist: PATH, HOME and shell, identity, locale, temp dirs, the Windows process variables a child needs to start, and proxy and custom-CA variables. Keys are compared case-insensitively (Windows keys vary, proxy vars come in both cases) and keep their original case. The memory cap is a command prefix so the shell and everything it spawns inherit it; no cap means no prefix. With a tool shell the command runs as the deployment's unprivileged tool user, with the same env and prefix. The provider credential lives in `auth.json`, not env. `scrubbed-bash.ts`, `session/child-memory-fence.ts`, `backends/claude/claude-env.ts`.

### run_code ships code to a disposable sandbox
Instead of a local shell that would force the agent process into an always-on sandbox, `run_code` sends code to the code sandbox and gets output and files back. The transport is the only difference between deployments: server mode calls the sandbox directly with the sandbox URL, the app-layer token and a Google-signed ID token, carried in separate headers (`Authorization` for Cloud Run IAM, `X-Sandbox-Token` for the app token) because IAM consumes `Authorization`; a pooled turn worker holds none of these and relays through the gateway under the turn grant, so a worker that serves another org next keeps nothing durable. Both return the upstream `Response` unread. Two 401s share the status: a wrong app token, or a grant the gateway no longer accepts. `run-code.ts`, `run-code-transport.ts`.

### run_code details
The language list duplicates the sandbox's `LANGUAGES` (`packages/code-sandbox/src/types.ts`) on purpose: the two packages are independent services. An out-of-range timeout is clamped to the sandbox ceiling, not rejected. The run budget is injected because its scope differs: one per process (per workspace) for a long-lived runtime, one per worker shared across turns in turn mode, where a limiter built per tool instance would bound nothing. The budget keeps one workspace from taking the whole sandbox fleet's instances; release is idempotent. A clean exit that wrote to stderr is warnings. `run-code.ts`, `run-code-limiter.ts`.

### Artifact write-back never destroys a file silently
An artifact may overwrite a workspace file only when the model declared it as an input (it asked to transform that file); any other collision is saved as "name (2).ext" and reported. One bad path does not discard the others, and every outcome is reported to the model. `run-code-artifacts.ts`.

### Cloud Run ID tokens
ID tokens come from the metadata server and are cached, refreshed five minutes before expiry; an unparsable expiry counts as expired. On a dev machine there is no metadata server and the provider yields null, so only the app token is sent; enforcement is server-side, and a missing token in production surfaces as the tool call's error. `gcp-id-token.ts`.

## AI Manager operations (assistant*.ts)

### Four tools over a generated catalog
Find, read, do and remember: `houston_capabilities`, `houston_describe`, `houston_call`, `houston_recall`. A tool per operation would flood every request with hundreds of tools, and the catalog is generated, so the tools must not need edits when it grows. The search caps results because descriptions are paragraph-length; the model narrows with `group`. `assistant.ts`, `assistant-search.ts`.

### houston_call holds no credential and no approval
It carries only the sandbox token to `/sandbox/assistant/call`; the host knows the gateway, which operations it routes, and whether the user approved this exact call. Validation is duplicated on purpose: here so the model gets a correctable answer, on the host so a sandbox token alone cannot reach an unrouted or unapproved operation. There is no "confirmed" input, since an approval the model could assert is not an approval. `assistant-call.ts`.

### Confirmation is bound to the checked bytes and decided by the host
`confirm: true` operations ask the host (`POST /sandbox/assistant/pending`) for an exact-call receipt or a card; the gate runs on the checked params so the approval covers what would be sent, and the card wording comes from the host so the sentence the person reads and the bytes their yes authorizes cannot drift. A missing, spent, expired or mismatched receipt raises a fresh card rather than a dead end. No conversation means nowhere for an answer to arrive, so the call is refused. The model is told it waits; the failure this prevents is a model that confirms itself. `assistant-confirm.ts`, `assistant-call.ts`.

### Unserved and withheld operations
The host stamps what this deployment cannot perform (spaces, teams and billing on desktop); the runtime answers that before the catalog lookup so the model hears "not here" once instead of retrying an opaque gateway error. The unserved set is read from the environment per query rather than memoised, since it is small and a module cache would be hard to reach from tests. A withheld operation resolves to undefined so it is indistinguishable from one that does not exist; the unserved refusal answers only for operations otherwise visible. Unroutable operations are refused locally because reaching one means the model addressed it from memory. `assistant-callable.ts`, `assistant-call.ts`.

### Params fail closed and keep declared order
An argument the operation does not declare is an error, so a model cannot reach fields no annotated operation exposes. Arguments are returned in declared order because the host maps that order onto the client method's positional signature. A schema rejection carries the accepted values inline (an enum, const or union of literals; a `null` branch is skipped as the optional marker): told only "does not match", a model asked for a blue agent tried several formats and then deleted and recreated the agent. `assistant-params.ts`, `assistant-schema-hint.ts`.

### Describe says where each value comes from
The catalog carries each param's author sentence and the operation that lists its accepted values; `houston_describe` renders both and closes with a paragraph naming where each identifier is read from, including identifiers nested inside body objects. Params Houston resolves itself are marked so the model may pass the name the user said. An identifier the model is left to invent is one it will invent. `assistant-describe.ts`.

### Host refusals that must not read as retryable
Plan mode, no live turn recorded, a protected chat (the assistant's own, or a card's), and the host's deployment gate each come back as a named code, because "the gateway refused" reads as something to retry and a retry cannot work in any of them. The deployment-gate refusal is relayed verbatim since the host knows something this process was not told. `assistant-call-errors.ts`, `tool-error.ts`.

### houston_recall reads the assistant's own transcript
The assistant runs one long-lived autocompacting chat, so old turns leave the model's context while they stay on disk. The tool reads the transcript store in-process (nothing to proxy); a pooled turn passes its own store. It reads once per call, since the store is parse-cached and per-term reads would re-walk the transcript. Hits fill newest-first so the total cap drops the oldest; a per-hit cap exists because the model chooses the query and the excerpt contains it. A message with no `ts` shows no time rather than "Invalid Date". `houston-recall.ts`.

## Missions, routines and learnings

### The host owns mission writes
`start_mission`, the board read and the move tool act on the caller's own board unless they name another agent. The host owns the merge-safe writes, stamps the agent-started marker and attribution, resolves the named agent, fires the child turn through the routine channel and enforces the guards (depth 1, running cap, never the current conversation, never a running mission). A 200 whose body is not a board is a failure reported as a named refusal, not a crash. Only the assistant's move tool cross-references Houston operations, so it does not answer that a mission cannot be deleted. `missions.ts`, `mission-call.ts`.

### The assistant must name an agent, and the refusal lists them
The assistant keeps no board, so a mission it started for itself would land where the user never looks. `agent` stays optional in the schema and a missing one is refused with a sentence naming the agents that would work, fetched through `listAgents` over `/sandbox/assistant/call` (authorized for the assistant alone). A refusal that withholds the list makes the model guess. Dot-named Houston agents are never targets. If the list cannot be read the refusal still goes out without names and the failure is logged, never a second failure. The transport rides on the mission call because that route is outside `/sandbox/missions`. `mission-params.ts`, `mission-agents.ts`, `mission-call.ts`.

### Provider and model pins have two clocks
The schema's accepted provider ids are a snapshot of connected providers taken as the tool defs are built and cached for the session; with none connected the param is omitted (an empty union is not a schema). The values enforced, and named in refusals, come from `resolveProviders()` inside `execute`, in the acting member's scope, read once per call so the accepted pin and the reported sentence agree. The host's start route is the final word. A model enum cannot live in the schema because valid models depend on the provider in the same call, so the `model` description lists `id = Friendly name` per provider; it is the only place friendly names reach an agent. The typed shape declares `provider` as an optional id regardless of snapshot, so callers handle its absence. `start-mission.ts`, `mission-providers.ts`, `mission-pin.ts`, `mission-params.ts`.

### Pin resolution
An unpinned child inherits the parent turn's provider and model; on managed cloud the runtime holds no standing provider, so an unpinned child would be refused. A model named without a provider rides the inherited provider; a provider without a model gets that provider's default. A model the resolved provider does not offer is `invalid_model`, not `invalid_provider`, which would send the model back to re-pick a provider that was fine. The tool tells the user only ids that survived resolution and the host's check, using the name the user knows. `mission-pin.ts`, `tool-error.ts`.

### Reading a mission
The caller's own missions are read from this runtime's transcript store; another agent's through the host. The conversation id is `activity-<id>`, with `session_key` from activity.json as the fallback for missions keyed differently. Output keeps the tail and fills newest-first so the total cap drops the oldest lines. A receipt is recognized only when a result parses as one; anything else draws no mission card. `read-mission.ts`, `mission-transcript.ts`, `start-mission-receipt.ts`.

### save_routine writes through the host and never from a routine run
Each setup chat knows only its own routine, so whole-file writes of `routines.json` deleted siblings; the host route reads, merges one entry and writes the survivors. A routine run's conversation (`routine-<id>`) may never write routines, because a routine prompt that reads like a scheduling request pushed the agent into copying the running routine instead of doing its work; setup chats are `activity-<id>`. The conversation id lets the host key `created_by` to the live turn it recorded. The event-trigger binding is all-optional in the schema and validated by the host, which rejects it where triggers are unavailable. `save-routine.ts`, `save-routine-params.ts`.

### save_learning takes only the text
A learning's provenance (who taught it, which mission) is derived server-side from the acting-as header and the conversation id, so the tool takes only the text and the host owns the merge-safe write. `save-learning.ts`.

## Interaction tools

### ask_user batches into one card
Up to three questions go into one call that records question steps on the turn's terminal `done` frame; the app walks the user through them in one card in place of the composer, and answers arrive as the next user message. A connection need in the same turn joins the same flow. `ask-user.ts`.

### Offer tools end the turn once the reply is written
`suggest_actions` and `suggest_reusable` carry pi's `terminate` hint when the closing message is already written, so the reply and the offers come from one model pass instead of a second full-context round trip. Every result in the batch must carry it, so the two offers end the turn together; the Claude backend mirrors this with a PostToolBatch hook (`backends/claude/turn-end-hook.ts`). Called before anything visible, the tool does not end the turn and quotes back the turn's visible text so the model writes its closing message: asked to judge for itself, a model that wrote the answer only in its reasoning replied "the link is in my reply above" with no link. The quote is cut by code points, since a lone surrogate is a provider 400 and would persist in a resumed Claude session. Offers render above the composer and never change board status. `suggest_reusable` is excluded from plan mode by name. `suggest-actions.ts`, `suggest-reusable.ts`, `unread-reply.ts`, `session/tool-selection.ts`.

### plan_ready is plan-mode only
The model writes the plan, then calls `plan_ready`; the card offers start, Autopilot or keep planning, and choosing to proceed sends a new turn. It is gated to plan by name and never joins the execute or auto allowlist. `plan-ready.ts`.

### request_hands_on and request_provider_connection refuse what cannot render
Billing and the danger zone are the person's own standing over money and their space; the card carries a model-written reason in Houston's chrome, so only the AI Manager (the runtime the host named to operate the account) may hand those over. Per-employee screens need the roster and the API, which only the Manager has. A screen the app cannot open, or a provider id with no connect card (pi's catalog is wider than Houston's), is refused in the tool, because the card would block the composer until Skip. An older build that does not know the hands-on step drops it and the turn ends with nothing on screen; this is accepted, since the alternative is narrating clicks in chat. `request-hands-on.ts`, `request-provider-connection.ts`.

## Browser (browser/**)

### A native Playwright tool, one browser per process
The browser is driven in-process by Playwright rather than through a CLI, so passwords never pass through a shell command and calls show in the tool log. One browser per runtime process, launched on first use, with one context per conversation; calls for a conversation run in order so a close or idle sweep never lands mid-action. A crashed browser or closed page is replaced on the next call. Idle and hand-off timers are unref'd so they never keep a finished process alive; Playwright's own exit hook kills the child on a hard exit. A pooled turn's contexts are saved and closed before its workspace is deleted, logging rather than throwing. `browser/pool.ts`, `browser/local-browser.ts`, `browser/tool.ts`.

### Every action has a deadline
Playwright bounds navigation and element waits but not `page.evaluate` or a renderer frozen mid-load (one held an `open` for six minutes). Past the deadline the slot's context is closed, which is what ends the stuck call; an epoch bump keeps the abandoned call from moving the tab under the calls queued after it. A frozen page cannot hand over its storage, so the tab is dropped unsaved (sign-ins were saved after each change), and a backup tab being tried is closed too because it bills. A ref missing from the page fails fast instead of waiting out Playwright's default. `browser/action-deadline.ts`, `browser/pool-slot.ts`, `browser/tab-swap.ts`, `browser/run-action.ts`.

### Dialogs are held for the model
Playwright silently dismisses dialogs, so a `confirm("Delete?")` was answered Cancel without the model knowing. Dialogs are held and the model answers them; `beforeunload` is accepted since navigating away is the model's decision. Work races the dialog, because a page with a dialog open freezes: the model hears about it now and the interrupted work finishes once it is answered. During a hand-off a dialog is answered for the person at once so their page never stalls. `browser/dialogs.ts`, `browser/handoff.ts`.

### Refs are generation-stamped
Playwright reuses `e12` for a different element once the page changes, so every ref is prefixed with a process-wide generation (`s7e12`) and only the latest look's refs resolve; an older one is refused as stale. Only an element's own `[attr]` marks are rewritten, never refs its name or value text spells out. A look takes the epoch at its start and commits only if no dialog superseded it, so a late look cannot retire newer refs. `[new]` marks compare against the previous look at the same document, identified by `performance.timeOrigin`, since refs are stable only within one document. `browser/refs.ts`, `browser/look-memory.ts`, `browser/snapshot.ts`.

### Snapshots
A raw page can be about 200k characters, so text is cut on a line boundary. The AI snapshot descends into iframes because sign-in forms often live there. Password values are read from every frame and masked by value only on textbox lines, anchored on the line head (a password can contain `]: `) and after Playwright's whitespace normalization; a frame whose read fails fails the snapshot rather than risk printing a password, except a detached frame. An iframe that navigates during the read is retried once. A page whose body is held back by a head script is reported as loading. Playwright single-quotes a key that needs YAML quoting, so keys are unquoted once where the tree is read, and `\xNN` sequences are rewritten as `\u00NN` for JSON comparison. `browser/snapshot.ts`, `browser/mask-passwords.ts`, `browser/aria-keys.ts`, `browser/snapshot-tree.ts`, `browser/page-text.ts`.

### Page text is fenced
Text a website controls, including Playwright error messages that quote the page, is fenced so the model reads it as content; every run of `<<<` or `>>>` is broken up so a page cannot close the fence and speak as the tool. Tool messages stay outside. The transcript never repeats a password the model typed. `browser/untrusted.ts`, `browser/tool.ts`, `browser/run-action.ts`.

### The network fence
Chromium sends every request (subresources, fetches, workers, each redirect hop) through a per-browser proxy on 127.0.0.1. The proxy exception list holds only `<-loopback>`, which removes Chromium's built-in loopback exception so localhost reaches the proxy and is refused; WebRTC's non-proxied UDP is off; host-resolver rules point loopback, "any address", `.internal` and `metadata` names at nowhere as a second wall for lookups Chromium makes itself. The proxy logs nothing about where pages go, and its own answers carry a header so a refusal is recognizable and a site cannot fake one. `browser/network-fence.ts`, `browser/fence-proxy.ts`, `browser/fence-wire.ts`, `browser/fence-refusals.ts`.

### The proxy resolves once and connects only to checked addresses
A name is refused when any of its answers is blocked or is this machine's own address, so a public name pointing at loopback or a metadata server never gets through. The checked addresses are what the proxy connects to, in order, so a different DNS answer between check and connect changes nothing; the list is capped. IPv6 link-local answers beside others are dropped rather than refused, since mDNS names carry one routinely. Addresses are tried in order with a per-attempt cut so a dead first answer (IPv6 with no route) still opens; judging and connecting share one bound. `browser/fence-target.ts`, `browser/fence-dial.ts`.

### Address ranges
Never reachable: this machine (0/8, 127/8, ::/8), link-local and metadata ranges, and the AWS IPv6 and Alibaba metadata servers. Private networks (RFC1918, carrier-grade NAT, IPv6 unique-local) are blocked only on the managed cloud (`HOUSTON_MANAGED_CLOUD=1`), where they are the provider's internal network; on desktop and self-host they are often the team's intranet. This machine's interface addresses are read on every check, because with private networks allowed its LAN address would reach anything on 0.0.0.0, the host included, and interfaces change while the browser is open. IPv4-mapped IPv6 reads as the IPv4 address. `browser/ip-ranges.ts`.

### Two resolvers
On the managed cloud the fence resolves with c-ares: `dns.lookup` runs getaddrinfo on libuv's four-thread pool, which file I/O shares, so slow DNS zones could stall the runtime; c-ares queries have timeouts and a deadline, and only a few run at once. On desktop and self-host it uses the OS resolver, because intranet names (search domains, hosts file, mDNS, split DNS) must work; getaddrinfo cannot be cancelled, so a slot is held until the OS answers, the in-flight count is small, and a repeat ask joins the running lookup. IPv4 is asked first, and one family failing keeps the other's answers. Lookups are never cached. `browser/fence-resolve.ts`, `browser/fence-limit.ts`.

### One judged request per proxy connection
A CONNECT tunnel carries TLS or a WebSocket to the one host judged. A plain-http connection relays exactly one request and its response with `Connection: close` on every head; any further byte is cut, so each request gets its own judgment. Head parsing is strict per RFC 9112 (no obs-fold, no bare CR or LF in a line, no whitespace before the colon), the method keeps its case, `Host` comes from the request target, and a chunked body is refused because the proxy cannot frame it. `browser/fence-wire.ts`, `browser/fence-forward.ts`, `browser/fence-splice.ts`.

### Site failures are not reported as faults
A browser hanging up, a connection reset by the site, every address refused, or a site walling the backup too is the site's state, not Houston's, so none of these is a Sentry event. `browser/fence-proxy.ts`, `browser/fence-dial.ts`, `browser/fence-splice.ts`, `browser/open-fallback.ts`.

### The name check before fetching
The model's address is judged by name before anything is fetched, so an `open` of a blocked address is a refusal the model can read; the proxy then judges where the name resolves on every request. One root dot is the same host. A bare host gets https. A refusal of a private, metadata or other non-public address says it is blocked on purpose, because a model told only "will not open" reached the same address with curl; a refusal of this machine does not, since on desktop that is the person's own local server. The check defaults to the env the browser was launched with so it agrees with the fence. `browser/url-policy.ts`.

### URL redaction fails closed
Values of secret-looking query, fragment and path-matrix parameters, and userinfo passwords, are replaced by `[hidden]` wherever the model, chat or live view sees an address. Secret words match anywhere in the separator-stripped lowercase name, so a harmless name containing one is hidden unless the harmless list names it; short words match only as whole tokens, and `code` counts alone or after a verification word. Percent-encoded addresses inside values are redacted too, and `?` separates pairs because hash-routed apps keep their query in the fragment. `browser/redact-url.ts`.

### Chromium launch
Chromium's own sandbox is on everywhere unless the operator sets `HOUSTON_BROWSER_SANDBOX=0` (logged at each launch), because Playwright's default turns it off; a sandboxed launch that fails is not retried without it. Popup blocking stays on so a page cannot open a chain of renderers without a click. `--disable-dev-shm-usage` because containers ship a 64 MB /dev/shm. Candidates: `HOUSTON_BROWSER_EXECUTABLE` (the cloud image's headless shell, much smaller than full Chrome), Playwright's headless shell, then the installed Chrome and Edge. `playwright-core` loads on the first call. The browser's env is an allowlist (paths, locale, time zone, fonts), so a renderer process holds no tokens. A packaged build is probed at smoke time so a missing playwright-core file fails there. `browser/launch.ts`, `browser/launch-report.ts`, `browser/browser-env.ts`, `browser/probe.ts`.

### Saved sign-ins
Sign-ins are a Playwright storageState under `.houston/browser/`, not a Chromium profile, because a pooled turn syncs its workspace back and a profile would ship caches. The directory is 0700 and files 0600, because a pooled turn's tool user shares the tree's group; a state directory not owned by this process is not read, and the file is opened without following a symlink, checked and read through the same descriptor. A missing `.houston/` drops the save rather than recreating a workspace nobody cleans up. A torn file is ignored and replaced by the next save. Saves are a three-way merge of what this context changed since it opened, so one chat cannot erase a sign-in another made, serialized per path within the process. Downloads are refused. `browser/state-store.ts`, `browser/state-merge.ts`, `browser/open-tab.ts`.

### The backup browser (Kernel)
A page blocked by an anti-bot wall moves the conversation's tab to Kernel, a third party that then sees the page and its cookies, so a block needs a vendor's own marker; a generic "Forbidden" is never one, and a quotable marker counts only as a tag or with a denied status. Word checks drop scripts and styles. A blocked visit is not saved first, since the wall's cookies would get the backup blocked too, and a backup tab gets only that site's sign-ins and none of the vendors' cookies. A conversation on the backup returns local for another site, because the backup is paid and refuses some sites. `KERNEL_API_KEY` is the switch; absent, the fallback is off and logged as a warning. Sessions are deleted at once because they bill until they end; the CDP URL carries a session token and is never logged. Kernel's proxy header counts only on a backup tab. The fence cannot sit in front of a remote browser; url-policy still applies. `browser/block-detect.ts`, `browser/page-block.ts`, `browser/open-fallback.ts`, `browser/backup-state.ts`, `browser/kernel.ts`, `browser/kernel-tab.ts`.

### Tabs and popups
The tab follows the newest page so a sign-in popup becomes the page the model and the person see, and falls back when it closes. Pages are capped (three in turn mode, where a 2 GB sandbox also runs Node and the harness, else eight); the oldest go first, but never the current page or its direct opener, since closing the opener breaks an OAuth popup's `window.opener`. `browser/tab-pages.ts`.

### The live hand-off
A hand-off belongs to the gateway-signed acting-as person, else the person a pooled turn's verified record names, never `actingUser`, which a standing runtime takes from an unsigned header. Its time is read once the page is loaded. Each hand-off has an unguessable id echoed on everything, so nothing aimed at an earlier one acts on this one, and input batches carry a per-viewer seq recorded before the events run so a half-failed batch is not typed twice. Input goes over the page's own CDP session, not the pool queue the hand-off holds, every CDP step is bounded, and typed text and addresses are never logged. Navigations use `commit` and share a per-batch budget so several Backs on a hung site cannot hold Done; the timeout is never 0, which Playwright reads as none. Back on a popup closes it, using the browser's history record rather than the page's. `browser/handoff.ts`, `browser/live/session.ts`, `browser/live/input.ts`, `browser/live/navigation-budget.ts`, `browser/live/cdp-step.ts`, `browser/live/page-errors.ts`.

### Live view streaming
Each viewer is paced by its own acks within a count and byte window, and a frame arriving while the window is full replaces the held one, so a slow phone catches up to the newest picture; a frame larger than the window still goes once nothing is unacked. The latest picture sent on attach is not counted. The frame cap fits both layouts so a switch needs no restart, and after the hand-off every page it may have resized is reset to the size snapshots assume. `browser/live/viewer-window.ts`, `browser/live/screencast.ts`, `browser/live/layout.ts`.

### Action schema and navigation
The tool's parameters are one flat object because a top-level union is not a valid function schema for most providers and the Claude bridge converts only object shapes; `parseBrowserAction` checks which fields each action needs, and `handoff` is listed only where a person can be shown the browser. Empty fill text is a real fill. Navigation waits for `commit`, and a failed load waits for Chromium's error page so it does not interrupt the next `open`. Labels are drawn in a closed shadow root that takes no input. `browser/action-schema.ts`, `browser/actions.ts`, `browser/navigate.ts`, `browser/labels.ts`.

## Documents

### PDF and Word reads
PDF is detected by magic; Word needs its extension because DOCX is a generic ZIP like XLSX and PPTX. A `.doc` that is RTF or HTML is already text and goes to pi's plain read. pdf.js rethrows parser errors from its worker as `UnknownErrorException` with the original class only in `details`; anything else wrapped that way is a pdf.js bug and still throws. `read-documents.ts`, `read-word-document.ts`.

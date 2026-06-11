# Workflows

Multi-step runs Houston **plans**, the user **approves**, then the engine **executes** step by step. Distinct from Skills (reusable manual procedures) and Routines (scheduled future work). See `app/src-tauri/src/houston_prompt/workflows.rs` for product-voice guidance on when the agent should start one vs answer inline.

## When to use what

| Pattern | User intent | Houston surface |
|---|---|---|
| One-shot answer or simple action (1-3 straightforward steps) | "Summarize this email" | Chat only, no workflow |
| Reusable procedure the user runs themselves | "Save how we research companies" | Skill (`.agents/skills/`) |
| Scheduled / recurring future work | "Check my inbox every morning" | Routine (`.houston/routines/`) |
| Multi-step plan-approve-execute **now** (>3 actions, parallelizable work, or dependent steps) | "Audit our repo, fix issues, open a PR" | Workflow run (agent asks clarifying questions first, then triggers) |

## File layout

```
~/.houston/workspaces/{Workspace}/{Agent}/
  .houston/
    workflows/
      workflows.json + workflows.schema.json    # saved definitions (CRUD from Workflows tab)
    workflow_runs/
      workflow_runs.json + workflow_runs.schema.json   # all runs (saved + inline)
```

- **Saved workflow** — row in `workflows.json` with `id`, `name`, `description`, `plan_prompt`, and optional frozen `plan` (step DAG). When `plan` is set, re-runs copy it onto the new run and skip the AI planner; legacy rows without `plan` still plan from `plan_prompt` every run.
- **Inline run** — no saved definition. Run row carries `workflow_id: "inline-{uuid}"` plus optional `plan_prompt`, `name`, `description` on the run itself. Inline runs appear in run history but **not** in the saved workflows grid.

Engine CRUD: `engine/houston-engine-core/src/workflows/defs.rs` (definitions), `runs.rs` (runs). `inline.rs::effective_workflow()` resolves saved def first, else reconstructs from run fields for planner/executor.

## Run lifecycle

```
planning → awaiting_approval → running → waiting_for_connection → running → done | error | cancelled
```

1. **Planner** — dedicated session (`session_key` = `workflow-{wid}-run-{run_id}`) turns `plan_prompt` into a `WorkflowPlan` (DAG of steps with optional `depends_on`, `use_worktree`, `requires_approval`, `toolkits`).
2. **Approval** — user approves or cancels from Workflows tab editor or inline chat panel (`ActiveRunPanel`).
3. **Executor** — steps run in dependency order; independent steps may overlap. Mid-run gates pause on `requires_approval` until the user approves that step. Approval stays available while other branches are still running or waiting for connection; approving a gated step does not wait for unrelated in-flight steps to finish.
4. **Connection gates** — three layers block a step with `waiting_for_connection` until the user connects Composio or the required app:
   - **Pre-flight** — the planner annotates each step with `toolkits` (lowercase Composio slugs). Before dispatch, the executor checks sign-in and connected toolkits; a missing requirement sets the blocker immediately without running the step.
   - **Runtime marker** — if a step runs and the agent emits `<!--houston:workflow-connection {...}-->` in its response, the same blocker path applies.
   - **Recovery probe** — if the step finishes without a marker but prose looks like a Composio connection failure (CLI strings or en/es/pt phrasing, with no action evidence), the executor runs one extra probe turn in the same step session. The probe must reply with a marker or `NO_BLOCKER` only; a marker sets the blocker, `NO_BLOCKER` lets the step complete normally, and garbage or dispatch errors mark the step `error` while keeping the original summary.
   Dependents stay pending, independent branches continue, and synthesis waits. Supported blockers are `composio_signin` and `composio_toolkit` with a toolkit slug.
5. **Summary** — final synthesis written to `run.summary`.

Manual start: Workflows tab → Run → `POST /v1/workflows/:id/run`.
Chat start: agent emits trigger marker (below); engine intercepts after the user chat turn.

## Chat-trigger markers

Two HTML-comment markers, same pattern as Skills (`knowledge-base/skills.md`).

### Trigger (assistant reply → engine)

Emitted by the agent when a workflow is warranted. Parsed in `engine/houston-engine-core/src/workflows/chat_trigger.rs`. Hooked from `sessions::run_start` after a successful **user chat** turn (skipped when `session_key` starts with `workflow-`).

```
<!--houston:workflow {"workflowId":"<saved-id>"}-->
```

Saved workflow — `workflowId` must match a row in `workflows.json`.

```
<!--houston:workflow {"planPrompt":"<what to plan>","name":"<title>","description":"<one line>"}-->
```

Inline workflow — `planPrompt` required when no saved id matches. At most one marker per reply.

Routing: saved id wins → `begin_run`; else non-empty `planPrompt` → `begin_inline_run` → synthetic `inline-{uuid}` workflow id.

### Run link (engine → chat feed)

After a trigger succeeds, the engine emits and persists a system message:

```
<!--houston:workflow-run {"runId":"<run-uuid>"}-->
```

- Live: `FeedItem::SystemMessage` on the **user chat** `session_key`.
- Persisted: `db.add_chat_feed_item_by_session` under the chat's Claude session id so reload keeps the link.

### Agent context

`build_agent_context` in `engine/houston-engine-core/src/agents/prompt.rs` injects `# Available Workflows` when `workflows.json` is non-empty (`workflows/context.rs`). Lists stable `id`, `name`, `description` so the agent can reference a saved workflow by id in the trigger marker.

### Product prompt

`WORKFLOWS_GUIDANCE` in `app/src-tauri/src/houston_prompt/workflows.rs`, wired into `system_prompt()` after routines guidance. Teaches when to emit the trigger vs answer inline. Engine stays prompt-agnostic; app passes copy via `HOUSTON_APP_SYSTEM_PROMPT`.

**Auto-detection threshold:** the agent starts a Workflow when fulfilling the request takes more than 3 distinct actions, when two or more actions could run in parallel, or when several dependent steps are needed. Simple 1-3 step requests stay in chat.

**Clarify-first:** before emitting the trigger marker, the agent asks a short set of clarifying questions via the structured question card (`<!--houston:question {...}-->` — see `QUESTIONS_GUIDANCE` in `app/src-tauri/src/houston_prompt/questions.rs`). It does not emit the workflow marker on a turn where it is still asking questions. After the user answers, it triggers the workflow with answers folded into `planPrompt`. The generated plan is shown in the inline chat panel (`InlineRunCard` via `InlineWorkflowRunCard`); the user can refine or start from chat, or approve/cancel inline before execution.

### Plan review (engine → chat)

When planning finishes, the run stores `source_chat_session_key` linking it to the user chat that triggered it. `build_agent_context` injects `# Active workflow run (awaiting your review)` with `runId` and step tasks while status is `awaiting_approval`.

After a user chat turn, the assistant may emit:

```
<!--houston:workflow-approve {"runId":"<run-uuid>"}-->
<!--houston:workflow-replan {"runId":"<run-uuid>","feedback":"<what to change>"}-->
```

Parsed in `workflows/chat_actions.rs` (hooked from `sessions::run_start` after the trigger check). Approve calls `approve_run`; replan resets the run to `planning` with augmented `plan_prompt` and re-invokes the planner.

## UI

| Surface | Package / file | Notes |
|---|---|---|
| Workflows tab (grid + editor) | `app/src/components/tabs/workflows-tab.tsx`, `@houston-ai/workflows` | CRUD saved defs, run history, `ActiveRunPanel` + `PlanApprovalDialog` modal on editor. Editor collapses the definition form + saved plan when execution is focused (Run, history pick, or in-flight on open); header toggle restores them. Scrolls to `ActiveRunPanel` on explicit run focus. |
| Inline chat panel | `app/src/components/inline-workflow-run-card.tsx` | `InlineRunCard` with inline approve/cancel/stop (approval gate + planning + running). At initial plan approval on inline runs, shows a plan-ready invite nudging the user to refine or start from chat. Approve/cancel render on the gated step row and in a sticky strip under the heading so parallel step lists do not hide them. Decodes run-link marker in `renderSystemMessage` (`use-agent-chat-panel.tsx`). Chat composer Stop/Esc cancels the linked in-flight run when one exists (`app/src/lib/active-workflow-run.ts`, `use-agent-board-send.ts`). |
| Run-link decoder | `@houston-ai/chat` `workflow-run-message.ts` | `decodeWorkflowRunMessage(body) → { runId }` |
| Shared i18n labels | `app/src/hooks/use-active-run-labels.ts` | `workflows` namespace; shared by tab + inline panel |

Inline panel: `useWorkflowRuns(agentPath)` finds run by id, renders `InlineRunCard` with approve/cancel wired to existing mutations. Returns `null` while loading so raw marker text never flashes.

Failed or blocked steps on terminal runs (`error` / `cancelled`) show a per-step **Retry** button in `StepProgress` (Workflows tab run panel + inline chat card). Retry resets the target step, any non-`done` ancestors it needs, and all downstream dependents to `pending`, then re-executes only that subgraph (`POST /v1/workflow-runs/:id/steps/:stepId/retry`). Unrelated failed branches stay as-is. Whole-run **Resume** (`POST .../resume`) still re-runs every failed/cancelled step. Both retry and resume call `runs::reopen_run`, which clears the prior run synthesis and `completed_at` before execution restarts; the UI hides run/step summaries until the run is terminal again.

Connection-blocked steps render the existing Composio sign-in or toolkit card through `@houston-ai/workflows`' generic `renderStepDetail` prop. The app generates toolkit authorization URLs on click, watches live connection state, and retries the blocked step once when the requirement is satisfied. Stop remains available while the run waits.

Mobile chat parity for the inline panel is deferred.

## Reactivity

| Event | Invalidates (desktop) |
|---|---|
| `WorkflowsChanged` | `queryKeys.workflows(agentPath)` |
| `WorkflowRunsChanged`, `WorkflowPlanProposed`, `WorkflowStepChanged` | `["workflow-runs", agentPath]` |

WS topic: `workflows:{agent_path}` (`engine/houston-engine-protocol::event_topic`). Desktop subscribes to `*` firehose. File watcher on `workflow_runs.json` also emits `WorkflowRunsChanged`.

## Engine modules (quick map)

| Module | Role |
|---|---|
| `workflows/defs.rs` | Saved workflow CRUD |
| `workflows/runs.rs` | Run rows; `create`, `create_inline` |
| `workflows/inline.rs` | `effective_workflow`, `begin_inline_run` |
| `workflows/planner.rs` | Plan generation session |
| `workflows/connections.rs` | Composio pre-flight connection checker |
| `workflows/connection_probe.rs` | Prose connection-failure recovery probe |
| `workflows/runner.rs` | Approve, execute, resume, retry step, cancel |
| `workflows/chat_trigger.rs` | Marker parse, route, `maybe_trigger_from_chat` |
| `workflows/chat_actions.rs` | Approve/replan markers from chat, `maybe_workflow_action_from_chat` |
| `workflows/context.rs` | `# Available Workflows` prompt section |

REST routes: `engine/houston-engine-server/src/routes/workflows.rs`. Wire details in `knowledge-base/engine-protocol.md`.

## Authoring notes

- Saved workflows: user creates via Workflows tab or agent writes `workflows.json` per schema (same files-first rules as routines/learnings).
- Chat-triggered inline runs are ephemeral definitions; after a successful inline run completes, the chat panel asks whether to save it (`POST /v1/workflow-runs/:id/save-as-workflow`), which creates a saved workflow with the run's frozen `plan`.
- Nested workflow sessions are guarded: chat trigger does not run inside `workflow-*` session keys.

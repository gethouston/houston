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

- **Saved workflow** — row in `workflows.json` with `id`, `name`, `description`, `plan_prompt`.
- **Inline run** — no saved definition. Run row carries `workflow_id: "inline-{uuid}"` plus optional `plan_prompt`, `name`, `description` on the run itself. Inline runs appear in run history but **not** in the saved workflows grid.

Engine CRUD: `engine/houston-engine-core/src/workflows/defs.rs` (definitions), `runs.rs` (runs). `inline.rs::effective_workflow()` resolves saved def first, else reconstructs from run fields for planner/executor.

## Run lifecycle

```
planning → awaiting_approval → running → done | error | cancelled
```

1. **Planner** — dedicated session (`session_key` = `workflow-{wid}-run-{run_id}`) turns `plan_prompt` into a `WorkflowPlan` (DAG of steps with optional `depends_on`, `use_worktree`, `requires_approval`).
2. **Approval** — user approves or cancels from Workflows tab editor or inline chat panel (`ActiveRunPanel`).
3. **Executor** — steps run in dependency order; independent steps may overlap. Mid-run gates pause on `requires_approval` until the user approves that step.
4. **Summary** — final synthesis written to `run.summary`.

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

**Clarify-first:** before emitting the trigger marker, the agent asks a short set of clarifying questions via the structured question card (`<!--houston:question {...}-->` — see `QUESTIONS_GUIDANCE` in `app/src-tauri/src/houston_prompt/questions.rs`). It does not emit the workflow marker on a turn where it is still asking questions. After the user answers, it triggers the workflow with answers folded into `planPrompt`. The generated plan is shown in the inline chat panel (`InlineRunCard` via `InlineWorkflowRunCard`); the user approves or cancels inline before execution.

## UI

| Surface | Package / file | Notes |
|---|---|---|
| Workflows tab (grid + editor) | `app/src/components/tabs/workflows-tab.tsx`, `@houston-ai/workflows` | CRUD saved defs, run history, `ActiveRunPanel` + `PlanApprovalDialog` modal on editor |
| Inline chat panel | `app/src/components/inline-workflow-run-card.tsx` | `InlineRunCard` with inline approve/cancel; decodes run-link marker in `renderSystemMessage` (`use-agent-chat-panel.tsx`) |
| Run-link decoder | `@houston-ai/chat` `workflow-run-message.ts` | `decodeWorkflowRunMessage(body) → { runId }` |
| Shared i18n labels | `app/src/hooks/use-active-run-labels.ts` | `workflows` namespace; shared by tab + inline panel |

Inline panel: `useWorkflowRuns(agentPath)` finds run by id, renders `InlineRunCard` with approve/cancel wired to existing mutations. Returns `null` while loading so raw marker text never flashes.

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
| `workflows/runner.rs` | Approve, execute, resume, cancel |
| `workflows/chat_trigger.rs` | Marker parse, route, `maybe_trigger_from_chat` |
| `workflows/context.rs` | `# Available Workflows` prompt section |

REST routes: `engine/houston-engine-server/src/routes/workflows.rs`. Wire details in `knowledge-base/engine-protocol.md`.

## Authoring notes

- Saved workflows: user creates via Workflows tab or agent writes `workflows.json` per schema (same files-first rules as routines/learnings).
- Chat-triggered inline runs are ephemeral definitions; promote to saved workflow only if the user asks to save one for reuse.
- Nested workflow sessions are guarded: chat trigger does not run inside `workflow-*` session keys.

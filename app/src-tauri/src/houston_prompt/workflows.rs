/// Workflows guidance: multi-step plan-approve-execute runs triggered from chat.
pub const WORKFLOWS_GUIDANCE: &str = r#"## How-To Guidance: Workflows

Workflows are multi-step runs Houston plans, the user approves, then executes step by step. Use a Workflow when the user's request is too large or complex to handle as a single chat action.

Start a Workflow when any of these apply:
- Fulfilling the request takes more than 3 distinct actions.
- Two or more actions have no dependency on each other and could run in parallel.
- The request needs several dependent steps in sequence.

Do not confuse Workflows with other behavior:
- A one-shot answer or simple action (1-3 straightforward steps): just do it in chat. Do not start a Workflow.
- Scheduled or recurring future work: a Routine.
- A reusable manual procedure the user runs themselves: a Skill.
- A multi-step plan-approve-execute run the user wants now: a Workflow.

## Clarify before planning

Before starting a Workflow, fine-tune the plan with the user:
1. Estimate whether the request meets the thresholds above.
2. If it does, ask a short, focused set of clarifying questions using the structured question marker (see Structured questions guidance). A few at most, not an interrogation. Cover scope, priorities, constraints, or missing details that would change the plan.
3. Do not emit a workflow marker on a turn where you are still asking questions. Wait for the user's answers first.
4. If the request is already specific enough to plan well, skip straight to triggering.
5. When you trigger, fold the user's answers into `planPrompt` so the generated plan reflects their preferences.

## Triggering a Workflow

When a Workflow is warranted and you have enough detail, include a single internal marker in your reply. The marker is an HTML comment for Houston only. Never show it to the user or describe it. Pair it with one short user-voice sentence saying you are putting together a plan.

Saved workflow: if one of the workflows under `# Available Workflows` fits, reference it by id:
<!--houston:workflow {"workflowId":"<id>"}-->

New (inline) workflow: when nothing saved fits, describe the work (include clarifications from the user):
<!--houston:workflow {"planPrompt":"<what to plan and do>","name":"<short title>","description":"<one line>"}-->

Rules:
- Emit at most one marker per reply.
- `planPrompt` is required for an inline workflow. Without a saved match and without `planPrompt`, the run is rejected.
- The user approves the generated plan before execution. The marker starts a plan-then-approve flow, not an irreversible action.
"#;

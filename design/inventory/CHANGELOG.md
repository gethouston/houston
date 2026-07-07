# Inventory changelog

Every `version` bump in `inventory.yaml` needs a matching entry here (enforced by
`pnpm check:parity`). Newest first. Use `## vN` headings.

## v5 - 2026-07-06

Redesign `question-card` to the composer family and batch questions. `ask_user`
now asks 1-3 questions in one call (protocol `question` variant carries
`questions[]`). The card stacks questions vertically, each with vertical
single-select option rows (role=radio, toggle on re-click), and a free-text
field that is ALWAYS visible at the bottom (the "own-answer-toggle" is removed,
satisfying no-hover-only-affordances directly). The surface adopts the
composer's exact vocabulary — `rounded-[28px]` `bg-card`, soft shadow with a
focus-within lift, a borderless inline textarea, and the round `PromptInputSubmit`
send — so card and composer read as one family. Fast path: a single question
with options and empty input sends on option click. Send otherwise composes one
`"<question>: <label>"` line per answered question plus appended free text.
Still shared web (`@houston-ai/chat` `ChatQuestionCard`), so it stays
`implemented`.

## v4 - 2026-07-06

Add `question-card`: the in-chat surface shown when the agent pauses mid-turn to
ask the user a question (protocol `PendingInteraction` kind=question). Replaces
the composer until answered; prominent prompt, always-visible option buttons, a
quiet toggle to an inline free-text answer (shown directly when there are no
options). Web ships it as a shared `ui/` piece (`@houston-ai/chat`
`ChatQuestionCard`), so it lands `implemented`.

## v3 - 2026-07-05

Add `agent-provisioning-card` (HOU-693): the in-chat notice (and its
blocked-write-dialog variant) shown while a just-created agent's hosted engine
warms up. Web ships it app/-locked (`agent-provisioning-card.tsx` +
`agent-warming-dialog.tsx`), so it lands as `partial` -- extract before mobile.

## v2 - 2026-07-03

Add the AI models hub's reusable content components: `ai-provider-card`,
`ai-model-row`, and `ai-model-offer-row`. The hub is a new top-level marketplace
surface (browse hundreds of models, connect a provider) that will exist on native
mobile; its navigation shell is surface-specific idiom and stays uninventoried.
Web implements all three today but app/-locked (in `app/src/components/ai-hub/`,
not a shared `ui/` package), so they land as `partial` — extract before mobile.

## v1 - 2026-07-03

Initial cross-surface component inventory. 22 components derived from an audit of
the `ui/` packages, scoped to pieces that are genuinely cross-surface (will exist
on native iOS/Android). Establishes the structural-parity contract and the three
surface manifests.

Components: agent-avatar, agent-list-item, conversation-feed, assistant-message,
user-message, thinking-indicator, tool-call-chip, provider-error-card,
system-message, skill-invocation-message, composer, turn-status, progress-panel,
approval-surface, deliverable-card, mission-card, mission-board,
mission-status-chip, routine-row, skill-row, empty-state, toast.

Surfaces: web (enforced, inventoryVersion 1), ios + android (unenforced,
inventoryVersion 0, all not-started).

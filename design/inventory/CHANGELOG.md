# Inventory changelog

Every `version` bump in `inventory.yaml` needs a matching entry here (enforced by
`pnpm check:parity`). Newest first. Use `## vN` headings.

## v9 - 2026-07-08

Add `plan-ready-card`, the composer-replacing surface shown when the agent
finishes planning (plan mode) and calls `plan_ready`. A pending interaction
carrying a single `plan_ready` step (its plan `summary`) reaches the frontend
exactly like `ask_user`; the card presents the drafted plan above three
always-visible actions: "Start working" (starts a normal execute turn
confirming the plan), "Run on Autopilot" (starts an autopilot turn), and "Keep
planning" (dismisses the card locally so the composer returns with the Mode pill
still on plan; a later, different plan re-shows it). The first two flip the
composer Mode pill to match and send a visible user message; the third sends
nothing. `disabled` gates all three actions. New `@houston-ai/chat`
`ChatPlanReadyCard` (props-only, i18n-agnostic with a `DEFAULT_PLAN_READY_LABELS`
fallback), so Web ships `implemented`; native surfaces defer it (plan-mode flow
is not in mobile v1). No change to `interaction-card`: the app defensively
filters any `plan_ready` step out of the stepper.

## v8 - 2026-07-08

Rebuild `ai-model-row` from the multi-column Mercury ledger into a compact card,
matching the allowed-models editor's idiom. The Models tab is now a `sm:grid-cols-2`
grid of cards (lab glyph + model name + lab name + an always-visible "See more"
cue), above a control row of a pill search box and four facet comboboxes: AI
provider (self-hides at one lab), Good at, Cost, Memory. The whole card is one
button that opens the model detail modal (no nested buttons, nothing hover-gated).
The comboboxes are a shared `ai-hub/filter-combobox.tsx` (Popover + cmdk) that the
teams allowed-models `lab-filter.tsx` also reuses; Cost/Memory are pure
`costBucket` / `memoryBucket` helpers (cost reuses the meter's `costTier`
thresholds plus a `$0` "Free" bucket, memory splits at 200K / 1M). The old ledger
(`models-ledger.tsx`, `model-row.tsx`, the sticky `LedgerHeader`, and
`model-directory-filters.tsx`) plus the dead `CostMeter` / `MemoryLabel` badges
are deleted. `ModelsBrowser` backs both the directory and the provider modal, so
they still read identically. Stays web `partial` (app/-locked).

## v7 - 2026-07-08

Add a `signin` step to `interaction-card`. The pending-interaction sequence now
orders question steps, THEN at most one signin step, THEN connect steps. A signin
step appears when Houston reports the user must sign in before a tool call can run
(the runtime queues it alongside any connect steps in the same flow). Like a
connect step it carries no answer text and advances only when the app reports the
user signed in; ui/chat stays auth-unaware via a required `renderSignin` prop
(mirrors `renderConnect`), and the app supplies the sign-in card driving the
existing sign-in machinery. It counts in "N of X" and supports back/forward like
any other step (a revisited signin step relies on the stepper's forward chevron
since its card never re-fires once signed in). Completion contributes a
"Signed in to Houston." line before any connected lines. No design/surface change
to the card chrome. Web keeps `@houston-ai/chat` `ChatInteractionCard`, so it
stays `implemented`.

## v6 - 2026-07-07

Rename `question-card` to `interaction-card` and rebuild it as a one-step-at-a-time
stepper. The card now walks the user through a `steps[]` sequence (1-3 question
steps THEN connect steps) one step at a time, with a quiet "N of X" progress
indicator (shown only when total > 1) and a back chevron from step 2 on.
Question steps keep the vertical single-select option rows and an always-visible
free-text escape hatch; clicking an option or submitting typed text answers the
current step and advances. Connect steps render an app-supplied connect card
(ui/chat stays Composio-unaware via a `renderConnect` prop) and advance only on
`onConnected`. Revisiting a step pre-selects its prior answer; re-answering
replaces it. A single question-with-options step keeps the one-tap feel. The card
collects `ChatInteractionAnswer[]` and hands them to `onComplete`; the app formats
the resume message. Surface flips `bg-card` to `bg-secondary` (the product's grey
card token) so the white option rows and free-text input read as raised, distinct
chips in light and inset wells in dark. Batching (all questions at once) is gone.
Web ships `@houston-ai/chat` `ChatInteractionCard`, so it stays `implemented`;
`ChatQuestionCard` and its logic/parts/tests are deleted with no compat re-export.

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

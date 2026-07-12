# Inventory changelog

Every `version` bump in `inventory.yaml` needs a matching entry here (enforced by
`pnpm check:parity`). Newest first. Use `## vN` headings.

## v22 - 2026-07-12

`suggest-reusable-card` gains a third variant: `learning`. The agent's
end-of-mission REFLECTION STEP (the `suggest_reusable` tool, fired only on a
clean `done` finish, never on `needs_you`) can now offer to keep the
just-completed work as a reusable Skill, a scheduled Routine, OR a Learning (a
stable fact/preference saved to `.houston/learnings/learnings.json`). Same
card, same two rows; the save row's label and icon name the kind (Sparkles /
CalendarClock / Lightbulb), and accepting sends the same follow-up-message
flow (an execute turn asking the agent to write the Skill/Routine/Learning).
Protocol `InteractionStep` kind=suggest_reusable widens `reusableKind` with
`"learning"` — additive, no anatomy/state change, no new component.

## v21 - 2026-07-12

Two changes: the interaction stepper gains an ACTION-APPROVAL step, and its
dismiss X is now a durable user interruption.

New `interaction-approval-card`. Connected-app actions are no longer pre-asked
via `ask_user`; instead the host GATES the integration `execute` (the sandbox
route answers 409 `approval_required` with a display-ready `{toolkit, action,
params, paramsHash}` payload) and the runtime records an `approval` step
(protocol `InteractionStep` kind=approval) on the turn holder (`recordApproval`,
deduped by paramsHash, ids `a1..aN`), landing LAST in the sequence (questions →
signin → connects → approvals — approving follows connecting). It rides the SAME
shared `InteractionModal` shell as signin/connect, app-supplied via a new
`renderApproval` prop (ui/chat stays Composio-unaware). The card asks "Allow
{app} to {action}?" over a two-column param block and offers THREE footer
decisions — **Always allow** (outline, left), **Deny** (outline, Esc), **Allow
once** (filled, Enter). Unlike a connect/signin "Not now", Deny is a real
decision the model HEARS: allow-once writes a one-shot ticket (keyed by
paramsHash, TTL 15 min, consume-once), always-allow appends the action slug, and
the composed reply names the RAW action slug ("Approved: go ahead with
{ACTION}." / "I chose not to allow {ACTION}. ..."). Autopilot auto-approves the
gate (`x-houston-turn-mode: auto`), so the card never appears on an auto turn.
The store is per-agent `<agent>/.houston/action-approvals.json`, kept pod-side in
v1 (NOT gated on gatewayFronted; per-user Teams scoping is a cloud follow-up).
Web `partial` (the composed card is app/-locked + Composio-coupled, like the
connect/signin bodies).

`interaction-card` dismiss = user interruption. The dismiss X (and typing a fresh
message) no longer just drops the card locally: it persists a durable `stopped`
marker on the assistant turn AND clears the pending interaction, so the sequence
retires and the MODEL LEARNS NOTHING from the abandonment. A reload now renders
the standard "Stopped by user" line and settles `needs_you` through the SAME
`finishErr` stop path live and from history (fixing the old divergence where a
stopped turn re-derived as `done`). The mid-turn race is refused (409).
Tokens/prose only for `interaction-card`; the step-kind enumeration adds
approvals and the family '(icon) NAME' note goes present-tense (the approval card
adopts it).

## v20 - 2026-07-12

`interaction-card`: "treat it like a modal." The card family's chrome is now a
shared shell — `InteractionModal` (with `InteractionModalTitle`) in `ui/chat` —
that owns the surface, the HEADER row (title left; `‹ N of M ›` pager + dismiss X
top-right), a body that fades on step swap, and a right-aligned FOOTER row. The
question stepper, the sign-in step, and the connect step all compose it, so every
consumer is structurally identical; the signin/connect bodies (app-supplied, so
ui/chat stays auth/Composio-unaware) render their OWN `InteractionModal` wired
with the `StepChrome` the stepper hands them (pager + dismiss). This replaces the
old split where `ui/chat` drew the header/surface and the app drew a headerless
body via the removed `InteractionFooter`.

Header carries the identity. The signin/connect `(icon) NAME` lockup ("Google
Sheets" / "Houston") moved OUT of the body and UP into the modal title, on the
SAME row as the pager + X — fixing the complaint that the title sat below an
empty header strip.

Weight restraint, for real. The modal title and the option / identity labels drop
from `font-medium` to REGULAR; color tone (foreground vs muted) now carries the
hierarchy. `font-medium` survives only where it earns it: the Recommended chip,
the number-badge digit, the filled CTA label.

Option rows lose their inline description. Rows show label + Recommended chip
only. `description` stays TOLERATED on the wire (protocol unchanged) but is no
longer rendered, and the `ask_user` tool schema + Houston prompt (TS host + Rust
mirror) drop their per-option description guidance so the model stops spending
tokens on it (the `recommended` guidance stays).

Unified decline in the footer. The question's old inline Skip pill left the
free-text escape field (which keeps its honest-input treatment, now pill-free) and
became a card-wide footer action. "Skip" and connect/sign-in's "Not now" unify
into ONE label everywhere — **"Not now"** + an Esc keycap hint (owner-voice, warm
deferral not a technical "skip"; already shipped in en/es/pt as `interaction.
notNow`, so no new copy). A question footer is that decline ALONE (options advance
on click); signin/connect place it beside the CTA. Esc now declines a question
step too. Copy: `questionCard.skip` removed; `suggestReusable.notNow` folded into
the shared `interaction.notNow`. Anatomy swaps `stepper-header`/`step-identity-row`/
`option-description`/`skip-pill` for `modal-shell`/`modal-header`/`step-title-icon`/
`footer-row`/`unified-decline`/`decline-esc-hint`; drops the `with-description`
state; tokens only.

Family note (judgment call): `suggest-reusable` and `plan-ready` were considered
for the shell and deliberately NOT migrated — they are composer REPLACEMENTS
(grey secondary surface, composer shape, a stacked menu of equal-weight action
rows), a different family from this floating white modal, and the shell's
header/body/footer does not fit plan-ready's three-way mode menu. They keep their
own headers; only `suggest-reusable`'s dismiss word was unified onto
`interaction.notNow`.

## v19 - 2026-07-11

`interaction-card`: three refinements from live use of the v17 Coworker cards.

Weight restraint: the family used `font-semibold` on the question title, option
labels, AND the connect/sign-in titles at once (competing bolds). It now holds
to ONE medium step of hierarchy — titles and option/identity labels drop to
`font-medium`, everything else is regular; no `font-semibold`/`font-bold`
anywhere in the card family.

Free-text escape row -> escape FIELD: the flat pencil + grey text + Skip row
read as a static row, not an input. It becomes an honest field — a hairline
`border-input bg-transparent` border on the row (the composer/`Input`
vocabulary), `cursor-text` over the whole surface (click anywhere focuses the
textarea), placeholder-toned text, a `border-ring` focus state, a leading pencil
adornment, and the inline Skip pill. Its resting look now promises the text
input it always became on focus.

Connect/sign-in restructure: the reason was a bold title with the app
description stacked under it (wrong hierarchy). Now the title row is `(icon)
integration NAME` at medium weight (the identity line — "Google Sheets" /
"Houston"), and the body is TWO fields: the agent's REASON in foreground tone
(the prominent-but-not-bold "why") over the app description / sign-in explainer
muted. This '(icon) name' pattern is documented as the family convention for any
card with an app/brand icon (the future action-approval card adopts it; the
icon-less suggest-reusable / plan-ready cards are untouched). Copy: `interaction.
connectTitle` -> `connectReasonFallback` ("Connect {app} to continue."); new
`interaction.signinAppName` ("Houston"); `signinTitle` now the sign-in reason
fallback (en/es/pt).

Decline consistency: "Not now" was hidden on a revisited/reconsidered
signin/connect step (shown only on the live frontier), leaving a reconsidered
step with only a Connect button. "Not now" now travels WITH the CTA — present
wherever connecting/signing-in is offered — so skipping is consistently
available everywhere it is legal. Anatomy swaps `step-identity-lockup`/
`benefit-line`/`pencil-badge`/`free-text-escape-row` for `step-identity-row`/
`integration-name`/`reason-line`/`app-description`/`pencil-adornment`/
`free-text-escape-field`; tokens only.

## v18 - 2026-07-11

Routines can now wake on an external event, not only a cron schedule (C9).

`routine-row` gains an event-driven variant: alongside the schedule-driven row
(schedule summary + next fire), an event routine shows a humanized event summary
("Wakes on an event in Gmail") and a live trigger-status badge -- active,
setting up, reconnect-needed (with a one-click reconnect to the integrations
surface), access-turned-off, or needs-attention. New render states
`trigger-active` / `trigger-pending` / `trigger-paused` / `trigger-error`. The
authoring surface (the wake-mechanism choice, app + event picker, and the
schema-generated config form) stays desktop-only chrome, excluded like the
schedule/cron editor.

## v17 - 2026-07-11

`interaction-card`: the whole family adopts the reference "Coworker card" look
and feel (compact, left-aligned, white-card-on-page).

Chrome: the grey `bg-secondary` surface (with raised white chips) becomes a
white `bg-background` card set apart by a hairline border + soft shadow; radius
tightens to `rounded-2xl`. The header drops the "Step N of M" eyebrow: the title
goes bold and left, and a compact "N of M" pager sits top-right whose chevrons
ARE the Back/Forward navigation (replacing the footer nav), beside the dismiss X.

Question step: the right-edge keycaps move to a LEFT circular number badge (the
digit still the keyboard shortcut); options gain a soft "Recommended" chip and a
muted INLINE description (new additive protocol fields `InteractionOption.
description` / `recommended`, tolerant/additive). The free-text row becomes the
escape row — a pencil badge + muted placeholder + inline Skip pill — and the
separate footer (Back / Skip / Next) is gone: actions live in the rows and the
pager, Enter submits the free text.

Signin/connect step: REVERSES the v16 centered identity hero. The body is now a
COMPACT left-aligned lockup — brand logo (size-6) inline with a bold title (the
reason, else "Connect {app}?" / "Sign in to Houston"), one muted benefit line —
with a footer of a quiet "Not now" + Esc hint beside a filled CTA carrying a
return-key glyph. Enter fires the CTA, Esc declines (capture-phase, pre-empts the
global Escape-closes-panel shortcut). Navigation is the header pager for every
kind, so `StepFooterApi` simplifies to `{ revisited, onSkip }` (Back node +
onForward removed); a revisited completed step shows the connected state with no
footer (pager forward is onward), a revisited skipped step keeps its CTA
(reconsider survives). Anatomy swaps `progress-label`/`keycap-hint`/`footer-nav`/
`step-identity-hero` for `pager`/`number-badge`/`recommended-chip`/
`option-description`/`free-text-escape-row`/`step-identity-lockup`/
`not-now-esc-hint`; tokens only.

## v16 - 2026-07-10

`interaction-card` signin & connect steps: the step body becomes a CENTERED
identity hero, and a skipped step is reconsiderable.

Design: the app-supplied body was a flat left row (bare logo leading name +
description). It is now a composed vertical lockup — the brand logo sits BARE
and large ON TOP (size-14, up from the size-10 leading slot; new `xl` AppLogo
size), the app name centered beneath it, one muted one-line description centered
under that. The sign-in step gives the Houston helmet the same centered slot.
The connected state integrates into the lockup: the description swaps for a calm
check + "Connected" line under the name. The family chrome is unchanged — the
eyebrow + reason-title header stays left, the Back/Skip/CTA footer stays the
shared right-aligned row — so the centered hero reads as the step BODY between
them. New anatomy `step-identity-hero` / `connected-check` (replacing
`step-app-row`); tokens only.

Bug fix (reconsider a skipped step): a revisited signin/connect step used to
show only Forward, which is right for a COMPLETED step (its card can't re-fire
completion) but stranded a SKIPPED one — no way to change your mind and connect.
Now a revisited step splits by its FINAL state: completed → bare filled Forward
(the only way on); skipped → the full actionable state returns, a ghost Forward
("keep it skipped") beside a fresh filled Connect / Sign in, never two filled
pills. Connecting / signing in there COMMITS (the earlier skip is undone), and
the completion reply derives from each step's FINAL outcome — a step skipped
then reconsidered reports "Connected {app}." (never a stale "Skipped connecting
{app}."), and no step is named twice. New state `reconsider`; ui/chat's
`StepFooterApi` replaces the pre-styled `forward` node with an `onForward`
callback (the body owns the forward button so it can pick filled vs ghost from
the connection/auth state only it knows). Auto-continue stays gated to the live
frontier, so the revisit-bounce fix does not regress.

## v15 - 2026-07-10

`interaction-card` signin & connect steps: the icon integrates into the card and
every step becomes skippable. The step's app row dropped its hairline border and
its boxed thumbnail — the brand logo now sits BARE on the card surface (size-10,
rounded; its own art carries the brand), leading the identity stack (name +
one-line description), so the step reads as a purpose-built connect card rather
than a chip inside a card; the sign-in step gives the bare Houston helmet the
same size-10 slot. The calm connected check keeps its trailing position beside
the identity stack. Skip generalizes from questions to ALL step kinds: a
signin/connect step renders a ghost Skip between Back and its filled CTA (live
frontier only — a revisited completed step still shows Forward), and a skipped
signin/connect is a recorded FACT in the completed reply ("Skipped connecting
{app}." / "Skipped signing in.", visible in the structured answers bubble when
the sequence had questions, hidden auto-continue otherwise) so the agent hears
the decline instead of re-requesting forever. New state `skipped`; ui/chat's
`StepFooterApi` gains `onSkip` (the generalized `skipStep` transition replaces
`skipQuestion`).

Also fixes the production connect-step logo regression: the shared `AppLogo`
now keys its failure latch to the failing URL (the pre-catalog favicon guess
404'd and permanently shadowed the real Composio logo) and the in-chat connect
surfaces hold the favicon-guess fallback until the toolkits catalog settles.

## v14 - 2026-07-10

`interaction-card` brings the signin & connect steps into the Mercury system —
they were the last hold-outs still drawing a card-inside-a-card. Before, the
app-supplied body floated a nested `bg-background` rounded surface (logo, name,
truncated description, AND a filled Connect pill) INSIDE the grey interaction
card, with the reason as loose text above it. Now the step body draws NO surface
of its own: the reason routes through the SAME header slot as a question's title
(anatomy `question-title` -> `step-title`, now shared by every kind; a labelled
"Connect {app}" / sign-in fallback covers a reason-less step), the app renders a
hairline Mercury row (app logo + name + one-line clamped description, the
option-row grammar; new anatomy `step-app-row`), and the single filled CTA
("Connect" / "Sign in") moves into the shared footer beside the Back node,
exactly like a question step's Next (new anatomy `step-cta`). A connecting
hand-off shows a spinner CTA plus a quiet muted line above the footer (new
anatomy `waiting-note`, new state `connecting`); an already-connected app shows
a calm check in the row (new state `connected`).

CONTRACT change (additive): `renderConnect`/`renderSignin` now receive the
shared `StepFooterApi` (`back`/`forward` nav nodes) alongside their completion
callback, so the app composes the footer without re-implementing navigation;
ui/chat exports `InteractionFooter` (the footer row's chrome) so the app's CTA
sits in the exact same spacing. `StepperHeaderProps.questionText` ->
`title`. ui/chat stays auth/Composio-unaware; the reactive connect/OAuth logic
is shared by the inline `#houston_toolkit` card and the stepper step via one
app-side hook, so only their presentation forks. New locale key
`chat:interaction.connectTitle` (en/es/pt).

## v13 - 2026-07-10

The interaction-card family adopts the Mercury settings-modal discipline:
one title, one quiet micro-label, one filled CTA, hairline rows.

`interaction-card` restructure: the header's "current/total" pill + inline
question row becomes a quiet "Step N of M" progress micro-label (anatomy
`progress-pill` -> `progress-label`) above the question rendered as the card's
real title (`question-text` -> `question-title`); a single-step sequence shows
the bare title, so screenshot states (b)/(c) look designed, not stripped. The
option row's right-aligned bare position number becomes a keycap-style hint (a
small bordered rounded square, anatomy `position-number` -> `keycap-hint`) so
it reads as the keyboard shortcut it is, never a list marker; a lone option
hides the keycap entirely (new state `single-option`). Rows tighten to the
hairline treatment (border-border/60, rounded-xl, roomier py-3), the free-text
escape hatch joins the same row group and rhythm, and the footer re-weights:
Back/Skip become ghost text buttons and Next the single filled pill (its
corner-down-left glyph is gone). Default progress copy is now "Step {n} of
{m}" (locales updated en/es/pt).

`interaction-answers-message` becomes a receipt: pairs separated by hairline
dividers (new anatomy `pair-divider`, new state `single-pair`), answers drop
from bold to medium so the bubble sits quieter than the interaction card; a
lone pair reads as a deliberate compact receipt.

`plan-ready-card` + `suggest-reusable-card` inherit the same row treatment
(hairline border, py-3, no shadow, shared focus ring) so the in-chat card
family reads as one system. No contract changes anywhere; labels props are
unchanged in shape.

## v12 - 2026-07-10

Interaction cards stop replacing the composer, and two new chat surfaces land.

`interaction-card` redesign: the card now floats ABOVE the always-mounted
composer; typing a fresh message there (or the new header dismiss X) abandons
the whole pending sequence. The header becomes a "current/total" pill plus the
question text; option rows show a right-aligned position number (1, 2, 3...)
selectable by that number key when focus is outside a text field, replacing the
check-on-selected indicator; the free-text field reads as the "something else"
escape hatch so option lists never need an "Other" row. ALL navigation moves to
one footer row, Back leftmost: Back / Skip (advance past a question unanswered,
omitted from the reply) / Next (commit), with a bare Forward for revisited
signin/connect steps. The old header back/forward chevrons and the collapse
toggle are gone. `plan-ready-card` inherits the composer-visible behavior
unchanged otherwise.

New `suggest-reusable-card`: on a clean mission finish the agent may call
`suggest_reusable`; a dismissible offer proposes saving the work as a Skill
(Sparkles) or Routine (CalendarClock). Uniquely, its lone step keeps the board
status at `done` — nothing is waiting on the user. Save sends an execute-mode
follow-up asking the agent to write the Skill/Routine; "Not now" dismisses
locally.

New `interaction-answers-message`: a completed question sequence now sends a
marker-encoded user message rendered as structured question/answer pairs (muted
question, bold answer) instead of a flat text blob; the plain-text body the
model reads is unchanged.

## v11 - 2026-07-09

`routine-row` grows a state icon and quick actions. The 8px status dot becomes
a leading `status-icon` that names the state by shape, not color alone: a clock
while the routine waits for its schedule (and while disabled, dimmed with the
row), a pulsing filled bolt while a run is in flight, an amber pause badge
while the in-flight run sleeps on a usage-limit window, a red alert when the
last run errored. On the trailing edge, next to the enabled toggle, a new
always-visible `quick-actions-menu` (three-dot trigger, same overflow idiom as
the routine editor header) offers Rename and Delete: Rename swaps the title
into an inline input (Enter/blur commits, Escape cancels — the board card's
rename pattern), Delete confirms in a dialog before calling back (the board
card's delete pattern). New states `paused` and `renaming`; anatomy `run-status`
is renamed `status-icon` and `quick-actions-menu` added. This is a labels
CONTRACT change: `RoutineRowLabels` gains `moreActions`, `rename`, `delete`,
`deleteTitle` (`{name}` token), `deleteDescription`, `deleteConfirm`,
`deleteCancel`; `RoutinesGrid` gains optional `onRename(routineId, name)` /
`onDelete(routineId)` and `RoutineRow` optional `onRename(name)` / `onDelete`
— all optional, so existing callers render unchanged minus the dot.

## v10 - 2026-07-08

Revamp `plan-ready-card`'s three options into the composer mode-menu idiom.
The stacked pill buttons (filled "Start working", outline "Run on Autopilot",
ghost "Keep planning") become full-width mode-menu rows: each row shows its
icon inline with the title (Handshake / Rocket / ListTodo, matching the
`ChatModeSelector` icons, in the title's foreground color) and a one-line
description on its own line below, with a rounded-xl hover background and
nothing hover-gated. Copy is now "Continue in Coworker mode", "Continue in
Autopilot mode", and "Keep planning". Primary emphasis comes from row order +
title weight, so there is no filled primary button anymore. The card surface
(rounded-[28px] bg-secondary), the "PLAN READY" title, and the plan summary are
unchanged; callbacks (`onStartWorking` / `onRunAutopilot` / `onKeepPlanning`)
and the `disabled`-gates-all-three behavior are unchanged. This is a labels
CONTRACT change: `ChatPlanReadyCardProps.labels` drops the flat button strings
and instead carries `{ title, coworkerTitle, coworkerDescription,
autopilotTitle, autopilotDescription, keepPlanningTitle, keepPlanningDescription
}` (`DEFAULT_PLAN_READY_LABELS` + the pure model updated to match); icons are
internal to the component. Web-only; native surfaces still defer plan mode.

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

## vN` headings.

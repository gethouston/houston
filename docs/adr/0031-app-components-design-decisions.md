# app/src/components (top-level files): design decisions

Covers the files directly under `app/src/components/` (not its subfolders): the per-agent chat panel, composer and its selectors, Mission Control, interaction step cards, the command palette and board toolbar. File paths in this record are relative to that folder.

## One per-agent chat panel hook

`useAgentChatPanel` centralizes every agent-scoped concern spread into AIBoard, so every board, the assistant and the setup chats share one implementation. Some imports use package subpaths because value imports from the package index only resolve under bundler resolution.

Lives in `app/src/components/use-agent-chat-panel.tsx`.

## Model pin resolution

The activity's pin is the per-mission override; agent config is the per-agent default; workspace defaults were retired. The last-used provider is the fallback when neither names one, and a confirmed-connected provider wins over a stale preference (through the shared `confirmedConnectedProviders` derivation), so a no-provider agent never lands on a logged-out account. The model always comes from the same source that named the provider (mission pin, agent choice, provider default), so glyph and label never disagree and a model never travels across providers; a final coherence pass falls back to the pinned provider's default. Effort is per agent and validated against the active model. Ceiling picks run only on the catalog plus confirmed accounts. In multiplayer Teams orgs pickers read and write the acting user's personal per-agent choice clamped to the allowed-models ceiling; an open mission's in-ceiling pin wins for provider and model. Once a conversation has turns its provider is frozen, so a provider that logs out mid-conversation surfaces the reconnect card instead of silently switching. Rows first served from the cross-agent placeholder cache carry no pin, so the pin is unknown until the agent's own read lands. Pins are compared across the engine and display dialects on equal terms.

Lives in `use-agent-chat-panel.tsx`.

## Settled send pin

Until every input has landed the pin is a guess bottoming out on the device-wide last-used provider, so `resolveSendPin` holds a send (bounded) until the composer settles. Legacy pin-less chats are stamped once with the agent-derived pin so a later agent default never moves a chat that already ran, but never from a placeholder row or an unsettled composer, which once overwrote real pins.

Lives in `use-agent-chat-panel.tsx`.

## Picks are scoped to the open chat

A pick inside an open chat pins that conversation's activity only and never touches agent config; a fresh-composer pick sets the default (and the device's last-used, which seeds the create dialog). The picker flips optimistically, echoing a pick for one activity id until the row reflects it. `config.json` is canonical while the picker uses display ids. Switching to a different provider mid-conversation spends tokens, so a consent dialog asks first once output exists; the runtime applies the handoff on the next send. A ceiling that moved under the user is already an expected-state toast. Effort rewrites carry the resolved model and are clamped to the ceiling so the gateway does not answer `model_not_allowed`.

Lives in `use-agent-chat-panel.tsx`.

## Composer states

With no provider connected the input area is replaced by one CTA into the AI Hub, returning on its own when a provider connects, except when a requested provider connection already offers the remedy. Opening an agent whose hosted pod is scaled to zero detects the asleep engine so sends park with the warming machinery instead of hanging. The context indicator divides latest usage by a self-correcting window estimate; a new provider uses its catalogued default window. Dictation (desktop only) appends to the same draft store AIBoard reads, keyed like the board's drafts. Integration connect cards render only when the host advertises integration providers. Teammate attribution shows on every turn in multiplayer; @mentions are empty off multiplayer.

Lives in `use-agent-chat-panel.tsx`.

## Edit and copy

Editing a previous user message happens in place on its row; switching conversations abandons it. Rewind runs first so a truncate failure leaves the editor open with the text. Only messages the user typed are editable (no markers, no channel relays, only one's own in shared threads), and editing is disabled while a turn runs to avoid the runtime's 409. Copy is allowed on any row whose raw content is what the bubble shows.

Lives in `use-agent-chat-panel.tsx`.

## Skills in the composer

A selected Skill only wraps the submitted message with the hidden marker and a "Use the X skill" prompt; text and attachments stay the composer's. Mid-conversation it sends through the normal pipeline with the turn stream pushing the bubble; new conversations get a readable title override. Mentions typed alongside ride the send. Unedited English store skills are swapped for the workspace language's versions. The selected skill clears on agent or session change.

Lives in `use-agent-chat-panel.tsx`.

## Sends that reactivate archived missions

Every send this hook owns (interaction offers, Skill submits, the integration-connected nudge, error-card retries) reports through `onSendReactivated` after it lands, because each starts a turn that reactivates an archived mission. Callbacks are held in refs so override cards do not re-render on every fresh closure. The nudge uses a two-argument `then` so a throw in the handoff is not reported as a failed send.

Lives in `use-agent-chat-panel.tsx`.

## Pending interactions

The card shows the live VM interaction if this client settled the turn, else the persisted one, and is hidden while a turn runs. Interactions have no single id, so the joined step ids key "the user abandoned this one"; suppression resets at each turn start because the engine null-clears the prior interaction and step ids repeat (every plan_ready step is "p1"). The stepper's X is a Stop: hide at once, append the durable stop marker, and clear the persisted card; only a confirmed clear is definitive. Clean-finish offers are dismissed per step so sibling offers survive reload. Plan-ready starts a turn with an explicit `modeOverride`, never the uncommitted mode state. Suggested action pills prefill the composer instead of sending. Child and parent mission navigation replaces the follow-up bubbles but never a blocking step. Archived surfaces get only non-blocking offers, since archiving answers nothing. Store apps show payment links as plain text.

Lives in `use-agent-chat-panel.tsx`.

## Chat panel error cards and notices

Unlabeled provider-error cards are attributed only from evidence of what the chat used, never the composer's "anthropic" fallback, which once told OpenAI users to "Connect Anthropic". A refused not-connected send resends the original message verbatim without a second bubble; a mid-turn auth failure resumes with a hidden auto-continue nudge. The resume is an `autoResume` send: held at most once if a turn shows running (several cards can fire it), dropped when redundant, and held invisibly. The inline reconnect card is the stable surface; the connect-AI empty state suppresses the store-driven card to avoid two CTAs. The store card always gets this chat's provider so a Claude logout never shows a reconnect button in an OpenAI chat. A shared-agent note warns teammates their reply is visible to others (multiplayer only). The welcome greeting is a hardcoded localized message derived from the `welcome-` session key and held back briefly on the creating run; skill cards are hidden during the welcome and self-setup beats so they do not flash under the greeting.

Lives in `use-agent-chat-panel.tsx`.

## Composer toolbar

One row at both breakpoints: on phones the Skills entry moves into the "+" menu, effort becomes its gauge icon, pickers drop chevrons, controls are 44px and the row scrolls sideways. Edit and copy affordances appear only while the conversation is idle, since a rewind behind a running turn is refused (409). Messages carrying file comments render as pills and are neither copyable as raw text nor editable.

Lives in `use-agent-chat-panel.tsx`.

## Mission Control data

Activity ids map to agent paths for card handlers; session keys map directly to agent and activity, because routine chats use `routine-{rid}` keys and stripping an `activity-` prefix loads an empty chat. A failed sweep never reads as "no missions": React Query's `placeholderData` covers pending only, so on error the board would show zero cards and auto-open the composer. Missions started against a cold engine are overlaid as running cards until real rows arrive (their row write is held through warm-up). Contributor profiles resolve only in hosted Teams; single player stays byte-identical. Card names come from the roster, not the swept row (whose web registry falls back to "Houston"). Archived missions and guided setup chats never appear on the active board. Skill and attachment markers are decoded on cards. The raw sweep rows (before filtering) are the only input to the surface router.

Lives in `use-mission-control.ts`.

## Mission Control sends and creates

Sends into a warming or asleep pod park in the queue and flush on ready, re-reading the mission's own pin. Cross-agent sends carry the mission's stored provider and model from the cached activity list, because the session router reads agent config only when no override is sent. The turn stream pushes the bubble; the adapter holds sends into a running turn. A failure before a turn stream exists toasts. The blank "New mission" path routes through `createMission` with the agent explicit; the new mission's identity is held until the sweep returns it; `createMission` does not go through the mutation hooks, so the list is refreshed manually; failures roll back and toast.

Lives in `use-mission-control.ts`.

## Connect step in chat

The title is the app's brand and action; the agent's reason is the body. Auto-continue fires only on the live frontier, since a revisited completed step's fresh card would otherwise re-fire and bounce the user forward. A revisited skipped step keeps its Connect CTA. A reconnect step counts as done only once a reconnect started here lands, or a connection made after the refusal time, because the dead connection still reads active. Curated toolkits open their options dialog. Decline relays typed text verbatim.

Lives in `chat-connect-interaction-card.tsx`.

## Shared connect logic for chat surfaces

The inline markdown connect card and the stepper's connect step share one hook. No-auth toolkits read as connected from the catalog, since they have no connection row and Connect would 400 with `toolkit_no_auth`. Logos wait for the catalog to settle so the favicon guess is only for real misses. The connect flow's identity includes the agent scope, so an account-scoped manager connect is never joined by an agent card. A surface is connecting only while its own slug's flow runs. The resume nudge fires once per surface and only for a connection driven from it; success toasts come from the shared flow so joined flows never double toast. In stepper mode an already-connected toolkit self-reports once so the sequence advances.

Lives in `use-integration-connect.tsx`.

## Model selector

The provider is never locked; mid-conversation switches are staged by the panel. Visibility follows the Teams matrix: managers and owners always see it, Teams members see it, members on a pre-Teams multiplayer host see nothing (hooks still run to keep hook order stable). The option list is clamped to the allowed-models ceiling, and exactly one allowed model renders read only. Pointer events on the trigger stop bubbling so the detail panel does not treat them as outside clicks. The popover prevents auto-focus both ways since the picker places focus itself. A routine's selector labels the resolved provider and model pair.

Lives in `chat-model-selector.tsx`.

## Connect step shell

Sign-in, app connect, credential and provider connect steps share one shell. Typed free text is parked by the stepper so it survives the card being torn down. Enter acts and Esc declines only while the step is live and idle, preempting the global Escape-closes-panel shortcut in capture phase. A step holding something that must not be walked away from (a key shown once) swallows Escape instead of letting it close the panel, and offers no decline, pager or dismiss. A decline empties the row so sent text does not reappear on revisit. Bindings park when the surface is not the active view.

Lives in `chat-connect-step-shell.tsx`.

## Search folding and highlights

`foldForSearch` is one native normalize/replace/lowercase pass shared by matching and highlighting; the per-character `foldWithMap` (about 100x slower) exists only to map highlight ranges back to original text and is for short strings. Transcripts are folded once on load and matched with `findFoldedMatch` per keystroke. Phrases match contiguously with flexible whitespace. Snippet ranges are recomputed against the final display string, since whitespace collapsing and ellipses shift indices. A `start + 1` guard handles zero-width hits inside expanded ligatures.

Lives in `mission-highlight.ts`.

## Context indicator

A ring gauge with percentage; the detail is a hover card on desktop and a tap sheet on phones, a structural fork since hover is dead on touch. Token counts are compact and locale aware.

Lives in `context-indicator.tsx`.

## Interaction reply composition

A completed sequence sends one message: the visible answers when it had questions, else a hidden auto-continue. It appends each step's final outcome (connected, signed in, skipped, reconsidered) in step order, because a skipped step the agent never hears about gets re-asked forever. OAuth credential steps read as sign-ins. Hands-on steps record the only evidence of what happened on a screen nothing can observe.

Lives in `chat-interaction-reply.ts`.

## Turn summary

Saved skills are named after the skill whose SKILL.md the turn wrote and land in the agent's Skills section. Settings targets the user cannot reach are stated, not offered.

Lives in `turn-summary-section.tsx`.

## Hands-on errand card

One card covers every task only the person's own hands can finish (a card on file, a key revealed once, files on their device, a space only they may destroy), since none can carry a result back. Only an employee's own screen asks whose it is, because its Settings are drawn for managers alone. API errands run inline only in the AI Manager's chat; in a mission chat the reason shown above the mint form would be written by the model rather than asked for by the person. The inline API key card reuses `api-key-create-flow.tsx` and mints nothing while capabilities load.

Lives in `chat-hands-on-interaction-card.tsx`, `chat-hands-on-api-key-card.tsx`.

## Mission history scan waves

Transcript loads run with bounded concurrency so a big board never opens one request per mission at once. A failed load is recorded as an empty transcript so it is not retried on every keystroke, and reported once per wave. Missions already matched by title or description need no transcript. Each wave is tagged with its phrase and stops starting work when the phrase changes; in-flight loads still commit, since a transcript is a fact about the mission. A superseded wave's unclaimed missions are released and immediately relaunched for the current phrase, because nothing else would retrigger them. The spinner is published only when it flips. Results commit in time windows so the board does not re-render per mission. The bookkeeping is hook-free for direct unit tests.

Lives in `mission-history-scan-wave.ts`, `use-mission-history-scan.ts`.

## Inline connect card state

A link carrying `#houston_toolkit=<slug>` renders as a connect card on any base URL, so cards survive prompt revisions. Slugs are compared lowercased and trimmed, since agent-authored fragments vary and a raw comparison leaves the card stuck on Connect. No-auth toolkits count as connected. A reconnect step counts only connections made after the refusal. In stepper mode an already-connected toolkit self-reports so the sequence advances.

Lives in `integration-connect-card-state.ts`.

## Step cards advance only

Every step renderer records its outcome and advances; the composed reply fires once at completion, because starting a turn from a single step would tear the card down mid-sequence. Signed-in wins over an earlier skip. A typed decline makes the sequence resume visibly so the agent hears the redirection. The AI Manager connects for the account, an agent chat for its agent.

Lives in `chat-interaction-step-cards.tsx`.

## Sender identity

In multiplayer every turn shows its sender (teammate face and name, or the agent's mark and name); single player is unchanged. The hook passes `true` or `undefined`, never `false`, so `ui/chat`'s two-author heuristic remains the fallback while the viewer profile resolves. A person's name tone hashes the same user id as their avatar fill, so one teammate has one color everywhere; the agent uses its avatar color. Faces are 32px with the agent mark matching.

Lives in `use-chat-sender-avatars.tsx`.

## Interaction stepper instance

Everything that lives as long as one walked sequence (outcome log, mapped steps, completion callback) belongs to a keyed instance. It is a builder so the `key` travels with the component; otherwise React reuses the instance when switching between missions' pending cards. The identity comes from the wire steps. A connect flow that outlived its card would complete an old sequence and send answers the user is still editing, so callbacks check that their card is still mounted.

Lives in `chat-interaction-stepper.tsx`, `use-parked-interaction-card.ts`.

## Parked interaction state

The card replaces the composer and is torn down when the user opens another mission, so position, answers, outcomes and per-step free text are parked per conversation and identity, never hydrating a different card. A restored position past a skipped connect step refills the outcome log so the reply mentions the skip. Approvals are stripped on hydration so nothing unsafe replays. A child that parked during mount is not overwritten by the seed.

Lives in `use-parked-interaction-card.ts`.

## Credential step

The list read and save use the per-agent routes, since the top-level form 404s behind the gateway. A slug that resolves to no registered integration (on a settled list) shows an honest dead end instead of a form whose save would 404. OAuth integrations render as a Sign in card that completes out of band when the grant lands, advancing once. A key that saved but failed the service's probe warns and still resumes. The sign-in tab is claimed in the click; a refused open keeps the minted URL for an explicit click.

Lives in `use-chat-credential-step.ts`, `chat-credential-interaction-card.tsx`, `chat-credential-step-fields.tsx`.

## Command palette

The palette's open state lives in the UI store so any shortcut can toggle it. Archived missions and setup chats are excluded from recent missions. Opening a mission uses the same handoff as notifications (open the board, publish `activityPanelId`), deferred so the palette unmounts first and focus lands on the composer.

Lives in `command-palette.tsx`.

## Sign-in step

The sign-in step drives the same Google SSO as Integrations and advances once when the session is ready. On the frontier it fires on ready even for a stale already-signed-in step; on a revisit it fires only if the user signed in from the card, so it does not bounce them off. A signed-in step keeps its body because it answers whose identity the agent acts under.

Lives in `chat-signin-interaction-card.tsx`.

## Connect step for curated entries

Composio apps use the OAuth hand-off; curated entries open the curated dialog, since the generic connect would 400. Both hooks always mount and each is inert for the other family. A curated connection counts through the MCP definition or the provider's own app; a reconnect step counts only a fresh provider connection, since the definition carries no timestamp. The resume nudge fires once when a curated connection lands on the live frontier.

Lives in `use-chat-connect.ts`.

## Provider connect step

Secrets go only through the existing secure dialogs; the SDK observes fresh auth evidence. The provider resolves through the gated connect list, never the raw catalog, which once offered a local-model dialog on a host with nowhere to point it; gateway ids resolve too. The card spins only until the first answer. Cancel and resume are remembered per request (the whole request, since every turn's first step id is "p1"), not per mount, because the card is rebuilt after the turn its nudge starts and a second nudge would loop. An answered step's memory is dropped.

Lives in `use-chat-provider-connect.ts`, `chat-provider-connect-interaction-card.tsx`.

## Persisted interaction writes

Clearing and per-step dismissal share one persist-then-repaint path; the activity write does not self-toast, so failures surface here. A clear resolves true only when the card is gone. Per-step dismissals chain from the last write via a ref so consecutive dismissals do not resurrect each other. When the runtime refuses a dismiss because a turn is running, the card was stale: repaint only, since a clear would race that turn's settle write. Callbacks are keyed on stable id strings so refetches mid-sequence keep them stable.

Lives in `use-persisted-interaction.ts`.

## Mode selector

Planner (read only), Ask first (execute) and Autopilot (auto) follow the same audience as the model selector. Trigger pointer events stop bubbling so the detail panel does not close.

Lives in `chat-mode-selector.tsx`.

## Mission history scan hook

The scan passes `observe: false`, marking a bulk read so the adapter reads a bounded window and spawns no observer stream. The scanner reads the caller's latest functions through a ref, so a fresh `loadHistory` identity does not wipe its memory; the ref is assigned before the scan effect.

Lives in `use-mission-history-scan.ts`.

## Mission Control follow-up pin

An existing activity's stored provider and model are the per-activity override, often different from the agent default; the engine's session router reads agent config only without an override. Legacy aliases (`opus`, `sonnet`) normalize to explicit versions. Rows store pi's canonical ids, so they are converted to display ids and re-canonicalized at the wire (`wireTurnPin`). The pin is read from the cached list, not a pod round trip, because the read once rode the whole cold start and froze the composer. Effort is always the composer's. Mode is the conversation's kept mode. The module imports with an explicit `.ts` extension so `node --test --experimental-strip-types` can load it (`allowImportingTsExtensions` is on in `app/tsconfig.json`).

Lives in `mission-control-send.ts`.

## Board toolbar

The team chrome measures its strip and decides between the strip and row forms; the caller never picks. Search, filter and primary action read left to right in both board sections. With a chat open the person filter collapses to its face.

Lives in `mission-control-toolbar.tsx`.

## Person filter

A real filter in hosted team spaces and legacy multiplayer hosts; a growth teaser in a personal space on a spaces host, offering Everyone plus an "invite your team" row that opens the create-organization dialog. Faces carry the person's id so initials use their stable `person.*` tone everywhere.

Lives in `mission-person-filter.tsx`, `mission-person-teaser.tsx`, `mission-person-face.tsx`.

## Inline connect card

Status and action stay visually distinct, because fusing them was ambiguous.

Lives in `integration-connect-card.tsx`.

## Effort selector

One click cycles to the next level the model accepts and wraps. It is hidden for models without effort levels and for members on pre-Teams multiplayer hosts. A legacy `max` normalizes to `xhigh`. The gauge always renders the full spectrum so it looks identical across models. On phones only the gauge shows; the aria-label carries the value.

Lives in `chat-effort-selector.tsx`.

## Model picker empty states

"Nothing connected" has two variants by space kind (a team space where each viewer connects their own account versus personal), so a new team space never reads as broken. The connect action renders only where the viewer can reach the AI Models hub. Picker rows name whose account runs the models when the deployment says. When the allowed-models ceiling, not a missing connection, empties the picker, the story is `connect` (a disconnected AI offers an allowed model), `choose` (a manager can open Models settings) or no action for viewers who can do nothing.

Lives in `chat-model-selector-labels.ts`, `chat-model-selector-ceiling.ts`.

## Attachment policy

`prepareAttachments` is keyed on the policy value, not object identity, so callers may build policies inline.

Lives in `attachment-rejection-dialog.tsx`.

## Mission search

Queries are folded and whitespace-collapsed so a multi-word query is one phrase. Title matches show no snippet and the title is never highlighted. Bodies and scanned history (including the user's own messages) produce a snippet cut from the matching lines only, since the index-mapping fold is a per-character walk and one line is one message. Matching against loaded transcripts runs on the raw query every keystroke; only the network scan is debounced. The spinner stands only for missions not yet scanned, and an emptied box is never searching. One analytics event per search session.

Lives in `mission-search.ts`, `mission-search-text.ts`, `use-mission-search.ts`.

## Command palette lists

Empty groups render nothing, separator included. Agent badges are 28px so cmdk's forced 20px svg sits at its native proportion.

Lives in `command-palette-lists.tsx`.

## Conversation turn mode

A mission keeps its mode on its card, so leaving, restarting or another surface reads the person's pick; a fresh composer holds the pick in session and starts on Ask first. A failed write keeps the pick for the session. A pick during a streaming turn also applies to that turn, since the runtime mutates its live-mode ref; `applied: false` is benign.

Lives in `use-conversation-turn-mode.ts`.

## Interaction step mapping

Question steps that name a toolkit are branded with the app's identity. Custom step titles use provider display names, never wire ids. Hands-on errands ride the generic custom step so a screen this build does not know still gets a title. Provider names resolve through the gated connect list so title and card agree.

Lives in `chat-interaction-steps.ts`.

## File card

The affordance icon mirrors the click: external link for an OS hand-off, eye for the in-app preview.

Lives in `file-card.tsx`.

## One interaction send

Every interaction card sends its composed reply as a normal user message; the turn start clears the interaction. A provider connect claims its single resume before the reply is composed, so a reply that never leaves the client gives the claim back, or the retry would be refused.

Lives in `use-send-interaction-message.ts`.

## New task button

The section's primary action, sized at the strip's 32px lozenge height, lives in the section's tools, not the strip. The trigger's click is the request; the caller turns it into a direct open or a menu so no frame shows a needless menu. A locked org takes no new task.

Lives in `new-mission-button.tsx`.

## Agent picker dialog

The one "which agent should run this?" modal wherever a create spans several agents; it only asks, and what happens next belongs to the caller.

Lives in `agent-picker-dialog.tsx`.

## Action brand resolver

`integration_execute` actions are branded for the process header: custom executor addresses (`tools.<slug>...`) resolve against the chat's own agent's custom list on per-agent deployments, Composio slugs through the catalog. A service favicon is used when the view carries one.

Lives in `use-action-brand-resolver.ts`.

## Failed agent reads strip

A read that did not answer is shown inside the surface above the content, not as a toast, because it is a standing fact. The i18n variable is `failed`, not `count`, so i18next does not look for plural keys that do not exist.

Lives in `agent-reads-failed.tsx`.

## Provider switch dialog

Mark and name derive from one provider id so they cannot disagree. Both handoff modes (replay, summarize) ask first because both spend tokens.

Lives in `provider-switch-dialog.tsx`.

## Effective provider

Evidence order: the turn's activity pin, the agent's configured provider, then the last provider the chat used; empty strings are absent. Mid-conversation the provider is frozen even when logged out, so the reconnect card shows. A fresh composer never defaults to a disconnected provider; only a confirmed sign-out moves it.

Lives in `chat-effective-provider.ts`.

## Display labels

While connecting (no output yet) the indicator plays a rotating astronaut line; once executing, the header holds the concrete task. A send the shared compute had no room for shows a connecting line while the SDK re-sends (`sendWaiting`).

Lives in `use-chat-display-labels.tsx`.

## Phone compose sheet

The phone's compose asks which agent in a bottom sheet and pushes that agent's empty draft chat; a board's compose scopes to its own agents.

Lives in `mobile-new-mission-sheet.tsx`.

## Dictation consent

The first mic use asks consent before downloading the roughly 181 MB whisper.cpp `ggml-small-q5_1` model; `useDictation` owns the progress subscription.

Lives in `dictation-setup-dialog.tsx`.

## Turn modes

Ask first maps to `execute`, Planner to `plan`, Autopilot to `auto`; wire values stay, only labels change. The list is ordered as an autonomy dial (Planner, Ask first, Autopilot) and shared between the desktop menu and the phone sheet.

Lives in `chat-mode-options.tsx`.

## Board columns

One status-to-section mapping serves the column builder, drag and drop and multi-select. The "Move to done" checkmark appears on exactly the Needs you contents, including `error`, since the engine parks finished work there either way and only the user moves it on. The archive box appears on exactly the Done contents. A locked org drops the Running column's "+". `archived` belongs to no column.

Lives in `mission-board-columns.ts`.

## Skill cards and icons

Skill cards use the solid chip fill (`bg-chip-solid`) because the alpha fill reads see-through on translucent surfaces. Icons accept a URL or a Fluent Emoji slug resolved from jsDelivr, render grayscale, and fall back to `sparkles`. The integration chip row returns `undefined` rather than a null-rendering component so optional slots keep their own spacing.

Lives in `skill-card.tsx`, `skill-icon.tsx`, `skill-integration-chips.tsx`.

## Turn summary integration rows

External artifact rows show the app logo (wrench for custom integrations, globe as a fallback) and, with a URL, open the artifact with a visible external-link glyph. A raw slug is never rendered.

Lives in `turn-summary-integration-row.tsx`.

## No-AI composer state and dividers

The connect-AI empty state stands in the composer slot (`chat-panel.tsx` hides `ChatInput` for replace-mode overrides) and tells the personal or team story. Conversation dividers mark compaction (automatic or `/compact`), provider switches and clears; the clear sentence wraps on phones.

Lives in `chat-connect-ai-empty-state.tsx`, `context-compacted-divider.tsx`.

## Mentions

`ui/chat` never fetches; the app resolves the mention roster (viewer excluded for the composer, included for chipping replies), row faces and labels from the active space's directory. Off multiplayer the rosters are empty.

Lives in `use-chat-mentions.tsx`.

## Move conflicts

A drag-move onto an existing name offers Replace or Keep both instead of surfacing the host's 409 as an error.

Lives in `move-conflict-dialog.tsx`.

## Step keys and decline pill

One capture-phase Enter and Escape handler serves every interaction step card; each key is optional. The decline pill with its Esc keycap is shared so the cards render one affordance.

Lives in `use-interaction-step-keys.ts`, `chat-step-decline-button.tsx`.

## Toolkit brand resolver

Question cards show an app's identity without starting OAuth. `appDisplay` is the one fallback owner and receives the toolkit as written, since lowercasing first turned "GoogleSheets" into "Googlesheets". Logos show only for resolved entries once the catalog settles.

Lives in `use-toolkit-brand-resolver.ts`.

## Mission Control create planning

The target agent of a cross-agent "new mission" is resolved (and its absence handled) in a pure function, so the routing that once regressed is unit tested.

Lives in `mission-control-create.ts`.

## Spec chip

One neutral pill for small facts beside a name (model specs, banked experience), so one kind of count never has two shapes.

Lives in `spec-chip.tsx`.

## Notice copy

Typed system lines render from the SDK's `EngineNoticeKind` in the person's language; the map is exhaustive so a new notice without copy fails to compile. `SystemNote` matches `ui/chat`'s default row so translated copy looks identical, because returning `undefined` would fall through to the English default.

Lives in `chat-notice-copy.ts`, `system-note.tsx`.

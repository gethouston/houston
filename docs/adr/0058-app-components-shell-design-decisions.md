# app/src/components/shell: design decisions

Covers `app/src/components/shell/`: the app shell: sidebar and rail, top-level screens, gates, dialogs, update and reconnect notices, provider sign-in and the choice and question cards. File paths in this record are relative to that folder.

## Remote provider sign-in dialog

For remote or headless engines, where the provider sign-in cannot open the user's browser, the engine sends a `ProviderLoginUrl` event. The raw OAuth URL stays hidden by default behind Open and Copy, with reveal as the manual fallback. The dialog never calls `window.open` itself. For the Claude token paste flow the wire `instructions` string is only a flow marker: its content is never rendered, because an older engine's copy told users to run a CLI command; localized CLI-free steps are shown instead, and the reference link always points at the Console API keys page (mirroring the runtime's `ANTHROPIC_TOKEN_HELP_URL`). The dialog stays open after submit and closes on `ProviderLoginComplete`. A login the runtime already dropped (abandoned-login timer, restart) is an expected state with authored copy. Per-open state resets so stale codes or revealed URLs never leak.

Lives in `app/src/components/shell/provider-login-dialog.tsx`.

## Desktop Claude browser login

The happy path is a spinner while the native `claude auth login` completes through the browser. Returning focus after being away is the signature of a stuck hand-off: the dialog silently tries to finish from a copied code, and only if that finds nothing shows the "Claude showed you a code?" link; a timer reveals it as a backstop. The dialog closes on `claude-login://done`.

Lives in `provider-login-browser-pending.tsx`.

## Provider marks

Every mark is a real single-color logo from models.dev (MIT), rendered in `currentColor`; Anthropic's current starburst comes from LobeHub because models.dev serves a retired glyph. The local provider uses Houston's own server glyph, not a brand.

Lives in `provider-marks.tsx`.

## API key dialog

A "Get your API key" button opens the provider dashboard. Azure OpenAI also collects the resource endpoint. Typed verdicts (bad key, blocked key, unreachable) show actionable copy; a reason-less failure shows the host's own sentence minus the "(engine error NNN)" suffix instead of generic copy, which had made failures undiagnosable. All failures keep the dialog and key for a correction. A resolved close is marked as completion, because a dismissal cancels the connection observation. A plain member on the org-level connect sees an inline expected-state note (owners/admins only).

Lives in `provider-api-key-dialog.tsx`.

## Copilot connect

One card with two sign-in homes: github.com (personal and Copilot Business, whose entitlement follows the account) and a GitHub Enterprise domain for data-residency companies. An unusable domain fails in the dialog with a remedy rather than inside a device-code flow; github.com typed into the company field is the github.com path. The close after a plan is picked is progress, never a dismissal, since a dismissal would cancel the observation as the sign-in starts.

Lives in `provider-copilot-connect-dialog.tsx`.

## Local model manual form

The manual path (and the web fallback without a native bridge) collects address and model with no tunnel. Typing a model id re-applies the reasoning default until the user flips the toggle. The cloud host's "can't reach that address" 400 shows the rule it broke rather than generic copy that filed a Sentry issue per attempt.

Lives in `local-model-manual-form.tsx`.

## Reconnect card lifecycle

`launchLogin` resolves when sign-in starts, not completes, so the card waits for `ProviderLoginComplete`. The auto-resume resend fires once per card. The subscription is held in a ref so it mounts once and cannot drop an event. With no provider on the error, any success satisfies the card, but unrelated failures do not move its phase. Success clears the global signed-out flag. A benign cancel re-arms unless the card issued it as the first half of a relaunch. Non-OAuth providers never hit `launchLogin` (the engine 400s); they open the key or local dialog, and no provider at all opens the AI Hub. The org-policy card opens the AI Hub, because a reconnect cannot heal it. With no provider the card uses generic copy, since interpolating an empty provider or guessing one lied.

Lives in `provider-error-cards/use-provider-login.ts`, `provider-error-cards/auth-presentation.ts`.

## Guided role questions

Answers are stored as labels (they go into the job description), capped at `AGENT_ROLE_PART_MAX_LENGTH` wherever written, including the filter query taken as an answer. Each question holds one answer: picking from the catalog drops the typed one and vice versa, and a new context drops the role picked from the previous context's list, except when an answer is given again on the employee card. Only an open resets, so a late start never overwrites an answer already changed. Onboarding passes survey answers as the start; the in-app dialog passes nothing.

Lives in `use-agent-role-state.ts`.

## Choice step

Picking a suggestion answers outright; typed answers confirm with Continue. Opening the typed answer carries the filter's words over. Enter picks the first match, or the typed words when nothing matched; an IME's Enter answers nothing. Escape has one owner at a time: typed answer, then query, then the dialog. Suggestions stay visible but unreachable while typing. Chips use one roving tab stop.

Lives in `choice-step.tsx`.

## One create sheet

Everything a user adds to their workspace goes through one sheet; doors differ only in the screen they open on. A choice with one answer is not a screen. Doors express intent, while gates settle after open, so walked steps are state measured against the current shape each render and a screen the run turns out not to have is cut from the trail. A run that ends up with no screen shows nothing. Back goes up one level of the tree, and moves enter from the side they travel. Screens with no primary action have no bottom bar. Scanning screens (catalog questions, copy wizard) use the tall frame; others the hand-sized one, which only fades on entrance because a 12px slide scrolls it sideways.

Lives in `create-agent-steps-model.ts`, `add-to-workspace-sheet.tsx`.

## Team identity popover

The swatch row uses the agent palette; clicking the selected swatch clears it, replacing a synthetic gray "Default". Search matches localized names and concepts alongside English keywords. The popover has a fixed width equal to the full 14-column grid so filtering never shrinks it. The tint is inherited from the grid, so unpicked and picked marks are one object in two states.

Lives in `team-identity-popover.tsx`.

## Workspace frame

The app frame is the rail, one floating screen card and the shared detail panel. The kept-alive set is keyed by workspace so switching drops workspace-scoped screens. On phones a chat is a pushed full-screen place with the bottom chrome hidden (`phoneChromeHidden`); the desktop ignores it. A file preview or wide chat steps `<main>` out of layout while the board stays mounted. The frame uses `h-dvh` and `pt-safe`; phones are one flat background with no gutter or rounding.

Lives in `workspace-shell.tsx`.

## Activity summaries and folded teams

Sidebar summaries extend the unread model's input so the two cannot disagree on what a mission is. "Never given work" (`none`) is only a confirmed answer after the agent's slice was read in full this session; anything else is `unknown`, so a veteran employee is never shown as new. A folded team's header rolls up its members' needs-you counts and running missions from the same per-agent summaries, because collapsing a team must not hide that agents need something. While the cross-agent aggregate has not fetched, an agent's own activity list is the fallback. Routine setup chats never count.

Lives in `agent-activity-summary-model.ts`.

## Plan modals and rows

One plan modal at a time: the promo-ended notice waits for the pricing-change modal and other plan dialogs. The pricing-change modal is cloud only and its show/close/page rules live in the SDK (`choiceModal`, `nextChoiceModalFrame`, `nextChoicePage`). Payers keep the price they signed up at; others see list prices from the gateway. The promo-ended notice targets only the billing owner on the promotional price (`billing.priceNotice`), preselects yearly where sold, and keeps the offer up when a card is declined. The upgrade row is a button only for the billing owner, a status line for others, and never sends anyone to upgrade in the store apps. The free-org picker draft lives in its frame so stepping back into the intro keeps it; focus lands on a fallback that outlives the opening row.

Lives in `plan-lifecycle.tsx`, `billing-change-modal.tsx`, `billing-change-copy.ts`, `promo-ended-modal.tsx`, `plan-upgrade-row.tsx`, `free-org-picker.tsx`, `free-org-picker-rows.tsx`.

## Phone More menu

The More card holds the desktop rail's foot, headed by the workspace switcher. Rows are 48px with one 16px edge and type size. Dialogs opened from it mount outside the sheet, since the sheet unmounts on close. Back from the account page returns focus to the opener. The account menu's parts are shared between the rail and the phone so both offer the same actions; sign-out failures surface on the auth-error bus.

Lives in `mobile-more-menu.tsx`, `sidebar-account-menu.tsx`.

## Provider logos

One registry (`BRAND_LOGOS`) maps a `BrandKey` to its mark, exhaustively; callers pair `providerLogo(id)` with the `Monogram` fallback tile, drawn in the same 24x24 slot with a `currentColor` wash so it reads in both themes. Qwen uses the `alibaba` mark from models.dev.

Lives in `provider-logos.tsx`, `provider-marks-extra.tsx`.

## Create workspace and organization

AI is connected once for the whole app, so naming is the only question before a workspace exists; the app switches to it behind the dialog so the team card hires into the current workspace. Name conflicts show inline while typing. Organizations (`POST /v1/orgs`) render only where `capabilities.spaces` is advertised; each person has one free org, and when that slot is taken the dialog offers a paid create with live prices. The checkout tab is claimed in the click because the URL arrives only with the create's answer.

Lives in `workspace-dialog.tsx`, `create-organization-dialog.tsx`.

## Quota and model-availability cards

Optional `RowCard` slots pass `undefined`, not `false`, because its slot test is `!= null` and `false` would mount an empty action span. The card names the model (or provider) by catalog label, never a wire id. When the turn ran on the sender's own account, the copy says so, so members do not ask an admin to fix their personal plan. Azure `not_deployed` outranks that wording because the model is missing from the resource.

Lives in `provider-error-cards/quota.tsx`.

## View guards

A view is stale only once the capabilities behind the gates have loaded; until then it is in flight. A space change arms the guard first so its outgoing view cannot disarm the new space. A closed, settled organization gate cannot honor a pending Admin tab. A manager running onboarding stays reachable regardless of discovery. The guard returns the same object while nothing changed, since the caller holds it as state.

Lives in `view-guard-rules.ts`.

## Reconnect card scoping

`authRequired` is one global flag set by the last session that hit an auth error; it drives a card only when it names that chat's provider, so a Claude logout never shows "Connect Claude" in an OpenAI chat, and the global flag is cleared only for the provider just confirmed. The card clears on a fresh connected probe through the shared `reconnectCardShouldClear`; a failed probe proves nothing. A local OpenAI-compatible server reconnects through its dialog, never `launchLogin`.

Lives in `provider-reconnect-card.tsx`.

## Device code panel

The verification page opens once per mounted panel even if a re-emit swaps the code; a failed open is surfaced by `openUrl`. Copy confirmation shows inline on the code box and resets on a new code or unmount.

Lives in `provider-device-code.tsx`.

## Update launch overlay

An undismissable alert dialog runs the install to a relaunch; errors offer retry. It sits at `z-[70]`, above the lesson band at `z-[60]`, so recovery controls are never veiled. The surface itself takes focus because Radix would focus a Cancel that does not exist. Its live region is pinned assertive, since a region whose politeness flips is announced under the old setting.

Lives in `update-launch-overlay.tsx`.

## Choice row

One row with two states sharing geometry: browsing (filter plus "Something else") and answering (field plus Continue). The filter carries the answer's own cap because it seeds the typed answer. The answer is seeded verbatim into instructions, so a pasted page stops at the field's limit. `md:contents` dissolves the wrapper on desktop so Continue sits where the door stood.

Lives in `choice-row.tsx`.

## Choice keyboard

Arrow movement measures chip rows live at keypress, since rows change with width. Typing anywhere on a searchable question goes to the search field with the starting character, listening on the document. Escape belongs to the question before the dialog; an IME's Escape only abandons composition. Focus returns to the opener after the leaving state renders.

Lives in `use-choice-keyboard.ts`.

## Local model dialog

On desktop the guided dialog detects LM Studio, Jan or Ollama and tunnels the chosen model to the user's cloud agent (mint credentials, start bridge, register endpoint). Success reports the real model id before closing so onboarding can select it. A reasoning toggle marks the endpoint as a reasoning model.

Lives in `local-model-dialog.tsx`, `local-model-dialog-parts.tsx`.

## Engine gate

The hosted OAuth mode waits for a Firebase session token before engine-backed hooks mount; other modes wait only for the handshake. On a 401 the adapter force-mints a fresh token and replays, and `refreshNow`'s three-valued answer must pass through intact. A secure storage read fault shows the storage error screen, never sign-in. Hosted OAuth with no baked Firebase project fails loudly rather than spinning. Dev builds sign in with the email code, because the `houston://` callback opens the installed prod app.

Lives in `engine-gate.tsx`.

## Language gate

No language is preselected; every language is an identical neutral button named in its own language. The gate predates a locale, so it does not use `t()`; its few strings render in the OS-detected language with English fallback. The funnel event fires only after the language is applied, so a retried pick is not double counted.

Lives in `language-gate.tsx`.

## Hire path and paid org offer

The naming step's name follows the job until the person types, steps over names that cannot be taken, and a typed change clears a stale server rejection. The paid org offer opens the new org's checkout from the submit while the dialog is up; a new org has one member, so its line shows one seat's bill.

Lives in `use-create-agent-flow.ts`, `paid-org-offer-dialog.tsx`.

## Provider error cards

`ProviderErrorCard` routes every typed `ProviderError` variant to its own renderer so the user always sees a next action. Auth failures and unreachable local endpoints change engine-side connection status, and the picker and AI Hub cache statuses for 30 s, so such a card triggers a status refresh. Cancellation has no UI and is guarded defensively. Transient variants (network, provider internal, malformed) carry no account affordance; for the local provider the remedy names the model app, not "check your internet". Policy blocks and blocked accounts open the AI Hub instead of a reconnect. A card with no provider draws a plug icon, not an empty monogram.

Lives in `provider-error-card.tsx`, `provider-error-cards/transient.tsx`, `provider-error-cards/auth.tsx`.

## Not-connected card attribution and retry

When the engine cannot name a provider, the card is labeled with this chat's provider only from evidence (the same chain as the composer's `preferredProvider`), never the composer's "anthropic" default, and a card that already names a provider is never rewritten. A retry that re-delivers the original refused prompt does not push a second bubble. A mid-turn auth failure resumes with a hidden auto-continue that re-delivers the undelivered user text, because pi's prompt-time credential guard raises before recording the message and a bare "continue" would get "I don't see a previous message". A persisted inline reconnect card always wins over the store-driven card.

Lives in `provider-error-cards/not-connected.ts`.

## Shell-global login fallback

Sign-ins launched from surfaces without their own handler (the in-chat reconnect card) are caught here so the URL is not lost. For a remote engine's codex URL with no user code, a local relay binds port 1455 and relays the code, because pi's callback server is in the pod; this check must precede the open decision. The Claude setup-token flow always goes to the paste dialog. The engine names providers in pi's canonical dialect (`openai-codex`) while dialogs use display ids, so lookups alias. A device code already shown is kept when a later URL-only frame arrives. A completion only clears a dialog for its own provider.

Lives in `provider-login-fallback.tsx`.

## Create flow footer and trail

One primary action per screen in the same place at both widths, full width on phones; the pair is stacked on phones with primary on top. The trail is the screens actually walked, because capability reads are optimistic and the shape can change mid-run; a trail is cut at the first screen the new shape lacks, dropped whole if it no longer starts at the run's first screen, and answers on removed screens go with them. Moving to a screen already behind the user unwinds rather than duplicating. A parent chain longer than the step count is a cycle.

Lives in `create-flow-footer.tsx`, `create-flow-trail.ts`.

## Filter combobox

The house facet picker (Popover plus cmdk) shows a search box once a list exceeds 8 options. Brand marks use `text-current!` because the Command item's default svg rule would gray them.

Lives in `filter-combobox.tsx`.

## Choice step model

Matching is accent and case blind. A filter appears once what it can reach (not what is on screen) is long enough; the role question shows ten shared jobs but searches the whole catalog. The single tab stop follows the arrows, else the pick, else the first chip, so Tab back lands where the user left. Enter takes the first match in reading order, or the typed words when nothing matches.

Lives in `choice-step-model.ts`.

## Role step

Unanswered, the role question leads with the picked industry's jobs, then shared jobs; once the user types, the filter reaches the whole catalog. A typed industry has only the shared run, and the copy says the filter reaches more. The person's own role question puts leadership positions first; an AI Employee is never hired for a position.

Lives in `role-step-model.ts`, `role-step.tsx`.

## Workspace view guards

Desktop boot opens the first employee in rail order once roster and layout resolve. Settings owns its own top-level event and is skipped here to avoid double counting; Admin is not skipped.

Lives in `use-workspace-view-guards.ts`.

## Sidebar

Below `md` the rail is not rendered; phones navigate through the nav bar and More menu. The create sheet's open state is store owned so every door opens the one the shell mounts. The desktop has a gutter frame; phones have none.

Lives in `sidebar.tsx`, `sidebar-rail.tsx`.

## Update pill

A mid-session update downloads silently and waits behind a "Restart to update" pill that never counts down, blocks or restarts on its own. It lands with one short ease-out.

Lives in `update-pill.tsx`.

## Choice key scope

Choice questions listen on window and document, so they must decide whose key it is. Synthetic keys (`isTrusted` false) are ignored, because leaving a kept-alive screen fires a synthetic Escape to dismiss its portalled modal. A hidden question (kept-alive screen, or a step behind the manager's typing) takes no keys. Focus on the body may be taken for type-to-filter. Layers portalled later than the question sit above it and own keys first, including `alertdialog` confirms; a containing earlier layer does not. `display: none` subtrees have no boxes.

Lives in `choice-key-scope.ts`.

## Page header tools

Whether a header's sections become a switcher is answered once, crossing the strip's measured mode with the phone fork (`headerCollapsesTabs`), so no screen decides on its own. The first measurement lands in a layout effect to avoid a stacked-then-snapped paint. Crossing the threshold remounts tool subtrees: controlled values survive, focus does not.

Lives in `page-header/page-header-tools.tsx`.

## Team status banner

The org status strip shows a scheduled lock, a failed payment or a lock for the active org (Personal included), worded by why, with the recovery the SDK allows (`orgRecovery`).

Lives in `team-status-banner.tsx`.

## Invite card

Pending invitations show at the top of the rail, always visible. One action runs at a time. Team names can be 200 unbroken characters, so the card uses `min-w-0`, `break-words` and `line-clamp-3` to keep Accept and Decline in view.

Lives in `invite-card.tsx`.

## Provider logo map

One table maps provider and lab ids to brand marks for every dispatcher. Only genuine logos ship, since an inexact mark reads as a wrong logo; an alias onto a provider with no art yields the monogram, never another brand's logo. Monograms keep a pre-shortened seed and otherwise take the first letter with punctuation stripped.

Lives in `provider-logo-map.ts`.

## Promo-ended steps

Yearly is preselected where sold and charged today less Stripe's credit for the unused month; "Maybe later" closes for the session.

Lives in `promo-ended-steps.tsx`.

## Edit team identity

The form seeds when the dialog opens, never while open, so a concurrent edit cannot change fields mid-type. Saves compare against the identity shown at open; a deselect becomes an explicit null clear (`teamIdentitySaveWrites`). Folder names save to the personal sidebar layout.

Lives in `edit-team-identity-dialog.tsx`.

## Limit cards

Rate limits clear in seconds and offer retry; plan-window pauses (Anthropic's 5-hour and weekly limits) clear at a stated time and offer no retry, only another model. Neither offers another account, since a team space has none. Terminal variants show the provider's verbatim text under the body, because for unclassified failures it is the only identifying detail (for example a terms-acceptance notice).

Lives in `provider-error-cards/limits.tsx`, `provider-error-cards/terminal.tsx`.

## Rail create button

One "+" holds everything a user can add: a menu when both choices exist, one press for a single choice, nothing when neither. It carries the tour anchor.

Lives in `sidebar-create-button.tsx`.

## Team identity vocabulary

Team colors are the agent palette, so a team and an agent never mean different things by a color name. Each concept word is translated once and shared across marks; each mark is named from its own key in the user's language. A stored color that is not a palette entry (a raw hex from a server host) maps to no swatch rather than falling back to the first color, which would misrepresent it.

Lives in `team-identity.ts`.

## Invite inbox

Pending invitations render in a bounded, self-scrolling band under the rail's top line, or nothing when there are none. Both fetch and render are gated on Spaces. One lock is keyed by invite id across re-renders. The collapsed rail shows a labelled count button that expands the sidebar, so a user who collapsed the rail never loses an invitation.

Lives in `pending-invites.tsx`.

## Sidebar activity summaries

Board queries are watched through the query cache without attaching observers, because a per-render `useQueries` subscription caused notification churn that kept the shell re-rendering. Only data updates trigger re-renders; cache events emitted during a mounting component's render are ignored to avoid setState-in-render. The coverage ledger is watched separately because a read can confirm "no tasks" without changing rows. "No tasks" is only answered from rows that hold the read, since restored or missing aggregates would mark a veteran as new. Before the aggregate fetches, badges come from each agent's restored board cache, never a fetch, and never a confirmed "no tasks".

Lives in `use-agent-activity-summaries.ts`.

## Running ring and badges

One component draws the "something is running" ring around an agent avatar or a folded team's glyph, so the two cannot differ. The needs-you count and the "New" mark share one quiet badge. "New" appears only when the agent is confirmed empty, its first day is pending and the caller may start it, so the row never invites a click the board cannot answer.

Lives in `agent-sidebar-status.tsx`, `agent-sidebar-items.tsx`.

## Connect group rows

"Connect your apps" (Integrations, ungated) and "Connect your AI" (the AI Models hub, behind `showAiModels`) appear on both breakpoints, each led by three overlapped logos read from queries those screens already hold, so nothing here fetches. Apps fill to three with Gmail, Outlook and Slack, whose bundled marks always draw so the row never swaps images; AI fills with Anthropic, OpenAI and Google. Connections are read only once the provider is ready. From the phone's More card destinations reset the nav stack rather than push.

Lives in `connect-group.tsx`, `use-connect-group-logos.tsx`.

## Login URL routing

On a co-located desktop a loopback OAuth flow opens the browser directly and the localhost callback finishes it. Codex on a desktop with a remote engine uses the zero-code loopback relay. Claude on any Tauri desktop, co-located or remote, uses the native `claude auth login` browser flow instead of the setup-token paste. Otherwise the dialog shows. The raw URL is shown only as a hostname hint.

Lives in `provider-login-url.ts`.

## Workspace menu

The rail's account row and the phone's More card share the menu rows. Handlers that navigate run one tick later because Radix restores focus to the trigger on unmount and would yank focus back. Creating routes on `capabilities.spaces`: the create-organization dialog on hosted Spaces, the local workspace create elsewhere. The current workspace is a checkbox item with a leading checkmark so screen readers hear it.

Lives in `workspace-account.tsx`, `sidebar-workspace-menu.tsx`.

## Keep-alive views

Views mount lazily once and keep local state while hidden. Radix dialogs portal to `document.body`, so hiding a screen would leave its modal over the next view with the page inert; a synthetic Escape closes it, fired only when such a modal is open because it would also dismiss pills and inline edits. Each kept-alive screen exposes whether it is the visible one for the e2e suite.

Lives in `keep-alive-views.tsx`.

## Plan briefing motion

Entrances fill `backwards` only, so nothing holds a transform afterwards and presses can still scale. Rows stagger at a fifth of the step's duration, with the fourth and later starting together so the last starts within the step's duration. Reduced motion becomes plain fades. A briefing animates only steps that change, never the opening one.

Lives in `plan-briefing-motion.css`, `plan-briefing-swap.tsx`.

## Update preview harness

A dev-only console harness (gated on `import.meta.env.DEV` so release builds drop it) drives the update surfaces with simulated status, since the real flow only runs in packaged production builds.

Lives in `update-preview.ts`.

## Phone nav bar

The floating pill (AI Employees, More, compose) is CSS-hidden at `md:` so it appears on resize with no re-render. The compose button is the phone's single New task control and so carries the lesson anchor; it picks its subject from where the user stands.

Lives in `mobile-nav-bar.tsx`.

## Page shell

App-local page primitives (not in `ui/`, since they encode Houston page chrome) keep every full-window surface's width and header spacing identical: `default` max-w-4xl for reading surfaces, `wide` max-w-6xl for catalogs. The hero uses level 2 when the `<h1>` lives in a header strip.

Lives in `page-shell.tsx`.

## Checkout dialogs open in the click

Status-strip and locked-chat checkouts open their tab inside the click so the browser keeps it, and the dialog stays up until the gateway answers.

Lives in `team-status-checkout-dialog.tsx`.

## Choice grid and runs

Chip rows are measured from each chip's top edge at keypress, since a wrapping run has no columns in markup. Left/right walk reading order, up/down hold the column and clamp, Home/End go to the ends; keys with no target are left to the dialog. All runs of one question form a single radio group named for the question; an empty match renders no group. Industry chips sort by translated label.

Lives in `choice-grid-model.ts`, `choice-runs.tsx`, `context-step.tsx`.

## Reconnect notice

A strip appears a few days before a hosted Claude subscription login ends (about 28 days after sign-in), keyed by deadline so a new login starts fresh. It runs the same `launchLogin`; the spinner covers only the launch, and a finished login moves the deadline and clears the strip.

Lives in `provider-reconnect-notice.tsx`.

## Local model status pill

Shown only when this session owns the bridge; when down it names the local app that must be open and offers Reconnect.

Lives in `local-model-status.tsx`.

## App routes

The cloud migration gate sits above the first-run branch, because a migrating user has zero cloud agents and would be captured by onboarding. Coalesced toast repeats show their tally so retried failures visibly react.

Lives in `app-routes.tsx`.

## Phone account page

"Your account" drills in inside the More card instead of a dropdown covering it; the rows are the same `AccountAction`s as the rail. The row's accessible name starts with its visible label (WCAG 2.5.3).

Lives in `mobile-more-account.tsx`.

## Agent row headline

An agent row leads with what is happening now: the newest mission at work, else the newest waiting on the person, else the newest of any kind; work wins because the wait keeps its own count badge. A running mission with no title yet still shows. Timestamps are parsed, not compared as strings, because hosts stamp with and without milliseconds.

Lives in `mission-headline-model.ts`.

## Back control

One back element serves `BackBarScreen`, `PageHeader`'s back slot and the skill editor's compact strip. The chip's ring is a `border`, not `.ht-hairline`, because that utility cannot be scoped to the phone layer. The focus ring is never dropped at a breakpoint.

Lives in `back-control.tsx`.

## Plan limit card

Only a free org's weekly pool offers Upgrade (to the billing owner); everyone else is told to ask the owner, and store apps never send anyone to upgrade. Seat allowances, history cards from before an org went paid and unknown billing only say when the limit resets. A locked org replaces the composer with its locked card.

Lives in `provider-error-cards/plan-limit.tsx`, `plan-composer-state.tsx`, `org-locked-card.tsx`.

## Page header tabs and layout

Header navigation uses `aria-current`, not tab-panel semantics, since items swap a whole surface. A single item is a static heading lozenge with no nav landmark or button. The strip's height is declared once; the desktop-only variant is written out literally because Tailwind cannot read a template class name. Unmeasured headers render stacked, which is correct at every width. Collapsing tabs into the identity lozenge is a phone rule only; on desktop, narrowing (for example a side panel opening) moves the tools to the body row and the cluster keeps the strip. The switcher trigger keeps its track (a lone white pill would vanish on a light page) and takes its accessible name from the identity it shows.

Lives in `page-header/page-header-tabs.tsx`, `page-header/page-header-layout.ts`, `page-header/page-header-switcher.tsx`, `page-header/drilled-header.tsx`.

## Drilled headers

The back chip precedes the cluster, never collapses into it, and names the destination as its rail row does. On phones the drilled header shows the subject's mark, name and section, with one overflow slot, because the section was already chosen one level up.

Lives in `page-header/page-header-back-chip.tsx`, `mobile-drilled-header.tsx`.

## Choice chips

Every option is visible and one tap away, never a dropdown. "Something else" is not one of the chips; it shares their height and radius so they read as one family.

Lives in `choice-chips.tsx`.

## Plan briefing frame

Plan announcements are a dark centered briefing on desktop and a full-height sheet on phones; only the person closes them (X, Escape, click outside all call `onDismiss`). The CTA label follows the pick instantly without a swap animation, since arrowing through radios would replay it on every key. A swapped-in step focuses its checked radio or title, showing the ring only when a key moved focus.

Lives in `plan-briefing-frame.tsx`, `plan-briefing-cta.tsx`, `plan-briefing-swap.tsx`.

## Landing in a created org

Switching into a new org uses the workspaces store's `setCurrent`, which is the C8 sequence (re-point `x-houston-org`, drop the query cache, re-establish the event stream). The user is then sent home, because staying on a view from the old space reads as a silent failure.

Lives in `use-land-in-created-org.ts`.

## Org avatar

An org's tone comes from FNV-1a over its slug so it is the same on every screen; initials split by code point so emoji are never cut.

Lives in `org-avatar.tsx`.

## Shared nav destinations

Admin (behind `showOrganization`), Academy (ungated, every deployment) and Settings (opened on its index) are built by one builder per destination for both the rail menu and the phone More card, so label, glyph, destination and anchor never disagree. The phone More rows spread the rail's `dataAttrs` so lesson anchors resolve on phones too.

Lives in `sidebar-nav-rows.tsx`, `mobile-more-row.tsx`.

## Tour anchors

`data-tour-target` names are a closed union and selectors come from `tourSelector`, so a typo or a removed target is a compile error rather than a spotlight that finds nothing. The composer's send button is marked by `ui/chat` with `data-composer-submit`, since a props-only package cannot carry an app anchor.

Lives in `workspace-tour-steps.ts`.

## Agent warming notice

A write on an agent whose engine is still warming opens a notice that is the only blocker; screens stay explorable. An entry past its normal TTL stays visible with "slower than usual" copy instead of clearing silently, and the notice closes once the agent is ready.

Lives in `agent-warming-dialog.tsx`.

## Boot splash

The splash mounts at several gate positions during one boot; its entrance (elegant duration) plays once per page load and later mounts render settled, so boot reads as one surface.

Lives in `workspace-loading.tsx`.

## Top-level screens

The Academy is ungated. The assistant screen exists before discovery answers, because onboarding runs in it; once onboarding is over the view guard sends a stale `viewMode` home.

Lives in `top-level-screen-views.tsx`.

## Claude desktop browser login

There is deliberately no background reconcile of an earlier login's cached credential: pushing a cached snapshot put one refresh-token family behind several rotators, which tripped Anthropic's reuse detection and revoked the family. A failed hand-off is finished by reconnecting. Cancel kills the native `claude` child and announces a benign dismissal so every spinner clears.

Lives in `claude-browser-login.tsx`.

## Create step progress

Three named segments, current emphasized, walked ones filled, because the flow is three questions, not milestones.

Lives in `create-step-progress.tsx`.

## The AI Manager in the rail

The AI Manager is the employees band's pinned first row. The band keeps one selection (`selectedId` and `onSelect`): the Manager, under its view id, while its view is open, otherwise the lit agent; selecting the Manager's id opens its view.

Lives in `sidebar-manager-row.tsx`, `sidebar-manager-selection.ts`.

## Team header signals

A team header shows the running ring and needs-you badge only while folded; open, its agent rows carry them and repeating would double count.

Lives in `team-header-signals.tsx`.

## Reconnect prompt invariant

A chat's reconnect card may only ask to reconnect the provider that chat uses. Only a confirmed signed-out probe raises it; an unknown probe is "checking", and a missing CLI is not a sign-in problem.

Lives in `provider-reconnect-state.ts`.

## Team glyph color

A team's glyph deliberately pins a color, bending the rail anatomy rule that a row's glyph never pins one. The color is set through an inline custom property, never a class, because the stored value may be a raw hex a server host holds; palette ids resolve to theme-reactive `var(--ht-agent-*)`. The identity picker paints palette colors inline as data, and its swatches have no synthetic "default" entry.

Lives in `team-glyph.tsx`, `team-identity-swatch.tsx`.

## Checkout open note

While a payment page this app opened is still open, pay buttons are disabled; the note offers to reopen it (closing its tab tells the app nothing) or start over.

Lives in `checkout-open-note.tsx`.

## Unhealable auth causes

`org_policy_blocked` (needs an API key) and `billing_locked` (a provider such as GitHub Copilot locked billing behind an intact credential) never launch a sign-in; the card offers a remedy on the AI Hub and ignores stray login failures elsewhere.

Lives in `provider-error-cards/auth-unhealable.ts`.

## Copilot connect step

The Copilot dialog lives once for every surface that starts logins. Picking a plan starts the sign-in, so its close keeps the observation alive (`closeMeansCancel`).

Lives in `use-copilot-connect.tsx`.

## Brand colors

Curated brand accents tint `BrandMark` only in the AI Models hub; aliases resolve through `providerBrandKey` so variants share the parent's color; absent keys stay monochrome.

Lives in `provider-brand-colors.ts`.

## Error card labels

The wire carries pi's canonical provider ids and raw model ids while the catalog uses display ids, so naming goes through one aliasing helper; a second fallback chain is how label and icon once drifted. Models are always named via `modelDisplayLabel`. Status page links exist only for providers whose outages Houston can point at, keyed by display id.

Lives in `provider-error-cards/labels.ts`.

## Login URL ownership

On the v3 wire the runtime cannot touch the browser, so the active view acts on `ProviderLoginUrl`. Dedicated login surfaces register while mounted; the global fallback acts only when none owns the event, mirroring their branches.

Lives in `provider-login-surface.ts`.

## API key field

Paste is never blocked, and the reveal state resets with the field's mount so a revealed key never resurfaces.

Lives in `provider-api-key-field.tsx`.

## API key guides

Only providers whose key page needs a non-obvious choice get a walkthrough; NVIDIA needs an NGC Personal Key with "Public API Endpoints" included, which the quick key flow never shows.

Lives in `provider-api-key-guide.tsx`.

## Update checker

A launch-check find shows the launch overlay (install already running); a mid-session find shows the restart pill once downloaded. Background downloads and failed downloads that will retry show nothing.

Lives in `update-checker.tsx`.

## Stripe fallback link

One component for the link offered when a Stripe page did not open on its own, so look, focus ring and exit cannot drift. Store apps show plain text, never a link or button, because the stores forbid pointing to purchases outside in-app payment (`purchase-policy`).

Lives in `fallback-link.tsx`, `plan-web-note.tsx`, `plan-keep-footer.tsx`.

## One shell detail panel, owned by claim

Every panel surface (mission boards, routine chat, archives, setup chats) portals into the same container and all stay mounted while hidden, so ownership is a list of claims; it returns the same array when unchanged. The panel is wide only with two consents: the persisted `chatWide` preference and a claim from a surface that opted in. The panel card renders only while claimed; on phones it covers the content area with the board still mounted.

Lives in `detail-panel-owners.ts`, `use-shell-detail-panel.ts`, `use-panel-wide.ts`, `shell-panel-card.tsx`, `detail-panel-context.tsx`.

## Page header frame

One home at every width, inside the screen card. A drilled page passes `back`, which leads the strip. The portal target renders in both forms so crossing the breakpoint never remounts or blurs its search field. The drilled header's `<h1>` is the active lozenge, so the heading names the screen shown. Tabs follow Safari's grammar: a darker track with only the open tab in the screen's tone; navigation repaints without shifting layout. One tools row and one search treatment keep catalog surfaces aligned.

Lives in `page-header/page-header.tsx`, `page-header/drilled-header-heading.ts`, `page-header/header-lozenge.ts`, `page-header/header-tools-row.tsx`, `page-header/header-search.tsx`.

## Only the user closes shell dialogs

The app dispatches a non-cancelable synthetic Escape when leaving a kept-alive screen, which Radix would honor regardless of `onEscapeKeyDown`; shell-level dialogs mark user dismissals so only a real user action closes them.

Lives in `user-dismissal.ts`.

## Create flow header

The segmented progress shows only on the wide questions; the compact customize screen is always last and would show a full bar that says nothing. Compact steps title the screen with their question; wide steps keep the flow name as the accessible title. The first screen exists only when both answers do; the hire/copy choice is two rows because copying is a whole other flow.

Lives in `create-flow-progress.tsx`, `create-flow-title.ts`, `add-choice-step.tsx`, `choose-start-step.tsx`.

## Workspace switcher face

The email is omitted when it equals the name or the provider withheld it. Single-player desktop has no identity and no menu header.

Lives in `workspace-switcher-face.tsx`.

## Query persistence

Cloud list queries are restored before their observers read the network. Persistence lives inside `EngineGate` because the buster needs the hosted user's JWT, and nests the same QueryClient so the session query can run before restoration.

Lives in `query-persistence-provider.tsx`.

## Team identity save

Saves write only fields the person changed; one name-length rule on the trimmed name serves create and edit. The module avoids ui barrels so node tests can load it.

Lives in `team-identity-save.ts`.

## First-day invites on rail rows

A row invites the first day only when the task list is confirmed empty this session, the first day is pending in config and the caller may start it; anything less would lead to a board with no start button. Only those employees' configs are read, on the board's query, which wakes no one at work. The row's second line is the headline mission first, then the invite; status lives in the ring and badge so the line stays muted.

Lives in `first-day-invites.ts`, `use-first-day-invites.ts`, `agent-row-line.ts`, `agent-row-parts.tsx`.

## Context step model

Industries are one run sorted and matched on translated labels, since no grouping of fifty peers reads better than the alphabet.

Lives in `context-step-model.ts`.

## Choice chips announcement

All runs of a question are one radio group, since a group per run would announce several answers where the arrows walk one grid.

Lives in `choice-chips-model.ts`.

## New group submit

Creating a sidebar group is optimistic and synchronous; a group that cannot be written (no workspace, layout unloaded) is reported and the form stays open. Creating a group is never gated.

Lives in `new-group-submit.ts`, `use-create-flow-gates.ts`.

## Create flow gates

What a user may add is resolved once so the rail's "+" and the sheet never disagree about which screens exist.

Lives in `use-create-flow-gates.ts`.

## Org locked fieldset

A locked org disables controls but keeps text readable, since it refuses writes, not reads. The fieldset always renders so locking never remounts its contents.

Lives in `org-locked-fieldset.tsx`.

## Rail navigation closes the phone menu

Every rail navigation closes the phone's More menu, so resizing across the breakpoint never lands on a stale open menu. The current-agent store follows the focused Tasks screen.

Lives in `sidebar-footer.tsx`, `use-sidebar-navigation.ts`.

## Hire identity during create

While a hire is creating the card shows the identity it was submitted with, because the agent store adopts the new employee before the create settles and the live identity would call its own name taken and cross-fade to the next color. The name field is marked invalid only when the name is the cause.

Lives in `create-agent-flow-model.ts`.

## Team name validation

The client trims and caps team names as a hint; the gateway (`POST /v1/orgs`) re-validates. When the free slot is taken, the create dialog offers a paid create with the gateway's prices, monthly without a figure when none are known.

Lives in `create-team-model.ts`, `create-org-offer.ts`.

## Reconnect surface routing

Only OAuth providers use `launchLogin`; api-key providers re-paste in the same connect dialog and the local provider uses its endpoint dialog, because `launchLogin` 400s for them and dead-ends the card. An id the catalog cannot resolve goes to the engine, which keeps its own guard. The store-driven card's launched label names its action ("Sign in again") instead of the ambiguous "Try again".

Lives in `provider-error-cards/reconnect-surface.ts`, `provider-error-cards/reconnect-dialog.tsx`, `provider-reconnect-presentation.ts`.

## Sidebar auto-collapse

The rail auto-collapses only when the window crosses the narrow threshold and re-expands when it widens back, so manual toggles are otherwise respected; phones have no rail.

Lives in `use-sidebar-auto-collapse.ts`.

## Bundled connect logos

The apps row's popular apps ship bundled marks so the row draws before (or without) a catalog and never swaps images; asset imports are Vite only, so they live apart from the node-tested rules.

Lives in `connect-apps-bundled-logos.ts`, `connect-group-logos.ts`.

## Per-org dismissals

Routine prompt dismissals are held per org, since each org has its own routines.

Lives in `use-org-dismissal.ts`.

## Window drag strip and Admin mounting

Overlay title bars need a drag target on full-window gate surfaces. Admin stays mounted while its gate resolves so it can show a neutral frame.

Lives in `window-drag-strip.tsx`, `top-level-screen-plan.ts`.

## Local model sharing

Publishing a local endpoint through the managed gateway is a team-only opt-in.

Lives in `local-model-share-toggle.tsx`.

# Inventory changelog

Every `version` bump in `inventory.yaml` needs a matching entry here (enforced by
`pnpm check:parity`). Newest first. Use `## vN` headings.

## v55 - 2026-08-07

Chat status messages rework (PRODUCT-1226), no new components. The
thinking-indicator's pre-token wait now renders as the turn-status line itself
(one component, one size) and the rotating phrase deck plays only while
connecting; an executing agent's header always names the concrete task,
folding consecutive identical activities into an "xN" repeat counter.

## v54 - 2026-08-06

A workspace file named in an agent's prose stops dressing as a web link. It
previously rendered two different ways depending on how the agent happened to
write the markdown -- a filled button pill with an external-link arrow for
`[Perfil](perfil.md)`, the blue autolink chip for `[plan.md](plan.md)` -- so one
action had two looks, and both borrowed the vocabulary of a destination that
leaves the app. The affordance now follows the DESTINATION KIND before the label
shape: a file is one chip, carrying the per-extension glyph in its reserved
filetype tint on the recessed chip surface, the same mark the Files tab and the
turn summary already use. Link blue stays reserved for the web, which is the
point -- the reader can finally tell from the chip whether a click leaves
Houston. File-type classification and iconography moved from `ui/agent` to
`@houston-ai/core` so both surfaces draw the same file.

## v53 - 2026-07-31

Promoted the Agent Store Home, agent detail, and creator profile compositions
into shared screen contracts. Website and app now supply only data, navigation,
actions, translations, and rich-content seams, so screen structure cannot drift.

## v52 - 2026-07-31

Registered the shared Agent Store family used by both the public website and
the in-app Store: navigation, catalog controls, agent and creator cards, the
full detail layout, skill list, and creator identity block. Navigation,
installation, translated labels, and rich-content rendering stay
surface-owned seams while the structure remains shared.

## v51 - 2026-07-31

The mission card loses its unread dot. The mark shipped in v39 as the per-card
half of the shell's unread signal, and on a real board it did not earn its place:
a filled dot trailing the agent name on a card that already carries a status, a
running glow, a people stack and three icon actions reads as one more thing to
decode, not as "there is something new here". The signal is being redesigned from
the mission card outward, so the dot comes out cleanly rather than sitting in the
codebase as a shape the redesign has to work around.

Gone from `mission-card`: the `unread-dot` anatomy part, the `unread` state, the
behavior paragraph describing when it paints, and its a11y clause. `KanbanItem`
drops the optional `unread` flag and `KanbanCardLabels` drops the `unread` label,
so `@houston-ai/board` no longer has an unread vocabulary at all.

What STAYS, deliberately: the agent sidebar's unread dot and its per-agent count
(`agent-list-item`), the Mentions inbox row dot and the toolbar pill's
outstanding-mention count (`mentions-inbox`), and the per-device read cursors all
three are measured against. Only the board card's copy of the signal is removed —
the `mentions-inbox` wording is updated to point at the sidebar rather than at a
card dot that no longer exists.

## v50 - 2026-07-30

The board's loop had one click at the start and a menu at the end. A finished
mission reaches Done with a single tap of the checkmark, and then the only move
left, getting it out of the way, cost a multi-select: tick the card, wait for
the bulk bar, press Archive, confirm. Four steps to do the thing the column is
for.

The mission card now carries at most ONE status-gated primary action, chosen by
the column it sits in. Needs you keeps the checkmark. Done gets an archive box,
same 24px hit target, same resting weight, same one click. The status sets are
disjoint by construction, so the two never appear together and the action row
never has to fit a second same-weight glyph beside rename and delete; a running
card gets neither, because there is nothing to sign off yet and nothing to file
away.

What separates them is colour and nothing else. The checkmark warms to `success`
on hover because signing a mission off is a win; the archive box stays neutral
(`ink` on `hover`) because filing one away is housekeeping. Neither is `danger`:
the trash can beside them is still the only control that destroys anything, and
archiving remains fully reversible from the archived list. There is no confetti
on archive either. The mission was already celebrated when it was checked off,
and cheering the same work twice cheapens the first burst.

One consequence worth naming: `archived` is the only status with no board
column, so archiving a card removes it from the board rather than moving it.
A mission archived while its chat panel is open therefore closes that panel,
matching what a delete and a bulk archive already do instead of leaving a panel
pointed at a card that is no longer on screen.

`KanbanCard` gains `archiveStatuses` + `onArchive`, mirroring the approve pair
exactly and threaded through the same `KanbanColumn` / `KanbanBoard` / `AIBoard`
cascade, plus an `archiveTooltip` label. Both actions now read their render rule
from one pure gate (`kanban-card-actions.ts`) instead of two inline conditions,
so "which action does this card show" is a single tested decision rather than a
pattern to be repeated by hand next time.

## v49 - 2026-07-29

The connected provider row stops pretending to be a row. It carries a brand
mark, a plan chip, a whole second tier of live meters, and it opens the account:
that is a card, and a card has to look pressable before anyone touches it. It was
transparent at rest and only painted on hover, which is a hover-gated
affordance — the thing our own rules forbid.

`CatalogRow` gains ONE props-only knob, `surface`. The default `plane` is the
flat catalog row every browse list still uses, unchanged. `card` paints the
`card` surface plus a 1px `line` hairline ring at rest and answers a press with
`scale(0.98)`; the hover wash is untouched and now enhances a surface instead of
being the only evidence the row exists. Depth is surface + hairline, never a drop
shadow, so dark mode needs no exception. Only the AI hub's Connected strip opts
in.

Three things follow from being a card. The trailing chevron is gone: a chevron
says "this line drills in", which is row language, and a card that already reads
as pressable does not need the glyph (the Integrations, Skills and permissions
rows are still planes and keep theirs). The focus ring moves to the card: the
focusable element is still the body button, but a ring around the body alone drew
a box inside a box that stopped short of the plan chip and the meters, so the
card surface hoists the ring to the whole card, keyed on that button's own
`:focus-visible` — the indicator now matches the target it describes. And the
`below` tier is aligned to the row's OWN padding rather than indented to the text
column, so the meters start at the brand mark's left edge and run to the card's
right edge; indented, they read as a paragraph hanging off a row rather than as
the card's own content. That tier had exactly one consumer, so the indent is
replaced, not made optional.

Two extractions came out of it, both export-compatible: `CatalogAddButton` moved
to `catalog-add-button.tsx`, and the surface vocabulary itself (what a `plane`
and a `card` each paint, and why the focus ring has to follow the surface) to
`catalog-row-surface.ts` — so the row component reads as structure and the
surface module as look, with every file inside the 200-line limit.

## v48 - 2026-07-28

Two corrections to the connected provider row v43 shipped, both from using it.

A card must end where its content ends. The usage tier reserved a fixed height
(two window bars) in every state so the loading skeleton could not shift the row.
That was right for the common two-window subscription and wrong for everyone
else: an account with a single window drew one bar and then a bar's worth of
empty card. The tier is now sized by its content in every loaded state. What
keeps the strip still is not a reservation but the data: the skeleton is drawn
ONCE, in the shape of the most common account, and readings are retained across
background refetches, so a row can only ever settle once, on its first reading,
and polls never re-enter the skeleton. The two-window row still lands at exactly
the height it loaded at; the one-window row now ends flush after its meter.

A card is one target. Only the row body was clickable, so a click on the meters
inside the row's own hover wash did nothing, which reads as a broken card rather
than a deliberate boundary. `CatalogRow` moves `onClick` from the body button to
the row's outer element: the whole card opens the item, cursor included, from
any tier. The body stays a real button and the row's ONE focusable element, so
it still owns the accessible name and the focus ring, and its keyboard
activation dispatches the very click the card's handler reads, which is what
makes pointer and keyboard each fire exactly once. The right-edge `action` is
excluded by its marker attribute: the ghost + still connects or installs without
also opening the row. The prop is now typed as the row's open action
(`() => void`) rather than a raw button handler, matching every call site.

## v47 - 2026-07-28

HOU-789 and HOU-790 collapse the Usage screen. An AI account and how much of it
is left are one thing, so `provider-usage-card` stops being a card on a screen of
its own and becomes `connected-provider-usage`: the plan chip rides the connected
provider row's trailing edge in the AI models hub, and the account's meters
(rate-limit windows, prepaid balance, or Houston's own token metering) indent to
that row's text column. Every honest non-ok state survives the move: an account
with no usage surface, one that needs a re-sign-in, and a probe that failed all
say so rather than showing a blank meter, and a failed fetch says THAT rather
than letting each row claim it is simply unmetered.

Making that one row required two new slots on the shared `CatalogRow` primitive
(`@houston-ai/core`), both props-only: `below`, a second tier under the row body
that lives INSIDE the row's hover/focus surface — so the wash covers the meters
too and the pair reads as one row, not a card stapled under one — and `aside`,
quiet trailing content OUTSIDE the row button. The plan chip rides `aside`
because a button's descendants are presentational: inside the button the plan was
either noise in the accessible name or invisible to assistive tech. The row body
keeps its own name (provider plus how it is connected) and its single click
target.

Two rules keep the strip still. The usage tier reserves a fixed height (two
window bars) in every state, and the plan chip's slot is held open while the
reading loads, so rows do not resize or reflow as readings arrive. And a row
whose connection is only unconfirmed shows no usage tier at all: Houston makes no
metering claim, not even "not measured yet", about an account it could not read,
and the fetch is gated on at least one CONFIRMED account rather than on the
strip's mount.

What remains of the old screen is the per-agent running-time analytics, whose
user-facing identity is now Time worked, a Settings section that exists only
where the deployment meters it. No surface says "Usage" or "Compute usage" to a
user any more.

One deliberate consequence: Time worked rides `capabilities.computeUsage`, not
the AI-models Teams gate the old Usage screen inherited, so plain members of a
hosted-cloud team now see Settings > Time worked where they previously saw
nothing. That is intended and safe — the server scopes `GET /v1/org/compute-usage`
to the agents the caller can already reach, so a member sees only their own
agents' time.

## v46 - 2026-07-29

`plan-ready-card` now accepts the runtime's deterministic empty-summary
backstop. The optional lede and its collapsed hint are absent when no summary is
available; the title, two continuation choices, header dismiss X, and integrated
feedback input remain fully actionable. The dismiss X locally returns the
composer without sending, and the input now explicitly invites plan feedback.

## v45 - 2026-07-28

The plan-ready card now belongs fully to the shared interaction-card family. Its
two-line plan lede and three choices live in the common modal shell, with the
same fixed trailing free-text row used by sign-in, connection, and credential
cards. The card replaces the external composer while pending, so its row is the
only text input; submitting it creates a visible plan-mode user follow-up and
retires the card.

## v44 - 2026-07-28

HOU-974 and HOU-766 make blocked interaction cards collapsible without hiding
their state. Only the body scrolls under the 40vh cap; footer actions and the
trailing free-text row remain reachable. The chevron stays usable while a turn
is running, and collapsed cards retain a muted one-line context hint. The
complete plan now stays in the transcript; the floating plan approval card above
the always-mounted composer carries only a two-line lede and three next-step
choices.

## v43 - 2026-07-28

HOU-773 adds `suggest-actions`, optional follow-up bubbles above the completed
mission composer. A selected pill sends its concrete message as a visible user
follow-up; dismissal is available without hover.

## v42 - 2026-07-28

HOU-762 through HOU-764 unify the chat skill picker with the Skills catalog's
installed row. The picker now searches, sorts by displayed title, and selects
from the same row anatomy rather than presenting a separate card and category
tab treatment.

## v41 - 2026-07-28

HOU-831 clarifies the required action in in-chat integration steps. A connect
title now reads "Connect {app}" beside the app logo, and the body keeps only the
agent's reason: the redundant catalog description is gone. The action footer
keeps Skip left and the filled Connect CTA right; the free-text escape row moves
into the modal's trailing region below those actions. Sign-in and credential
steps share that trailing-row structure, so every actionable card presents its
primary choice before its alternate instruction.

## v40 - 2026-07-27

HOU-960, chat sender presentation rebuilt on the semantics of a group chat. A
group chat labels the people you are talking TO and never you: your own messages
are identified by the side they sit on, everyone else's by a face and a name.
And a name is an answer to "who is talking now", a question that only needs
answering when the answer changes, so it prints once per speaker rather than
once per message. v37 gave every turn in a shared conversation its own sender
line above the bubble, which answered "who wrote this" for each message in
isolation: a fast exchange became a column of repeated names, with the reader's
own name printed back at them. This is the same information, arranged the way
readers already know how to read it.

There are three row anatomies now, all on the incoming-bubble geometry of a
group chat (12px corners, the corner nearest the sender's face squared, compact
12/8 padding). A `user-message` written by a TEAMMATE mirrors to the left: their
32px face top-aligned in a fixed column beside the bubble, their name the
bubble's first line, small and semibold in that person's own tone, the bubble
the recessed chip fill with a hairline rather than the viewer's near-ink one,
because a left-hand bubble in the reader's own colour reads as something the
reader said. An `assistant-message` in a shared conversation is one more group
member: the same incoming bubble (wider, for prose), the agent's 32px mark in
the face column, its name the bubble's first line in the agent's own avatar
colour; solo it stays bare left-aligned prose. The VIEWER'S OWN message keeps
the right-aligned near-ink bubble with no face and no name at all, adopting the
compact mirrored geometry only in an attributed thread. The "You" line is gone
from the screen; the consumer's "you" string is announced to screen readers
instead, because alignment is a cue only a sighted reader gets.

Run grouping ties the three together. A name and a face print on the first
message of a run from one sender and nowhere else in it, while the avatar column
stays reserved on the rest so consecutive bubbles line up under the face instead
of stepping sideways. A run breaks when the speaker changes, and a system
divider (a context compaction, say) always breaks one, because after a divider
the reader has lost the thread and the next speaker has to reintroduce
themselves. An agent's tool and reasoning blocks are transparent to the rule:
they neither start nor break a run, so "you asked, the agent worked, the agent
answered" still introduces the agent on its answer, while "answer, work, answer"
correctly stays one run.

The colours needed new tokens. A person's tone is a property of the person,
hashed from their stable id, so their name and their avatar are the same hue on
the board and in chat alike. But the five `person.*` fills were tuned as avatar
backgrounds carrying white initials, and as name text on the bubble they measure
2.90 to 3.14 in dark mode, well under the 4.5:1 floor for body text. So
`--ht-person-name-{slate,sage,mauve,taupe,indigo}` joins them in both themes:
the same five hue families retuned for text, a darker light-mode tone paired
with a lighter dark-mode one, so the identity reads the same while the text
stays legible. On the composited bubble surface (light rgb(244,244,244), dark
rgb(41,41,43)) they measure, light over dark, slate 6.06 / 5.18, sage 5.83 /
5.48, mauve 6.07 / 4.95, taupe 6.29 / 4.94 and indigo 6.34 / 5.03, and a token
test re-measures them against the real surfaces on every build rather than
trusting a pinned number. The agent palette needed no retuning but is checked
the same way: every agent colour is measured against its theme's chat surface,
and one that cannot carry 4.5:1 as text falls back to plain ink in that theme.
All seven pass in both themes today, the tightest being golden at 4.80 in light
and crimson at 6.02 in dark.

Single player is untouched to the pixel. Attribution still appears only where
the deployment is multiplayer, or where the old heuristic finds two distinct
authors in one thread; a solo transcript renders no name, no face, and reserves
no column for either, exactly as before.

## v39 - 2026-07-27

HOU-945, relevance-scoped notifications: a shared workspace only works if you can
tell, at a glance, which of it moved while you were away. Four surfaces land
together — a mark on the mission, a mark on the agent, an inbox of the missions
where somebody typed your name, and the pill that opens it. All four are
multiplayer-only: read state is per person and per device (local, never a write
to the server on every mission open), so without a signed-in identity there is no
"you" for anything to be unread FOR. Single player and the desktop app gain no
new chrome at all, and reserve no space for any of it.

`mission-card` gains an `unread-dot` (and the matching `unread` state) — the
per-mission half. A mission card now carries a quiet mark when that mission has
moved, or somebody typed your name in it, since you last opened it. The mark is
a small filled dot in the semantic action tone, trailing the card's agent name:
"there is something new here for you", never "act now" (which stays the needs-you
status and its count chip). It is a mark, never a number, and it disappears the
moment you open the mission.

It sits in the card's identity line rather than among the approve / rename /
delete icons (where a filled dot would read as a fourth button) and well clear of
the contributors' faces in the body's bottom-right corner. A card with nothing
new renders no dot AND reserves no space for one, so single player, a
signed-out surface, and every legacy mission look exactly as they did.

`agent-list-item` gains the matching `unread` state — the same dot, rolled up to
the agent. A sidebar row now marks the agent when ANY of its missions has moved,
or named you, since you last looked. It appears next to the needs-you chip, dot
first, never in place of it: an agent can perfectly well have something urgent
AND something new, and hiding one behind the other would make the rail lie about
what is waiting. The dot never shows a number, but its label does ("3 unread
updates"), so a screen reader and a hover both get the count without turning the
rail into a wall of digits.

Add `mentions-inbox`: a new Mission Control mode holding every mission where a
teammate typed your name, newest first. Deliberately not a board — there is no
column to move a mention between and no status to read off one, only who pinged
you, where, and how long ago. So each row is a flat line: their face, "Ana
mentioned you in Finance", the mission title, and how long ago, and clicking it
lands you in that mission's chat exactly the way a completion notification does.
A row that still has something new keeps the same quiet dot, on a rail that is
always reserved so read and unread rows stay optically aligned. A mention we
cannot attribute drops the face for an at-sign and says only that you were
mentioned. Nobody has mentioned you yet: "No mentions yet".

The way in is a Mentions pill in the Mission Control toolbar, beside Archived
(`mission-board` gains it as an anatomy part). It highlights while the inbox is
showing, collapses to its at-sign when a chat panel squeezes the board, and
carries the number of mentions still outstanding — a mention of you newer than
where you last read, NOT ambient mission movement, because a number the size of
your whole workspace's activity is a number nobody clicks. Past ninety-nine it
reads "99+"; the exact figure past that changes nothing you would do. The count
is in the control's accessible name too, not just next to the glyph.

## v38 - 2026-07-27

Add `mention-autocomplete` + `mention-chip` (HOU-944): in a shared chat you can
now tag a teammate. Typing "@" in the composer raises a picker over the space's
co-members, filtered as you type (accent- and case-insensitive, yourself
excluded); Arrow keys move, Enter or Tab accepts, Escape closes. Accepting types
the plain text "@Name" into the message and remembers who that is, so the model
reads ordinary prose while the message carries the identities alongside it. With
no roster (single player, a personal space, or a host that predates the
directory) the picker never opens and "@" is just a character.

Both sides of the conversation render those names as chips: a human message
chips the mentions stored on the message itself, and the agent's prose is matched
against the known people of the space, since an agent writes a name as plain text
when it needs someone specific to confirm something. A mention of the reader is
emphasized, so an ask aimed at you stands out in a busy thread.

Behind it the conversation view-model carries `mentions` end to end beside
`author` (protocol `ChatMessage.mentions` + the `user` wire frame, runtime
persistence, `packages/sdk`: `TurnSendInput` / `StreamTurnOptions` /
`FeedFrame` / `FeedItemVM`), which is what a notification and inbox layer will
read to tell someone they were tagged.

## v37 - 2026-07-27

Refine `user-message` + `assistant-message` (no new component, no `since`
change): in a SHARED conversation every turn now carries a **sender line** --
the writer's face + name above a human bubble, the agent's mark + name above its
prose (HOU-943). Attribution follows the DEPLOYMENT: a multiplayer client
attributes every turn from the first message (the old "label only once two
people have written" heuristic left a shared chat looking single-player until a
second person spoke, and never named the agent; it still governs outside
multiplayer, so legacy attributed transcripts keep their labels). Single-player
is untouched -- no line, no faces, byte-identical transcript.

Behind it, the conversation view-model now carries a message's `author` end to
end (`packages/sdk`: `FeedItemVM.author`, folded by `seedHistory` /
`prependHistory` and stamped on the optimistic send via
`StreamTurnOptions.author`), which is what makes a teammate's bubble keep its
identity across reload, scroll-up paging, and the live send. Web ships it in
`ui/chat` (`ChatSenderHeader`, threaded through `ChatPanel`/`ChatMessages` as
`showSenders` + `agentLabel` + `renderSenderAvatar`); the app resolves faces
through the batched org-profiles lookup the mission face stacks already use.

## v36 - 2026-07-27

Refine `mission-card` (no new component, no `since` change): its anatomy gains
`people-face-stack` + `people-overflow-chip` and an `attributed` state -- the
multi-contributor signal on the shared board (HOU-947). Every human on a mission
renders as an overlapping ringed avatar over the card body's bottom-right
corner: a photo when the profile has one, otherwise initials on an OPAQUE
desaturated person tone (`person.*` design tokens: slate / sage / mauve / taupe
/ indigo, plus an initials colour and a solid overflow-chip fill/text pair, both
themes) chosen deterministically from the person's stable id, so one person
keeps one tone on every card and in the expansion popover. Past five faces the
rest collapse into a solid, high-contrast "+N" chip that opens the full roster,
and the card body reserves a right gutter sized to the stack so no text runs
underneath it. Three rendering defects went with it: the initials fill was
`chip-subtle` (~96% transparent, so overlapped faces and card text showed
through the letters), the "+N" chip wore the same translucent fill (it read as a
hole in the stack), and `TooltipTrigger asChild` was overwriting the avatar's
`data-slot`, which silently disabled `AvatarGroup`'s 2px ring contract so the
faces collided edge to edge with no cutout. The stack also takes the surface it
sits on, so the mission detail panel rings its faces in the panel colour instead
of the card colour.

## v35 - 2026-07-26

Refine the shared `CatalogRow` (no new component, no `since` change): its
`description` slot takes a node, not just a string, so a row can put its
SITUATION on that one secondary line instead of its blurb. Integrations uses it
for the in-place recovery model -- an app whose connection is pending or errored
is no longer lifted out of the catalog into a separate recovery section at the
top of the pane; it keeps its own category rows and wears a `status-badge`
(dot + label, warning/danger) where its description would be, its `+` retries
the connect from that row, and its detail modal carries Reconnect + Remove. A
live connect outranks the at-rest status line, so a row never reports the same
connection twice.

## v34 - 2026-07-23

Refine `conversation-feed` (no new component, no `since` change): the transcript
now opens on its TAIL window instead of the full history, and gains a
`load-older-trigger` at the top of the scroll viewport plus a `loading-older`
state (HOU-819). When the view-model reports messages beyond the loaded window
(`historyWindow.earliestLoaded > 0` on the conversation VM), scrolling the top
of the feed into view fetches the previous page and prepends it, scroll-anchored
(same distance from the bottom) so on-screen content never jumps; a quiet
spinner shows while the page loads and the trigger retires at the transcript
start. Web ships it in `ui/chat` (`ConversationLoadOlder`, threaded through
`ChatPanel`/`ChatMessages` as `onLoadOlder` + `hasOlderMessages` and through
`AIBoard` as `onLoadOlderMessages` + `hasOlderMessages`); the windowed reads
ride the additive protocol params (`?limit`/`?before` on the runtime's
messages route) and the SDK VM's additive `historyWindow` + `prependHistory`.

## v33 - 2026-07-22

Add `status-badge`: the shared connected/live-status indicator (a colored dot,
alone or with a label) that conveys connected / pending / error state beside an
item name. Web ships it as a props-only, i18n-agnostic `ui/` piece
(`@houston-ai/core` `StatusBadge` / `StatusDot`, mapping each status to a
semantic color token), so it lands `implemented`. The app's
`ConnectionStatusBadge` (Integrations) and `LiveStatus` (AI hub) are now thin
i18n wrappers over it, so "connected" reads identically everywhere.

Also a refinement to the shared `CatalogRow` (no new component, no `since`
change; the catalog surfaces stay app/-locked, web `partial`): the row gains an
optional `statusDot` slot rendered immediately LEFT of the title —
presence-style, "● Asana" — always visible (no hover gating). The three catalog
surfaces use it so connected/installed state no longer rides on section
placement alone: Integrations (green/amber/red per connection status, with an
sr-only status label), the AI-models hub (green, sr-only "Connected"), and the
Skills marketplace's installed rows (green, beside the quiet installed check in
the `action` slot), contrasting with the not-installed `+`.

## v32 - 2026-07-21

Add `verified-badge`: the verified-creator indicator glyph shown beside a creator
handle on Agent Store cards, creator chips, and the profile pane (part of the
creator-profiles surface). Web ships it as a shared, props-only `ui/` piece
(`@houston-ai/core` `VerifiedBadge`), so it lands `implemented`.

## v31 - 2026-07-20

The catalog shell's two-section grammar gets three refinements, all in the shared
CatalogShell composition (no new component, no `since` change; the surfaces stay
app/-locked, web `partial`).

The `controls` row is now STICKY: it pins to the top of the surface's scroll
container so the search field (plus the Integrations category combobox) stays
reachable through a long catalog, sitting transparent at rest and fading in an
opaque `popover` fill with a rounded bottom only while rows pass BEHIND it. The
scroll-stuck detection is the generic `useStuckOnScroll` hook, hoisted into
`@houston-ai/core` (`hooks/use-stuck-on-scroll.ts`) as the single source of truth
— the shell and the app's provider filter bar both consume it, and the app's
former copy (`app/src/hooks/use-stuck-on-scroll.ts`) is deleted.

The Installed section (Connected on the AI hub, Your skills on Skills) is now a
quiet CONTAINED panel — a rounded, hairline-bordered `card` surface — so "yours"
reads as its own thing above the flat "available" browse below. The
InstalledSkeleton and the "Show all N" expander sit inside the panel padding with
no doubled framing.

The Integrations category sections now order MAINSTREAM-FIRST: a curated
`CATEGORY_PRIORITY` list floats the everyday categories ahead of the long tail,
with Featured pinned first, the remaining non-curated categories by size DESC, and
Uncategorized last (the category dropdown stays A-Z). The available count chip now
accepts a preformatted STRING for catalogs whose true total isn't cheaply known —
the Skills store chip reads `"9000+"` rather than a live count.

## v30 - 2026-07-20

The catalog surfaces adopt a two-section grammar. ONE search field — plus, on
Integrations, a category combobox — sits on top via the shell's new `controls`
row and filters everything below it, over two titled sections: Installed
(Connected on the AI hub, Your skills on Skills) and Available. Each section
carries an `lg` CatalogSectionHeader with a live count chip (the shown count
while filtering, the total at rest). A section is OMITTED entirely when the
active filter matches nothing in it, so a heading never sits over an empty list.
The preview cap stays 6 rows behind a "Show all N" expander at rest and shows
every match uncapped while filtering.

This retires the per-strip installed search field added in v29 — there is no
"above 8 installed items" threshold anymore — and unifies each pane's own
internal search box into the one page query: the Integrations CatalogPane is now
controlled (query + category props), and the AI Models directory drops its search
box (the provider modal keeps its local one). All four surfaces (global
Integrations, per-agent Integrations, AI Models hub, Skills) read identically.

`ai-model-row` behavior updated: the directory-grid-row variant's control row is
now the facet comboboxes alone (free-text search is the AI hub's one page field);
the provider-modal-list-row variant keeps its own search box + facets. `skill-row`
and `ai-provider-card` keep their v29 CatalogRow strips, now driven by the page
query rather than a per-strip field. No new component and no `since` change; the
compositions stay app/-locked (web `partial`).

## v29 - 2026-07-20

The catalog "Installed" strips converge onto the shared CatalogRow grammar. The
Integrations, AI Models, and Skills surfaces previously rendered their installed
items as compact icon TILES (the ui/core `CatalogTile`); they now render the SAME
`CatalogRow` used by their browse grids — a full-width row with name, description,
and a quiet trailing chevron — laid out in the responsive two-column `CatalogGrid`.
`CatalogTile` is DELETED from `@houston-ai/core` (no compat re-export). Each strip
gains a preview cap of 6 rows behind a "Show all N" expander (CatalogShowMore) at
rest, and, above 8 installed items, an installed search field that filters the
strip in place. Integrations additionally gain a Featured section and a
total-count subtitle on the strip header.

`skill-row` restructured: `installed-tile` variant becomes `installed-row` (the
installed strip is now CatalogRow grammar behind the Show-all expander, a row
opening the edit modal); anatomy/a11y drop the tile framing. `ai-provider-card`'s
Connected strip likewise moves from a tile strip to the CatalogRow strip (quiet
trailing chevron, preview cap + Show-all expander). No new component and no `since`
change; web stays `partial` for both (`installed-skills-strip.tsx`,
`connected-providers-strip.tsx`, `installed-strip.tsx` are app/-locked). Manifest
refs updated (CatalogTile -> CatalogShowMore).

## v28 - 2026-07-16

`composer` gains a `replaced-by-override` state: the existing override card
(previously always rendered ABOVE the input, both visible) can now REPLACE the
input while present (`composerOverrideMode="replace"` on ChatPanel). Used by
onboarding's watch-your-agent step, where the "send an email to myself" offer
is the only intended action and a live reply input competed with it. Default
behavior is unchanged ("above": typing abandons the pending card).

## v27 - 2026-07-16

`interaction-approval-card` sheds its technical body. The two-column param
rows (and the "+N more settings" overflow line) are GONE — the wire payload
still carries `params`/`paramsOmitted`, but no surface renders them; the
approval keeps covering the exact call via `paramsHash`. Everything else is
unchanged: the '(icon) NAME' header lockup, the "Allow {app} to {action}?"
question, the three-decision footer, and the decided states. Anatomy drops
`param-rows`; states drop `with-params`/`no-params`.

## v26 - 2026-07-13

New component `provider-usage-card`: a new top-level Usage page (its own
sidebar item, sharing the AI Models hub's Teams gate) shows each CONNECTED
provider account's live limits, one card per account (brand mark + name +
plan chip). Subscription providers render a labeled meter per rolling
rate-limit window (percent used + localized reset note, warning tint at >=
90%); prepaid API-key providers render their remaining balance. Data is the
engine's new `GET /providers/usage` (protocol `ProviderUsage`): the runtime
reads each provider's own usage API with the already-linked credential
(Anthropic OAuth usage, ChatGPT/Codex rate limits, Copilot quota snapshots,
OpenRouter credits, DeepSeek balance); providers with no readable surface
report an honest `unsupported` row. Web-only today, app/-locked
(`app/src/components/usage-view/`), so the web manifest lands it `partial`.

## v25 - 2026-07-12

The Routines/Reactions tab split is merged into ONE "Automations" tab, and the
wake mechanism becomes a choice INSIDE the routine editor. `routine-row`'s
inline edit panel gains a "When should this happen?" choice rendered as two
option cards (Clock / Zap icon chip + label + one-line example hint: "On a
schedule — every morning, once a week, you choose" / "When something happens —
a new email, a message, a change in an app"), shown only where the deployment
supports event triggers (`capabilities.triggers`) — the tab set no longer
varies by deployment. The trigger picker's no-connected-apps empty state gains
a "Connect an app" CTA (dashed panel) that jumps to the Integrations surface.
The list surface converged on the v24 catalog grammar: `routine-row` is now a
flat transparent row with the full-row `hover` fill (the bg-chip slab card and
hairline dividers are gone), the list splits into Active / Paused sections
under `CatalogSectionHeader` count chips (headers render only when both groups
exist), the local new-draft editor sits in its own bordered `input` panel, and
the empty state is the pure catalog shape (title + description + one filled
CTA — the three-step walkthrough is gone; the editor's wake choice teaches
itself). CONTRACT change: `RoutineRowLabels` gains `whenTitle`,
`whenSchedule`, `whenScheduleHint`, `whenEvent`, `whenEventHint`;
`TriggerLabels` gains `connectApp`; `TriggerPicker` gains `onConnectApp`;
`RoutinesGridLabels` gains `sectionActive` / `sectionPaused` and DROPS
`emptyStepsTitle` / `emptySteps` (with `RoutineHowItWorksStep`);
`RoutinesGrid`'s `newDraftVariant` prop is replaced by `allowEventWake` (the
new-draft editor always starts on the schedule side and the user switches).
No new component; `routine-row` anatomy gains `wake-choice` inside its edit
panel.

## v24 - 2026-07-12

The AI models hub moved to the shared catalog grammar (the ui/ CatalogShell +
CatalogRow family, shared with the Integrations page).

`ai-provider-card` restructured: the hub row is now a split CatalogRow (body
opens the provider detail modal, a ghost round + connects, Cancel pill while in
flight), and connected providers moved out of the browse grid into the
consolidated "Connected" tile strip above the tabs. The onboarding / migration
/ workspace-setup connect card keeps the previous static shape as the
connect-flow-card variant; its info button (the old one open affordance) is
gone with the hub grid.

`ai-model-row` restyled to the same CatalogRow: flat transparent row (no more
bg-chip slab), no trailing "See more" cue, two-column CatalogGrid in the
directory / single column in the provider modal.

`skill-row` converged too: the Skills surface is now the CatalogShell (installed
tiles above Store / Custom skills tabs), community rows are CatalogRows with the
ghost + install, and the old installed row (pen/trash) is gone — edit opens from
a tile, delete moved into the edit modal footer.

## v23 - 2026-07-12

`provider-error-card` gains a `context-overflow` state. The engine taxonomy
(protocol `ProviderError`, mirrored in `ui/chat`) adds `context_overflow`: the
provider rejected the request because the conversation no longer fits the
model's context window (llama.cpp/Jan `exceed_context_size_error`, OpenAI
`context_length_exceeded`, Anthropic "prompt is too long"). Previously this
fell through to the generic `unknown` card. The card names the model that ran
out of room and offers the model picker as its CTA (a larger-window model, or
the user starts a fresh mission). Wire fields carry the provider's own numbers
(`context_window_tokens`, `prompt_tokens`); the runtime also uses the reported
window to correct an over-assumed custom-endpoint window so autocompact fires
at the real boundary on later turns.

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

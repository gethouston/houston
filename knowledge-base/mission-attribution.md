# Mission attribution — faces, senders, @mentions, unread

Who created and collaborated on each mission, who is speaking in a shared chat, who was
tagged, and who still needs to be told. All of it is **multiplayer-gated** on
`caps.multiplayer`; single-player never renders or resolves any of it and every
artefact (`activity.json`, the chat transcript, the sidebar) stays byte-identical.

Roles and access → `teams.md`. Spaces → `spaces.md`.

## The data is server-stamped, never agent-written

- Two optional fields on `Activity`: `created_by?: string` (the human who created the
  mission) and `contributors?: {user_id, name?}[]` (everyone who started or
  collaborated).
- The host derives them from the gateway's `x-houston-acting-as` header
  (`actingAuthorFromHeader`, `packages/host/src/auth/acting.ts`) and writes them on
  mission **create**, **PATCH** edit, and each **user turn** — only when
  `deps.gatewayFronted`. Off the gateway `author` is null and nothing is stamped.
- Turn stamping is **`stampTurnAttribution`**
  (`packages/host/src/routes/activity-attribution.ts:28`, called from
  `routes/agents.ts:1030`). It matches the mission by `session_key` or `activity-<id>`,
  upserts the contributor AND the mentions in a SINGLE load→save→emit pass, is
  best-effort, and NEVER blocks or fails a turn (a stamping error is swallowed with a
  log). It runs only when a gateway vouched for the actor, so off the gateway nothing
  runs, not even the body read.
- Schema `ui/agent-schemas/src/activity.schema.json` (`additionalProperties: false`);
  domain writes in `createActivity` / `applyActivityUpdate` / `upsertContributor`
  (`packages/domain`). Files side → `files-first.md`.

**Threading to the UI.** engine-client `Activity` / `ConversationEntry` carry the fields
→ web engine-adapter → app `RawConversation` → `use-mission-control` builds each
`KanbanItem.people` via `app/src/lib/mission-people.ts` (pure, DOM-free, unit-tested:
creator first, deduped; label falls back **profile name > stored `name` > 8-char id
slice**; avatar is the profile image when known).

## Teammate names + photos — gateway-backed (HOU-876)

The gateway stores each user's GCIP `name`/`picture` and serves them two ways:

- **Inline on the roster.** `GET /v1/org` members each carry optional
  `displayName?`/`photoUrl?` (`OrgMember`). `people-roster.tsx` reads these directly —
  display name is the primary label, the email drops to a muted secondary line,
  `photoUrl` is the avatar (initials fallback via the design system's
  `Avatar`/`AvatarFallback`). No profiles fetch there.
- **By id for face stacks.** `GET /v1/org/profiles?ids=<csv>` (`getOrgProfiles`,
  `cp/orgs.ts` + `orgs-mixin.ts`, `tauriOrg.profiles`) →
  `200 {"profiles":{"<id>":{displayName?,photoUrl?}}}`. `useUserProfiles`
  (`app/src/hooks/queries/use-user-profiles.ts`) is a real TanStack Query over it:
  multiplayer-gated (`alwaysEnabled` for the caller's own id in `useMyProfile`), ids
  deduped+sorted into a stable key `[USER_PROFILES_KEY, ...ids]`, `staleTime` 5 min. It
  backs the mission face stacks, the person filter, the Share dialogs, and the agent
  settings People section. Wire→app mapping (`displayName`/`photoUrl` → `name`/
  `avatarUrl`, absent → `null`) is the pure `mapProfilesResult`
  (`app/src/hooks/queries/user-profiles-map.ts`).
- **Users set their own identity** in Settings > Profile (`settings:profile.*`, section
  `profile`, first in `SETTINGS_SECTION_IDS`, hidden entirely when
  `GET /v1/me/profile` 404s or off-identity). The photo is cover-cropped browser-side to
  256px (`app/src/lib/avatar-image.ts`, reusing `image-crop.ts`) and PUT as a data URI
  to `PUT /v1/me/profile`. A save seeds the profile query and invalidates
  `USER_PROFILES_KEY`, `ORG_PEOPLE_KEY` and the org roster, so every face stack, sender
  avatar and @mention row repaints live. Both sign-in completions backfill the GCIP
  account RECORD's photo/name from the provider identity when the record lacks them
  (web `firebase-popup.ts`, desktop `accounts:update`) — the token claims are minted
  from the record.

**Privacy boundary.** The gateway is the sole enforcer: `/v1/org/profiles` returns a
profile ONLY for a **co-member of the caller's active space** (≤100 ids/request);
non-co-members are omitted and a personal space resolves only the caller. Off-gateway
and on a pre-feature gateway (404) both reads degrade to an empty map. It is a cosmetic,
non-user-initiated read: `tauriOrg.profiles` runs with `{toast:false,capture:false}`, so
a rare hard failure stays silent and consumers fall back via React Query's `isError`.

## Board face stacks (`@houston-ai/board`)

- Generic `KanbanPerson` (`{id, label, imageUrl?}`) + a `KanbanPeople` overlapping face
  stack, on cards (`kanban-card.tsx`, up to `CARD_PEOPLE_MAX = 5` faces at `sm`) and the
  detail panel (`kanban-detail-panel.tsx`, 3 at `md`).
- Anatomy: circles overlapped `6px`, each with a `2px` ring painted in the SURFACE colour
  it sits on (`input` on cards, `background` on the panel) so an overlap reads as a
  cutout, not a halo. The initials fallback is OPAQUE, a desaturated tone hashed from the
  person's stable id (`personToneClass`). The "+N" chip is a solid `bg-person-overflow`
  fill and, when `expandable`, a button whose popover lists EVERY contributor.
- The card body reserves a right gutter sized to the painted stack and rounded up to the
  sanctioned spacing scale (`peopleGutterClass`) so the description never runs under the
  faces — `""` for an unattributed card, which keeps a single-player board
  byte-identical.
- Props-only, i18n-agnostic (labels passed in). i18n: `board:people.label`,
  `dashboard:peopleFilter.*` (en/es/pt).

**Person filter.** `app/src/components/mission-person-filter.tsx` — a dropdown of
**Everyone / My missions / each person on the board** (roster from
`distinctBoardPeople`), beside the agent filter, gated on `isMultiplayer` and a signed-in
user. In a personal space `app/src/components/mission-person-teaser.tsx` stands in and
opens the create-team dialog.

**Name tones are their own tokens, measured not assumed.** A person's colour is a
property of the PERSON: `personNameToneClass` and `personToneClass`
(`ui/board/src/kanban-people-tone.ts`) share ONE `personToneIndex(id)`, so a teammate's
name and avatar are the same hue on the board and in chat. The hue is the same, the VALUE
is not: the `person.*` fills carry white initials, so five separate tokens
`--ht-person-name-{slate,sage,mauve,taupe,indigo}` (light + dark) retune the same
families for TEXT, bridged as `text-person-name-*` in `ui/core/src/globals.css`. The
seven agent colours are bridged as `text-agent-*` too (avatars still resolve to an inline
`var(--ht-agent-*)`, since a fill is picked at runtime from data).
`agentNameToneClass` (`ui/core/src/agent-name-tone.ts`) MEASURES each agent colour
against the theme's real chat surface at module load (dark composited through the glass)
and emits a complete literal class per outcome, dropping to `text-ink` in whichever theme
cannot carry 4.5:1. Guards: `packages/design-tokens/test/contrast.test.ts` re-measures
every person-name and agent token against the composited surfaces read out of the
generated `dist/css/tokens.css`; `ui/core/tests/agent-name-tone.test.ts` pins the branch
table.

## Chat sender attribution (HOU-943, HOU-960)

Group presentation starts only when the transcript PROVES someone besides the viewer
participated: a user-message author differs from the resolved viewer id, or the
transcript has ≥2 distinct author ids while that profile is still resolving. WhatsApp
semantics: a group chat labels the people you talk TO and never you, and a name answers
"who is talking now", so it prints once per change of speaker. The app passes `true` for
the proven group case and otherwise omits the prop, preserving `ui/chat`'s
distinct-authors fallback.

**The identity travels on the view-model.** `ChatMessage.author` is stamped by the
runtime from `x-houston-acting-as` (gateway-fronted only). `@houston/sdk` carries it end
to end: `FeedItemVM.author` (additive), folded by `seedHistory` / `prependHistory` from
`historyToFeed`'s `FeedFrame.author`, and stamped on the OPTIMISTIC send via
`StreamTurnOptions.author` — so a teammate's bubble keeps its identity across reload,
scroll-up paging and the live send alike. The optimistic identity is supplied by the
SURFACE (the SDK has none): `SessionStartRequest.author` → adapter `streamTurn` → SDK,
filled once in `tauriChat.send` from `app/src/lib/acting-user.ts` (a read of the shared
`["session"]` cache; signed out ⇒ absent ⇒ authorless).

**Three row anatomies.**

- A **teammate's** user turn mirrors LEFT: their 32px face top-aligned in a fixed column
  beside the bubble (`ChatPeerRow`), their name as the bubble's FIRST LINE (`text-xs
  font-semibold`, that person's tone), and the recessed `bg-chip` fill with a
  `border-line` hairline and incoming geometry — 12px corners, top-left squared toward
  the face, `px-3 py-2` (`is-peer` in `ai-elements/message.tsx`). A left-hand bubble in
  the reader's own near-ink colour reads as something the reader said.
- The **agent** in a shared chat is one more group member: the SAME incoming bubble
  (`is-peer is-agent`, wider at `max-w-[85%]` for prose), its 32px mark in the face
  column, its name as the first line in the agent's own avatar colour. In single player
  it stays bare left-aligned prose.
- The **viewer's own** turn keeps the right-aligned near-ink bubble (`is-user`) with NO
  face and NO name, adopting the compact mirrored geometry (12px, top-right squared) only
  when the thread is attributed. The "You" line is gone from the screen;
  `authorLabels.you` is announced in an `sr-only` span, because alignment is a
  visual-only cue a screen reader cannot see.

**Run grouping** — `ui/chat/src/chat-sender-runs.ts` (pure, JSX-free, tested in
`ui/chat/tests/attribution.test.ts`). Name and face print on the message that OPENS a run
from one sender; the rest render bare with the avatar column still reserved, so
consecutive bubbles line up under the face instead of stepping left. `senderRunKey` keys
a user message on its author id (`user:` + id; an authorless message keys on the empty
id), a system message on its own message key (so a divider can never join a run and
always breaks the one it interrupts), and every assistant turn on the constant
`AGENT_RUN_KEY`. `senderRunStarts` walks the DISPLAY items and SKIPS `kind: "process"`
blocks, so an agent's tool/reasoning work neither starts nor breaks a run.
`ChatMessages` computes the start set once per render and hands each row `isRunStart`.

**Rendering seam (`@houston-ai/chat`).** `ChatPanel`/`ChatMessages` take `showSenders`,
`agentLabel`, `renderSenderAvatar` and `senderNameClass` (the Tailwind text-colour
utility a row's sender NAME is painted in). The APP supplies sender presentation as DATA
because it is the only side that knows the palette, the profile and the agent; `ui/chat`
owns layout, alignment and grouping and stays palette-free and i18n-agnostic.
`chat-sender-parts.tsx` holds `ChatSenderName` / `ChatSenderHeader` / `ChatPeerRow`,
`chat-message-item.tsx` composes the row against `chat-message-item-types.ts`, and
`chat-message-body.tsx` takes the name as a `nameSlot` so it renders INSIDE the bubble
(or directly above a custom `renderUserMessage` node). Pure rules in `author-label.ts`:
`isOwnMessage` (absent author OR unresolved viewer ⇒ "own", so a legacy transcript and
the signed-in-but-not-yet-resolved window both render today's layout) and `senderNameFor`
(own or authorless ⇒ `null`).

**App wiring.** `use-chat-sender-avatars.tsx` resolves it: `showSenders` from the
multiplayer transcript and resolved viewer profile, `agentLabel` from the agent, faces
from the SAME batched `useUserProfiles` lookup the board face stacks use (`PersonFace`
initials fallback), and `senderNameClass` = `personNameToneClass(author.userId)` for a
human / `agentNameToneClass(agent.color)` for the agent. `use-agent-chat-panel` returns
the four props, `authorLabels.you` = `chat:attribution.you`, and every AIBoard mount
forwards them. E2E: `packages/web/e2e/chat-senders.spec.ts` against the fake host's
`/__test__/chat-history` control.

## Chat @mentions (HOU-944)

Typing `@` in the composer raises a picker over the space's co-members; accepting inserts
the PLAIN TEXT `@Name ` (the composer stays a plain textarea, no contenteditable) and
remembers `{userId, name}` on the side. On send, the pending mentions whose `@Name` still
appears ship as a structured `mentions[]` sidecar next to the prompt: **the model reads
prose, the wire carries identities.** Agents mention humans back in plain text (the
product prompt tells them to address a person as `@Name` when a reply needs that person's
confirmation), so ASSISTANT mentions are never structured.

- **The roster** — `GET /v1/org/people` → `{people:[{userId, displayName?, photoUrl?}]}`,
  the sanitized co-member directory of the ACTIVE space, served to EVERY member (a
  personal space resolves only the caller), named-first, no emails and no roles. Unlike
  `GET /v1/org` it is NOT owner/admin-only: every teammate must be able to mention their
  co-members. `getOrgPeople` 404-degrades to `[]`. The hook
  `app/src/hooks/queries/use-org-people.ts` is multiplayer-gated exactly like
  `useUserProfiles` (`staleTime` 5 min, no toast, no Sentry) and returns TWO lists:
  `people` (named co-members, viewer INCLUDED — the render roster, so an agent writing
  your name chips it) and `mentionable` (`people` minus the caller — the composer list).
  A co-member with no display name is never offered: `@a1b2c3d4` means nothing.
- **The wire** — `mentions?: {userId, name?}[]` rides beside `author` the whole way:
  protocol `ChatMessage.mentions` + the `user` frame's `data.mentions`, runtime
  `UserMessageMeta` (persisted) and the send-route body, `SessionStartRequest` /
  `ChatHistoryEntry`, and the SDK's `TurnSendInput` / `StreamTurnOptions` / `FeedFrame` /
  `FeedItemVM`. Every untrusted reader runs the ONE shared guard `parseMentions`
  (`packages/protocol/src/conversation.ts`, hand-rolled, no zod): caps at `MENTIONS_MAX`
  32, clips `userId`/`name` to 128 / 256, keeps the FIRST entry per userId, stops scanning
  after `MENTIONS_SCAN_MAX` 1000 raw entries, drops junk and omits the field when nothing
  survives.
- **Rendering** — `MentionChip` + the pure span finder (`ui/chat/src/mention-spans.ts`) +
  a hand-rolled rehype pass (`mention-rehype.ts`) appended AFTER Streamdown's own
  `raw → sanitize → harden` chain (Streamdown REPLACES its plugin list when you pass
  `rehypePlugins`, so the defaults are spread back in; the plugin is passed in tuple form
  because Streamdown caches processors by plugin name + `JSON.stringify(options)`). A
  user bubble chips off the message's own `mentions[]`; assistant prose is matched
  against the `mentionPeople` prop. A mention of the viewer wears the highlight wash.
- **Matching rules, all in `ui/chat/src/mention-text.ts`.** BOTH the roster names and the
  message text are normalized to **NFC** before anything is compared, because the span
  finder slices the text by the name's UTF-16 length and "é" has two spellings — the two
  must agree or a chip truncates mid-grapheme. Span matching is therefore case-folding
  ONLY; the accent-folding key (`mentionKey`) is used exclusively by the autocomplete
  FILTER, where a length change is harmless. Two co-members with the same display name
  collapse to ONE render target, carrying the OR of their `isSelf` flags; which userId
  each occurrence ATTRIBUTES to is decided at send time by handing occurrences to the
  pending picks in order (`mention-send.ts`).
- **The composer half** — `use-mention-autocomplete.ts` (+ `use-mention-combobox.ts`,
  `chat-input-mentions.tsx`), intercepting Enter/Tab/arrows/Escape through
  `PromptInputTextarea`'s external-handler-first `defaultPrevented` seam. Four rules: the
  list takes NO key while an IME composition is in flight (`mention-keys.ts`); a dismissal
  sticks for the LIFETIME of its token (same `@` index) and a pointer-down on the anchor
  textarea is not a dismissal; the TEXTAREA carries the combobox ARIA (`role`,
  `aria-expanded`, `aria-controls`, `aria-activedescendant`) since focus never leaves it,
  which is why the list is plain markup and not cmdk (whose own element ids overwrite the
  caller's); pending picks are parked per `draftKey` (the ChatPanel's `sessionKey`) in a
  bounded map, and the send SNAPSHOTS rather than consumes them (a rejected send keeps its
  text, so it keeps its mentions).
- **Masking at send** — `ui/chat/src/mention-mask.ts` blanks fenced code, inline code
  spans and inline links one character for one, because the renderer never chips inside
  `code`/`pre`/`a` and a mention recorded there would notify someone about a message that
  addresses them nowhere. It is a lexical pass, not a parser; the residual gaps (indented
  code blocks, reference links, autolinks, raw HTML) are listed in that module's header.
- **App wiring** — `use-chat-mentions.tsx` resolves `mentionPeople`,
  `messageMentionPeople`, `renderMentionAvatar` (= `PersonFace`) and `mentionLabels`;
  `use-agent-chat-panel` returns them as `mentionProps`. Display names are normalized to
  NFC at that boundary (`app/src/hooks/queries/org-people-map.ts`). The mentions travel as
  an ARGUMENT, not state: `ChatInput.onSend(text, files, mentions)` → `AIBoard.handleSend`
  → `onSendMessage`/`onCreateConversation`/`onComposerSubmit` → the board sources'
  `SendOverrides` bag → `tauriChat.send({mentions})`, including the warming-send queue (a
  parked message keeps its chips across a relaunch). E2E:
  `packages/web/e2e/chat-mentions.spec.ts`.

## Relevance-scoped notifications (HOU-945)

With many agents running in parallel a user must only be signalled when it matters to
THEM. There is **no settings toggle** (features-default-ON): relevance IS the behaviour,
and the existing global notifications on/off switch is untouched.

**The relevance rule is not re-derived.** It is `missionMatchesMe(people, selfId)`
(`app/src/lib/mission-people.ts:107`), reached through `app/src/lib/mission-relevance.ts`
(`missionMatchesMe(buildMissionPeople(conv, NO_PROFILES), selfId)`): a mission is mine if
my face is on it (`created_by`/`contributors`) OR it carries no attribution at all. That
second clause is load-bearing and keeps desktop/single-player byte-identical. A mission
that @mentions me is relevant too, whether or not I ever touched it.

### The mention aggregate lives on the ACTIVITY

The client's mission list is derived from activities
(`engine-adapter/client/activities-mixin.ts` → `activityToConversation`), NOT from the
runtime's `ConversationSummary`, so the per-mission aggregate rides the activity record
the board already fetches:

```ts
// packages/protocol/src/domain/activity.ts
interface ActivityMention { user_id: string; at: string; by?: string }
const ACTIVITY_MENTIONS_MAX = 32;
interface Activity { …; mentioned?: ActivityMention[] }
```

- Latest-per-person (an array of "who has been pinged here, and when", not a log), capped
  by dropping the oldest `at`. Declared in `ui/agent-schemas/src/activity.schema.json` and
  sanitized on read by `sanitizeMentions` inside `normalizeActivities`, which keeps the
  NEWEST `ACTIVITY_MENTIONS_MAX` entries by `at` (returned in file order, ties stable) —
  matching `upsertMentions`'s evict-the-oldest rule, so a read can never drop exactly the
  mentions a write just decided to keep.
- Getting the mentions there needed one structural change: the turn body is normally first
  read inside the channel, so `ChannelCtx` gained an optional `body?: Buffer`.
  `routes/agents.ts` drains the turn POST once, derives the ids with the shared
  `parseMentions` guard, stamps, and hands the buffer down; both `ProxyChannel` and
  `TurnChannel`/`dispatchCloudrun` prefer it over the now-exhausted stream. Threaded on to
  `ConversationEntry` → `RawConversation`.
- A malformed turn body is not that seam's business — it stamps no mentions and passes the
  body on. `dispatchCloudrun` GUARDS its parse and answers `400 {"error":"invalid JSON
  body"}` (re-throwing `BodyTooLargeError` so an over-cap body still maps to a clean 413).
  The proxy path still relays the pi runtime's `500 {"error":"internal error"}`, because
  `runtime/src/transport/http-helpers.ts` `readJson` is unguarded.

### Read cursors are per-device localStorage, on purpose

Five modules, one concern each:

| Module | Owns |
| --- | --- |
| `app/src/lib/read-cursors.ts` | the pure cursor ALGEBRA (keys, floors, watermarks, the 500-entry cap) |
| `app/src/lib/read-cursors-merge.ts` | how two views of one user's store combine (the cross-tab rule) |
| `app/src/lib/read-cursors-parse.ts` | decoding an untrusted stored blob; the `version` stamp |
| `app/src/lib/read-cursors-storage.ts` | the `localStorage` seam: key, merge-on-write, foreign-account eviction |
| `app/src/lib/read-cursor-live-store.ts` | the singleton instance + subscribers (React-free, so a notification callback reads it) |

`app/src/hooks/use-read-cursors.ts` is only the React bindings (`useReadCursorStore` =
`useSyncExternalStore` over the live store, `useReadCursorTracker` = the "viewed"
observer).

- Key `houston.read-cursors.<uid>`, per-uid so two accounts on one machine never read each
  other's state. Each entry holds `readAt` and the mention `notifiedAt` watermark; the
  store's `since` is the floor for anything with no cursor of its own, so a fresh device
  does not open on a backlog. The persisted envelope carries `version: 1` and a
  `lastTouched` stamp.
- **The tradeoff, taken deliberately**: an unread badge is local reading state and the
  user experiences clearing it as instant. Host preferences would put a request on every
  mission open, and in hosted mode that request can be the thing that WAKES a sleeping
  pod. Cost: a second device starts from its own `since`.
- **A second TAB is the normal case, not a tradeoff.** One whole-blob value per user means
  a plain `setItem` is last-writer-wins. So every save is a read-modify-write
  (`saveReadCursors` merges against disk and RETURNS what it wrote — callers must adopt
  that, not the value they passed), a `window` `storage` listener folds other tabs' writes
  in live, and the merge rule is per conversation: the LATER of each watermark, the
  EARLIER `since`. Watermarks only move forward, so the tabs are never in conflict.
- **Foreign accounts are evicted** (`pruneForeignCursorStores`, on every uid change): the
  4 most recently `lastTouched` blobs of OTHER uids survive, the rest are removed. A
  shared machine otherwise accretes one uncapped blob per person who ever signed in,
  against a ~5MB origin quota shared with the query persister.
- **Two clocks in `isUnreadForMe`.** An outstanding @mention is measured against my cursor
  for that conversation ALONE (`mentionReadFloorFor`, no `since` fallback): someone typed
  my name, so it stays unread however old it is and survives the mission moving on without
  me. Ambient movement uses `updated_at` vs the normal floor. Without the split, signing in
  on a second device silently marked every pre-install mention as read.
- **`notifiedFloorFor` folds `readAt` in.** `markRead` deliberately never touches
  `notifiedAt` (the two watermarks answer different questions, and collapsing them at
  write time would clear the badge a ping had just announced), so the OS-ping floor is
  `max(notifiedAt ?? since, readAt)`. Without it, a mention landing in a conversation ON
  SCREEN still fired a desktop notification.
- **Self-authored mentions never count.** `missionMentionsMe` / `latestMentionFor`
  (`lib/mission-relevance.ts`) require `by !== selfId`, so typing your own name cannot earn
  a permanent inbox row plus an unclearable badge. An entry with NO `by` still counts — the
  gateway only began stamping authors with this feature, and reading "no author" as "me"
  would swallow a whole generation of real mentions.
- **The "viewed" seam** is the `["chat-history", agentPath, sessionKey]` query, observed
  raw (`getObserversCount() > 0`) so no surface has to remember to report anything. Session
  keys resolve to conversation ids via `app/src/lib/chat-conversation-id.ts` (cache reads
  only). It answers **null** when no cached list can name the mission (a cold
  `routine-<id>`), and the tracker then writes NOTHING — a cursor under a key no unread
  surface looks up is worse than none, and the same cache events re-fire once the lists
  land.
- **Only `observerAdded` + `updated` count as "viewed"** (`VIEWED_EVENTS`). React Query
  emits `observerOptionsUpdated` on EVERY RENDER of a component holding the query and each
  mark stamps a fresh `Date.now()`, so marking on those turns the tracker into a
  render-driven write — an infinite loop the moment a second surface subscribes (store
  change → board re-render → options updated → new cursor → store change). Any new
  subscriber to `useReadCursorStore` depends on this filter.

### Surfaces

- **Completion notifications** — `app/src/hooks/completion-notification.ts` gates the send
  on `shouldNotifyCompletion`. Fails OPEN (unknown mission, unattributed mission,
  signed-out user all notify) and reads `selfId` at FIRE time, since a latch can outlive a
  sign-in by its grace window.
- **@mention pings** — `app/src/hooks/use-mention-notifications.ts`, once per aggregate
  entry via the `notifiedAt` watermark.
- **Sidebar** — `AgentActivitySummary.unreadCount` beside `needsYouCount`, rendered as a
  quiet `UnreadDot` (a filled `bg-action` dot), deliberately a different shape and weight
  from `NeedsYouChip`: "something new here" vs "act now". Zero when signed out or
  single-player — `use-agent-activity-summaries.ts` omits the `unread` option unless
  `isMultiplayer(capabilities)`, and `buildAgentActivitySummaries` leaves every count at 0
  without it.
- **Mentions inbox** — Mission Control's third mode
  (`app/src/components/board/mentions-inbox.tsx`), hidden entirely when
  `!isMultiplayer(capabilities)`. Its chrome is `app/src/components/mission-toolbar-actions.tsx`
  + the shared `agent-filter-menu.tsx` (the ONE "which agent am I looking at" menu, also
  worn by both team sections); the mode controls are presence-gated (`onToggleMentions`
  absent = no chrome).
  **The pill counts a narrower thing than the rows show**: a row's dot is `isUnreadForMe`
  (mention OR ambient movement); the pill's number is `mentionOutstanding` (a mention
  strictly newer than my cursor for that conversation) — the control says "N unread
  mentions", and a mission that merely moved is not somebody typing your name.
  `MentionInboxRow` carries both booleans so neither surface re-derives the other's rule.
- **The notifications bell** — `NotificationsBell`
  (`app/src/components/shell/notifications-bell.tsx:45`) is mounted by
  `mission-toolbar-actions.tsx:115` as `{!onToggleMentions && <NotificationsBell />}`, i.e.
  on the surfaces that are NOT the inbox itself. Badge = the outstanding-mention count; the
  menu reuses `mentions-inbox-row`, `mentions-inbox-view-model` and the shared
  `board/mention-row-nav.ts` `openMentionRow`. Multiplayer-gated.
- **Mission cards carry NO unread dot** (removed 2026-07-30, inventory `mission-card` v51).
  `KanbanItem.unread`, `ui/board/src/kanban-card-unread.ts` and the `use-board-unread.ts`
  join are gone — it fired too broadly to be a trustworthy signal. The read-cursor model
  and `isUnreadForMe` STAY (the sidebar count and the mentions inbox consume them); a
  rebuilt card indicator should start from the same model.

E2E: `packages/web/e2e/mentions-inbox.spec.ts` (inbox + read-cursor persistence when a
mission is opened), `packages/web/e2e/archived-mention-nav.spec.ts`.

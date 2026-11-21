# ui/chat: design decisions

Covers `ui/chat/` (`@houston-ai/chat`): message rendering and its Markdown chain, the composer, attachments, mentions, dictation, interaction cards and the conversation viewport.

## Markdown plugin chain order

Streamdown replaces its own rehype chain when `rehypePlugins` is set, so the chain is rebuilt around its defaults in this order: raw, sanitize, file links, harden, mentions. The file-link pass runs after sanitize (whose attribute allowlist would strip the `data-file-path` it adds) and before harden (which blocks bare relative links). Mentions run last so their spans are never stripped. Mention targets ride in the plugin's options tuple because Streamdown caches compiled processors by plugin name plus JSON options; two messages with different targets would otherwise share one processor. Mention targets are compared by value, since the caller rebuilds the list every render. Lives in `ui/chat/src/ai-elements/message.tsx` (`MessageResponse`).

## Link affordances in agent prose

A link to a workspace file opens the path recorded in `data-file-path`, not the href, because harden rewrites `./plan.md` to `/plan.md`. Workspace files render as a file chip (per-extension glyph on the recessed chip) whatever the markdown looked like, and the chip label always keeps the extension. Every web URL renders as the same inline chip that opens in the system browser, so link blue means "leaves Houston". Only autolinks are shortened (scheme stripped, capped, softbreaks removed); an authored label renders verbatim. The app's custom link renderer gets first say on every link and falls through to the defaults by returning null or undefined. A link with no open handler renders non-interactive. Lives in `ui/chat/src/ai-elements/message.tsx`.

## Markdown render failures degrade to raw text

If a render-time failure is thrown out of Streamdown (for example shiki's JS regex engine on an older WebView), the message falls back to its raw markdown so one message cannot blank the chat. Streamdown 2.7 boxes tables at 300px with their own scroll; replies override that to keep full-height tables. Lives in `ui/chat/src/ai-elements/message.tsx`.

## Bubble styling

The viewer's own bubble uses pure white, medium-weight text over the fill in both themes, because the near-white surface grays read dull at bubble size. An incoming bubble (a teammate, or an agent turn in a group chat) uses the recessed chip fill plus a hairline, since the fill alone barely separates from the canvas; it has 12px corners with the top-left corner squared toward the sender's face and 12/8 padding. Single-player agent prose uses `prose-text` at regular weight (ink reads dim in dark mode); a group-chat agent turn uses the peer bubble, slightly wider. Side follows the writer, not the role; labels follow the attribution gate, so single-player transcripts keep their shape. The viewer's own bubble shows no name, but screen readers hear the "you" label on rows that record the viewer as author. Lives in `ui/chat/src/ai-elements/message.tsx` and `ui/chat/src/chat-message-item.tsx`.

## Per-message actions and in-place edit

Copy shows on any settled row with text; Edit shows only on the viewer's own user rows that carry a `turnId` (optimistic sends and pre-turn-id transcripts cannot anchor a rewind). Both are always visible. The edited row swaps its bubble for a full-width editor card. Lives in `ui/chat/src/chat-message-item.tsx`.

## Composer submit and sizing

The form is reset right after the text is captured, before the async blob-to-data-URL conversion, so typing during the conversion is not lost. Inputs are not cleared when submit fails, so the user can retry. A user-dragged composer size may exceed the `max-h-52` class and follows the pointer without easing. The stop button is a solid square alone. The send button grows to a 44px phone tap target through an `::after` hit slop, keeping 36px on desktop. Lives in `ui/chat/src/ai-elements/prompt-input.tsx`.

## Feed to messages

Provider-error cards are deduplicated per kind per turn, not per provider: the same failure can arrive unlabeled on one channel and labeled on another. The first card wins, and a later duplicate only contributes its provider label (merged in place, same key), because the first card carries the retry state (`undelivered_prompt`, `failed_prompt`, `credential`, `retry_after_seconds`). The map resets at every user message so a new failing turn gets a fresh card. Accepted edge: if the backend switches mid-turn and both providers fail the same way, the failures share one card.

When a typed error card covered a turn, the `Session error: ...` echo that ui/core's `use-session-events` synthesizes is dropped; without a card it still renders. That prefix is a hardcoded string on the ui/core side and both sides must stay in sync.

Cancellation produces no card; the runner already reports it as a session status.

Message keys prefer the feed item's stable view-model id over the position, so prepending older history does not remount the list and reuse Streamdown instances against other messages.

A tool call after visible text starts a new process-only message, because some providers narrate before running tools; otherwise the tool fuses into the text message and the live mission log is not at the bottom.

The parser emits two tool calls per tool (null input at block start, real input at block stop); the null-input placeholder is replaced.

Author labels show only when the thread has at least two distinct authors (`distinctAuthorCount`).

Lives in `ui/chat/src/feed-to-messages.ts`.

## Feed merge and echo reconciliation

The engine re-broadcasts every turn's prompt over the session topic. The sending client already pushed it optimistically, so echoes are matched against a per-session count of pending optimistic pushes keyed by text, not against text already in the feed: a routine that reuses one chat sends identical prompts on every run, and a text match swallowed new runs. A prompt with no pending optimistic push (a routine run, another client) is appended. `reconcileUserMessageEcho` runs before `mergeFeedItem` because it needs per-session state.

When history loads, server history is authoritative for persisted turns; streaming items collapse to their finals and a count-based match keeps deliberate repeats. Client-only items between two persisted turns keep their slot (for example the synthetic session-error message, which used to be re-pinned to the bottom on every reload); client-only items with no persisted successor append as the live tail. The reconciliation key is a JSON tuple so content cannot collide with a separator. Lives in `ui/chat/src/feed-merge.ts`.

## Chat types mirror the protocol

`MessageMention.name` is the name as typed when sent, so the renderer can still find the run after a rename. `MentionPerson.name` is required: a person with no display name is never offered. `ProviderError` mirrors the engine's provider error enum; a new variant is added on both sides at once. `failed_prompt` is client-synthesized (the send was refused before reaching the engine, so "Send again" resends that text); `undelivered_prompt` is wire-carried (the engine persisted the prompt but the model never got it, so the retry re-delivers it hidden under the auto-continue marker and never renders a second bubble). Context-window overflow is not a credential fault; its action opens the model picker. `ProviderErrorCredential` is present only on managed-cloud turns with an acting identity and unlocks no action. Lives in `ui/chat/src/types.ts`.

## Interaction card stepper

The stepper state machine is pure and DOM-free so node:test can drive it. It tracks a frontier (the furthest step reached) so a user can walk forward again through completed steps; a revisited connect step never re-fires `onConnected`, so re-advancing toward the frontier is the only way past it. Skip is offered on every step, commits nothing and drops any earlier answer on that step; the app records skipped signin and connect steps so the reply can tell the agent. A skipped last step completes like any other terminal transition. Lives in `ui/chat/src/interaction-card-logic.ts`.

## Interaction modal shell

Every interaction step (question, sign-in, connect) composes one shell: title left, pager and dismiss on the same row, body, right-aligned footer. Steps differ only in what they pass in. Titles are regular weight; color carries hierarchy. `leading-6` makes the first title line 24px, matching the size-6 icon buttons. The card uses solid `bg-input` in both themes so content behind never bleeds through. A full stepper replaces the composer slot; lighter suggestion offers float above the mounted composer (`composerOverrideMode`). Lives in `ui/chat/src/interaction-modal.tsx`.

## Process header

The collapsed mission log header names only the current action, never a count of tool calls. It holds the most recently invoked tool for the whole active turn, because local tools finish in under a second and keying on "still running" left the header on "Thinking..." most of the time. The only number is a repeat counter (" x3") when the same activity ran consecutively; sameness is the rendered header line (same integration action, command activity or tool verb), coarser than input equality. While any tool has run in an active turn, the header always names the task; the playful phrases belong only to the standalone connecting indicator. A missing integration logo falls back to the helmet; a `"tool"` glyph (custom API or MCP integrations) takes precedence over `logoUrl`. Malformed `integration_execute` input yields no branded row. Lives in `ui/chat/src/chat-process-header.ts`.

## Offscreen settled blocks

Settled message blocks off screen skip layout and paint; the active streaming block sits at the viewport bottom and renders normally. Lives in `ui/chat/src/chat-message-item.tsx`.

## Interaction card composition

The card owns no step content for signin, connect, credential or custom steps: the app renders each as its own `InteractionModal` wired with the `StepChrome` the stepper hands it, so ui/chat stays unaware of auth and integrations. Every non-question step carries an always-visible free-text row below the footer; sending text there declines the step with that message, which the caller relays to the agent. The caller seats the card in the composer slot, so that row is the only text input on screen; the dismiss X restores the composer. The pager chevrons are the navigation for every step kind. A missing `renderCustom` renders nothing rather than crashing. While a reply carrying files uploads, no completion may fire again; `completionKey` extends that guard across remounts, so a remounted card whose restored terminal step completes on mount cannot send the reply twice. `onComplete` resolves to whether the reply was accepted: `true` releases the files, `false` keeps them; it must never reject. Step ids must be unique, because answers, drafts and the step-leaving callbacks in `use-stepper-transitions.ts` key on them. A revisited completed step drops its CTA and stops auto-reporting completion; a revisited skipped step keeps its CTA and decline. Lives in `ui/chat/src/interaction-card.tsx` and `ui/chat/src/interaction-card-props.ts`.

## Question step layout

Option rows are the scrollable body; the answer row (free-text escape plus decline) is fixed in the trailing slot so a long option list never scrolls it away. Clicking an option answers and advances, so there is no primary CTA. A branded question puts the app logo and name in the title and moves the question into the body. A detail block sits above the options because it must be read before answering. A file-answered question shows an upload area only when the panel has an attachment list to send to; files alone can only be sent from the field's send button. Lives in `ui/chat/src/interaction-question-step.tsx`.

## @mentions in the composer

The composer stays a plain textarea. Accepting a person inserts the text "@Name " and records `{userId, name}` on the side, parked under the draft's session key so switching conversations neither loses picks nor attaches them to another send. What ships is whatever `resolveMentions` still finds in the sent text, so deleting the words deletes the mention. A token is marked settled after acceptance, otherwise a name accepted before a comma re-offers itself and the next Enter re-accepts instead of sending. Caret restoration runs after every commit (no dependency list) because its trigger is a ref set by an event handler. The key handler calls `preventDefault()` on consumed keys, which is what makes `PromptInputTextarea` skip its own Enter and Escape. An empty roster disables the feature; dictation owning the keyboard closes the list. On send, mentions are snapshotted, not consumed: a rejected send keeps text and mentions together. The composer roster excludes the viewer; the reply-chip roster includes the viewer. Lives in `ui/chat/src/use-mention-autocomplete.ts`, `ui/chat/src/chat-input.tsx`, `ui/chat/src/chat-panel-types.ts`.

## Sender labels and thinking indicator

A shared conversation attributes every turn (`showSenders`), since sender identity belongs to the deployment; otherwise user bubbles are labeled only once the thread has two distinct authors and the agent is never labeled. Name and face print once per change of speaker, computed over display items so a process block cannot fake a speaker change. The standalone thinking indicator shows only while a turn is submitted and no active process block or progress-owning host card trails; otherwise both would show progress at once. Lives in `ui/chat/src/chat-messages.tsx` and `ui/chat/src/chat-process-groups.ts`.

## Process block grouping and log behavior

The mission log is closed by default and never auto-opens or auto-closes, so a manual open stays open for the life of the block. When open during a run, the latest tool call is pinned into view inside the height-capped pane until the user scrolls up. Blocks are keyed by their first segment only: a streaming turn keeps appending segments, and a key naming the last segment remounted the block and snapped an open log shut. A block holding only `suggest_actions` / `suggest_reusable` calls draws no log line but is still emitted so the turn-end summary keyed on its index survives. An empty assistant message with no reasoning or tools is suppressed, except the actively streaming final message, which legitimately starts empty. Lives in `ui/chat/src/chat-process-block.tsx` and `ui/chat/src/chat-process-groups.ts`.

## Composer panel contracts

A controlled attachment list is cleared only by its parent; the panel never removes sent files itself. Uncontrolled, the panel keeps one list per `sessionKey`. The composer text can live under `sessionKey` in a draft store so typing re-renders only the composer. `composerOverrideMode` `"above"` keeps the input usable (typing abandons the interaction); `"replace"` hides it. Omitting dictation hides the mic (the web build has no speech capture). A clipboard image whose bytes the webview never hands over (Linux Wayland WebKitGTK) shows a dedicated notice. On phones the composer sits tight to the safe area or keyboard. Lives in `ui/chat/src/chat-panel-types.ts` and `ui/chat/src/chat-input.tsx`.

## Live browser view

The view is phone first: one column with the two answers at the bottom within thumb reach; the dialog or sheet frame belongs to the caller. Close hides the view while the hand-off keeps waiting. A frame that cannot be drawn is reported, not shown. Controls press in on touch, and the X's hit area grows to 44px. Lives in `ui/chat/src/browser-live-view.tsx`.

## Dictation waveform geometry

Every 100ms amplitude bucket owns a fixed-width slot. Drawn buckets never move or change width while the track has room; once full, the strip scrolls left. Head position and scroll shift derive from one monotonic clock (elapsed time), never from bucket count, because buckets arrive in bursts and mixing the two made the head jiggle. The pinned head is computed as a min against the right edge rather than via the shift, so float cancellation cannot make it wobble. The math is DOM-free so node tests can run it. Lives in `ui/chat/src/dictation-waveform-math.ts`.

## Waveform envelope drawing

The envelope is a Catmull-Rom spline converted to cubic bezier segments, with clamped endpoints to avoid overshoot. One bucket off the left edge is drawn so the curve stays continuous while scrolling. Silence floors to a hairline so it reads as a center line. The rocket playhead is a DOM overlay moved by `style.transform` each animation frame, and levels are polled with requestAnimationFrame, so per-frame motion never re-renders React. `currentColor` is read per frame so a theme switch repaints without a render. Transcribing freezes the exact recording layout. Lives in `ui/chat/src/dictation-waveform-math.ts` and `ui/chat/src/dictation-waveform.tsx`.

## Composer override and attachments ownership

Only a replacing override takes over the attachment list; an above-card override leaves the composer showing and sending them. The override block drops the input's top padding to avoid doubled spacing. @mention picks are parked under the conversation's session key, like the draft text. Lives in `ui/chat/src/chat-panel.tsx`.

## Conversation map

The map indexes only the current DOM and keeps no history. The header's "Find" action lives outside the subtree and requests the search by bumping a token; the ref is seeded with the mount-time value so a conversation switch (which remounts the map) does not replay the previous request. Skill, attachment and interaction-answer markers are decoded so raw marker JSON never shows. Lives in `ui/chat/src/conversation-map.tsx` and `ui/chat/src/conversation-map-model.ts`.

## Animations

The live browser view carries its own frame animations because core's Sheet and Dialog reference tw-animate classes no stylesheet defines: the phone sheet rises on the iOS drawer curve and the desktop dialog scales from 0.96. `transform` composes with Tailwind's `translate` property used for dialog centering. Browser hand-off motion is transform and opacity only, exits shorter than entrances, and only an opacity fade under reduced motion. Lives in `ui/chat/src/styles.css`.

## @mention query rules

An `@` counts only at the start of text or after whitespace or an opening bracket. The query may contain a bounded number of single interior spaces (enough for a three-part name) and is capped in length; a leading space abandons the mention and a trailing one closes the list, which is also what closes it right after accepting "@Name ". Matching is a prefix of the full name or any word, diacritic-insensitive, in roster order, capped. Accepting adds a trailing space only when needed and never before closing punctuation; opening brackets and quotes keep the space. A dismissal (Escape or accept) lasts for the life of the token it was made in and lifts once the token stops existing. Lives in `ui/chat/src/mention-query.ts`.

## Folder picking and attachment chips

The directory picker uses the non-standard `webkitdirectory` attribute, supported by every engine Houston ships on; it is cast because React's typings lack it, and engines without it fall back to a file picker. An attached folder collapses to one chip and is removed as a unit. Chip icon columns are fixed at 32px with a 20px glyph so text aligns across chips; files use the tinted `filetype` glyph classified by `@houston-ai/core`, folders keep the monochrome glyph. Lives in `ui/chat/src/chat-input-attachments.tsx` and `ui/chat/src/attachment-chip.tsx`.

## Live browser input

Mouse input forwards the primary button only. `PointerEvent.detail` is always 0, so double and triple clicks are counted locally (within 500ms and 5px). A touch is a tap or a scroll (after 10px of travel), never a text selection, and a scroll does not raise the phone keyboard. Moves are throttled to one per 33ms. The wheel listener is registered manually because React's is passive and the page must own the scroll. Shift+Escape moves focus out of the page to the view's controls. The first frame fades in over the skeleton; later frames replace canvas pixels in place. Lives in `ui/chat/src/browser-live-pointer.ts` and `ui/chat/src/browser-live-stage.tsx`.

## Conversation scroll pane

The `Conversation` element wraps the scroll container; use-stick-to-bottom creates the actual scrolling div. The outer keeps `role="log"` and `tabIndex={-1}` so the shell can focus it on Escape, and the inner carries the `conversation-scroll-pane` marker class the keyboard-shortcut layer uses. Top padding matches the h-8 top fade, otherwise a small overflow pinned to the bottom left the first row half under the fade. The top fade shows only while scrolled; in light it fades from `canvas` (the panel's exact tone), in dark from `background` because the dark canvas token is translucent. One scroll listener covers user and programmatic scrolls. Lives in `ui/chat/src/ai-elements/conversation.tsx`.

## Message body

A user turn chips its own recorded mentions (so a rename still chips the original text); an assistant turn matches its prose against the supplied roster, with the viewer emphasized. The sender name is the bubble's first line, pulled to a 4px gap from the bubble's 8px paragraph gap; for custom-rendered cards it sits directly above. An empty teammate message still prints its byline. A person's words render verbatim with line breaks; only agent prose renders markdown. Streamdown's heading scale is retuned for bubbles (h1 20px stepping down to 16px, h5 and h6 at 14px, semibold, tighter margins) through descendant selectors, which outrank Streamdown's element utilities. Lives in `ui/chat/src/chat-message-body.tsx`.

## Clipboard and file identity

File identity is name, size and lastModified; folder-derived files use their folder-relative path, since a folder can hold same-named, same-sized files in different subfolders. Clipboard paste dedupe also includes the MIME type, because pasted screenshots usually have no name. `DataTransferItem` items are preferred over `files`, because the two can expose the same entry as different File objects with different timestamps. Generated names index after dedupe and strip MIME parameters so they never contain `;`, `=` or `+`. Linux Wayland WebKitGTK lists an image item but `getAsFile()` returns null; that case is reported to the user as `unavailable`. The image-only clipboard WebKitGTK hides entirely cannot be observed from JS. The clipboard types use loose `string` for `kind` and `type` so a real DOM `DataTransfer` stays assignable. Lives in `ui/chat/src/clipboard-files.ts`.

## Drop zones

The DataTransfer is neutered once the drop handler returns, so entries are captured synchronously and folder expansion runs afterwards. The ingest callback current at the drop is the one that runs, so files land in the conversation where they were dropped. Folder expansion failure goes to `onDropError`; without it the rejection surfaces unhandled, never swallowed. Lives in `ui/chat/src/use-file-drop-zone.ts`.

## Workspace file links in markdown

Agents link files they wrote, such as `[Plan](<Tropical Food - Plan.md>)`. Micromark percent-encodes destinations, and rehype-harden treats a destination as relative only when it starts with `/`, `./` or `../`, so a bare `perfil.md` was replaced by an inert "[blocked]" span. The file-link pass runs after sanitize and before harden: it records the decoded path on `data-file-path` and prefixes bare destinations with `./` so harden accepts them. Harden still owns the href. Anything with a scheme is not a file. The hast types are declared structurally so ui/chat takes no `@types/hast` dependency. Lives in `ui/chat/src/file-link-rehype.ts`.

File-link details: the returned path keeps the prefix the agent wrote so engine-absolute paths survive; percent-decoding returns the input unchanged on malformed escapes (which is also right for a file named `100%.md`); code spans and existing links are left untouched; the plugin takes no options so Streamdown's processor cache keeps one entry. The same transform recovers file links that CommonMark refused to parse (`splitFileLinks`).

## Comment chips in the composer

Comments waiting in the composer sit in one fixed-height row that scrolls sideways, so adding a comment never grows the composer. Hovering or focusing a chip lights its mark on the page; pressing it scrolls the mark into view. Lives in `ui/chat/src/citation-chips.tsx`.

## Tool names have two dialects

Claude tool names (PascalCase, `file_path`) and pi coding-agent names (lowercase, `path`) both reach the chat; icons, labels and content renderers cover both. An unmapped tool returns no icon so callers pick their own fallback (the header keeps the helmet). Browser tool details name only `open` and `handoff` pages; element refs mean nothing to a reader. A tool result with no text renders the command line alone, and an unknown tool falls back to its arguments, so an opened row is never empty. Lives in `ui/chat/src/tool-formatters.tsx` and `ui/chat/src/tool-content.tsx`.

## Tool block auto-open

A tool block auto-opens while active and auto-closes about 800ms after the result, but auto-close is armed only for an auto open; any user toggle takes ownership, since closing a row the user just expanded was a reported bug. Bash blocks opt out of auto-open because shell output is noise to most users. Lives in `ui/chat/src/ai-elements/tool-block.tsx`.

## Option rows and free-text row

Option labels wrap and are never ellipsized, since the user is choosing between sentences. A right-edge number badge doubles as the keyboard shortcut and crossfades into an advance arrow on hover or selection in the same slot, so the row never reflows; selection is a fill, not a border. A branded title's logo is 24px and falls back to the name on load failure. The free-text row is a miniature of the composer (28px pill, input hairline, optional "+", the same arrow-up send that lights with text or files). Its height is set in a layout effect so a new line never paints a frame with a scrollbar; once text wraps it expands (text full width, controls below) and stays expanded until emptied, since collapsing as soon as it fits would rewrap and flip back. The "+" is 4px taller than the send button, so padding is trimmed to keep the pill height. Lives in `ui/chat/src/interaction-card-parts.tsx` and `ui/chat/src/interaction-free-text-row.tsx`.

## Browser hand-off card

Open shows only while waiting; afterwards the same slot shows the outcome, so the card keeps its height and the chat does not jump. Done is the only success state; every other ending is neutral. Only a state change animates, so a card scrolled back into a settled chat does not fade in again. Lives in `ui/chat/src/browser-handoff-card.tsx`.

## Sender presentation is supplied by the consumer

`viewerUserId` absent treats every row as the viewer's, which is the single-player layout. The sender avatar renders only on the first row of a run, with the column reserved on the rest so bubbles align. Sender name color comes from the consumer, the only side that knows the palette. Lives in `ui/chat/src/chat-messages-types.ts`.

## Interaction card model

Only an explicit option click carries an option id; typed text is never matched back to an option. `hideFreeText` is ignored on free-text-only questions, and a file-answered question always shows the answer field because its send is how files alone answer. A reconnect step never counts the existing connection as done; only a connection created after the refusal time counts, wherever it was made. Credential steps take a custom integration's API key in a secure field so the secret never reaches the transcript. Lives in `ui/chat/src/interaction-card-model.ts`.

## Composer attachments

A folder pick filters hidden files (`.DS_Store`, `.git/**`) that the host refuses. The file input is reset before `click()` so the same file can be re-picked and WKWebView does not hold stale state. Removal takes an index set so a folder chip removes all its files in one update. Lives in `ui/chat/src/use-composer-attachments.ts`.

## Command activity classification

Bash and `run_code` calls are classified as web (curl, wget, HTTPie's `http`/`https`) or Python by the leading executable of each pipeline segment, skipping env assignments and wrapper words and stripping directory prefixes. Web wins over Python when both appear. The host is the first full URL, else the first domain-like argument, with "www." dropped. Quote stripping walks indices instead of an anchored alternation regex, which rescans quote runs and stalled the chat for seconds on long tokens. Lives in `ui/chat/src/command-activity.ts`.

## Mention span matching

Spans are matched longest name first, case-insensitive, with the `@` at the start or after whitespace or an opening bracket, never running into a longer word. Offsets index into the NFC-normalized text, so callers that slice must normalize first. Co-members sharing a display name collapse to one target carrying the first identity and the OR of their `isSelf` flags, so a viewer named by an ambiguous mention is still emphasized; send-time attribution is decided separately in `mention-send.ts`. Lives in `ui/chat/src/mention-spans.ts`.

## Composer resize handle

Desktop only. The handle sits absolutely in the surface's top padding so the grid never makes room for it; a drag starts from the drawn box so it does not jump from auto-grow; double-click returns to auto-grow; arrow keys resize in steps and do not leak to the surface's key handling. The dragged size lives for the composer's lifetime and is never persisted. Lives in `ui/chat/src/composer-resize-handle.tsx`.

## Mention rehype pass

Mentions are injected by a hand-rolled rehype transform (no new dependency) that runs after Streamdown's raw, sanitize and harden passes, splitting text nodes on "@Name" runs and marking them with `data-mention-name` for the `span` override to render as `MentionChip`. Nodes under `code`, `pre` or `a` are skipped. It slices the NFC form of the text because that is what `findMentionSpans` indexes into; the two forms render identically. It must be passed in tuple form with its targets as options (see the plugin chain section). Lives in `ui/chat/src/mention-rehype.ts`.

## Card attachments

`attach` is null outside a composer-replacing panel slot, so a card with nowhere to send files offers no "+". Files ride only a completion that answered a question; a declined card or a connect-only one leaves them for the returning composer. The list is read at completion time, not render time, because an OAuth hand-off can complete the card long after; once unmounted, a late completion hands over nothing. The pending latch starts true because a restored terminal step completes from a descendant's mount effect, which runs before this hook's effects. The latch is freed before releasing files so a throwing release does not disable every card with that key; a rejected completion still frees the card and is reported. Lives in `ui/chat/src/use-card-attachments.ts`.

## Envelope color handling

The envelope modules import core by deep path, because the core barrel is the React component library and these modules must load under `node --test`. Alpha is replaced through `@houston-ai/core`'s color parser; on a form it does not model (`color-mix()`, named colors) the input is returned unchanged so a frame never fails, except for alpha zero, where returning the opaque input would invert the oldest slice's fade. Lives in `ui/chat/src/dictation-waveform-envelope.ts`.

## Tool and action labels stay English

`ui/` is i18n-agnostic and the app passes no `toolLabels`, so tool verbs and integration action verbs read in English in every locale, matching the in-pane rows. Both tool dialects resolve to the same verbs; product tools arrive MCP-prefixed and resolve by short name. An unmapped action verb is capitalized, never conjugated, because a wrong gerund reads worse than the plain word. Which words belong to the toolkit is decided by the shared `actionWordsWithoutToolkit` in `@houston-ai/core`, also used by the workflow-step chip, so multi-word toolkits like `googlemaps` strip the same way on both surfaces. `suggest_actions` and `suggest_reusable` are clean-finish offers, bookkeeping rather than work. Lives in `ui/chat/src/tool-labels.ts` and `ui/chat/src/action-labels.ts`.

## Answer row

The decline sits beside the free-text field so "type here, or skip" reads at a glance, fixed in the trailing slot. When the card replaced the composer, the panel's attached files show as chips above the row, since this is the only place they are visible. The Esc keycap hint is hidden on phones. Lives in `ui/chat/src/interaction-answer-row.tsx`.

## Tool keys

`ToolEntry` has no unique id and a tool can run many times, so rows are keyed by name plus occurrence index. Lives in `ui/chat/src/chat-helpers.tsx`.

## Mention popover

The popover is plain markup rather than cmdk: focus stays in the textarea, which carries the combobox ARIA (`aria-activedescendant` and so on), and cmdk mints its own option ids after the caller's, so the textarea could never name the active option. It suppresses Radix's open and close autofocus, opens without animation, ignores focus-outside (focus legitimately lives in the textarea), and ignores pointer-down on its anchor so clicking into the "@query" does not dismiss it for the rest of the token. `data-mention-option` and `data-mention-popover` are stable test hooks. Lives in `ui/chat/src/chat-input-mentions.tsx`.

## Dictation contract

All speech capture and transcription lives in the app; the library renders a prop-driven control. The level history is polled with requestAnimationFrame, so `levels` must be cheap and side-effect free. `requesting` is distinct from `recording` (the mic is being granted, so the track pulses with no bars). Submit is disabled while a capture or transcription is in flight; Escape discards only while capturing. Lives in `ui/chat/src/dictation-types.ts`.

## Markdown link classification

A link is an autolink when its visible text equals the href, is itself a web URL, or equals the decoded href (micromark percent-encodes). The URL test also runs on whitespace-collapsed text, because agents hard-wrap long URLs inside labels and the softbreak flattens into the label. A childless `<br>` from a hard break counts as whitespace. Children are flattened by duck typing so the module stays testable without React. Autolink display text strips the scheme and caps at 64 characters with an ellipsis (one line at bubble width); the href keeps the full destination as a hover title. Non-web autolinks render their children as-is to keep Streamdown's streaming wrappers. Lives in `ui/chat/src/markdown-link.ts`.

## Skill message marker

A skill run's body starts with a single-line HTML comment marker `<!--houston:skill {...}-->` carrying display metadata, followed by the prompt the model follows, so the renderer can show a card for live and reloaded messages. Parsing lives in `@houston-ai/chat` so every surface decodes it the same way. The pre-rename legacy marker is still parsed so old history renders as a card. Fluent emoji slugs resolve to the jsDelivr mirror of `microsoft/fluentui-emoji@main/assets`. Lives in `ui/chat/src/skill-message.ts`.

## Author attribution rules

The viewer's own rows are never labeled; the `you` label is announced to screen readers only. An author known only by id gets a short slice, never the raw UUID; this duplicates the board's face-stack fallback because `ui/` may not import app code. A row is the viewer's own when there is no author (single-player or pre-stamping) or no known viewer yet, so layout never snaps sides once identity resolves. Side follows the writer only, never the labeling heuristic, because gating it on labeling would paint a teammate's words in the viewer's bubble and flip it later; misattribution is worse than an unlabeled bubble. "You" is announced only when the transcript proves the viewer wrote the row. Lives in `ui/chat/src/author-label.ts`.

## Stepper transitions

Transitions derive from the latest state through a ref, never the render-time state, because a handler may write a draft and leave the step in one batch. Each callback is bound to the step it was created for, so a late report (an OAuth hand-off resolving after the user paged on) leaves the current step alone. Lives in `ui/chat/src/use-stepper-transitions.ts`.

## Overflow menu to search popover

The menu's Radix close cycle must finish before the search popover opens, or their focus handling fights; `onCloseAutoFocus` is the first safe moment. Lives in `ui/chat/src/conversation-actions-menu.tsx`.

## Message list remount per conversation

The message list is keyed by `sessionKey`. Streamdown holds internal parse and DOM state, and positional message keys collide across conversations, so without the remount a session switch left the previous reply on screen. `sessionKey` is stable within a conversation, so streaming is unaffected. Lives in `ui/chat/src/chat-panel-log.tsx`.

## Child mission drawer

The missions a chat started list above the composer, open by default, with the title as a visible toggle that keeps the count when closed and flips instantly (only the chevron turns). Every row opens that mission's chat, because the value of a planning chat is reviewing what it handed out. The list height is bounded so a wide fan-out scrolls. It wears the same bordered card as the sibling composer offers. Lives in `ui/chat/src/chat-mission-list.tsx`.

## Upload area drag handling

A disabled button gets no dragleave or drop, so a drag over it would stay highlighted; the area accounts for that. A file drag over the box stops propagation so the panel's drop overlay steps aside and the box shows where files land. A file an earlier question took stays on that question. Lives in `ui/chat/src/interaction-upload-area.tsx`.

## Suggest-reusable card

The card replaces the composer and borrows the plan-ready card's vocabulary (28px rounded `bg-chip` surface, the same full-width row button classes) so the card family reads as one system. Icons (Sparkles for a Skill, CalendarClock for a Routine, Lightbulb for a Learning) are internal so the labels contract stays icon-free. Lives in `ui/chat/src/chat-suggest-reusable-card.tsx`.

## Human messages render as plain text

What a person typed renders verbatim with line breaks; only agent prose is markdown. Mention chips and bare URL chips survive, using the same matcher and the same shortened display as the markdown path so both render alike. Pasted URLs are matched conservatively (scheme to next whitespace, minus trailing sentence punctuation); without an open handler they render as plain text. Lives in `ui/chat/src/plain-message-text.tsx`.

## In-place message editor

Send rewinds the conversation to this message and continues from the edited text; the consumer owns that. Enter sends, Shift+Enter breaks a line, Escape cancels, and Send disables while empty or in flight so a double tap cannot rewind twice. The editor is bordered and filled so the editing state is unmistakable in both themes. Lives in `ui/chat/src/chat-message-editor.tsx`.

## Message action row reveal

The Copy and Edit row is invisible at rest and revealed by opacity while the row is hovered or holds focus; the buttons stay in the DOM and tab order so keyboard users reach them. This follows ChatGPT's grammar over the always-visible default, and opacity-only keeps geometry stable. It is an exception to the repo rule against hover-only affordances and should be revisited against that rule. The action row is excluded from "does this message show a sender mark" checks because its buttons carry icons. Lives in `ui/chat/src/chat-message-actions.tsx`.

## Conversation search folding

Search ignores case and accents, the same folding as archived mission search. Lives in `ui/chat/src/conversation-map-search.ts`.

## Live browser keyboard

Special keys go by name with CDP modifier bits; everything else is inserted text read back from a hidden field, because that is the only path phone keyboards, autocorrect and IMEs all take. Composition is left alone until it ends. keyCode 229 identifies an IME-handled keydown: WKWebView fires the composition-committing Enter with `isComposing` already false. Backspace on an empty field on a phone sends no keydown, so it is taken from `beforeinput`. Tab and Escape belong to the page; Shift+Escape leaves it. Lives in `ui/chat/src/browser-live-keys.ts`.

## Unparsed file links in text

CommonMark rejects unescaped spaces in destinations, so `[informe](informes/Q3 reporte.pdf)` reaches the reader as literal text. The repair runs on rehype text nodes, so code spans and blocks are never touched. Matching is narrow because a false positive rewrites prose: the destination must pass `markdownFilePath`, must end in a file extension (the guard that keeps "see [the note](a longer aside)" intact), and neither half may span a line or nest brackets. The anchor builder is injected so this module does not import the rehype pass. Lives in `ui/chat/src/file-link-text.ts`.

## Panel-level attachments

Attachments live at panel level so the whole panel is a drop target. Uncontrolled, they are kept per conversation, because a board reuses one panel across conversations and an unscoped list would follow the user into another conversation. Merges and releases read the list at call time, so a folder drop that resolves after a switch, or a send that settles after more files were added, touches only its own files. Controlled, the parent owns scoping and `releaseFiles` is a no-op. Lives in `ui/chat/src/use-chat-panel-attachments.ts` and `ui/chat/src/use-session-files.ts`.

## Attachment intake

Every entry point (drop, picker, paste) funnels through one ingest path so validation, dedupe and the duplicate notice behave the same. A folder pick past the file ceiling refuses the whole batch (the drop path aborts at the same ceiling), because a silent subset would misrepresent what the agent gets. Lives in `ui/chat/src/use-attachment-intake.ts`.

## Live browser types

The view's props are a structural copy of the wire shapes in `@houston/wire-types` so ui/ stays free of the wire while the app passes SDK values straight in. Frames skip React state: the stage subscribes and paints onto a canvas so a 10 fps stream never re-renders. Pointer coordinates are 0..1 of the frame; wheel deltas are page pixels; frames are base64 JPEG without a data-URL prefix. Lives in `ui/chat/src/browser-live-types.ts`.

## Composer inert state

The attach button opts out on its own when locked, because keyboard focus survives the composer's pointer-events lock. Lives in `ui/chat/src/chat-input-attach-button.tsx`.

## Decline row

Non-question cards (connect, sign-in, credential, plan approval) carry an always-visible free-text row styled as a miniature composer; it can be controlled so a typed instruction survives a remount, and submits trimmed, never-empty text. Lives in `ui/chat/src/interaction-decline-row.tsx`.

## Load-older trigger

Mounted as the first child of the conversation content: when the top of the loaded window scrolls into view, the previous page is fetched and prepended, and the viewport is anchored by distance from the bottom. It is guarded against the initial stick-to-bottom sweep (which passes the sentinel while pinned) and against overlapping loads. Lives in `ui/chat/src/ai-elements/conversation-load-older.tsx`.

## Plan-ready card

Two options in render order: continue in Ask first mode, then Autopilot. Primary emphasis comes from order and title weight, not a filled button; `disabled` gates both so the card reads inert while another turn runs. Empty summaries render no lede. The resolver is DOM-free for node tests. Lives in `ui/chat/src/chat-plan-ready-card-model.ts`.

## Mention chips

A mention chip is soft and non-interactive. A mention of the viewer uses the highlight wash; inside the light user bubble (near-ink fill) its label flips to the bubble foreground. Other people's mentions use the chip fill on the canvas and the `bubble-chip` pair inside the user bubble, measured against the bubble. The `span` override turns only spans minted by the mention pass into chips; KaTeX output and kept raw HTML pass through. Lives in `ui/chat/src/mention-chip.tsx`.

## Mentions carried by a send

Only picks whose "@Name" run survives in the text ship, and only where the renderer would chip them (see the mask), so nobody is notified about a message that does not address them. When co-members share a display name, occurrences are handed to picks in order; extra occurrences repeat the first. Lives in `ui/chat/src/mention-send.ts`.

## Mention mask

The renderer refuses to chip inside `code`, `pre` or `a`, but the send path sees raw text, so code spans, fenced blocks and inline links are blanked one character for one (newlines kept) before matching, so offsets still index the original. Masked characters become spaces, because the renderer starts a fresh text node after such a node, where an "@" at index 0 starts a mention. Inline constructs are matched against the fence-masked text; an unterminated fence masks to the end, like a renderer. Known divergences of this lexical pass: indented code blocks, reference-style links, bare angle-bracket autolinks, raw HTML `<code>`, and mentions inside a block quote of a code fence. The failure mode is a notification with no chip, never a lost message. Lives in `ui/chat/src/mention-mask.ts`.

## Mention text primitives

All mention comparisons happen in NFC so a name's UTF-16 length is the same in roster and text, which makes slice-by-name-length safe. The span key folds case only, never diacritics, because folding could change lengths and truncate a chip mid-grapheme; "@Jose" does not chip "José". The filter key folds case and diacritics, used only for the popover. An `@` starts a mention at the start of text or after whitespace, an opening bracket or a quote; a following letter, digit or combining mark extends the name and invalidates the match. These primitives live in their own module so composer, send and renderer modules do not depend on each other. Lives in `ui/chat/src/mention-text.ts`.

## Live browser painting and keyboard wiring

Frames paint without React state: one decode at a time, a single pending frame replaced by newer ones, and frames older than the last painted dropped. The hidden field uses native listeners because React's synthetic `onBeforeInput` has no `inputType`. Paste is typing into the page and never blocked. A bare host typed in the address bar means its https page; the field follows the page but never overwrites what the person is typing. Lives in `ui/chat/src/browser-live-paint.ts`, `ui/chat/src/browser-live-keyboard.ts`, `ui/chat/src/browser-live-address.tsx`.

## File answers

Files with no words still answer a question, but only files no other step's live claim holds, and never over a picked option. A plain question needs every attached file; a `wantsFiles` question takes whichever are unclaimed, so each file question gets its own. A typed answer on a `wantsFiles` question also claims the files. A claim lives only while its files stay attached and its answer stands; a skip or a different answer drops it. Lives in `ui/chat/src/use-file-answer.ts` and `ui/chat/src/interaction-file-claim.ts`.

## Cited messages

File comments ride the typed words in an envelope whose format `@houston/wire-types` owns. A body may contain Skill or attachment markers and several sends joined by a queue flush, so it is split into sends first and each decoded; an attachment send's repeated prompt and a Skill send's repeated words are skipped. Lives in `ui/chat/src/cited-message.ts`.

## Edit tool diff

Claude's `old_string`/`new_string` and pi's `edits: [{ oldText, newText }]` both normalize to ordered pairs. An errored result replaces the diff; input with no pair falls back to the result text. Lines truncate at 200 characters. Sign and text use the same `-ink` tone, legible on its own /10 wash. Lives in `ui/chat/src/tool-content-edit.tsx`.

## Mention combobox ids

The textarea is the combobox and the popover list is its listbox; both render from `chat-input.tsx`, so the ids are minted once in this hook. The highlight is clamped because the filter can narrow between renders, and `aria-activedescendant` must never name a missing row. Lives in `ui/chat/src/use-mention-combobox.ts`.

## Chat status derivation

Only `assistant_text_streaming` counts as streaming, since it is the only visibly moving content; reasoning streams inside the collapsed log, and counting it made the loading helmet flicker off. Every in-flight turn without visible streaming text is "submitted", covering batchy providers that sit silent for 10 to 20 seconds before one burst. An idle feed whose last item is the user's message is in flight too (the send just fired, or the engine is warming). A typed provider error as the last visible event is terminal regardless of a stale `isLoading`, skipping the invisible `final_result` and the session-error echo. Lives in `ui/chat/src/chat-status.ts`.

## Link chip

Every link in chat is the same Slack-style chip (link-token blue on a soft tint with a chain glyph), shared by the markdown and plain-text paths. The tint is the resting affordance; hover only adds an underline. `box-decoration-break: clone` keeps rounded ends when wrapping. Inside the user's filled bubble the blue fails contrast, so it uses `bubble-chip-text`. The glyph is glued to the URL's first characters with a nowrap span so a wrap never strands the icon; non-string children cannot be split and the icon rides alone. Lives in `ui/chat/src/autolink.tsx`.

## Composer trailing controls

While a capture runs, the waveform takes the input row and this slot swaps to cancel and accept (or a spinner) and hides submit. On phones the 8px gap lets the mic's and send's 4px hit slops meet without overlapping. Lives in `ui/chat/src/composer-trailing.tsx`.

## Interaction answers marker

When an `ask_user` sequence finishes, one user message carries every answer: the model reads flat `"<question>: <answer>"` text, and a leading HTML-comment marker `<!--houston:interaction-answers {...}-->` carries the same data for a Q&A card. Parsing lives in `@houston-ai/chat`, mirroring the skill marker. Malformed entries are dropped; if none remain, decoding returns null and the message renders as text. Lives in `ui/chat/src/interaction-answers-message.ts`.

## Branded header line

The app logo replaces the helmet at text-line size with `object-contain`, so odd aspect ratios never change row height. A missing or failed logo (the pre-catalog favicon guess can 404) falls back to the helmet; a logo-less custom integration shows a wrench, since the helmet would read as Houston itself. Regular weight. Lives in `ui/chat/src/chat-action-brand-line.tsx`.

## Thinking phrases deck

Deck logic is pure so no `Math.random` runs during render; the component seeds and advances from an effect with its own RNG. Every phrase shows once before repeats, and a reshuffle never replays the last phrase first. Lives in `ui/chat/src/thinking-phrases.ts`.

## File chip

A workspace file named in prose uses the file vocabulary (tinted per-extension glyph on the recessed chip), not the web link look: `↗` and link blue mean "leaves Houston", and blue stays the one sanctioned blue for the web. The chip sits on the baseline (`align-[-3px]`) and long names break with `overflow-wrap:anywhere`. Lives in `ui/chat/src/file-chip.tsx`.

## Message previews

Skill and attachment messages persist a leading HTML-comment marker before the model prompt; rendering that verbatim leaked marker JSON onto mission cards. `message-preview.ts` decodes bodies the way the chat does: a Skill sent alone previews as its one-line description (or "" so the surface hides the subtitle), attachments preview as typed text with paths hidden, nested interaction-answer markers decode to a one-line join, and file comments preview as the surrounding words. It sits next to the marker decoders so every consumer derives the same preview. The attachment marker keeps absolute paths decodable for the model but never renders them. Lives in `ui/chat/src/message-preview.ts` and `ui/chat/src/attachment-message.ts`.

## Upload progress announcements

Only the reconnect is announced to assistive tech; a live region per percent or per file would talk over everything. Lives in `ui/chat/src/attachment-progress.tsx`.

## Wheel delta modes

Wheel `deltaMode` 1 (lines, Firefox) and 2 (pages) are converted to page pixels before forwarding. Lives in `ui/chat/src/browser-live-geometry.ts`.

## Suggestion chips wrap

Chips wrap onto more lines instead of scrolling sideways, because a hidden horizontal scroll cut the last chip mid-word with no sign of more; long labels wrap inside their chip. The heading and dismiss X sit on the first line at chip height. Lives in `ui/chat/src/ai-elements/suggestion.tsx` and `ui/chat/src/chat-suggest-actions.tsx`.

## Viewport pin

use-stick-to-bottom observes only its content, so when the log's viewport changes height (a composer card appearing, the composer growing, the phone keyboard), a shrinking viewport hides the newest lines and a growing one clamps `scrollTop`, which the library reads as the user scrolling up and lets go of the bottom. `ConversationViewportPin` compensates only the viewport's height change, while the library's `resizeDifference` guard is set so the clamp is not read as an escape; it corrects only browser clamps, and clears the guard after the clamp's scroll event has been judged a frame and a timeout later. A reader scrolled up stays put. Reduced motion jumps instead of springing. Auto-scroll re-pins only on the person's own acts (submission start, `latestToken`). Lives in `ui/chat/src/ai-elements/conversation-viewport-pin.tsx` and `ui/chat/src/ai-elements/conversation-auto-scroll.tsx`.

## Live browser task text and countdown

On phones the instruction clamps to three lines with Show more only when it truly overflows (measured while clamped; once expanded the toggle stays to fold back); desktop shows it whole. The countdown re-renders once per minute boundary (scheduled a hair after so `ceil()` has moved), and its last minute uses the attention color. Lives in `ui/chat/src/browser-live-task.tsx` and `ui/chat/src/browser-live-time-left.tsx`.

## Sender runs

Name and face print once per change of speaker. User messages key on author id (authorless on the empty id); every assistant turn shares one key; each system message has a unique key, so a divider always breaks a run and the next speaker reintroduces themselves. Process blocks are transparent and neither start nor break runs. The peer row reserves a 32px avatar column even on continuation rows so bubbles line up. Sender name tone comes from the consumer. Lives in `ui/chat/src/chat-sender-runs.ts` and `ui/chat/src/chat-sender-parts.tsx`.

## Pending mention picks

Picks are scoped per draft because draft text is per conversation; a panel-global list would cross conversations. The map is LRU-bounded (re-inserting on touch keeps Map order meaningful); a long-unvisited draft has to re-pick. The map lives in a ref, since nothing renders from it. Reading picks does not clear them; clear only once the send resolved. Lives in `ui/chat/src/mention-pending.ts` and `ui/chat/src/use-pending-mentions.ts`.

## Stepper state plumbing

A ref tracks the last state from either the controlled prop or local transitions, so a caller can park state, hand it back after a remount and drop the prop without losing a step. Function updaters resolve against the ref so two updates in one batch compose. Writing the ref during render is valid only while `controlled` is a synchronous external-store read (zustand), never a transition-deferred or Suspense-retried value. An origin-guarded transition that returns the same state disturbs neither render nor subscriber. Lives in `ui/chat/src/use-stepper-state.ts`.

## Status line

`ChatStatusLine` is the glyph and muted-label row shared by the mission log, thinking line and other prompts. It renders spans only so it stays valid inside markdown prose, and inherits text color. Lives in `ui/chat/src/chat-status-line.tsx`.

## Progress steps

The last `update_progress` call in the feed is authoritative; each call replaces the previous. Lives in `ui/chat/src/use-progress-steps.ts`.

## Interaction keyboard shortcuts

Number keys pick options and Esc declines, only on a live question step and only while focus is outside text fields. Esc runs in the capture phase and stops propagation so it does not fall through to the global Escape-closes-panel shortcut. Lives in `ui/chat/src/use-interaction-shortcuts.ts`.

## Parent mission link

A spawned mission links back to the chat that started it with one bar above the composer, the twin of the child drawer; a chat shows one or the other, since spawned missions cannot spawn. Lives in `ui/chat/src/chat-parent-mission-link.tsx`.

## Clipboard fallback

Copy falls through when the async Clipboard API exists but is denied in some WebViews. Lives in `ui/chat/src/clipboard.ts`.

## Composer manual size

Dragging below about two lines returns to auto-grow. The dragged size is capped so the header, a strip of conversation and the composer controls stay visible, but never below the auto cap. A manual size is a floor, and the cap is the larger of it and the auto cap so text still grows the box. The form re-clamps on window resize. Lives in `ui/chat/src/composer-resize.ts`.

## Answers receipt

The interaction-answers card is a quiet receipt in the user column; rows are keyed by position since the lines are an ordered, stable pass-through list. Lives in `ui/chat/src/user-interaction-answers-message.tsx`.

## System message rows

Built-in copy is English only; hosts that localize replace the whole row through `renderSystemMessage`, which the Houston app does for every kind. A host card with no rendering leaves no row. Lives in `ui/chat/src/chat-system-message.tsx`.

## Tool result pairing

Results can arrive after several calls and a thinking flush, so the current turn is searched in call order first; since a teammate's user row can land mid-turn, a result with no open call there falls back to earlier calls, most recent first. Lives in `ui/chat/src/feed-tool-result.ts`.

## Mention list keys and IME

While an IME composition is in flight the mention list consumes no keys: arrows, Escape, Enter and Tab belong to the candidate window, and intercepting them made the composer unusable in Japanese, Chinese and Korean. Shift+Enter is always a newline. Lives in `ui/chat/src/mention-keys.ts`.

## Workspace path helpers

Path helpers are separator-agnostic, since the engine may run on Windows while the viewer is any browser, and live in a `.ts` module because node:test cannot load `.tsx`. A leading dot is a dotfile, not an extension. A chip label gets the file's extension appended unless it already ends with it. Lives in `ui/chat/src/file-path.ts`.

## Pending completions registry

Pending card completions are module-level, keyed by `completionKey`, because a user can leave a conversation during upload and the returning card restores its terminal step and completes on mount; the new instance must see the first send pending. Lives in `ui/chat/src/pending-completions.ts`.

## Composer key order

The mention list gets first say; consumed keys are `preventDefault()`ed so PromptInputTextarea skips Enter and Escape does not reach the stop handler. Escape discards an in-flight dictation capture before stopping a running turn. While capturing, the textarea is replaced by the waveform, so Escape and Enter are listened for on the document. Lives in `ui/chat/src/use-composer-key-down.ts` and `ui/chat/src/use-dictation-hotkeys.ts`.

## Textarea auto-height

WKWebView has no `field-sizing: content`, so height is measured from `scrollHeight` after a 0px reset (so deleted text shrinks the box) with overflow hidden during measurement. Lives in `ui/chat/src/textarea-fit.ts`.

## Composer draft store

Drafts live in a keyed store only the composer subscribes to, so a keystroke re-renders the composer, not the board and message list. Lives in `ui/chat/src/use-composer-draft.ts`.

## Rotating phrases

Phrases rotate about every 4 seconds from the shuffled deck. Passing undefined or an empty list idles the deck with no timer, so a caller can key it off an active flag. The thinking indicator shows only before any output and uses the same `ChatStatusLine` as the mission-log header. Lives in `ui/chat/src/use-rotating-phrase.ts` and `ui/chat/src/chat-thinking-indicator.tsx`.

## Drop error notice

When folder expansion fails and there is no notice channel, the error is rethrown so it surfaces as an unhandled rejection to Sentry rather than being swallowed. Lives in `ui/chat/src/use-drop-error-notice.ts`.

## Process pane cap

An open process block's pane is capped at `max-h-80` with `overflow-y-auto` so streaming tool calls cannot push the conversation off screen. Scroll chaining stays on because the pane is inline content. `pr-1` clears the scrollbar gutter on Windows. The classes are dependency-free constants so node tests can assert them. Lives in `ui/chat/src/chat-process-classes.ts`.

## Channel brand colors

Messaging-channel badge colors (Slack aubergine, Telegram blue, the Slack lozenge colors) are third-party brand values, so they do not map to design tokens and never follow the theme, the same precedent as `app/src/components/shell/provider-brand-colors.ts`. Lives in `ui/chat/src/channel-brand-colors.ts`. The Python glyph path comes from Simple Icons (CC0) and uses `currentColor` (`ui/chat/src/python-icon.tsx`).

## Approval detail block

A value the user cannot see is a value they did not approve, so the detail block shows the value whole and selectable, preserves whitespace, is monospaced, and scrolls inside a bounded height so it cannot push the answer row off the card. Lives in `ui/chat/src/interaction-detail-model.ts`.

## Offscreen render skipping

Message roots use `content-visibility: auto` with `contain-intrinsic-size: auto 9rem`, so off-screen messages skip layout and paint and keep their last measured height. Unsupported engines ignore both. It applies to each message root, never a wrapper, because containment clips descendant outlines and the search highlight draws an outline on that root. Lives in `ui/chat/src/offscreen-render.ts`.

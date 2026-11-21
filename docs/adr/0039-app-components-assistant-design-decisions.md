# app/src/components/assistant: design decisions

Covers `app/src/components/assistant/`: the AI Manager chat, its phone header and its onboarding fields. File paths in this record are relative to that folder.

## The AI Manager chat is the ordinary agent chat

The assistant chat uses `useAgentChatPanel` and AIBoard's `panelOnly` mode, the same presentation as the phone's pushed mission chat, so nothing re-implements chat behavior and the SDK conversation VM stays the one source of turns. It creates no activity record, which keeps it out of every board, unread count and mention sweep. Its conversation is fixed (`handle.conversation`), so there is no selection or create path. With no board behind it (`rawItems: undefined`), per-conversation loading follows the SDK VM alone. The `hydrateSession` callback has a stable identity because AIBoard keys composer autofocus on it, and an inline arrow would refocus on every streamed token.

Lives in `app/src/components/assistant/assistant-chat.tsx`, `use-assistant-send.ts`.

## The assistant as an agent record

Discovery returns an address, not a roster row: the assistant is a dot-named directory the local store never lists. On the TS engine the id and folder path are the same opaque route key, so the chat builds the agent record around it. `configId` and `createdAt` are inert constants so the object stays stable. Its color is a palette token id so `resolveAgentColor` resolves it per theme.

Lives in `assistant-agent.ts`.

## Discovery wait and failure

The screen waits on discovery behind a spinner; the query is cached for the session, so only the first open waits. The spinner also covers a paused query (offline), because `isLoading` means no answer yet, not a request in flight. Once the retry ladder is spent, the screen says so and offers another try, with the same words for a pod that will not wake and a real failure, and no cause or status shown since the failure already reached logs and Sentry. It uses `AsyncButton` because the retry runs the whole ladder. A deployment with no assistant renders nothing.

Lives in `assistant-view.tsx`, `assistant-failure-state.tsx`.

## Conversation commands are plain messages

The composer's compact and clear entries send their literal text through the ordinary send path; the runtime recognizes it at the turn route (`packages/runtime/src/session/conversation-command.ts`). The literals are a contract with that parser: a typo silently sends a prompt instead, so a test pins them. The entries are disabled in an empty chat and mid-turn, because the send queue would merge a queued command with other text and the runtime would no longer recognize it. The send path already reports failures; the handler only stops the rejection escaping.

Lives in `context-commands.ts`, `use-context-command-menu.tsx`, `composer-context-menu.tsx`.

## Keyboard inset on iOS

iOS does not shrink `dvh` when the keyboard opens, so full-height chats and onboarding steps pad by the visual viewport's occluded bottom.

Lives in `assistant-chat.tsx`, `onboarding/manager-chat.tsx`.

## Phone header

The phone header is CSS-hidden at `md:`. On phones the chat is a push with the nav bar hidden, so its chevron is the way out; it retreats to the Agents list, or goes to the Agents tab when nothing is behind it.

Lives in `assistant-phone-header.tsx`.

## Scripted onboarding in the real chat component

First-run onboarding is authored copy with every answer given on a step, so it runs whether or not the manager can start. It renders through the same `ChatPanel` as the real manager. The manager's lines type out a word per beat (reduced motion shows them whole); answers appear at once; a reopened conversation types only the latest manager turn. The step replaces the composer, stays mounted while hidden so live work (the team being hired) is not lost, and caps its height with `cqh` against the chat's size container so the latest line keeps the rest with the keyboard up. The closing is the team card, shown whole.

Lives in `onboarding/manager-chat.tsx`, `onboarding/use-scripted-reveal.ts`, `onboarding/manager-step-frame.tsx`, `onboarding/manager-onboarding.tsx`.

## Resume from persisted state

The conversation is derived from persisted state (connected provider, survey record, hired AI Employees) plus this session's team answers, so a reload resumes on the step it left. Each survey question saves before moving on, because the record is the resume point; `*_continued` events fire only after the save lands. Employees present when the team step opens were hired by an earlier interrupted run. The connect step does not wait on the provider probe unless Connect is pressed. Where discovery serves no manager, the closing goal is not sent.

Lives in `onboarding/first-run-conversation.tsx`, `onboarding/manager-survey-card.tsx`, `onboarding/manager-team-prompt.tsx`.

## Lifecycle lives in the host, beside the shell

The funnel and the pending stage live in `ManagerOnboardingHost`, not the chat, because the chat is a kept-alive screen the person may leave and a run must count once. The host mounts beside its children so starting or ending onboarding never remounts the shell. Opening the manager view is a redirect that replaces rather than pushes.

Lives in `onboarding/manager-onboarding-host.tsx`.

## Transcript import and finish

Finishing writes the onboarding lines into the manager's real conversation, then hands over to the real chat. A failed import is reported, stays owed on the device, and is retried once per session on the next load. An import abandoned by the page (a reload aborting it) is held by the SDK (`turns.importMessages` does not settle), so the stage stays pending and the next load resumes; finishing anyway would stamp `onboarding_completed` with an empty manager chat. On a page that turns out to be live (bfcache restore) the SDK resends and finish runs once, late. A second finish is ignored. A finish pressed during discovery waits for it.

Lives in `onboarding/use-onboarding-transcript.ts`.

## Kickoff and Try again

The kickoff onboarding leaves for the manager is sent through the chat's own send as the first turn, waiting for any running turn. The goal card's Try again is hidden while a turn is in flight and allows one press at a time, since the send marks busy only once on its way and a second press must not carry a second grant.

Lives in `use-manager-handoff.ts`, `onboarding/use-onboarding-chat-cards.tsx`, `onboarding/onboarding-goal-card.tsx`.

## Goal field

The goal cannot be skipped. Its length is counted in code points, the gateway's unit, and nothing clamps the field, since truncating a paste would lose words. Enter sends unless an IME is composing; Safari clears `isComposing` before keydown and leaves only keyCode 229, so both are checked. The field is 16px on phones to prevent focus zoom.

Lives in `onboarding/manager-goal-card.tsx`.

## Profile completion

An existing account is asked only the survey gaps, fixed when the prompt opens so an answer never drops a question on screen. "Not now" is remembered. A ref guards the open event because StrictMode replays mount effects.

Lives in `onboarding/profile-conversation.tsx`.

## Card actions layout

On phones card actions stack full width with the primary lowest, nearest the thumb; on desktop they are one row with the primary last. The primary is listed first so it takes keyboard focus first. Back sits above the actions on phones and at the far left on desktop.

Lives in `onboarding/card-actions.tsx`, `onboarding/manager-step-frame.tsx`.

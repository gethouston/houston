# app/src/components/mission-chat: design decisions

Covers `app/src/components/mission-chat/`: the phone's pushed mission chat screen. File paths in this record are relative to that folder.

## The phone's mission chat is a pushed nav level

On phones a mission's chat is a first-class nav level pushed over whatever view opened it, popped by its back chevron or hardware back. The shell mounts it full screen and hides the tab bars while the nav entry names it. Selection belongs to the nav stack (`chatMissionId`), not local state: selecting another mission pushes that chat, the draft chat adopting its just-created mission replaces in place so back never revisits the blank composer, and deselecting closes the screen.

Lives in `app/src/components/mission-chat/mission-chat-screen.tsx`, `use-mission-chat-source.ts`.

## One sweep, panel-only presentation

The chat-only source reuses the same cross-agent sweep and action routing the boards read (`useMissionControl` + `useMcActions`), so board-only members are inert. Active and archived chats both render through AIBoard's panel-only presentation, so the phone screen cannot drift from the desktop panel. Which wiring applies is decided from the raw sweep rows (`pendingMissionSurface`), the one place both statuses coexist.

Lives in `use-mission-chat-source.ts`, `mission-chat-screen.tsx`.

## Late selections do not yank the user back

AIBoard's create path resolves asynchronously. A selection that lands after the user navigated away is applied only while that chat is still the open one.

Lives in `use-mission-chat-source.ts`.

## A removed subject closes the screen

Deleting or archiving the open mission, or deleting its agent, closes or pops the chat instead of leaving a dead composer.

Lives in `use-mission-chat-source.ts`, `archived-mission-chat.tsx`, `mission-chat-screen.tsx`.

## Archived chat swaps itself for the active one

A send in an archived chat reactivates the task; its handoff marks the sweep row running first, so the screen above swaps to the active chat on its own.

Lives in `archived-mission-chat.tsx`.

## Keyboard inset

The composer stays above the on-screen keyboard by padding the screen with the visual viewport's occluded bottom (`useVisualViewportInset`).

Lives in `mission-chat-screen.tsx`.

## Drafts follow the mission

The chat uses the Mission Control scopes' draft store, so text parked in a mission's composer follows the mission across surfaces.

Lives in `use-mission-chat-source.ts`.

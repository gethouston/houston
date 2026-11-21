# app/src/components/account: design decisions

Covers `app/src/components/account/`: the Profile and About me screens opened from the account menu. File paths in this record are relative to that folder.

## Account screens are top-level views

Profile and About me open only from the account menu (`shell/sidebar-account-menu.tsx`), on both breakpoints, as top-level screens with no back bar. They share the Settings index page shape (`AccountPage`). The menu offers Profile only once the profile read succeeded (`useProfileAvailable`).

Lives in `app/src/components/account/id.ts`, `account-page.tsx`, `profile-view.tsx`.

## Display name field

The gateway answers 400 above its name length ceiling, mirrored as a client constant. The field is seeded with the saved name and remounted by `key` when it changes, so it re-syncs to server truth without an effect that could overwrite typing. Validation is inline under the field because a toast scrolls away from what it describes. The save is optimistic and a refusal restores the old value with its own toast (`useSetMyProfile`). The effective name is the gateway value, falling back to the resolved self-identity.

Lives in `profile-view.tsx`.

## Profile picture

The image is squared and shrunk in the browser before upload (`fileToAvatarDataUrl`); only that resize is awaited, the save is optimistic. Each client-side rejection has its own literal localized string so a missing translation fails at compile time and the user reads the real reason. "Remove picture" appears only when the current picture is the user's own upload, and falls back to the Google photo. Initials come from the effective display name passed in, so they cannot disagree with the name field. The file input is cleared before each pick so picking the same file again still fires a change.

Lives in `profile-photo.tsx`.

## About me uses a compact editor

About me is stored in the workspace context blob's `user` slot, which the agent runtime reads into its prompt. It uses the compact (`rows`) editor because a viewport-height card inside a scrolling column has no height to claim. It waits behind `ContextSlotWaiting`.

Lives in `about-me-view.tsx`.

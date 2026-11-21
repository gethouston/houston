# app/src/components/provider-browser: design decisions

Covers `app/src/components/provider-browser/`: the provider browser and its connection grouping. File paths in this record are relative to that folder.

## Tri-state connection grouping

Providers split into three buckets from one derivation: confirmed connected (the only bucket that may say "Connected"), checking (not confirmable right now: unreachable engine, waking pod, a space whose agent list is settling) and confirmed not connected (the only bucket that gets a Connect CTA). Checking rows render on the connected side with a muted, non-actionable "Checking" and never a Connect button, because offering one for an account that may be signed in is the guess the tri-state prevents. Until the first status probe resolves, the browser shows a skeleton instead of guessing.

Lives in `app/src/components/provider-browser/provider-grouping.ts`, `provider-browser.tsx`, `provider-row.tsx`, `provider-browser-sections.tsx`.

## Auto-select only on confirmed, live transitions

Onboarding advances when a provider goes from not connected to connected. Only confirmed states count: an unknown probe never auto-advances. The watcher is gated on `probed`, not `ready`, because `ready` flips true from the cached last-scan snapshot and a stale cached "connected" must not advance onboarding or dismiss the migration gate. On the first snapshot an already-connected provider fires only with `selectOnMount` (onboarding re-entry); the hub leaves it off. The model is `provider.defaultModel || status.active_model`, and a transition with no model is skipped. Analytics (`provider_configured`) are fired by the status hook, not here. The local OpenAI-compatible provider's model is user-typed and absent from the catalog, so its dialog hands the model to `onSelect` directly; the later status transition resolves to no model and does not double fire.

Lives in `auto-select.ts`, `use-provider-auto-select.ts`, `provider-browser.tsx`, `provider-connection-dialogs.tsx`.

## Billing is separate from auth

How a provider is billed differs from how it connects. OpenCode Go is a flat subscription unlocked with a pasted key (`PROVIDER_OVERRIDES["opencode-go"].billing`). The merged OpenCode account spans `opencode` (payg) and `opencode-go` (subscription) with one key, so it returns both and matches either quick filter. The local provider has no billing. Model lists and offer lookups union across a card's gateway ids through one shared reverse map, so marketplace and model detail resolve offers identically.

Lives in `provider-grouping.ts`, `provider-filtering.ts`.

## Description keys fail visibly

Card description keys are a typed `satisfies Record` map, so a new key must be wired or typecheck fails. Unknown ids fall back to the raw id so a lookup never borrows another provider's copy; the modal then uses the provider-list one-liner instead of showing the raw key. The merged OpenCode account reads from `opencode-account`.

Lives in `provider-grouping.ts`.

## Curated onboarding mode

Opt-in and used only by onboarding: a featured set split by Subscription and API key (API key covers pasted keys, multi-lab gateways and the local server), with a "see all" chip. An active search or filter skips the featured narrowing, otherwise a non-featured match would render nothing beside a dangling chip; the chip shows only while collapsed with providers hidden. Billing toggles are hidden in curated mode since the sections already split by connect type. Filtering and featured pinning apply only in the browser; the chat model picker maps `PROVIDERS` directly.

Lives in `provider-filtering.ts`, `provider-browser.tsx`, `provider-filters.tsx`.

## Catalog reactivity

The pi-ai catalog hydrates `PROVIDERS` in place with no React signal, so the connect list memo re-keys on `useProviderCatalog().updatedAt`; otherwise it stays pinned to the seed captured before `/v1/catalog` resolved.

Lives in `use-provider-browser-data.ts`.

## Dialog close reasons

A dialog reports success through `onConnected` and only then closes, but `onClose` carries no reason, so a ref holds the pending reason across that hop and resets on every close. Only an abandoning close cancels the connection observation. A remote sign-in finishes out of band and unmounts its dialog, so a user-driven close there is always an abandon.

Lives in `provider-connection-dialogs.tsx`.

## Card presentation

Cards render without `layout` animation so the grid never reflows on a modal's scroll lock. The Connect pill has a fixed min width so the Connect, Connecting and Cancel labels never shift the row, and a per-provider accessible name. While connecting, hover reveals Cancel so a stuck sign-in can be aborted. Brand marks use curated accents through `currentColor` only in the hub; chat surfaces stay monochrome with `ProviderGlyph`. A filter toggle pair replaces a select because the choice is binary.

Lives in `provider-browser.tsx`, `provider-row.tsx`, `brand-mark.tsx`, `provider-filters.tsx`.

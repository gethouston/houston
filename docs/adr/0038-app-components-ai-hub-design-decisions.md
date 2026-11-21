# app/src/components/ai-hub: design decisions

Covers `app/src/components/ai-hub/`: the AI Hub of providers and models, its connection states, filters and strips. File paths in this record are relative to that folder.

## Tri-state connection everywhere in the hub

Only a confirmed connection gets the live badge, the sign-out footer, usage and the local-bridge treatment; only a confirmed disconnection gets a Connect CTA. An unconfirmable probe shows a neutral "Checking" with no action, on the "yours" side (the Connected strip) and sorted with connected offers in the model modal. Until the first probe resolves, connect buttons are disabled and the pane holds a skeleton. Connected and available sets are derived once (`useHubProviders`) and memoized because downstream memos key on their identity.

Lives in `app/src/components/ai-hub/use-hub-providers.ts`, `provider-modal.tsx`, `model-modal.tsx`, `model-offer-row.tsx`, `connected-providers-strip.tsx`, `provider-modal-connect-button.tsx`.

## Usage lives on the connected account row

An account and how much of it is left are one thing, so usage renders inside the connected row; there is no separate usage surface. The row is a card that shows its surface and ring at rest so it is visibly pressable, with no chevron. Meters go in `CatalogRow`'s `below` slot (inside the click target and hover surface) and the plan chip in `aside` (outside the button, so the button's accessible name stays clean and the chip stays readable). The chip slot is reserved while loading so the title column does not reflow.

Lives in `connected-provider-row.tsx`.

## Usage fetch precondition and honest states

The strip includes checking accounts by design, so its mount is not the gate: `providerUsage()` throws rather than fabricate a reading, so the fetch requires at least one confirmed account. Row tier is decided in order: connection state first (an unconfirmed account makes no metering claim and shows nothing), then the fetch state (loading shows a skeleton, error says the fetch failed rather than "not metered yet"), then the row's own status. `unsupported` only comes from the never-metered fallback. Cards span gateway ids (merged OpenCode) while rows use canonical engine ids, so pairing matches on canonical id sets and keeps the most informative row; a card with no row still appears.

Lives in `provider-usage-model.ts`, `connected-providers-strip.tsx`.

## Retained readings are dated and settled

TanStack keeps the last good data through a failed background refetch, so a blip does not blank the meters; the error note shows only when nothing is on hand. A retained reading is dated ("3 hours ago") while refetches keep failing. A window whose reset passed since the last fetch reads 0% at render time, because the strip polls every five minutes and stays mounted while hidden. The skeleton matches the common two-window subscription to the pixel, and readings persist across refetches, so a row settles size at most once.

Lives in `connected-providers-strip.tsx`, `provider-usage-window.ts`, `provider-usage-meters.tsx`.

## Connected strip preview cap

The strip previews 3 rows, below the shared cap of 6, because connected rows are about 136px with meters; six would push the discovery tabs below the fold on a laptop. Searching uncaps. Gap is 8px because rows paint their own surface and two cards a hairline apart read as one.

Lives in `connected-providers-strip.tsx`.

## Filters and counts never disagree

Search and the billing facet are applied by the page before the list arrives, so headings and grids agree. The cost facet and the "Budget" filter share `costTier` thresholds (under $1, under $4, premium; a missing price lands in the middle). Exactly $0 is its own `free` bucket. Memory buckets: under 200K, under 1M, 1M and above; absent context reads small. The lab filter lists labs most models first and hides when there is only one lab.

Lives in `ai-hub-view.tsx`, `facets.ts`, `model-facets.tsx`, `providers-pane.tsx`.

## Formatting rules

Prices keep three decimals below a dollar so cheap models do not read $0.00, and drop cents on whole dollars. Release dates parse as UTC so the month never shifts across timezones. The marketing model count rounds down to 50 and is dropped below 100. Capabilities only list what the data shows (no "fast"). A model's brand mark is always its lab, never an offering provider's logo, so a row never names one brand and draws another. Offers sort connected first, then subscription, then by cheapest input price.

Lives in `format.ts`.

## Description fallback

Most hub providers have no marketing copy; the modal falls back to the provider list's one-liner instead of rendering the raw key.

Lives in `provider-modal.tsx`.

## Scroll locking and modal shell

While a modal is open the page's inner scroller is frozen, because Radix locks only `<body>` and the inner region would keep a second draggable scrollbar; `scrollbar-gutter: stable` holds the gutter. The modal body uses `min-h-0` so it is the single bounded scroll area. The wide sheet width subtracts the phone gutter the `sm:` cap would drop. The modal stack retains the last provider or model so Radix keeps it mounted through the exit transition.

Lives in `ai-hub-view.tsx`, `modal-shell.tsx`, `hub-modal-stack.tsx`.

## Local model bridge

A local provider disconnects by tearing down the bridge, not a credential sign-out. The SDK binds bridge ownership to account, workspace, agent and device. Only a session that owns the bridge shows the tunnel pill, and then not the Connected badge, so they never stack; a manual endpoint or a tunnel another machine manages reads as normally connected.

Lives in `use-provider-modal-local.ts`, `provider-modal-footer.tsx`.

## Model allowlist editor

Selection is over provider-native offer ids; toggling a model flips all its offers so a member can pick it from any connected provider. Allow all saves `null`. Writes are instant. The lab filter is view-only. Per-agent and org ceilings share the editor.

Lives in `models-allowlist-editor.tsx`.

## Header width thresholds

The lozenges are about 230px. Providers mode tools are about 498px, giving 780px with padding and gap. Models mode tools are about 852px, giving 1134, rounded up to 1140. The threshold follows the active mode.

Lives in `ai-hub-header.tsx`.

## Connected state color

The live connected dot is the only always-green element, a wrapper over `ui/core` `StatusBadge` so connected reads the same everywhere. Brand color comes from `BrandMark`, never chips.

Lives in `hub-badges.tsx`.

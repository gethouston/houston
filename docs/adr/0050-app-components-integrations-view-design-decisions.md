# app/src/components/integrations-view: design decisions

Covers `app/src/components/integrations-view/`: the global Integrations page, its catalog, rows and states. File paths in this record are relative to that folder.

## The Integrations page is a personal apps catalog

The global Integrations page shows what this person's agents can reach outside themselves. What each agent can do lives in that agent's Skills section. The tools provider spans header and body so the catalog portals its search and actions into the header strip.

Lives in `app/src/components/integrations-view/integrations-view.tsx`, `integrations-header.tsx`.

## Grouped catalog, no pagination

The browse plane groups the whole connectable catalog (about 1000 apps) into flat category sections. Grouping is the navigation, so there is no pagination or category picker. Each section shows a capped preview until expanded, so first paint stays bounded. A fresh query or category resets every section to its cap, adjusted during render (React's documented pattern) to avoid a wasted paint.

Lives in `category-catalog.tsx`, `use-catalog-sections.ts`.

## Only working connections leave the catalog

A working connection moves the app to the Installed strip. A pending or errored connection stays in its own category row, wearing its status, retrying from its own `+`; its info modal is the single place to finish or remove it. There is no recovery section and no second dialog for a broken app.

Lives in `category-catalog.tsx`, `plane-app-row.tsx`, `app-info-dialog.tsx`, `catalog-pane.tsx`.

## Connect flows are per toolkit, owned by the row

An in-flight OAuth belongs to its own row, which expands into one card holding the header and the live flow, with a single spinner in the `+` slot. There is no page-level waiting panel and no row is disabled because another app is connecting. The info modal's CTA is gated only on that app's own flow. Flow state (`connectFlow`) is app-wide and outlives the surface, so leaving the page never kills a poll. The "Most used" spotlight repeats category rows, so rows are addressed by origin key and only the copy the user pressed owns the inline state; the modal carries that origin.

Lives in `plane-app-row.tsx`, `catalog-category-section.tsx`, `use-catalog-sections.ts`, `category-catalog.tsx`.

## Row card styling

The card's border and fill live on a layer behind the row, transparent at rest, so the treatment cross-fades on opacity. While carded the row's bottom is square so the hover fill reads as a header divider; the button's hover fill matches the card surface and is overridden inside the card.

Lives in `plane-app-row.tsx`.

## Curated entries

Curated entries join the browse catalog unless already added or unless the provider catalog carries the slug itself, in which case that toolkit is the card. Curated rows open their own connect dialog because the generic OAuth hand-off would 400 on a non-Composio slug; the dialog's Composio option runs the row's own hand-off. The dialog checks the provider catalog, not the merged one, since a curated extra keeps its slug on deployments without Composio. A curated row's Sign in reopens the chooser after an abandoned sign-in.

Lives in `catalog-tab.tsx`, `category-catalog.tsx`, `integrations-ready.tsx`.

## One controls row narrows both sections

The surface owns a single query and category, threaded into the Installed filter and the browse catalog. While filtering, the Installed strip renders uncapped. The "Custom" filter entry is pinned only where the host serves custom integrations, and a remote category slugged "custom" cannot take it over.

Lives in `catalog-controls.tsx`, `use-catalog-surface.ts`, `installed-strip.tsx`.

## Honest states

Only a resolved list may say "none yet". When the catalog is off (self-host without a Composio key), custom integrations still work below, so the page does not say "not available". Skeletons mirror the real layout (row padding, 40px art, two lines, the capped section's expander) so resolving causes no layout shift, and are `aria-hidden`.

Lives in `integrations-ready.tsx`, `catalog-tab.tsx`, `catalog-skeletons.tsx`.

## Multiple accounts

Adding a second account is a fresh connect of the same app; the provider mints a new account and keeps the first. Disconnect can target the whole app or one account. An app with several accounts shows the provider's account labels instead of its blurb.

Lives in `connected-app-dialogs.tsx`, `installed-strip.tsx`.

## Header width threshold

The header switches layout at 770px, derived from the widest locale (Spanish): lozenge about 129px plus the tools zone about 582px plus 40px padding and a 12px gap is 763, rounded up.

Lives in `integrations-header.tsx`.

## Layout

The draft banner renders above the shell so it greets the user rather than trailing the catalog. The catalog column caps at its natural width and centers so headings and rows share a left edge.

Lives in `integrations-ready.tsx`, `catalog-tab.tsx`.

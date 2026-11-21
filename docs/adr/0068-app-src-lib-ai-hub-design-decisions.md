# app/src/lib/ai-hub: design decisions

Covers `app/src/lib/ai-hub/`: the AI Hub model set, catalog keys and price tiers. File paths in this record are relative to `app/src/`.

## pi-ai is the authoritative runnable set

Every hub model exists because pi-ai can run it, with pi's own pricing. The baked models.dev snapshot is optional enrichment matched by cross-provider key; it never creates a model. Tool calling comes only from the snapshot, and image generation has no source, so it is always false.

Lives in `lib/ai-hub/catalog.ts`, `lib/ai-hub/catalog-pi.ts`, `lib/ai-hub/catalog-merge.ts`, `lib/ai-hub/catalog-snapshot.ts`.

## Cross-provider model key

The key folds the same model across providers. Region and vendor prefixes and parenthetical suffixes are stripped, punctuation collapses, and dots stay as version separators. It is the runtime twin of the generator's key.

Lives in `lib/ai-hub/catalog-key.ts`.

## One offer per provider

pi-ai lists some models more than once under the same provider (regional variants); they collapse to one offer based on the cleanest id.

Lives in `lib/ai-hub/catalog-merge.ts`.

## Subscription providers show no per-token price

OAuth providers are marked `subscription`.

Lives in `lib/ai-hub/catalog-pi.ts`.

## The hub shows exactly the visible providers

The hub is scoped to the providers `getVisibleProviders` shows and re-keys on the catalog's `updatedAt` because hydration is in place.

Lives in `lib/ai-hub/use-hub-catalog.ts`.

## Price tiers

Free is exactly zero, low is under $1 per million input tokens, mid under $5, high otherwise, from the cheapest offer.

Lives in `lib/ai-hub/capabilities.ts`.

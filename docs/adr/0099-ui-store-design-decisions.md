# ui/store: design decisions

Covers `ui/store/` (`@houston-ai/store`): the Agent Store screens and primitives shared by the website and the app.

## One composition for web and app

Store screens and dialogs (profile editor, listing editor, share dialog, nav, owner cards, claim card, sort pills, signed-out gate, installs panel) fix their composition and copy in this package so the website and the app cannot drift; surfaces inject persistence, behavior and translations only. The owner view is the same profile page with edit affordances (pencils on the hero, a manage menu per card), not a separate screen. Lives in `ui/store/src/screens/` and `ui/store/src/components/`.

## Design language primitives

Every store component composes classes from `primitives.ts`, shared by the Next.js site and the app: semantic tokens only, a 1040px measure with 24/32px gutters, a 40/64px rhythm implemented as a flex gap so sections carry no margins, four type roles, 150ms color and border motion only (never transform or `transition-all`), flat surfaces with hairline depth and no shadows, at most one accent action per view. The page plane is transparent and `min-h-full` so it works as a document in `agentstore/` and as a pane in the app, which both provide the screen plane; the store is designed against `bg-background`, never the gutter. Rationale lives in `ui/store/DESIGN.md`. Lives in `ui/store/src/primitives.ts` and `ui/store/src/components/store-page.tsx`.

## Agent cards

The card is a div with a full-card link overlay, never a button inside an anchor, so the corner affordance can sit above it validly. It has exactly one corner affordance: the install plus or the surface's `action` (the owner's pencil menu takes the same spot, since two circles in one corner painted the pencil over the plus). Hover changes color and hairline, never position. Integrations show up to four marks with a truthful overflow count. The featured card's hero is the creator's photo, because featuring an agent endorses its creator, falling back to the agent's picture and then its tone. One tone gradient is shared by tile and featured hero. Lives in `ui/store/src/components/agent-card.tsx`, `ui/store/src/components/featured-agent-card.tsx`, `ui/store/src/components/agent-tile.tsx`.

## Featured pair

The catalog has no curation flag, so "featured" is the two most-installed agents, shown only when two have installs (one card in a two-wide row reads as a gap), only on the unfiltered agents view, and never repeated in the grid. Hosts opt in explicitly, because on a server-paginated surface page N's top rows are not curated picks. Lives in `ui/store/src/screens/store-home-model.ts` and `ui/store/src/screens/store-home-screen.tsx`.

## Integration logos

Logos come from a favicon service by brand domain. Some curated slugs need explicit domains because `<slug>.com` is an unrelated site (for example the Croma and HighLevel entries). Lookup is case-insensitive (Composio slugs arrive uppercase, custom ones lowercase) and the domain guess drops separators (`ONE_DRIVE` becomes `onedrive.com`). The favicon service returns 404 for unresolvable domains, so a failed load latches to a letter tile, keeping the count truthful. Social links use the same favicon recipe, open in a new tab with `rel="noopener"`, and render nothing when empty. Lives in `ui/store/src/integrations.ts`, `ui/store/src/components/integration-mark.tsx`, `ui/store/src/components/social-links.tsx`.

## Handle field and profile editor

Handle grammar and the reserved list are checked locally for instant feedback; uniqueness is confirmed by the injected `checkHandle` after a debounce. A failed probe is advisory and falls back to a neutral hint, since the gateway re-validates on save and remains the authority. The owner's current handle always counts as available. Avatar uploads mirror the gateway's 2 MiB and png/jpeg/webp limits and require an existing profile row; every failure shows a visible message. Save errors map gateway codes to shared copy. Emptied social fields are removed. Lives in `ui/store/src/components/handle-field.tsx`, `ui/store/src/components/profile-editor-parts.tsx`, `ui/store/src/components/profile-socials.tsx`, `ui/store/src/screens/profile-editor-model.ts`.

## Listing editor

The listing editor saves store metadata (name, tagline, description, category, tags) as one `PATCH {identity}`; content such as skills comes from re-publishing in Houston. The draft is re-seeded from the row every time the dialog opens so it shows server truth. Validation and tag normalization (trim, drop blanks, case-insensitive de-dupe, cap) mirror the publish wizard. A cleared tagline is sent as an empty string so the gateway drops it. Lives in `ui/store/src/components/edit-listing-dialog.tsx`, `ui/store/src/components/edit-listing-model.ts`, `ui/store/src/components/listing-fields.tsx`.

## Share dialog and nav

Sharing uses Drive-style levels: public (store-findable, review-gated), hidden (link only), private. The nav content (brand, theme, account) is fixed; the web injects its avatar dropdown in place of the account control so there is one identity control. The nav paints nothing until scrolled (a zero-height sentinel above the sticky bar, observed with IntersectionObserver, works for window and pane scrolling), then frosts. Category pills cap and truncate user-language names. Lives in `ui/store/src/components/share-agent-dialog.tsx`, `ui/store/src/components/store-nav.tsx`, `ui/store/src/components/catalog-controls.tsx`.

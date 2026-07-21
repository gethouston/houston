/**
 * Pure helpers for the Agent Store view — kept free of React so the mapping
 * rules are unit-testable under node:test.
 */

import type { MyAgent, StoreCatalogAgent } from "@houston-ai/engine-client";

/** The art a listing renders: its emoji when it shipped one, else the name's
 *  first grapheme as a letter avatar. URL icons render as letters too — the
 *  catalog never hotlinks third-party images into the app. */
export function storeAgentGlyph(
  agent: Pick<StoreCatalogAgent, "name" | "icon">,
): { kind: "emoji" | "letter"; value: string } {
  if (agent.icon?.kind === "emoji" && agent.icon.value.trim()) {
    return { kind: "emoji", value: agent.icon.value.trim() };
  }
  const first = [...agent.name.trim()][0] ?? "?";
  return { kind: "letter", value: first.toUpperCase() };
}

/** Compact install count for row trailings ("1.2K"), localized. */
export function formatInstalls(count: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(count);
}

/** How the owner row's "request public listing" control presents. */
export type RequestPublicMode =
  | "hidden"
  | "available"
  | "pending"
  | "requested";

/** Resolve that control's mode. The gateway does not echo a public-request flag
 *  on the agent summary, so the owner panel carries two client-side facts: the
 *  in-flight mutation (`inFlight`) and a request already sent this session
 *  (`requested`). Without them a successful request would leave the row
 *  byte-for-byte identical and read as broken, so eligibility alone is not
 *  enough — a sent request downgrades the button to a disabled acknowledgment. */
export function requestPublicMode(
  agent: Pick<MyAgent, "state" | "visibility">,
  flags: { inFlight: boolean; requested: boolean },
): RequestPublicMode {
  const eligible = agent.state === "published" && agent.visibility !== "public";
  if (!eligible) return "hidden";
  if (flags.inFlight) return "pending";
  if (flags.requested) return "requested";
  return "available";
}

/** The connected-app options the browse integration filter offers: the deduped,
 *  lowercased union of toolkit slugs across the given listings (the wire ships
 *  slugs uppercase; the toolkit catalog resolves names and logos by lowercase
 *  slug). The active filter's own slug is always kept in the set, so the control
 *  never vanishes while its filter is still applied and always renders its own
 *  selection even when no supplied listing happens to carry it. */
export function catalogIntegrationOptions(
  items: readonly Pick<StoreCatalogAgent, "integrations">[],
  active: string | null,
): string[] {
  const slugs = new Set(
    items.flatMap((agent) =>
      agent.integrations.map((slug) => slug.toLowerCase()),
    ),
  );
  if (active) slugs.add(active.toLowerCase());
  return [...slugs];
}

/** The options the browse integration filter offers, sourced so the control
 *  never scopes its own vocabulary. Selecting a toolkit refetches the catalog to
 *  only that toolkit's agents, so the loaded `grid` collapses to that toolkit and
 *  can no longer name the others a user might switch to. `unfiltered` is a catalog
 *  read that omits the integration filter: with no filter active the grid is
 *  already that source, but once a toolkit is `active` the vocabulary comes from
 *  `unfiltered` instead. That independence is what lets a user switch straight
 *  from toolkit X to toolkit Y instead of round-tripping through "All
 *  integrations". The active slug is always kept, per catalogIntegrationOptions. */
export function browseIntegrationOptions(
  grid: readonly Pick<StoreCatalogAgent, "integrations">[],
  unfiltered: readonly Pick<StoreCatalogAgent, "integrations">[],
  active: string | null,
): string[] {
  return catalogIntegrationOptions(active ? unfiltered : grid, active);
}

/** The slug out of a store share URL (`…/a/<slug>`), or null when it isn't one. */
export function storeSlugFromShareUrl(shareUrl: string): string | null {
  const match = /\/a\/([a-z0-9][a-z0-9-]{0,63})\/?$/.exec(shareUrl.trim());
  return match ? match[1] : null;
}

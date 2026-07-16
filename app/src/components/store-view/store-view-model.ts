/**
 * Pure helpers for the Agent Store view — kept free of React so the mapping
 * rules are unit-testable under node:test.
 */

import type { StoreCatalogAgent } from "@houston-ai/engine-client";

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

/** The slug out of a store share URL (`…/a/<slug>`), or null when it isn't one. */
export function storeSlugFromShareUrl(shareUrl: string): string | null {
  const match = /\/a\/([a-z0-9][a-z0-9-]{0,63})\/?$/.exec(shareUrl.trim());
  return match ? match[1] : null;
}

/**
 * Pure message-level logic for the end-of-message "Waiting for you to connect"
 * hand-off line (issue #412). Kept apart from the per-card view state in
 * `composio-card-state.ts` (this is about the *message*, not one card) and
 * free of React so it stays unit-testable without a DOM.
 */

import { normalizeToolkitSlug } from "../lib/composio-toolkits.ts";
import {
  isToolkitConnected,
  parseComposioToolkitFromHref,
} from "./composio-card-state.ts";

/**
 * Extract the Composio toolkit slugs an assistant message links to, in first
 * appearance order, deduped and normalized.
 *
 * Only markdown links (`[label](href)`) count, which is exactly the shape the
 * chat's link renderer turns into a `ComposioLinkCard` (a bare or auto-linked
 * URL renders as plain text, never a card). Each captured href reuses
 * `parseComposioToolkitFromHref`, so the footer's notion of "which
 * integrations did this message ask for" can never drift from the cards
 * rendered inline.
 *
 * The line belongs at the bottom of the whole message, not buried beside the
 * card wherever the agent happened to drop the link mid-sentence.
 */
export function extractComposioToolkits(content: string): string[] {
  const slugs: string[] = [];
  const seen = new Set<string>();
  // Capture the href inside a markdown link's `](...)`. Composio connect URLs
  // carry no spaces or parens, so stopping at the first `)` / whitespace is
  // safe and skips an optional ` "title"` suffix too.
  const linkHref = /\]\(\s*([^()\s]+)/g;
  for (const match of content.matchAll(linkHref)) {
    const toolkit = parseComposioToolkitFromHref(match[1]);
    if (!toolkit) continue;
    const slug = normalizeToolkitSlug(toolkit);
    if (seen.has(slug)) continue;
    seen.add(slug);
    slugs.push(slug);
  }
  return slugs;
}

/**
 * Is the agent still blocked on at least one of `toolkits` (issue #412)?
 *
 * True while any linked integration is not yet connected, through the idle
 * hand-off and the "Connecting…" auth round-trip alike, since that round-trip
 * can stall, get abandoned, or time back out, and a not-yet-connected toolkit
 * reads as "still waiting" regardless. Only once every linked toolkit is
 * connected does the agent resume (via the per-card auto-continue nudge), so
 * the line clears exactly then.
 */
export function isWaitingForToolkits(
  toolkits: readonly string[],
  connected: ReadonlySet<string>,
): boolean {
  return toolkits.some((toolkit) => !isToolkitConnected(connected, toolkit));
}

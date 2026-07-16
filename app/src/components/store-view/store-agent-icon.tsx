import type { StoreCatalogAgent } from "@houston-ai/engine-client";
import { storeAgentGlyph } from "./store-view-model";

/**
 * A listing's leading art (~40px), the same slot every catalog row leads
 * with: the agent's emoji on a quiet chip, or a letter avatar fallback.
 * Decorative — the row/dialog title carries the accessible name.
 */
export function StoreAgentIcon({
  agent,
  className = "size-10 text-xl",
}: {
  agent: Pick<StoreCatalogAgent, "name" | "icon">;
  className?: string;
}) {
  const glyph = storeAgentGlyph(agent);
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-xl bg-chip ${
        glyph.kind === "letter" ? "font-semibold text-ink-muted" : ""
      } ${className}`}
    >
      {glyph.value}
    </span>
  );
}

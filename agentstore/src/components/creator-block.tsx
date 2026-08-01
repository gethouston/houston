import type { StoreCreator } from "@houston/agentstore-client";
import type { AgentIdentity } from "@houston/agentstore-contract";
import { CreatorBlock as StoreCreatorBlock } from "@houston-ai/store";
import Link from "next/link";

/**
 * The agent header's creator credit: the creator's face with their NAME
 * beneath it (never the raw @handle), linking to their public page when the
 * profile is claimed.
 */
export function CreatorBlock({
  creator,
  fallback,
  compact = false,
}: {
  creator: StoreCreator;
  fallback: AgentIdentity["creator"];
  /** Inline row (small avatar + name) for facts rows, vs the stacked block. */
  compact?: boolean;
}) {
  return (
    <StoreCreatorBlock
      creator={creator}
      fallbackName={fallback.displayName}
      compact={compact}
      href={creator.handle ? `/@${creator.handle}` : undefined}
      LinkComponent={Link}
    />
  );
}

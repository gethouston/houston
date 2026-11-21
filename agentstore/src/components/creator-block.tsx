import type { StoreCreator } from "@houston/agentstore-client";
import type { AgentIdentity } from "@houston/agentstore-contract";
import { CreatorBlock as StoreCreatorBlock } from "@houston-ai/store";
import Link from "next/link";

export function CreatorBlock({
  creator,
  fallback,
  compact = false,
}: {
  creator: StoreCreator;
  fallback: AgentIdentity["creator"];
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

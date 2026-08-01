import type { CreatorDirectoryEntry } from "@houston/agentstore-client";
import { CreatorCard as StoreCreatorCard } from "@houston-ai/store";
import Link from "next/link";

export function CreatorCard({ creator }: { creator: CreatorDirectoryEntry }) {
  return (
    <StoreCreatorCard
      creator={creator}
      href={`/creators/${encodeURIComponent(creator.handle)}`}
      LinkComponent={Link}
    />
  );
}

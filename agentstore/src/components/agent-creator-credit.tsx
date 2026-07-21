import type { StoreCreator } from "@houston/agentstore-client";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { CreatorChip } from "./creator-chip";

export interface AgentCreatorCreditProps {
  /** The enriched creator projection from the listing (carries the handle). */
  creator: StoreCreator;
  /** The IR-denormalized creator, used only when there is no claimed handle. */
  fallback: { displayName: string; url?: string };
}

/**
 * The "By …" credit on the agent detail page. A claimed creator (has a handle)
 * links to their `/@handle` page via the {@link CreatorChip}; an unclaimed one
 * falls back to the IR display name, linked to its optional creator URL.
 */
export function AgentCreatorCredit({
  creator,
  fallback,
}: AgentCreatorCreditProps) {
  if (creator.handle) {
    return (
      <div className="mt-3 text-sm">
        <Link
          href={`/@${creator.handle}`}
          className="inline-flex items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <CreatorChip creator={creator} size="md" />
        </Link>
      </div>
    );
  }
  return (
    <div className="mt-3 text-sm">
      {fallback.url ? (
        <a
          href={fallback.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4"
        >
          By {fallback.displayName}
          <ExternalLink aria-hidden className="size-3.5" />
        </a>
      ) : (
        <span className="font-medium text-muted-foreground">
          By {fallback.displayName}
        </span>
      )}
    </div>
  );
}

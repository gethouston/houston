import type { StoreCreator } from "@houston/agentstore-client";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { CreatorChip } from "./creator-chip";

export interface AgentCreatorCreditProps {
  creator: StoreCreator;
  fallback: { displayName: string; url?: string };
}

export function AgentCreatorCredit({
  creator,
  fallback,
}: AgentCreatorCreditProps) {
  if (creator.handle) {
    return (
      <div className="text-sm">
        <Link
          href={`/@${creator.handle}`}
          className="inline-flex items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus/50"
        >
          <CreatorChip creator={creator} size="sm" />
        </Link>
      </div>
    );
  }
  return (
    <div className="text-sm">
      {fallback.url ? (
        <a
          href={fallback.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-ink underline underline-offset-4"
        >
          By {fallback.displayName}
          <ExternalLink aria-hidden className="size-3.5" />
        </a>
      ) : (
        <span className="font-medium text-ink-muted">
          By {fallback.displayName}
        </span>
      )}
    </div>
  );
}

import { VerifiedBadge } from "@houston-ai/core";

import type { StoreCreatorRow, StoreLinkComponent } from "../types";
import { CreatorFace } from "./creator-face";

const PlainLink: StoreLinkComponent = (props) => <a {...props} />;

export function CreatorBlock({
  creator,
  fallbackName,
  compact = false,
  href,
  LinkComponent = PlainLink,
  verifiedLabel = "Verified",
}: {
  creator: StoreCreatorRow;
  fallbackName: string;
  compact?: boolean;
  href?: string;
  LinkComponent?: StoreLinkComponent;
  verifiedLabel?: string;
}) {
  const name = creator.displayName || fallbackName;
  const body = (
    <span
      className={
        compact ? "flex items-center gap-2" : "flex flex-col items-center gap-2"
      }
    >
      <CreatorFace
        name={name}
        avatarUrl={creator.avatarUrl}
        className={compact ? "size-6" : "size-12"}
      />
      <span className="flex items-center gap-1 text-[14px] text-ink-muted">
        {name}
        {creator.verified ? (
          <VerifiedBadge label={verifiedLabel} className="size-3.5" />
        ) : null}
      </span>
    </span>
  );
  if (!href) return body;
  return (
    <LinkComponent
      href={href}
      className="rounded-full outline-none transition-opacity duration-150 hover:opacity-75 focus-visible:ring-2 focus-visible:ring-focus/50"
    >
      {body}
    </LinkComponent>
  );
}

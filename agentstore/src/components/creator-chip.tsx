import type { StoreCreator } from "@houston/agentstore-client";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  cn,
  VerifiedBadge,
} from "@houston-ai/core";

/** First letter of a name/handle for the avatar fallback glyph. */
function initial(creator: StoreCreator): string {
  const source = creator.handle || creator.displayName || "";
  return source.trim().charAt(0).toUpperCase() || "?";
}

export interface CreatorChipProps {
  creator: StoreCreator;
  /** Larger treatment for the agent detail header vs. the compact card line. */
  size?: "sm" | "md";
  className?: string;
}

/**
 * The creator credit: a small avatar, `@handle`, and the verified badge when the
 * creator is verified. Presentational only (never an anchor of its own) so it can
 * sit inside a card that is already one big link, or be wrapped in a `<Link>` to
 * `/@handle` by a caller that wants it clickable. Renders the plain display name
 * when the creator has no handle (an unclaimed/legacy listing).
 */
export function CreatorChip({
  creator,
  size = "sm",
  className,
}: CreatorChipProps) {
  if (!creator.handle) {
    return (
      <span className={cn("truncate text-muted-foreground", className)}>
        By {creator.displayName}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 text-muted-foreground",
        className,
      )}
    >
      <Avatar size={size === "md" ? "default" : "sm"}>
        {creator.avatarUrl && (
          <AvatarImage
            src={creator.avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
          />
        )}
        <AvatarFallback>{initial(creator)}</AvatarFallback>
      </Avatar>
      <span
        className={cn("truncate font-medium text-foreground", {
          "text-sm": size === "sm",
        })}
      >
        @{creator.handle}
      </span>
      {creator.verified && <VerifiedBadge size={size} />}
    </span>
  );
}

import type { StoreCreator } from "@houston/agentstore-client";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  cn,
  VerifiedBadge,
} from "@houston-ai/core";

function initial(creator: StoreCreator): string {
  const source = creator.handle || creator.displayName || "";
  return source.trim().charAt(0).toUpperCase() || "?";
}

export interface CreatorChipProps {
  creator: StoreCreator;
  size?: "sm" | "md";
  className?: string;
}

export function CreatorChip({
  creator,
  size = "sm",
  className,
}: CreatorChipProps) {
  if (!creator.handle) {
    return (
      <span className={cn("truncate text-ink-muted", className)}>
        By {creator.displayName}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 text-ink-muted",
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
        className={cn("truncate font-medium text-ink", {
          "text-sm": size === "sm",
        })}
      >
        @{creator.handle}
      </span>
      {creator.verified && <VerifiedBadge size={size} />}
    </span>
  );
}

import type { CreatorProfile } from "@houston/agentstore-client";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  VerifiedBadge,
} from "@houston-ai/core";
import { CreatorReportDialog } from "@/components/creator-report-dialog";
import { SocialLinks } from "@/components/social-links";

/** First letter of the handle/name for the avatar fallback glyph. */
function initial(profile: CreatorProfile): string {
  const source = profile.handle || profile.displayName || "";
  return source.trim().charAt(0).toUpperCase() || "?";
}

export interface CreatorHeaderProps {
  profile: CreatorProfile;
}

/**
 * The creator page header: a large avatar, the display name with the verified
 * badge, the `@handle`, an optional bio, the social links row, and the always
 * visible "Report this creator" affordance.
 */
export function CreatorHeader({ profile }: CreatorHeaderProps) {
  return (
    <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
      <Avatar className="size-20 sm:size-24">
        {profile.avatarUrl && (
          <AvatarImage
            src={profile.avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
          />
        )}
        <AvatarFallback className="text-2xl">{initial(profile)}</AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {profile.displayName}
          </h1>
          {profile.verified && <VerifiedBadge size="md" />}
        </div>
        {profile.handle && (
          <p className="text-muted-foreground">@{profile.handle}</p>
        )}
        {profile.bio && (
          <p className="max-w-2xl text-foreground/90 text-pretty">
            {profile.bio}
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
          <SocialLinks links={profile.links} />
          {profile.handle && <CreatorReportDialog handle={profile.handle} />}
        </div>
      </div>
    </header>
  );
}

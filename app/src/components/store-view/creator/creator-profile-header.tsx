import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  VerifiedBadge,
} from "@houston-ai/core";
import type { CreatorProfile } from "@houston-ai/engine-client";
import { FlagIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CreatorSocials } from "./creator-socials";

/**
 * The creator profile pane's identity block: avatar, display name with the
 * verified badge, `@handle`, public-agent count, bio, social links, and the
 * quiet abuse-report affordance. Purely presentational — the pane owns the data
 * fetch and the report dialog.
 */
export function CreatorProfileHeader({
  profile,
  agentCount,
  onReport,
}: {
  profile: CreatorProfile;
  agentCount: number;
  onReport: () => void;
}) {
  const { t } = useTranslation("store");
  const initial = [...profile.displayName.trim()][0]?.toUpperCase() ?? "?";

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <Avatar className="size-16 shrink-0">
        {profile.avatarUrl ? (
          <AvatarImage src={profile.avatarUrl} alt="" />
        ) : null}
        <AvatarFallback className="text-xl">{initial}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-1.5">
          <h2 className="truncate text-xl font-medium text-ink">
            {profile.displayName}
          </h2>
          {profile.verified ? (
            <VerifiedBadge label={t("creator.verified")} />
          ) : null}
        </div>
        {profile.handle ? (
          <p className="text-sm text-ink-muted">@{profile.handle}</p>
        ) : null}
        <p className="text-sm text-ink-muted">
          {t("creator.agents", { count: agentCount })}
        </p>
        {profile.bio ? (
          <p className="whitespace-pre-line text-sm text-ink">{profile.bio}</p>
        ) : null}
        <CreatorSocials links={profile.links} />
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={onReport}
        className="shrink-0 text-ink-muted"
      >
        <FlagIcon className="size-4" />
        {t("creator.report")}
      </Button>
    </header>
  );
}

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  cn,
  VerifiedBadge,
} from "@houston-ai/core";
import { Pencil } from "lucide-react";
import type { ReactNode } from "react";
import type { CreatorProfileOwner } from "../components/owned-agent-grid";
import type { StoreCreatorProfile, StoreLinkComponent } from "../types";

const PlainLink: StoreLinkComponent = (props) => <a {...props} />;

/** The hero's countable-noun labels, provided by the screen. */
export interface CreatorProfileHeroLabels {
  agent: string;
  agentsNoun: string;
  install: string;
  installs: string;
}

function Edit({
  href,
  label,
  className,
  LinkComponent = PlainLink,
}: {
  href: string;
  label: string;
  className?: string;
  LinkComponent?: StoreLinkComponent;
}) {
  return (
    <LinkComponent
      href={href}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-8 place-items-center rounded-full text-ink-muted transition-colors duration-150 hover:bg-chip hover:text-ink",
        className,
      )}
    >
      <Pencil aria-hidden className="size-3.5" />
    </LinkComponent>
  );
}

/**
 * The profile page's hero: avatar, name, handle, stats, bio, socials. In
 * owner mode the SAME hero grows its edit pencils (avatar + profile) — no
 * separate owner layout exists.
 */
export function CreatorProfileHero({
  profile,
  stats,
  socialLinks,
  owner,
  LinkComponent,
  labels,
}: {
  profile: StoreCreatorProfile;
  stats?: { agents: number; installs: number };
  socialLinks?: ReactNode;
  owner?: CreatorProfileOwner;
  LinkComponent?: StoreLinkComponent;
  labels: CreatorProfileHeroLabels;
}) {
  const initial =
    (profile.handle ?? profile.displayName).trim().charAt(0).toUpperCase() ||
    "?";
  return (
    <header className="flex flex-col items-center gap-8 text-center md:flex-row md:items-center md:gap-8 md:text-left">
      <div className="relative w-fit">
        <Avatar className="size-24">
          {profile.avatarUrl ? (
            <AvatarImage
              src={profile.avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
            />
          ) : null}
          <AvatarFallback className="text-2xl">{initial}</AvatarFallback>
        </Avatar>
        {owner ? (
          <Edit
            href={owner.editHref}
            label={owner.editAvatarLabel ?? "Edit avatar"}
            className="-right-1 -bottom-1 absolute bg-chip"
            LinkComponent={LinkComponent}
          />
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-center md:items-start">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-balance font-semibold text-[32px] tracking-tight">
            {profile.displayName}
          </h1>
          {profile.verified ? <VerifiedBadge size="md" /> : null}
          {owner ? (
            <Edit
              href={owner.editHref}
              label={owner.editProfileLabel ?? "Edit profile"}
              LinkComponent={LinkComponent}
            />
          ) : null}
        </div>
        <p className="mt-1 text-[14px] text-ink-muted">
          {profile.handle ? <>@{profile.handle}</> : null}
          {stats ? (
            <>
              {" "}
              · {stats.agents.toLocaleString()}{" "}
              {stats.agents === 1 ? labels.agent : labels.agentsNoun} ·{" "}
              {stats.installs.toLocaleString()}{" "}
              {stats.installs === 1 ? labels.install : labels.installs}
            </>
          ) : null}
        </p>
        {profile.bio ? (
          <p className="mt-2 max-w-[60ch] text-[15px] text-ink/90 text-pretty leading-[1.55]">
            {profile.bio}
          </p>
        ) : null}
        {socialLinks}
      </div>
    </header>
  );
}

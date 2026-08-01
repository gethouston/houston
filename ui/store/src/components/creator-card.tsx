import { VerifiedBadge } from "@houston-ai/core";

import type { CreatorDirectoryRow, StoreLinkComponent } from "../types";
import { CreatorFace } from "./creator-face";

const PlainLink: StoreLinkComponent = (props) => <a {...props} />;
const compactNumber = new Intl.NumberFormat("en", { notation: "compact" });

export interface CreatorCardLabels {
  fallbackBio: string;
  agent: string;
  agents: string;
  installs: string;
  verified: string;
}

export function CreatorCard({
  creator,
  href,
  LinkComponent = PlainLink,
  labels = {},
}: {
  creator: CreatorDirectoryRow;
  href: string;
  LinkComponent?: StoreLinkComponent;
  labels?: Partial<CreatorCardLabels>;
}) {
  const text = {
    fallbackBio: "Creator on the Agent Store",
    agent: "agent",
    agents: "agents",
    installs: "installs",
    verified: "Verified",
    ...labels,
  };
  const bio = creator.bio?.trim();
  return (
    <LinkComponent
      href={href}
      className="flex min-h-60 flex-col rounded-[20px] bg-chip-subtle p-6 transition-colors duration-150 hover:bg-chip focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:outline-none"
    >
      <span className="flex items-center gap-4">
        <CreatorFace
          name={creator.displayName || creator.handle}
          avatarUrl={creator.avatarUrl}
          className="size-14 shrink-0"
        />
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-semibold text-[16px] text-ink">
              {creator.displayName}
            </span>
            {creator.verified ? (
              <VerifiedBadge size="sm" label={text.verified} />
            ) : null}
          </span>
          <span className="mt-1 text-[13px] text-ink-muted">
            @{creator.handle}
          </span>
        </span>
      </span>
      <span
        className={`mt-5 line-clamp-2 text-[14px] leading-[1.55] ${bio ? "text-ink/85" : "text-ink-muted"}`}
      >
        {bio || text.fallbackBio}
      </span>
      <span className="mt-auto flex items-center justify-between gap-4 pt-5 text-[12px] text-ink-muted tabular-nums">
        <span>
          {compactNumber.format(creator.agentsCount)}{" "}
          {creator.agentsCount === 1 ? text.agent : text.agents}
        </span>
        <span>
          {compactNumber.format(creator.installsCount)} {text.installs}
        </span>
      </span>
    </LinkComponent>
  );
}

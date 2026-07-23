import { CatalogAddButton, CatalogRow, StatusDot } from "@houston-ai/core";
import { Check } from "lucide-react";
import { resolveCardLabels } from "./skill-marketplace-card-labels";
import {
  formatInstalls,
  kebabToTitle,
  ownerOf,
} from "./skill-marketplace-util";
import { SkillOwnerAvatar } from "./skill-owner-avatar";
import type { CommunitySkill } from "./types";

export interface SkillMarketplaceCardLabels {
  installAria?: (name: string) => string;
  installedAria?: (name: string) => string;
  installsCount?: (count: number, formatted: string) => string;
  bySource?: (owner: string) => string;
}

export interface SkillMarketplaceRowProps {
  skill: CommunitySkill;
  installing: boolean;
  installed: boolean;
  onInstall: () => void;
  onOpenInfo: () => void;
  labels?: SkillMarketplaceCardLabels;
}

/**
 * A marketplace row in the shared catalog grammar ({@link CatalogRow}): owner
 * avatar + title + `by <owner> · <installs>` subtitle, transparent at rest
 * with the full-row hover fill. The row BODY opens the detail info modal; the
 * ghost `+` ({@link CatalogAddButton}, spinning while THIS skill installs) is
 * the install action — once installed the row gains the presence-style green
 * {@link StatusDot} left of the name and the `+` becomes a quiet check, so
 * installed and not-installed contrast at a glance.
 */
export function SkillMarketplaceRow({
  skill,
  installing,
  installed,
  onInstall,
  onOpenInfo,
  labels,
}: SkillMarketplaceRowProps) {
  const l = resolveCardLabels(labels);
  const owner = ownerOf(skill.source);
  const title = kebabToTitle(skill.skillId || skill.name);
  const subtitle =
    skill.installs > 0
      ? `${l.bySource(owner)} · ${l.installsCount(
          skill.installs,
          formatInstalls(skill.installs),
        )}`
      : l.bySource(owner);

  return (
    <CatalogRow
      icon={<SkillOwnerAvatar owner={owner} size="lg" />}
      title={title}
      description={subtitle}
      onClick={onOpenInfo}
      statusDot={installed ? <StatusDot status="active" /> : undefined}
      action={
        installed ? (
          <span
            role="img"
            aria-label={l.installedAria(title)}
            title={l.installedAria(title)}
            className="flex size-9 shrink-0 items-center justify-center text-ink-muted"
          >
            <Check className="size-4" aria-hidden />
          </span>
        ) : (
          <CatalogAddButton
            label={l.installAria(title)}
            busy={installing}
            onClick={onInstall}
          />
        )
      }
    />
  );
}

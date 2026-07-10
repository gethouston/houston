import { CatalogAddButton, CatalogRow } from "@houston-ai/core";
import { Check } from "lucide-react";
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

const DEFAULT_LABELS: Required<SkillMarketplaceCardLabels> = {
  installAria: (name) => `Install ${name}`,
  installedAria: (name) => `${name} installed`,
  installsCount: (count, formatted) =>
    count === 1 ? `${formatted} install` : `${formatted} installs`,
  bySource: (owner) => `by ${owner}`,
};

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
 * the install action — once installed it becomes a quiet check mark.
 */
export function SkillMarketplaceRow({
  skill,
  installing,
  installed,
  onInstall,
  onOpenInfo,
  labels,
}: SkillMarketplaceRowProps) {
  const l = { ...DEFAULT_LABELS, ...labels };
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
      action={
        installed ? (
          <span
            role="img"
            aria-label={l.installedAria(title)}
            title={l.installedAria(title)}
            className="flex size-9 shrink-0 items-center justify-center text-ink-muted"
          >
            <Check className="size-4" />
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

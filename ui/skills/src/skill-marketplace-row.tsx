import { cn } from "@houston-ai/core";
import { Check, Info, Loader2 } from "lucide-react";
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
  infoAria?: (name: string) => string;
  /** Labeled install pill copy. */
  add?: string;
  adding?: string;
  added?: string;
}

const DEFAULT_LABELS: Required<SkillMarketplaceCardLabels> = {
  installAria: (name) => `Install ${name}`,
  installedAria: (name) => `${name} installed`,
  installsCount: (count, formatted) =>
    count === 1 ? `${formatted} install` : `${formatted} installs`,
  bySource: (owner) => `by ${owner}`,
  infoAria: (name) => `About ${name}`,
  add: "Add",
  adding: "Adding...",
  added: "Added",
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
 * A compact marketplace row in the Integrations "AppRow" idiom: owner avatar +
 * title + subtitle on the left, two always-visible trailing actions on the
 * right (a labeled **Add** pill and an **info** button — no hover-gating).
 * Clicking the row body opens the detail info modal; the Add pill stops
 * propagation so it never also opens info. Rendered as a `div[role=button]`
 * (not a `<button>`) because it contains real `<button>` actions, and nesting
 * buttons would be invalid HTML.
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
    // biome-ignore lint/a11y/useSemanticElements: the row holds real <button> actions; a native <button> here would nest buttons (invalid HTML), so role="button" on a div is the correct pattern.
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenInfo}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenInfo();
        }
      }}
      className="group flex w-full cursor-pointer items-center gap-3 rounded-xl bg-secondary px-3 py-2.5 text-left transition-colors hover:bg-foreground/[0.05] focus-visible:bg-foreground/[0.05] focus-visible:outline-none"
    >
      <SkillOwnerAvatar owner={owner} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground">
          {title}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onInstall();
          }}
          disabled={installing || installed}
          aria-label={installed ? l.installedAria(title) : l.installAria(title)}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium transition-colors",
            installed
              ? "bg-secondary text-muted-foreground"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
            installing && "cursor-wait opacity-70",
          )}
        >
          {installing ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              {l.adding}
            </>
          ) : installed ? (
            <>
              <Check className="size-3.5" />
              {l.added}
            </>
          ) : (
            l.add
          )}
        </button>
        <button
          type="button"
          aria-label={l.infoAria(title)}
          onClick={(e) => {
            e.stopPropagation();
            onOpenInfo();
          }}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
        >
          <Info className="size-4" />
        </button>
      </div>
    </div>
  );
}

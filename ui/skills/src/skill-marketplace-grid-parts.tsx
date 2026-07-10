/**
 * Presentational internals for {@link SkillMarketplaceGrid}: the publisher chip
 * row, the loading skeleton, and the phase-to-body renderer. Split out of the
 * grid file to keep each under the 200-line limit; the grid owns the public
 * contract (types + props) and the pure model lives in
 * `skill-marketplace-grid-model.ts`.
 */

import { cn } from "@houston-ai/core";
import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import type { SkillMarketplacePhase } from "./skill-marketplace-grid";
import type { ResolvedGridLabels } from "./skill-marketplace-grid-model";
import { SkillMarketplaceRow } from "./skill-marketplace-row";
import type { CommunitySkill } from "./types";

const SKELETON_KEYS = ["a", "b", "c", "d", "e", "f"];

export function PublisherChips({
  publishers,
  selected,
  allLabel,
  onSelect,
}: {
  publishers: string[];
  selected: string | null;
  allLabel: string;
  onSelect: (owner: string | null) => void;
}) {
  const chip = (label: string, active: boolean, value: string | null) => (
    <button
      key={value ?? "__all__"}
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors",
        active
          ? "bg-accent text-foreground font-medium"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
  return (
    <div className="mb-3 flex gap-1 overflow-x-auto pb-1">
      {chip(allLabel, selected === null, null)}
      {publishers.map((p) => chip(p, selected === p, p))}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {SKELETON_KEYS.map((k) => (
        <div key={k} className="h-14 animate-pulse rounded-xl bg-secondary" />
      ))}
    </div>
  );
}

function MutedNotice({
  icon,
  children,
}: {
  icon?: boolean;
  children: ReactNode;
}) {
  return (
    <p className="flex items-center gap-1.5 py-4 text-sm text-muted-foreground">
      {icon && <AlertCircle className="size-3.5 text-muted-foreground/60" />}
      {children}
    </p>
  );
}

/**
 * The "couldn't load skills" degradation with a retry link, used by the browse
 * view when every category shelf fails.
 */
export function BrowseErrorNotice({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      <MutedNotice icon>{message}</MutedNotice>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-xs text-foreground underline-offset-4 hover:underline"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}

export interface MarketplaceBodyProps {
  phase: SkillMarketplacePhase;
  /** Visible skills after client-side publisher filtering. */
  filtered: CommunitySkill[];
  labels: ResolvedGridLabels;
  installState: Map<string, "installing" | "installed" | "failed">;
  installedSkillNames?: Set<string>;
  onInstall: (skill: CommunitySkill) => void;
  onOpenDetail: (skill: CommunitySkill) => void;
}

/** The phase-driven region below the search box and chips. */
export function MarketplaceBody({
  phase,
  filtered,
  labels: l,
  installState,
  installedSkillNames,
  onInstall,
  onOpenDetail,
}: MarketplaceBodyProps): ReactNode {
  if (phase.kind === "searching" && phase.previous.length === 0) {
    return <SkeletonGrid />;
  }
  if (phase.kind === "too-short") {
    return <MutedNotice>{l.minQuery}</MutedNotice>;
  }
  if (phase.kind === "no-results") {
    return <MutedNotice>{l.noResults(phase.query)}</MutedNotice>;
  }
  if (phase.kind === "search-error") {
    const message =
      phase.reason === "rate_limited"
        ? l.searchRateLimited
        : phase.reason === "offline"
          ? l.searchOffline
          : l.searchGeneric;
    return <MutedNotice icon>{message}</MutedNotice>;
  }
  if (phase.kind === "idle") {
    return <MutedNotice>{l.typeToSearch}</MutedNotice>;
  }
  if (filtered.length === 0) {
    return null;
  }
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-2 sm:grid-cols-2",
        phase.kind === "searching" && "pointer-events-none opacity-60",
      )}
    >
      {filtered.map((skill) => {
        const slug = (skill.skillId || skill.name).toLowerCase();
        const installed =
          installState.get(skill.id) === "installed" ||
          (installedSkillNames?.has(slug) ?? false);
        return (
          <SkillMarketplaceRow
            key={skill.id}
            skill={skill}
            installing={installState.get(skill.id) === "installing"}
            installed={installed}
            onInstall={() => onInstall(skill)}
            onOpenInfo={() => onOpenDetail(skill)}
            labels={l.card}
          />
        );
      })}
    </div>
  );
}

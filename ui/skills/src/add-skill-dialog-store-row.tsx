import { cn } from "@houston-ai/core";
import { AlertCircle, Check, Loader2, Plus } from "lucide-react";
import type { CommunitySkill } from "./types";

export interface StoreRowLabels {
  installCount?: (count: number, formatted: string) => string;
  installSkill?: (name: string) => string;
  installedSkill?: (name: string) => string;
  /** Badge shown when the skill is already installed before the dialog opened. */
  alreadyInstalledBadge?: string;
  /** Badge shown when the user just installed it this session. */
  installedJustNow?: string;
  /** Inline failure copy per error kind. */
  installFailedAlready?: string;
  installFailedRepoMissing?: string;
  installFailedMalformed?: string;
  installFailedRateLimited?: string;
  installFailedOffline?: string;
  installFailedGeneric?: string;
  installRetryAria?: (name: string) => string;
}

const DEFAULT_LABELS: Required<StoreRowLabels> = {
  installCount: (_count, formatted) => `${formatted} installs`,
  installSkill: (name) => `Install ${name}`,
  installedSkill: (name) => `${name} installed`,
  alreadyInstalledBadge: "Already installed",
  installedJustNow: "Installed",
  installFailedAlready: "Already installed",
  installFailedRepoMissing: "The author removed this skill.",
  installFailedMalformed: "This skill's file is broken. Try a different one.",
  installFailedRateLimited: "Skills.sh is busy. Wait a moment and click again.",
  installFailedOffline: "Couldn't connect. Check your internet and try again.",
  installFailedGeneric: "Install failed. Try again in a moment.",
  installRetryAria: (name) => `Try installing ${name} again`,
};

/** Per-row install state. Drives icon + caption + click behavior. */
export type RowInstallState =
  | { kind: "available" }
  | { kind: "already-installed" }
  | { kind: "installing" }
  | { kind: "installed-now" }
  | { kind: "failed"; reason: InstallFailureReason };

export type InstallFailureReason =
  | "already_installed"
  | "skill_not_in_repo"
  | "skill_malformed"
  | "rate_limited"
  | "offline"
  | "generic";

export function formatInstalls(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function failureCopy(
  reason: InstallFailureReason,
  l: Required<StoreRowLabels>,
): string {
  switch (reason) {
    case "already_installed":
      return l.installFailedAlready;
    case "skill_not_in_repo":
      return l.installFailedRepoMissing;
    case "skill_malformed":
      return l.installFailedMalformed;
    case "rate_limited":
      return l.installFailedRateLimited;
    case "offline":
      return l.installFailedOffline;
    case "generic":
      return l.installFailedGeneric;
  }
}

export function StoreRow({
  skill,
  state,
  onInstall,
  labels,
}: {
  skill: CommunitySkill;
  state: RowInstallState;
  onInstall: () => void;
  labels?: StoreRowLabels;
}) {
  const l = { ...DEFAULT_LABELS, ...labels };
  const installs = l.installCount(
    skill.installs,
    formatInstalls(skill.installs),
  );

  const installed =
    state.kind === "already-installed" || state.kind === "installed-now";
  const installing = state.kind === "installing";
  const failed = state.kind === "failed";
  const reasonCopy = failed ? failureCopy(state.reason, l) : null;

  const aria = installed
    ? l.installedSkill(skill.name)
    : failed
      ? l.installRetryAria(skill.name)
      : l.installSkill(skill.name);

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-6 py-3 transition-colors",
        installed ? "" : "hover:bg-accent/50",
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {skill.name}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {skill.source}
          {skill.installs > 0 && ` · ${installs}`}
        </p>
        {/* Inline status caption — only renders when there's something to say. */}
        {state.kind === "already-installed" && (
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            {l.alreadyInstalledBadge}
          </p>
        )}
        {state.kind === "installed-now" && (
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            {l.installedJustNow}
          </p>
        )}
        {failed && (
          <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5 flex items-center gap-1">
            <AlertCircle className="size-3 shrink-0" />
            <span>{reasonCopy}</span>
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onInstall}
        disabled={installing || installed}
        aria-label={aria}
        className={cn(
          "shrink-0 size-8 flex items-center justify-center rounded-full transition-colors mt-0.5",
          installed
            ? "text-muted-foreground/50 cursor-default"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground",
          installing && "opacity-50 cursor-wait",
        )}
      >
        {installing ? (
          <Loader2 className="size-4 animate-spin" />
        ) : installed ? (
          <Check className="size-4" />
        ) : (
          <Plus className="size-4" />
        )}
      </button>
    </div>
  );
}

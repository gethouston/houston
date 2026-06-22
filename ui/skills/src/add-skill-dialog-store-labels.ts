import type { StoreRowLabels } from "./add-skill-dialog-store-row";

export interface StoreViewLabels extends StoreRowLabels {
  searchPlaceholder?: string;
  /** Section heading shown above the popular feed when the search box is empty. */
  popularHeading?: string;
  /** "X skills already installed" caption shown above the list when applicable. */
  alreadyInstalledHint?: (count: number) => string;
  noResults?: (query: string) => string;
  minQuery?: string;
  /** Single error caption shown when search fails for any reason. */
  searchUnavailable?: string;
  /** Skills.sh said it's busy. Suggests waiting + retry. */
  searchRateLimited?: string;
  /** Couldn't reach skills.sh at all (offline or DNS / firewall). */
  searchOffline?: string;
  /** Anything else (5xx, parse error, etc). */
  searchGeneric?: string;
  /** "Loading popular skills..." while the empty-state list is fetching. */
  loadingPopular?: string;
  /** "We couldn't load suggestions. Try searching above." */
  popularUnavailable?: string;
  retry?: string;
  typeToSearch?: string;
}

export const DEFAULT_STORE_VIEW_LABELS: Required<StoreViewLabels> = {
  searchPlaceholder: "Search more than 90K skills...",
  popularHeading: "Popular on Skills.sh",
  alreadyInstalledHint: (count) =>
    count === 1
      ? "1 skill is already installed and shown below."
      : `${count} skills are already installed and shown below.`,
  noResults: (query) => `No skills found for "${query}"`,
  minQuery: "Type at least 2 characters to search",
  searchUnavailable:
    "Skill search is having trouble. Wait a moment and try again.",
  searchRateLimited:
    "Skills.sh is busy right now. Wait a moment and try again.",
  searchOffline:
    "Couldn't reach Skills.sh. Check your internet connection and try again.",
  searchGeneric: "Skill search hit a snag. Wait a moment and try again.",
  loadingPopular: "Loading popular skills...",
  popularUnavailable:
    "Couldn't load suggestions. Try searching for what you need above.",
  retry: "Try again",
  typeToSearch: "Type to search for skills",
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

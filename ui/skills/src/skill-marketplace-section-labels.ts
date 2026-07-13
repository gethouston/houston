import type { SkillMarketplaceGridLabels } from "./skill-marketplace-grid";
import type { SkillMarketplaceCardLabels } from "./skill-marketplace-row";
import {
  DEFAULT_SHELVES,
  type MarketplaceShelf,
} from "./skill-marketplace-shelves-model";
import type { SkillPreviewSheetLabels } from "./skill-preview-modal";

/**
 * Every label the inline marketplace section needs, composed from its
 * sub-components' own label types rather than flattened: an optional section
 * heading/subheading, the grid (search box, publisher chips, empty/error copy,
 * the "Powered by Vercel" badge, and the nested row labels), the curated browse
 * shelves, plus the on-demand preview modal. The consumer in `app/` fills these
 * from `t()`; the English defaults below are the i18n-agnostic fallback the
 * `ui/` boundary requires.
 */
export interface SkillMarketplaceSectionLabels
  extends SkillMarketplaceGridLabels {
  /** Optional section heading rendered above the search box. */
  heading?: string;
  /** Optional section subheading rendered under the heading. */
  subheading?: string;
  preview?: SkillPreviewSheetLabels;
  /** "See all" on a category shelf, which selects that category. */
  seeAll?: string;
  /** Retry link on the all-shelves-failed fallback. */
  retry?: string;
  /** All-shelves-failed fallback message. */
  browseUnavailable?: string;
  /** "Powered by Vercel" attribution in the section header. */
  poweredByVercel?: string;
  /** Curated browse shelves, titles localized; queries stay English. */
  shelves?: MarketplaceShelf[];
}

const DEFAULT_CARD_LABELS: Required<SkillMarketplaceCardLabels> = {
  installAria: (name) => `Install ${name}`,
  installedAria: (name) => `${name} installed`,
  installsCount: (count, formatted) =>
    count === 1 ? `${formatted} install` : `${formatted} installs`,
  bySource: (owner) => `by ${owner}`,
};

const DEFAULT_PREVIEW_LABELS: Required<SkillPreviewSheetLabels> = {
  install: "Install",
  installing: "Installing...",
  installed: "Installed",
  loadFailed: "Couldn't load the full description. You can still install.",
  noDescription: "No description provided.",
  bySource: (owner, repo) => `by ${owner} · ${repo}`,
  installsCount: (count, formatted) =>
    count === 1 ? `${formatted} install` : `${formatted} installs`,
  tagsHeading: "Tags",
  description: {},
};

export const DEFAULT_SKILL_MARKETPLACE_SECTION_LABELS: Required<SkillMarketplaceSectionLabels> =
  {
    heading: "Discover skills",
    // No trailing period: the Powered-by-Vercel badge's triangle follows
    // inline as the visual separator.
    subheading: "Add ready-made skills from the community",
    searchPlaceholder: "Search more than 90K skills...",
    publisherAllLabel: "All",
    allCategories: "All categories",
    categoryAria: "Filter skills by category",
    noResults: (query) => `No skills found for "${query}"`,
    searchRateLimited:
      "Skills.sh is busy right now. Wait a moment and try again.",
    searchOffline:
      "Couldn't reach Skills.sh. Check your internet and try again.",
    searchGeneric: "Skill search hit a snag. Wait a moment and try again.",
    typeToSearch: "Type to search for skills",
    minQuery: "Type at least 2 characters to search",
    seeAll: "See all",
    retry: "Try again",
    browseUnavailable:
      "Couldn't load skills. Check your internet and try again.",
    poweredByVercel: "Powered by Vercel",
    shelves: DEFAULT_SHELVES,
    card: DEFAULT_CARD_LABELS,
    preview: DEFAULT_PREVIEW_LABELS,
  };

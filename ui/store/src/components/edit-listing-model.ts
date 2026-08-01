import type { OwnedAgentIdentity, StoreAgentRow } from "../types";

/**
 * Pure state for the Edit-listing dialog: seed a draft from the listing row,
 * validate it, and shape the identity patch the gateway accepts — kept out of
 * the component so both surfaces (and tests) share the exact same rules the
 * publish wizard applies.
 */

export interface EditListingDialogLabels {
  title: (name: string) => string;
  nameLabel: string;
  taglineLabel: string;
  taglinePlaceholder: string;
  descriptionLabel: string;
  categoryLabel: string;
  categoryPlaceholder: string;
  tagsLabel: string;
  tagsPlaceholder: string;
  removeTag: (tag: string) => string;
  optional: string;
  contentNote: string;
  save: string;
  saveFailed: string;
}

export const EDIT_LISTING_DIALOG_LABELS: EditListingDialogLabels = {
  title: (name) => `Edit ${name}`,
  nameLabel: "Name",
  taglineLabel: "Tagline",
  taglinePlaceholder: "One line that says what it does",
  descriptionLabel: "Description",
  categoryLabel: "Category",
  categoryPlaceholder: "Pick a category",
  tagsLabel: "Tags",
  tagsPlaceholder: "Add a tag and press Enter",
  removeTag: (tag) => `Remove ${tag}`,
  optional: "Optional",
  contentNote:
    "Skills and instructions come from your agent in Houston. Publish it again to update them.",
  save: "Save changes",
  saveFailed: "The changes could not be saved. Please try again.",
};

/** The dialog's working copy of the listing's editable fields. */
export interface ListingDraft {
  name: string;
  tagline: string;
  description: string;
  category: string;
  tags: string[];
}

/** Mirrors the publish wizard's cap (store seed contract). */
export const MAX_LISTING_TAGS = 6;

/** Trim, drop blanks, de-dupe (case-insensitive), and cap at MAX_LISTING_TAGS. */
export function normalizeListingTags(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tag of raw) {
    const value = tag.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= MAX_LISTING_TAGS) break;
  }
  return out;
}

/** Seed the dialog's draft from the listing row as the catalog serves it. */
export function listingDraftOf(agent: StoreAgentRow): ListingDraft {
  return {
    name: agent.name,
    tagline: agent.tagline ?? "",
    description: agent.description,
    category: agent.category ?? "",
    tags: normalizeListingTags(agent.tags ?? []),
  };
}

/** Name, description, and category are required — same bar as publishing. */
export function listingDraftValid(draft: ListingDraft): boolean {
  return (
    draft.name.trim() !== "" &&
    draft.description.trim() !== "" &&
    draft.category !== ""
  );
}

/**
 * The identity patch a valid draft implies. Values are trimmed; a cleared
 * tagline is sent as an empty string so the gateway drops it rather than
 * keeping the old one.
 */
export function listingIdentityOf(draft: ListingDraft): OwnedAgentIdentity {
  return {
    name: draft.name.trim(),
    tagline: draft.tagline.trim(),
    description: draft.description.trim(),
    category: draft.category,
    tags: normalizeListingTags(draft.tags),
  };
}

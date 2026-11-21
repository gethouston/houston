import type { OwnedAgentIdentity, StoreAgentRow } from "../types";

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

export interface ListingDraft {
  name: string;
  tagline: string;
  description: string;
  category: string;
  tags: string[];
}

export const MAX_LISTING_TAGS = 6;

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

export function listingDraftOf(agent: StoreAgentRow): ListingDraft {
  return {
    name: agent.name,
    tagline: agent.tagline ?? "",
    description: agent.description,
    category: agent.category ?? "",
    tags: normalizeListingTags(agent.tags ?? []),
  };
}

export function listingDraftValid(draft: ListingDraft): boolean {
  return (
    draft.name.trim() !== "" &&
    draft.description.trim() !== "" &&
    draft.category !== ""
  );
}

export function listingIdentityOf(draft: ListingDraft): OwnedAgentIdentity {
  return {
    name: draft.name.trim(),
    tagline: draft.tagline.trim(),
    description: draft.description.trim(),
    category: draft.category,
    tags: normalizeListingTags(draft.tags),
  };
}

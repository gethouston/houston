export const CATEGORY_PRIORITY: readonly string[] = [
  "social-media-accounts",
  "file-management-and-storage",
  "spreadsheets",
  "team-chat",
  "team-collaboration",
  "productivity",
  "ai-meeting-assistants",
  "ads-and-conversion",
  "notes",
  "signatures",
];

function normalizeCategory(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

const CATEGORY_RANK: ReadonlyMap<string, number> = new Map(
  CATEGORY_PRIORITY.map((slug, i) => [normalizeCategory(slug), i]),
);

export function categoryRank(category: string): number | undefined {
  return CATEGORY_RANK.get(normalizeCategory(category));
}

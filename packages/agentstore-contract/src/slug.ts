// WHY: Must match slugify in @houston/domain so store ingest and the desktop derive the same slugs. ADR-0081
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

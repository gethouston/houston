/**
 * Kebab-case slug from a human name; empty string when nothing survives.
 *
 * Identical rules to `slugify` in `@houston/domain` (packages/domain/src/skills.ts):
 * lowercase, collapse every non-`[a-z0-9]` run to a single "-", trim leading and
 * trailing "-", cap at 64 chars. Shared here so the store's ingest path derives
 * slugs the same way the desktop skills layer does.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

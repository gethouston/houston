/** A user-typed name → a slug valid for executor catalogs AND Houston grants
 *  (`CUSTOM_SLUG` in types.ts). */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return slug || "integration";
}

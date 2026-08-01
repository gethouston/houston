import type { StoreCatalogPage } from "@houston/agentstore-client";

export function alphabetizeCatalogPage(
  page: StoreCatalogPage,
): StoreCatalogPage {
  return {
    ...page,
    items: page.items.toSorted((a, b) =>
      a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
    ),
  };
}

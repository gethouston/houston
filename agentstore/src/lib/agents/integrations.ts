/**
 * Integration display-name resolver for the public agent page.
 *
 * IR integrations are stored as Composio toolkit slugs: uppercase, single
 * concatenated tokens with no separators ("GITHUB", "GOOGLECALENDAR", "YOUTUBE").
 * Title-casing a slug in isolation therefore renders wrong brand casing
 * ("Github", "Youtube", "Googlecalendar"). The seeded `integrations_catalog`
 * holds the correct human names ("GitHub", "YouTube", "Google Calendar"), so we
 * look those up and only fall back to a humanized slug for toolkits not yet in
 * the catalog.
 *
 * NODE RUNTIME ONLY — imports the DB client. Never import from Edge/client.
 */

import { inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import { db } from "@/lib/db";

/** A resolved integration ready to render: the raw slug plus its display label. */
export interface IntegrationLabel {
  slug: string;
  label: string;
}

/**
 * Best-effort display name for a slug with no catalog entry. Composio slugs are
 * single concatenated tokens, so this only lower/title-cases the whole token
 * (e.g. "MAKE" -> "Make"); multi-word brands rely on the catalog for correct
 * casing and spacing.
 */
export function humanizeIntegrationSlug(slug: string): string {
  return slug
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Map catalog names onto slugs in input order, humanizing uncataloged slugs. */
export function applyCatalogLabels(
  slugs: string[],
  nameBySlug: Map<string, string>,
): IntegrationLabel[] {
  return slugs.map((slug) => ({
    slug,
    label: nameBySlug.get(slug) ?? humanizeIntegrationSlug(slug),
  }));
}

/**
 * Resolve slugs to display labels using the integrations catalog. Preserves the
 * input order and falls back to a humanized slug for toolkits not in the catalog.
 */
export async function resolveIntegrationLabels(
  slugs: string[],
): Promise<IntegrationLabel[]> {
  if (slugs.length === 0) return [];

  const rows = await db
    .select({
      slug: schema.integrationsCatalog.slug,
      name: schema.integrationsCatalog.name,
    })
    .from(schema.integrationsCatalog)
    .where(inArray(schema.integrationsCatalog.slug, slugs));

  const nameBySlug = new Map(rows.map((r) => [r.slug, r.name]));
  return applyCatalogLabels(slugs, nameBySlug);
}

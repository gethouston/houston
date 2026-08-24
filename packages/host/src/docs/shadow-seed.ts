import { ShadowUnavailableError } from "./shadow-fetch";
import {
  canonicalJSON,
  etagRevision,
  parseDocBody,
  responseError,
  unknownFamilyRejection,
} from "./wire";

/** The revision/content caches one seed refreshes (shared with the shadow). */
export interface SeedCaches<F extends string> {
  revisions: Map<F, number>;
  remote: Map<F, string>;
}

export interface SeedOutcome {
  seeded: boolean;
  /** Set when the gateway rejected the family as unknown (deploy skew). */
  unsupported?: string;
}

/**
 * Seed one family's revision + canonical content from a GET response the
 * caller fetched. 404 is the normal empty case (revision 0); an unknown-family
 * rejection is reported for the caller to latch; unavailability defers with a
 * warning (the next write re-seeds); anything else fails the seed loudly.
 */
export async function seedFromResponse<F extends string>(
  family: F,
  fetchDoc: () => Promise<Response>,
  caches: SeedCaches<F>,
): Promise<SeedOutcome> {
  try {
    const response = await fetchDoc();
    if (response.status === 404) {
      caches.revisions.set(family, 0);
      caches.remote.delete(family);
      return { seeded: true };
    }
    if (!response.ok) {
      const error = await responseError(response, family, "GET");
      if (unknownFamilyRejection(response.status, error.message)) {
        return { seeded: false, unsupported: error.message };
      }
      throw error;
    }
    const parsed = parseDocBody(await response.text());
    const etag = etagRevision(response);
    caches.revisions.set(family, etag ?? parsed.revision ?? 0);
    if (parsed.doc !== undefined) {
      caches.remote.set(family, canonicalJSON(parsed.doc));
    } else {
      caches.remote.delete(family);
    }
    return { seeded: true };
  } catch (error) {
    if (error instanceof ShadowUnavailableError) {
      console.warn(`[doc-shadow] ${family} seed deferred: ${error.message}`);
    } else {
      console.error(`[doc-shadow] ${family} revision seed failed`, error);
    }
    caches.revisions.delete(family);
    caches.remote.delete(family);
    return { seeded: false };
  }
}

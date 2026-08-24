import type { SeedCaches } from "./shadow-seed";
import {
  responseError,
  responseRevision,
  unknownFamilyRejection,
} from "./wire";

export interface PutOutcome {
  /** The doc route itself is gone: the whole shadow must latch off. */
  skew?: boolean;
  /** The gateway rejected the family as unknown (deploy skew). */
  unsupported?: string;
}

/**
 * One conditional PUT plus a single adopt-and-retry on a revision conflict.
 * The caches are refreshed exactly like the seed path: an accepted PUT records
 * the new revision and canonical content; a conflict yields to the file as
 * authoritative. Unavailability (ShadowUnavailableError) propagates for the
 * caller to defer.
 */
export async function publishDoc<F extends string>(opts: {
  family: F;
  doc: unknown;
  canonical: string;
  revision: number;
  putAtRevision: (revision: number) => Promise<Response>;
  caches: SeedCaches<F>;
}): Promise<PutOutcome> {
  const response = await opts.putAtRevision(opts.revision);
  if (response.status === 409) {
    const revision = await responseRevision(response);
    if (revision === undefined) {
      opts.caches.revisions.delete(opts.family);
      opts.caches.remote.delete(opts.family);
      console.debug(
        `[doc-shadow] ${opts.family} revision conflict without current revision; re-seeding on next write`,
      );
      return {};
    }
    opts.caches.revisions.set(opts.family, revision);
    opts.caches.remote.delete(opts.family);
    const retry = await opts.putAtRevision(revision);
    return acceptPutResponse(opts, retry);
  }
  return acceptPutResponse(opts, response);
}

async function acceptPutResponse<F extends string>(
  opts: { family: F; canonical: string; caches: SeedCaches<F> },
  response: Response,
): Promise<PutOutcome> {
  if (response.status === 404) return { skew: true };
  if (response.status === 409) {
    const revision = await responseRevision(response);
    if (revision === undefined) opts.caches.revisions.delete(opts.family);
    else opts.caches.revisions.set(opts.family, revision);
    opts.caches.remote.delete(opts.family);
    console.debug(
      `[doc-shadow] ${opts.family} revision conflict; file remains authoritative`,
    );
    return {};
  }
  if (!response.ok) {
    const error = await responseError(response, opts.family, "PUT");
    if (unknownFamilyRejection(response.status, error.message)) {
      return { unsupported: error.message };
    }
    throw error;
  }
  const revision = await responseRevision(response);
  if (revision !== undefined) opts.caches.revisions.set(opts.family, revision);
  opts.caches.remote.set(opts.family, opts.canonical);
  return {};
}

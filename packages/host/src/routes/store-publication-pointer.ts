import { storePublicationKey } from "@houston/domain";
import type { Vfs } from "../vfs";

/**
 * The machine-local POINTER from a local agent to its Agent Store listing,
 * stored at `<agentRoot>/.houston/store-publication/store-publication.json`.
 *
 * It carries NO secrets: ownership of the store agent is account-based (the
 * user's own GCIP bearer, verified by the gateway), so there is no manage token
 * to keep. The pointer only remembers which store agent this local agent maps
 * to, and where its listing lives, so the manage view can look up the live state
 * (`GET /v1/agentstore/me/agents`) and re-gather/PATCH the SAME store agent
 * instead of creating a duplicate.
 */
export interface StorePublicationPointer {
  /** The store agent's id (uuid), as returned by the gateway on publish. */
  storeAgentId: string;
  /** The listing slug, for the public share URL. */
  slug: string;
  /** The public share URL the gateway returned (store.gethouston.ai/a/<slug>). */
  shareUrl: string;
  /** ISO timestamp of the first successful publish. */
  publishedAt: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0;

/**
 * Read the pointer, or null when the agent was never published. A file that
 * exists but does not parse (or is missing a required field) THROWS with the key
 * named: a mangled pointer must surface, not silently reset and orphan the store
 * agent (beta policy).
 */
export async function readPublicationPointer(
  vfs: Vfs,
  root: string,
): Promise<StorePublicationPointer | null> {
  const key = storePublicationKey(root);
  const raw = await vfs.readText(key);
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `${key} is not valid JSON (${err instanceof Error ? err.message : String(err)})`,
    );
  }
  if (
    !isRecord(parsed) ||
    !isNonEmptyString(parsed.storeAgentId) ||
    typeof parsed.slug !== "string" ||
    typeof parsed.shareUrl !== "string" ||
    typeof parsed.publishedAt !== "string"
  ) {
    throw new Error(`${key} is not a valid store publication pointer`);
  }
  return {
    storeAgentId: parsed.storeAgentId,
    slug: parsed.slug,
    shareUrl: parsed.shareUrl,
    publishedAt: parsed.publishedAt,
  };
}

export async function writePublicationPointer(
  vfs: Vfs,
  root: string,
  pointer: StorePublicationPointer,
): Promise<void> {
  await vfs.writeText(
    storePublicationKey(root),
    `${JSON.stringify(pointer, null, 2)}\n`,
  );
}

/** Remove the pointer (after a store-side delete), if present. */
export async function clearPublicationPointer(
  vfs: Vfs,
  root: string,
): Promise<void> {
  await vfs.deleteKey(storePublicationKey(root));
}

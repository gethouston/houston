/**
 * Install from an Agent Store share link (or bare slug).
 *
 * Primary path: the host's `/v1/portable/fetch-from-store` route fetches the
 * published agent's IR (SSRF-guarded, DNS-vetted) and answers with portable
 * content. Hosted deployments have no local host — the cloud gateway answers
 * 501 for `/v1/portable*` — so the browser falls back to fetching the public
 * `{agent, ir}` route from the store gateway directly and converting it with
 * the SAME shared code the host route runs (`resolveStoreIrUrl` link policy,
 * `storePackageFromIrPayload` conversion), so the two paths cannot drift. The
 * host's extra DNS vet is a server-side privilege guard; in the browser, the
 * network sandbox (CORS, no privileged network position) covers it.
 *
 * Either way the package is parked in the SAME registry a file upload uses
 * (`parkUpload`), so the wizard's scan/name/install steps downstream are
 * byte-for-byte the file-upload flow.
 */

import { resolveStoreIrUrl } from "@houston/agentstore-contract";
import {
  type PortableContent,
  type PortablePackage,
  storePackageFromIrPayload,
} from "@houston/domain";
import type { PortableUploadPreviewResponse } from "../../../../ui/engine-client/src/types";
import { HoustonEngineError, isHoustonEngineError } from "./client/errors";
import type { ControlPlaneConfig } from "./control-plane";
import { hostFetch, parkUpload } from "./portable";
import { storeApiBase } from "./store-gateway";

/** Matches the host route: rides in the manifest of a link-installed package. */
const HOUSTON_VERSION = "0.0.0";

/** Bounded so a slow or hung store can never wedge the install dialog. */
const FETCH_TIMEOUT_MS = 30_000;

type StorePackage = {
  manifest: PortablePackage["manifest"];
  content: PortableContent;
};

/** Resolve a share link to a parked, wizard-ready package preview. */
export async function importFromStoreLink(
  cfg: ControlPlaneConfig,
  url: string,
): Promise<PortableUploadPreviewResponse> {
  const { manifest, content } = await fetchStorePackage(cfg, url);
  return parkUpload({ manifest, ...content });
}

/** The host's store fetch, or the direct-from-store fallback on its 501. */
async function fetchStorePackage(
  cfg: ControlPlaneConfig,
  url: string,
): Promise<StorePackage> {
  try {
    const res = await hostFetch(cfg, "/v1/portable/fetch-from-store", {
      method: "POST",
      body: JSON.stringify({ url }),
    });
    return (await res.json()) as StorePackage;
  } catch (err) {
    if (isHoustonEngineError(err) && err.status === 501) {
      return fetchStorePackageDirect(cfg, url);
    }
    throw err;
  }
}

/**
 * Fetch a published agent's IR straight from the store gateway and return the
 * same `{manifest, content}` package the host route answers with. Every
 * failure is a thrown {@link HoustonEngineError} carrying the user-facing
 * reason — nothing is swallowed.
 */
async function fetchStorePackageDirect(
  cfg: ControlPlaneConfig,
  rawUrl: string,
): Promise<StorePackage> {
  const resolved = resolveStoreIrUrl(rawUrl, storeApiBase(cfg));
  if ("error" in resolved) {
    throw new HoustonEngineError(400, { error: resolved.error });
  }

  let response: Response;
  try {
    response = await fetch(resolved.irUrl, {
      // No redirect following, matching the host route: a 3xx away from the
      // resolved origin could smuggle the fetch elsewhere.
      redirect: "error",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new HoustonEngineError(502, {
      error: `Could not reach the agent store: ${message}`,
    });
  }

  if (response.status === 404) {
    throw new HoustonEngineError(404, {
      error: "No published agent was found at that link.",
    });
  }
  if (!response.ok) {
    // Only the status is surfaced: echoing the upstream body would turn a
    // misdirected fetch into a read primitive, so we never forward it.
    throw new HoustonEngineError(502, {
      error: `The agent store returned an error (${response.status}).`,
    });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new HoustonEngineError(502, {
      error: "The agent store returned an unreadable response.",
    });
  }

  const pkg = storePackageFromIrPayload(payload, HOUSTON_VERSION);
  if ("error" in pkg) throw new HoustonEngineError(422, { error: pkg.error });
  return pkg;
}

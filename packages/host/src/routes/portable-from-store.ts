import type { IncomingMessage, ServerResponse } from "node:http";
import { agentIrSchema } from "@houston/agentstore-contract";
import { type PortableContent, portableFromIr } from "@houston/domain";
import {
  PORTABLE_FORMAT_VERSION,
  type PortableManifest,
} from "@houston/protocol";
import { config } from "../config";
import { json, readJson } from "./http";
import {
  defaultHostLookup,
  type HostLookup,
  vetResolvedHost,
} from "./portable-from-store-net";
import { resolveStoreIrUrl } from "./portable-from-store-url";

/** Rides in the manifest of a link-installed package; matches the export path. */
const HOUSTON_VERSION = "0.0.0";

/** Bounded so a slow or hung store can never wedge the install dialog. */
const FETCH_TIMEOUT_MS = 30_000;

/** Dependencies for the account-level "install from a link" route. */
export interface PortableFromStoreDeps {
  /** Gateway API base; defaults to `config.agentStoreApiUrl`. */
  apiUrl?: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable DNS resolver for the SSRF vet; defaults to `node:dns` lookup. */
  lookup?: HostLookup;
}

/**
 * POST /v1/portable/fetch-from-store — resolve a share link (or bare slug) to a
 * published agent, fetch its canonical AgentIR from the store, validate it, and
 * return it mapped to the portable content shape the import wizard already
 * consumes. The browser adapter parks the result in the SAME in-memory registry
 * as a file upload, so the scan/name/install steps downstream are untouched.
 *
 * Every failure surfaces to the user with a real status (400 bad link, 404 not
 * found, 422 unreadable IR, 502 store unreachable) — nothing is swallowed.
 * Returns true when handled.
 */
export async function handlePortableFromStore(
  deps: PortableFromStoreDeps,
  method: string,
  path: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (method !== "POST" || path !== "/v1/portable/fetch-from-store") {
    return false;
  }

  const body = await readJson(req);
  const rawUrl = typeof body.url === "string" ? body.url : "";
  const resolved = resolveStoreIrUrl(
    rawUrl,
    deps.apiUrl ?? config.agentStoreApiUrl,
  );
  if ("error" in resolved) {
    json(res, 400, { error: resolved.error });
    return true;
  }

  // The string check above cannot see where a public name resolves. Resolve it and
  // reject any private/internal answer BEFORE connecting, so a link like
  // `agent.evil.com` pointing at `169.254.169.254` can never reach the fetch.
  const vetted = await vetResolvedHost(
    new URL(resolved.irUrl).hostname,
    deps.lookup ?? defaultHostLookup,
  );
  if ("error" in vetted) {
    json(res, vetted.status, { error: vetted.error });
    return true;
  }

  const doFetch = deps.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await doFetch(resolved.irUrl, {
      // No redirect following: a 3xx away from the vetted origin could smuggle
      // the fetch to a non-https or private address the SSRF guard cleared.
      redirect: "error",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    json(res, 502, { error: `Could not reach the agent store: ${message}` });
    return true;
  }

  if (response.status === 404) {
    json(res, 404, {
      error: "No published agent was found at that link.",
    });
    return true;
  }
  if (!response.ok) {
    // Only the status is surfaced: echoing the upstream body would turn a
    // misdirected fetch into a read primitive, so we never forward it.
    json(res, 502, {
      error: `The agent store returned an error (${response.status}).`,
    });
    return true;
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    json(res, 502, {
      error: "The agent store returned an unreadable response.",
    });
    return true;
  }

  // The gateway's public route wraps the IR: { agent: AgentSummary, ir: AgentIR }.
  const ir =
    payload && typeof payload === "object" && "ir" in payload
      ? (payload as { ir: unknown }).ir
      : payload;
  const parsed = agentIrSchema.safeParse(ir);
  if (!parsed.success) {
    json(res, 422, {
      error: "The shared agent could not be read (unexpected format).",
    });
    return true;
  }

  const { content, meta } = portableFromIr(parsed.data);
  const manifest: PortableManifest = {
    agentName: meta.agentName,
    description: meta.description,
    exporter: parsed.data.identity.creator.displayName,
    houstonVersion: HOUSTON_VERSION,
    createdAt: new Date().toISOString(),
    anonymized: false,
    formatVersion: PORTABLE_FORMAT_VERSION,
  };
  json(res, 200, { manifest, content } satisfies {
    manifest: PortableManifest;
    content: PortableContent;
  });
  return true;
}

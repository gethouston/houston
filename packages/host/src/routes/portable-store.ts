import type { IncomingMessage, ServerResponse } from "node:http";
import type { Agent, UserId, Workspace } from "../domain/types";
import { CloudPaths, type WorkspacePaths } from "../paths";
import type { Vfs } from "../vfs";
import { json, readJson } from "./http";
import { buildStoreIr, parseStoreIrRequest } from "./portable-store-ir";
import {
  clearPublicationPointer,
  readPublicationPointer,
  type StorePublicationPointer,
  writePublicationPointer,
} from "./store-publication-pointer";

/**
 * Agent-scoped Agent Store routes (registered beside the portable export /
 * preview / anonymize routes). In the account-based store model the APP owns
 * the network: it talks to the gateway `/v1/agentstore` API with the user's own
 * GCIP bearer. The host does exactly two credential-free things:
 *
 *   POST .../portable/store-ir           gather the selected content -> { ir }
 *   POST .../portable/store-publication  record the { storeAgentId, slug, ... }
 *   GET  .../portable/store-publication  read the machine-local pointer
 *   DELETE .../portable/store-publication clear the pointer (after a store delete)
 *
 * No manage tokens, no store uploads, no store credentials ever touch the host.
 * Returns true when handled.
 */

/** Dependencies the store routes carry (no store network seam — the app owns it). */
export interface PortableStoreDeps {
  vfs?: Vfs;
  paths?: WorkspacePaths;
}

export interface PortableStoreCtx {
  workspace: Workspace;
  agent: Agent;
  userId: UserId;
}

export async function handlePortableStore(
  deps: PortableStoreDeps,
  ctx: PortableStoreCtx,
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (rest !== "portable/store-ir" && rest !== "portable/store-publication")
    return false;
  const vfs = deps.vfs;
  if (!vfs) {
    json(res, 503, { error: "agent data not configured" });
    return true;
  }
  const root = (deps.paths ?? new CloudPaths()).agentRoot(
    ctx.workspace,
    ctx.agent,
  );

  if (rest === "portable/store-ir") {
    if (method !== "POST") return methodNotAllowed(res);
    const request = parseStoreIrRequest(await readJson(req));
    if (typeof request === "string") return badRequest(res, request);
    const ir = await buildStoreIr(vfs, root, request);
    json(res, 200, { ir });
    return true;
  }

  // portable/store-publication — the machine-local pointer.
  if (method === "GET") {
    const pointer = await readPublicationPointer(vfs, root);
    json(res, 200, { pointer });
    return true;
  }
  if (method === "POST") {
    const pointer = parsePointerBody(await readJson(req));
    if (typeof pointer === "string") return badRequest(res, pointer);
    await writePublicationPointer(vfs, root, pointer);
    json(res, 200, { ok: true });
    return true;
  }
  if (method === "DELETE") {
    await clearPublicationPointer(vfs, root);
    json(res, 200, { ok: true });
    return true;
  }
  return methodNotAllowed(res);
}

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0;

/** Validate the pointer the app writes after a successful gateway publish. */
function parsePointerBody(
  body: Record<string, unknown>,
): StorePublicationPointer | string {
  if (!isNonEmptyString(body.storeAgentId)) return "missing 'storeAgentId'";
  if (typeof body.slug !== "string") return "missing 'slug'";
  if (typeof body.shareUrl !== "string") return "missing 'shareUrl'";
  return {
    storeAgentId: body.storeAgentId,
    slug: body.slug,
    shareUrl: body.shareUrl,
    publishedAt:
      typeof body.publishedAt === "string" && body.publishedAt.length > 0
        ? body.publishedAt
        : new Date().toISOString(),
  };
}

function badRequest(res: ServerResponse, error: string): boolean {
  json(res, 400, { error });
  return true;
}

function methodNotAllowed(res: ServerResponse): boolean {
  json(res, 405, { error: "method not allowed" });
  return true;
}

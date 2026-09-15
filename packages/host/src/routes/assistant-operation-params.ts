import type { ServerResponse } from "node:http";
import type { AssistantOperation } from "../assistant/catalog";
import { UnsupportedEntityCollectionError } from "../assistant/entity-directory-local";
import {
  type EntityResolution,
  resolveEntityParams,
} from "../assistant/entity-resolution";
import type { AssistantOperationCtx } from "./assistant-operation-ctx";
import { json } from "./http";

/**
 * Resolve the identifiers `params` names, or answer 400 with the sentence that
 * says what WOULD have worked. Both `/sandbox/assistant/*` handlers run this
 * BEFORE anything else touches the arguments, so the card, the receipt key and
 * the request are all built from the same resolved values — an approval given
 * for "Dobby" and a call performed against an id can never be two different
 * things.
 */
export async function resolvedParams(
  ctx: AssistantOperationCtx,
  op: AssistantOperation,
  params: Record<string, unknown>,
  res: ServerResponse,
): Promise<Record<string, unknown> | null> {
  let resolution: EntityResolution;
  try {
    resolution = await resolveEntityParams(op, params, ctx.directory);
  } catch (error) {
    // A collection this deployment simply does not have is not an outage: the
    // model must hear "this Houston has no such thing" once, not retry a list
    // that will never exist (assistant/entity-directory-local.ts).
    if (error instanceof UnsupportedEntityCollectionError) {
      json(res, 400, {
        error: `${error.collection} are not supported on this Houston, so nothing here can name one. Tell the user plainly that Houston cannot do this for them.`,
        code: "unsupported_entity",
      });
      return null;
    }
    console.error("[assistant] could not read the entity directory", error);
    json(res, 502, {
      error: "could not read the available items right now - try again",
      code: "directory_unavailable",
    });
    return null;
  }
  if (resolution.ok) return resolution.params;
  json(res, 400, { error: resolution.message, code: resolution.code });
  return null;
}

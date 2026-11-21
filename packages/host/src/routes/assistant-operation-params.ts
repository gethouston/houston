import type { ServerResponse } from "node:http";
import type { AssistantOperation } from "../assistant/catalog";
import { UnsupportedEntityCollectionError } from "../assistant/entity-directory-local";
import {
  type EntityResolution,
  resolveEntityParams,
} from "../assistant/entity-resolution";
import type { AssistantOperationCtx } from "./assistant-operation-ctx";
import { json } from "./http";

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
    if (error instanceof UnsupportedEntityCollectionError) {
      json(res, 400, {
        error: `${error.collection} are not supported on this install, so nothing here can name one. Tell the user plainly that this cannot be done here.`,
        code: "unsupported_entity",
      });
      return null;
    }
    console.error("[assistant] could not read the entity directory", error);
    refusedDirectoryUnavailable(res);
    return null;
  }
  if (resolution.ok) return resolution.params;
  json(res, 400, { error: resolution.message, code: resolution.code });
  return null;
}

export function refusedDirectoryUnavailable(res: ServerResponse): true {
  json(res, 502, {
    error: "could not read the available items right now - try again",
    code: "directory_unavailable",
  });
  return true;
}

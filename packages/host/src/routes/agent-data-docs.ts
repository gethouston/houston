import type { IncomingMessage, ServerResponse } from "node:http";
import { loadConfig, loadLearnings, saveLearnings } from "@houston/domain";
import type { Vfs } from "../vfs";
import { writeSurfaceConfig } from "./agent-config-write";
import { withDocLock } from "./doc-lock";
import { json, readJson } from "./http";

/**
 * The whole-document families: config and learnings are read and replaced in
 * one shot, with none of the per-item CRUD activities and routines carry (see
 * agent-data-activities.ts / agent-data-routines.ts). Returns true when it
 * answered; false leaves the caller's family-wide 405 to speak.
 */
export async function handleDocsData(
  vfs: Vfs,
  root: string,
  family: "config" | "learnings",
  method: string,
  itemId: string | null,
  req: IncomingMessage,
  res: ServerResponse,
  fireChange: () => void,
): Promise<boolean> {
  // Neither family has items: `config/anything` is a shape this route owns but
  // does not serve, and falls to the 405 like a wrong method does.
  if (itemId) return false;

  if (family === "config") {
    if (method === "GET") {
      json(res, 200, await loadConfig(vfs, root));
      return true;
    }
    if (method === "PUT") {
      const stored = await writeSurfaceConfig(vfs, root, await readJson(req));
      fireChange();
      json(res, 200, stored);
      return true;
    }
    return false;
  }

  if (method === "GET") {
    json(res, 200, await loadLearnings(vfs, root));
    return true;
  }
  if (method === "PUT") {
    const body = await readJson(req);
    const items = body.items;
    if (!Array.isArray(items)) {
      json(res, 400, { error: "missing 'items' array" });
      return true;
    }
    // Whole-file replace, under the SAME per-doc lock the runtime's
    // `save_learning` route takes (routes/learnings-sandbox.ts) — otherwise
    // this write can land in the middle of that route's load→append→save and
    // silently drop the learning the agent just recorded.
    await withDocLock(`${root}#learnings`, () =>
      saveLearnings(vfs, root, items),
    );
    fireChange();
    json(res, 200, { ok: true });
    return true;
  }
  return false;
}

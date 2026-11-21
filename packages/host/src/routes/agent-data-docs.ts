import type { IncomingMessage, ServerResponse } from "node:http";
import { loadConfig, loadLearnings, saveLearnings } from "@houston/domain";
import type { Vfs } from "../vfs";
import { writeSurfaceConfig } from "./agent-config-write";
import { withDocLock } from "./doc-lock";
import { json, readJson } from "./http";

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
    await withDocLock(`${root}#learnings`, () =>
      saveLearnings(vfs, root, items),
    );
    fireChange();
    json(res, 200, { ok: true });
    return true;
  }
  return false;
}

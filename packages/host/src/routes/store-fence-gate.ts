import type { ServerResponse } from "node:http";
import { json } from "./http";

export const STORE_FENCED_ERROR =
  "this agent's data can't be saved right now: a newer engine owns it, try again in a moment";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const SANDBOX_WRITE =
  /^\/sandbox\/(routines|learnings|missions|integrations\/custom\/(add|remove))(\/|$)/;

export function isFencedWrite(
  method: string,
  path: string,
  scope: "sandbox" | "authenticated",
): boolean {
  if (!MUTATING.has(method.toUpperCase())) return false;
  if (scope === "sandbox") return SANDBOX_WRITE.test(path);
  return true;
}

let reported = false;

export async function handleStoreFenceGate(
  deps: {
    storeFenced?: () => boolean;
    storeWritable?: () => Promise<boolean>;
    storeSyncAfterWrite?: () => void;
  },
  method: string,
  path: string,
  res: ServerResponse,
  scope: "sandbox" | "authenticated",
): Promise<boolean> {
  if (!isFencedWrite(method, path, scope)) return false;
  if (!deps.storeFenced?.() && (await deps.storeWritable?.()) !== false) {
    const ship = deps.storeSyncAfterWrite;
    if (ship) {
      res.once("finish", () => {
        if (res.statusCode < 400) ship();
      });
    }
    return false;
  }
  if (!reported) {
    reported = true;
    console.error(
      `[local-host] refusing ${method} ${path}: the object-store write fence was lost; this pod's writes would not persist`,
    );
  }
  json(res, 503, { error: STORE_FENCED_ERROR, code: "store_fenced" });
  return true;
}

export function resetStoreFenceReport(): void {
  reported = false;
}

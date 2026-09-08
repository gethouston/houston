import type { ServerResponse } from "node:http";
import { json } from "./http";

/**
 * Fail closed on agent-data writes once this pod has lost its object-store
 * write fence (PRODUCT-1706).
 *
 * A managed pod claims a per-agent write lease at boot; when a NEWER boot
 * takes it (a roll's replacement pod, a pool worker running the agent while
 * the registry called it asleep), the store answers this pod's syncs with 409
 * and the sync daemon halts for good — by design, it is no longer the writer.
 * But the gateway kept proxying to the pod, and the pod kept answering
 * routine/mission/config writes with 200: they landed on its own disk, showed
 * in every read served by that pod, and were gone the moment the pod was
 * recycled and the next one hydrated the store's copy. A routine edited to
 * 7:00 fired at 7:00 for days, then silently reverted to its old 11:30.
 *
 * The write is refused instead. The 503 carries a distinct reason (not the
 * gateway's waking shape), so the client shows its authored "couldn't save"
 * copy and reports it: a fenced pod still receiving writes is a bug we want
 * to see, never a quiet retry loop. Reads keep flowing — what the pod has is
 * still the freshest answer until it is recycled.
 */

export const STORE_FENCED_ERROR =
  "this agent's data can't be saved right now: a newer engine owns it, try again in a moment";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Runtime-tool write families that land in the agent's synced tree. */
const SANDBOX_WRITE = /^\/sandbox\/(routines|learnings|missions|skills)(\/|$)/;

/**
 * Whether a request would write agent data. `scope` follows the server's
 * ordering: the sandbox families are gated before their HMAC routes, the
 * user-facing `/agents/` routes only after the bearer has been verified (an
 * anonymous caller must keep getting 401, not a hint about pod state).
 */
export function isFencedWrite(
  method: string,
  path: string,
  scope: "sandbox" | "agents",
): boolean {
  if (!MUTATING.has(method.toUpperCase())) return false;
  if (scope === "sandbox") return SANDBOX_WRITE.test(path);
  return path.startsWith("/agents/");
}

let reported = false;

/** Answer 503 and return true when the write must be refused. */
export function handleStoreFenceGate(
  deps: { storeFenced?: () => boolean },
  method: string,
  path: string,
  res: ServerResponse,
  scope: "sandbox" | "agents",
): boolean {
  if (!deps.storeFenced?.() || !isFencedWrite(method, path, scope)) {
    return false;
  }
  if (!reported) {
    // Once per process: the fence loss itself is logged as a breadcrumb by
    // the sync daemon (superseded setup pods lose it routinely); a REFUSED
    // write is the moment a user's edit would have been lost, and reports.
    reported = true;
    console.error(
      `[local-host] refusing ${method} ${path}: the object-store write fence was lost; this pod's writes would not persist`,
    );
  }
  json(res, 503, { error: STORE_FENCED_ERROR, code: "store_fenced" });
  return true;
}

/** Test seam: forget the once-per-process report. */
export function resetStoreFenceReport(): void {
  reported = false;
}

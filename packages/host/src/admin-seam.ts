import type { IncomingMessage, ServerResponse } from "node:http";
import type { UserId } from "./domain/types";

/**
 * The operator-admin extension seam. The open server never imports an admin
 * route; it accepts an INJECTED request hook (ControlPlaneDeps.mountAdmin) and
 * calls it after the events stream. Nothing in-tree binds it anymore — the
 * closed control plane that did (`@houston/host-cloud`) was retired and deleted
 * — but the seam stays as the documented extension point for any private
 * deployment's admin surface. No profile in this repo sets it, so `/admin/*`
 * simply 404s — exactly as a request to any unmounted route would.
 *
 * Returns true when it handled the request (the server then stops routing), false
 * to fall through. Mirrors every other route's contract.
 */
export type MountAdmin = (
  userId: UserId,
  method: string,
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<boolean>;

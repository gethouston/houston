/**
 * A free org's routine rules (`/v1/me/routines*`) and the presence that keeps
 * its routines from pausing (`/v1/me/presence`). Org-scoped: each request
 * rides the active org's `x-houston-org`, and the gateway applies the rules of
 * that org's tier.
 */

import type { PlanRoutine, PlanRoutineKey } from "@houston/wire-types";
import { type HttpScope, httpRequest } from "../http";

/** List the active organization's enabled routines.
 * @assistant group:routines
 */
export async function listPlanRoutines(
  scope: HttpScope,
): Promise<{ routines: PlanRoutine[] }> {
  return (await (await httpRequest(scope, "/v1/me/routines")).json()) as {
    routines: PlanRoutine[];
  };
}

/** Choose the one routine a free organization keeps firing.
 * @assistant group:routines
 * @assistant confirm: Other routines in a free organization stay saved but stop firing.
 */
export async function keepRoutine(
  scope: HttpScope,
  key: PlanRoutineKey,
): Promise<void> {
  await httpRequest(scope, "/v1/me/routines/keep", {
    method: "PUT",
    body: JSON.stringify(key),
  });
}

/** Resume the active organization's routines paused while nobody was around.
 * @assistant group:routines
 * @assistant confirm: Paused routines can start firing again.
 */
export async function resumeRoutines(scope: HttpScope): Promise<void> {
  await httpRequest(scope, "/v1/me/routines/resume", { method: "POST" });
}

/** Report that the person has the active organization open in the foreground.
 * @assistant group:system hidden: presence means the person opened the app; an assistant reporting it would keep their routines from pausing.
 * @assistant unconfirmed: A foreground heartbeat only updates activity time.
 */
export async function reportPresence(scope: HttpScope): Promise<void> {
  await httpRequest(scope, "/v1/me/presence", { method: "POST" });
}

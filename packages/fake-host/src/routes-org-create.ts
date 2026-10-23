import { seatCheckoutRequestSchema } from "@houston/wire-types";
import { json } from "./http";
import * as state from "./state";

/**
 * `POST /v1/orgs`: mint an org with the caller as owner, free unless the body
 * asks for `paid`. A free create while the slot is taken answers `409
 * free_org_taken`; a paid one answers the locked org with `checkoutUrl`. An
 * interval other than month or year is a 400, as on the gateway.
 */
export function createOrg(body: Record<string, unknown> | undefined): Response {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return json({ error: "name is required" }, 400);
  // The gateway's own ceiling (`maxTeamNameLen`), mirrored so the create
  // dialog's long-name rejection is reachable here too.
  if (name.length > 200) return json({ error: "name too long" }, 400);
  if (!seatCheckoutRequestSchema.safeParse(body ?? {}).success)
    return json({ error: "interval must be month or year" }, 400);
  const outcome = state.createTeamSpace(
    name,
    body?.plan === "paid" ? "paid" : "free",
  );
  if (outcome.kind === "free_org_taken")
    return json(
      {
        error: "free org taken",
        code: outcome.kind,
        freeOrgSlug: outcome.freeOrgSlug,
      },
      409,
    );
  const { org } = outcome;
  return json(
    outcome.kind === "checkout"
      ? { ...org, checkoutUrl: outcome.checkoutUrl }
      : org,
    201,
  );
}

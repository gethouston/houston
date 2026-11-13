import { parseOrgBilling } from "@houston/wire-types";
import { json, parseBody } from "./http";
import {
  handleBillingChoiceCallsControl,
  handleBillingChoiceControl,
} from "./routes-billing-choice";
import { handlePlanCallsControl, handlePlanControl } from "./routes-plan";
import { handleSpaceInvitesControl } from "./routes-spaces";
import * as state from "./state";

const ORG_ROLES = ["owner", "admin", "user"] as const;
export async function handleAccountControls(
  req: Request,
): Promise<Response | undefined> {
  const path = new URL(req.url).pathname;
  const method = req.method;
  // Arm the per-member access lens (Admin > People drill-in): a multi-member
  // org roster (`members`) `GET /v1/org` serves, and the agent fleet with
  // per-agent assignments (`agents`) `GET /agents` serves. Pair with
  // `/__test__/capabilities` `{multiplayer:true, teams:true, role:"owner"}`.
  if (path === "/__test__/org" && method === "POST") {
    const body = await parseBody(req);
    if (Array.isArray(body?.members)) {
      state.setOrgMembers(body.members as state.FakeMember[]);
    }
    if (Array.isArray(body?.agents)) {
      state.armAgents(body.agents as state.AgentAccessSeed[]);
    }
    return json({
      members: state.getOrgMembers(),
      agents: state.listAgents(),
    });
  }
  // Arm the team-space rows `GET /v1/workspaces` bridges in (C8 Spaces): each
  // `{ slug, name }` becomes an `{ id:"org:<slug>", kind:"org" }` switcher row,
  // served alongside the always-present personal seed row, with its org
  // `billing`, `role` and `memberCount` when the row carries them. A `slug` must be
  // exactly 16 lowercase hex chars (the id grammar `space-id.ts` enforces).
  // Pair with `/__test__/capabilities` `{ spaces:true }`. Reset (or `{teams:[]}`)
  // restores the personal-only list.
  if (path === "/__test__/workspaces" && method === "POST") {
    const body = await parseBody(req);
    const teams = Array.isArray(body?.teams) ? body.teams : [];
    const rows = teams.flatMap((t) => {
      const row = t as Record<string, unknown>;
      if (typeof row.slug !== "string" || !/^[a-f0-9]{16}$/.test(row.slug)) {
        return [];
      }
      const billing = parseOrgBilling(row.billing);
      const role = ORG_ROLES.find((r) => r === row.role);
      return [
        {
          id: `org:${row.slug}`,
          name: typeof row.name === "string" ? row.name : row.slug,
          ...(billing ? { billing } : {}),
          ...(role ? { role } : {}),
          ...(typeof row.memberCount === "number"
            ? { memberCount: row.memberCount }
            : {}),
        },
      ];
    });
    return json({ teams: state.setTeamWorkspaces(rows) });
  }
  // Arm the invitee-side invite inbox `GET /v1/orgs` surfaces in `invites` (C8
  // Spaces): `{ invites: [{ orgName, role?, invitedBy?, orgSlug?, id?,
  // reject? }] }`. Only `orgName` is required. `reject` forces that invite's
  // accept/decline rejection (`needs_upgrade` 403 / `already_member` 409 /
  // `invite_not_found` 404) so the error paths are reachable. Pair with
  // `/__test__/capabilities` `{ spaces:true }` — the sidebar card is
  // capability-gated on the CLIENT, not here. `{ invites: [] }` (and reset)
  // empties the inbox.
  if (path === "/__test__/space-invites" && method === "POST") {
    return handleSpaceInvitesControl(await parseBody(req));
  }
  // Arm the C19 personal plan: the PlanSummary `GET /v1/me/plan` serves, the
  // invoices/routines, the Stripe URLs, and the chat send's `429
  // message_limit`. Also advertises the `plan` capability (the gateway's one
  // switch drives both); `{ summary: null }` (and reset) turns both off.
  if (path === "/__test__/plan" && method === "POST") {
    return handlePlanControl(await parseBody(req));
  }
  // Arm the free-org pick `GET /v1/me/billing-choice` serves; `{ choice: null }`
  // (and reset) is a gateway that predates it.
  if (path === "/__test__/billing-choice" && method === "POST") {
    return handleBillingChoiceControl(await parseBody(req));
  }
  if (path === "/__test__/billing-choice-calls" && method === "GET") {
    return handleBillingChoiceCallsControl();
  }
  // The plan-call ledger: every plan route hit (and refused send) since arming.
  if (path === "/__test__/plan-calls" && method === "GET") {
    return handlePlanCallsControl();
  }
  // Seed a connection at a status the UI can't be clicked into: `pending` (an
  // abandoned sign-in) or `error` (the provider refused). `{toolkit, status}`.
  if (path === "/__test__/integrations-connection" && method === "POST") {
    const body = await parseBody(req);
    const status = body?.status;
    return json({
      connection: state.seedConnection(
        String(body?.toolkit ?? ""),
        status === "active" || status === "error" ? status : "pending",
        {
          ...(typeof body?.accountLabel === "string" && body.accountLabel
            ? { accountLabel: body.accountLabel }
            : {}),
          // Mint a NEW connection even when the toolkit already has one, so a
          // spec can stack several accounts on one app (HOU-901).
          ...(body?.extraAccount === true ? { extraAccount: true } : {}),
        },
      ),
    });
  }
  // Flip a pending connection to active (models the OAuth completing).
  if (path === "/__test__/integrations-activate" && method === "POST") {
    const body = await parseBody(req);
    return json({
      activated: state.activateConnection(String(body?.connectionId ?? "")),
    });
  }

  return undefined;
}

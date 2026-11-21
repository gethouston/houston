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
  if (path === "/__test__/space-invites" && method === "POST") {
    return handleSpaceInvitesControl(await parseBody(req));
  }
  if (path === "/__test__/plan" && method === "POST") {
    return handlePlanControl(await parseBody(req));
  }
  if (path === "/__test__/billing-choice" && method === "POST") {
    return handleBillingChoiceControl(await parseBody(req));
  }
  if (path === "/__test__/billing-choice-calls" && method === "GET") {
    return handleBillingChoiceCallsControl();
  }
  if (path === "/__test__/plan-calls" && method === "GET") {
    return handlePlanCallsControl();
  }
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
          ...(body?.extraAccount === true ? { extraAccount: true } : {}),
        },
      ),
    });
  }
  if (path === "/__test__/integrations-activate" && method === "POST") {
    const body = await parseBody(req);
    return json({
      activated: state.activateConnection(String(body?.connectionId ?? "")),
    });
  }

  return undefined;
}

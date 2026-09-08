import type { AssistantGateway } from "../routes/assistant-forward";
import type { EntityDirectory } from "./entity-directory";
import {
  activityEntity,
  gatewayAgent,
  inviteEntity,
  memberEntity,
  namedEntity,
  record,
  skillEntity,
} from "./entity-directory-wire";

export interface GatewayDirectoryInput {
  gateway: AssistantGateway;
  agentId: string;
  /** Gateway identity can differ from the pod's directory-derived id. */
  gatewayAgentId?: string;
  actingAs?: string;
  fetchImpl?: typeof fetch;
}

/** The gateway authorizes every list with the host credential and acting identity. */
export function gatewayEntityDirectory(
  input: GatewayDirectoryInput,
): EntityDirectory {
  const { gateway, agentId, gatewayAgentId } = input;
  async function read<T>(
    path: string,
    parse: (row: Record<string, unknown>) => T,
    envelope = false,
  ): Promise<T[]> {
    const response = await (input.fetchImpl ?? fetch)(`${gateway.url}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${gateway.token}`,
        ...(input.actingAs ? { "x-houston-acting-as": input.actingAs } : {}),
      },
    });
    if (!response.ok)
      throw new Error(
        `entity directory request failed (${response.status}): ${path}`,
      );
    const payload: unknown = await response.json();
    // Agent-data routes serve document envelopes; gateway collection routes serve arrays.
    const list: unknown = envelope ? record(payload).items : payload;
    if (!Array.isArray(list))
      throw new Error(`entity directory returned an invalid list: ${path}`);
    return list.map((item) => parse(record(item)));
  }
  const agentPath = (id: string, family: string) =>
    `/agents/${encodeURIComponent(id)}/${family}`;
  return {
    agents: async () =>
      (await read("/agents", gatewayAgent))
        .filter((a) => a.id !== agentId && a.id !== gatewayAgentId)
        .map((a) => ({
          agent: {
            id: a.id,
            name: a.name,
            workspaceId: a.workspaceId ?? "",
            createdAt: 0,
          },
          workspace: {
            id: a.workspaceId ?? "",
            name: a.workspaceId ?? "",
            ownerUserId: "",
            kind: "personal" as const,
            slug: a.workspaceId ?? "",
            runtime: "local" as const,
            createdAt: 0,
          },
        })),
    teams: () => read("/v1/org/teams", namedEntity),
    workspaces: () => read("/v1/workspaces", namedEntity),
    members: () => read("/v1/org/people", memberEntity),
    invites: () => read("/v1/org/invites", inviteEntity),
    routines: (id) => read(agentPath(id, "routines"), namedEntity, true),
    skills: (id) => read(agentPath(id, "skills"), skillEntity, true),
    sharedSkills: (id) =>
      read(
        `/v1/workspaces/${encodeURIComponent(id)}/shared-skills`,
        skillEntity,
        true,
      ),
    activities: (id) => read(agentPath(id, "activities"), activityEntity, true),
  };
}

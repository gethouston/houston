import type { AssistantGateway } from "./assistant-forward";
import type { MissionTargetDirectory } from "./missions-directory";

/** The client-facing agent shape the gateway lists (`toAgentJson`). */
interface GatewayAgent {
  id: string;
  name: string;
  workspaceId?: string;
}

const isGatewayAgent = (value: unknown): value is GatewayAgent =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as GatewayAgent).id === "string" &&
  typeof (value as GatewayAgent).name === "string";

/**
 * The user's agents as the gateway knows them. An unreachable or unreadable
 * gateway is an ERROR, never an empty list: answering "there is no agent
 * called Dobby" because the network hiccuped would teach the model a lie.
 */
export function gatewayMissionDirectory(
  gateway: AssistantGateway,
  opts: {
    fetchImpl?: typeof fetch;
    actingAs?: string;
    excludeIds?: readonly string[];
  } = {},
): MissionTargetDirectory {
  return {
    async list() {
      const unreadable = {
        ok: false,
        status: 502,
        code: "agents_unreadable",
        error: "could not reach the other agents right now - try again",
      } as const;
      let response: Response;
      try {
        response = await (opts.fetchImpl ?? fetch)(`${gateway.url}/agents`, {
          headers: {
            Authorization: `Bearer ${gateway.token}`,
            ...(opts.actingAs ? { "x-houston-acting-as": opts.actingAs } : {}),
          },
        });
      } catch (err) {
        console.error("[missions] could not list agents from the gateway", err);
        return unreadable;
      }
      if (!response.ok) {
        console.error(
          `[missions] the gateway refused the agent list (${response.status})`,
        );
        return unreadable;
      }
      const payload: unknown = await response.json().catch(() => null);
      if (!Array.isArray(payload)) {
        console.error("[missions] the gateway's agent list was not a list");
        return unreadable;
      }
      const candidates = payload
        .filter(isGatewayAgent)
        .filter((a) => !opts.excludeIds?.includes(a.id))
        .map((a) => ({
          remote: true as const,
          id: a.id,
          name: a.name,
          workspace: a.workspaceId ?? "",
          workspaceId: a.workspaceId ?? "",
        }));
      return { ok: true, candidates };
    },
  };
}

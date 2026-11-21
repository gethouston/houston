import { isAgentDelegationRefusalCode } from "@houston/protocol";
import type { AssistantGateway } from "./assistant-forward";
import { delegationRefusal } from "./mission-delegation-refusals";
import type { MissionTargetDirectory } from "./missions-directory";

interface GatewayAgent {
  id: string;
  name: string;
  workspaceId?: string;
  role?: string;
}

const isGatewayAgent = (value: unknown): value is GatewayAgent =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as GatewayAgent).id === "string" &&
  typeof (value as GatewayAgent).name === "string";

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
        if (response.status === 403 || response.status === 409) {
          let refusal: unknown;
          try {
            refusal = await response.json();
          } catch (err) {
            console.error(
              "[missions] gateway returned unreadable delegation refusal",
              err,
            );
          }
          const code = (refusal as { code?: unknown } | null)?.code;
          if (isAgentDelegationRefusalCode(code))
            return {
              ok: false,
              ...delegationRefusal(code),
              status: response.status,
            };
        }
        console.error(
          `[missions] the gateway refused the agent list (${response.status})`,
        );
        return unreadable;
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch (err) {
        console.error("[missions] gateway returned unreadable agent list", err);
        return unreadable;
      }
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
          ...(a.role ? { role: a.role } : {}),
        }));
      return { ok: true, candidates };
    },
  };
}

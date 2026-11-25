import { assistantRuntimeRole } from "../launcher/assistant-role";
import type { AssistantGateway } from "./assistant-forward";
import { resolveAssistantGateway } from "./assistant-wiring";
import type { MissionsCtx } from "./missions-sandbox";

export type MissionGateway = {
  gateway: AssistantGateway;
  actingAs?: string;
  kind: "assistant" | "agent-caller";
};
export type MissionGatewayResult =
  | { ok: true; value: MissionGateway | null }
  | { ok: false; code: "no_acting_person" };

let loggedMissing = false;

export function resolveMissionGateway(
  ctx: MissionsCtx,
  env: NodeJS.ProcessEnv = process.env,
): MissionGatewayResult {
  if (!ctx.deps.gatewayFronted) return { ok: true, value: null };
  if (assistantRuntimeRole({ agentId: ctx.agent.id })) {
    const gateway = resolveAssistantGateway({ env });
    return {
      ok: true,
      value: gateway
        ? { gateway, kind: "assistant", actingAs: ctx.actingAs }
        : null,
    };
  }
  const pooled = ctx.deps.pooledTurn;
  if (pooled) {
    if (!ctx.actingAs) return { ok: false, code: "no_acting_person" };
    return {
      ok: true,
      value: {
        gateway: pooled.gateway,
        actingAs: ctx.actingAs,
        kind: "agent-caller",
      },
    };
  }
  const url = env.HOUSTON_INTEGRATIONS_URL?.trim();
  const token = env.HOUSTON_HOST_TOKEN?.trim();
  if (!url || !token || !/^[0-9a-f]{64}$/.test(token)) {
    if (!loggedMissing) {
      console.error(
        "[missions] agent-caller gateway off: set HOUSTON_INTEGRATIONS_URL and a 64-character HOUSTON_HOST_TOKEN",
      );
      loggedMissing = true;
    }
    return { ok: true, value: null };
  }
  if (!ctx.actingAs) return { ok: false, code: "no_acting_person" };
  return {
    ok: true,
    value: {
      gateway: { url: url.replace(/\/+$/, ""), token },
      actingAs: ctx.actingAs,
      kind: "agent-caller",
    },
  };
}

import { invalidAgentNameMessage, validateAgentName } from "@houston/domain";
import { channelFor, noChannel } from "./agent-authz";
import { clearAgentColor, moveAgentColor } from "./agent-color";
import { pruneAgentDelegation } from "./agent-delegation-store";
import { refuseReservedAgentName } from "./agent-name-reserved";
import { answerAgentNameTaken } from "./agent-name-taken";
import { rewriteOriginAgent } from "./agent-origin-rename";
import {
  renameWithDelegation,
  withAgentPolicyLock,
} from "./agent-rename-policy";
import { forgetAgentState } from "./agent-state-cleanup";
import { agentPayload } from "./agents-payload";
import { json, readJson } from "./http";
import { defineRoute } from "./registry";

const HERE = "packages/host/src/routes/agents-modify.ts";

async function cleanup(
  label: string,
  run: () => Promise<unknown>,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.error(`[agents] ${label} failed after agent change:`, error);
  }
}

defineRoute({
  group: "agent-crud",
  method: "PATCH",
  path: "/agents/:agentId",
  phase: "agent",
  classification: "sdk",
  source: HERE,
  async handler({ deps, userId, authz, agentId, req, res }) {
    const { name: rawName } = await readJson(req);
    if (!rawName || typeof rawName !== "string")
      return json(res, 400, { error: "missing 'name'" });
    const renameCheck = validateAgentName(rawName);
    if (!renameCheck.ok)
      return json(res, 400, {
        error: invalidAgentNameMessage(renameCheck.reason),
      });
    const name = renameCheck.name;
    if (refuseReservedAgentName(deps, res, name, authz.agent.name)) return;
    let result: Awaited<ReturnType<typeof renameWithDelegation>>;
    try {
      result = await renameWithDelegation({
        deps,
        workspace: authz.workspace,
        agent: authz.agent,
        name,
      });
    } catch (err) {
      if (answerAgentNameTaken(res, err)) return;
      throw err;
    }
    const { renamed, policyError } = result;
    if (renamed.id !== agentId) forgetAgentState(agentId);
    const vfs = deps.vfs;
    if (vfs) {
      await cleanup(`color move for ${agentId}`, async () => {
        const colorWs = await deps.store.getOrCreatePersonalWorkspace(userId);
        await moveAgentColor(vfs, colorWs.id, agentId, renamed.id);
      });
      await cleanup(`origin rewrite for ${agentId}`, () =>
        rewriteOriginAgent(deps, authz.workspace, agentId, renamed.id),
      );
    }
    deps.events?.emit(authz.workspace.ownerUserId, {
      type: "AgentsChanged",
      workspaceId: authz.workspace.id,
    });
    if (policyError) throw policyError;
    json(res, 200, await agentPayload(deps, authz.workspace, renamed));
  },
});

defineRoute({
  group: "agent-crud",
  method: "DELETE",
  path: "/agents/:agentId",
  phase: "agent",
  classification: "sdk",
  source: HERE,
  async handler({ deps, userId, authz, agentId, res }) {
    return withAgentPolicyLock(authz.workspace.id, async () => {
      const channel = channelFor(deps, authz.workspace);
      if (!channel) return noChannel(res, authz.workspace.runtime);
      const ctx = { workspace: authz.workspace, agent: authz.agent };
      const doDelete = async () => {
        await channel.teardown(ctx);
        await deps.store.deleteAgent(agentId);
      };
      if (channel.withQuiesced) await channel.withQuiesced(ctx, doDelete);
      else await doDelete();
      forgetAgentState(agentId);
      const vfs = deps.vfs;
      if (vfs) {
        await cleanup(`color clear for ${agentId}`, async () => {
          const colorWs = await deps.store.getOrCreatePersonalWorkspace(userId);
          await clearAgentColor(vfs, colorWs.id, agentId);
        });
        await cleanup(`delegation prune for ${agentId}`, () =>
          pruneAgentDelegation(vfs, authz.workspace.id, agentId),
        );
        await cleanup(`origin clear for ${agentId}`, () =>
          rewriteOriginAgent(deps, authz.workspace, agentId, undefined),
        );
      }
      deps.events?.emit(authz.workspace.ownerUserId, {
        type: "AgentsChanged",
        workspaceId: authz.workspace.id,
      });
      json(res, 200, { ok: true });
    });
  },
});

import { invalidAgentNameMessage, validateAgentName } from "@houston/domain";
import type { Agent } from "../domain/types";
import { AgentNameConflictError } from "../ports";
import { channelFor, noChannel } from "./agent-authz";
import { clearAgentColor, moveAgentColor } from "./agent-color";
import { forgetAgentState } from "./agent-state-cleanup";
import { agentPayload } from "./agents-payload";
import { json, readJson } from "./http";
import { defineRoute } from "./registry";

/**
 * Rename and delete one agent (owner-only — in personal mode, everyone for
 * their own). Both run inside the channel's quiesced span, for the same reason:
 * a live runtime holds absolute paths into the agent's directory.
 */
const HERE = "packages/host/src/routes/agents-modify.ts";

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
    // Rename inside the channel's quiesced span: the standing runtime is
    // stopped (confirmed exit — SIGKILL escalation, loud failure) AND the
    // id is latched against respawn until the directory has moved. A warm
    // local runtime holds absolute paths into the OLD directory (cwd +
    // HOUSTON_DATA_DIR), so a rename under it leaks the process and its
    // next write (conversation store, usage ledger — all mkdir-recursive)
    // RESURRECTS the old-named folder, which the directory-derived local
    // store re-lists as an agent with the old name ("my rename reverted").
    // The latch closes the second half of HOU-827: the app's reconnect
    // storm dispatches with the OLD id within ~500ms of the stop, and an
    // unlatched ensureAwake booted a fresh runtime into the directory
    // being renamed. On Windows the live child's cwd even locks the
    // directory against the rename itself. The runtime respawns on the
    // next dispatch (pi's continueRecent restores its sessions from the
    // renamed tree). A quiesce failure surfaces — never rename under a
    // live runtime.
    const doRename = () => deps.store.renameAgent(agentId, name);
    const channel = channelFor(deps, authz.workspace);
    let renamed: Agent;
    try {
      renamed =
        name !== authz.agent.name && channel?.withQuiesced
          ? await channel.withQuiesced(
              { workspace: authz.workspace, agent: authz.agent },
              doRename,
            )
          : await doRename();
    } catch (err) {
      if (err instanceof AgentNameConflictError)
        return json(res, 409, { error: err.message });
      throw err;
    }
    // The old id is free the moment the directory moves, so nothing this
    // process still holds under it may outlive the rename
    // (routes/agent-state-cleanup.ts).
    if (renamed.id !== agentId) forgetAgentState(agentId);
    // The id moved with the directory, so the color entry must move too
    // (routes/agent-color.ts) or the renamed agent renders the default.
    if (deps.vfs) {
      const colorWs = await deps.store.getOrCreatePersonalWorkspace(userId);
      await moveAgentColor(deps.vfs, colorWs.id, agentId, renamed.id);
    }
    deps.events?.emit(authz.workspace.ownerUserId, {
      type: "AgentsChanged",
      workspaceId: authz.workspace.id,
    });
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
  // Tear the agent's runtime-side state down first (so a failure is retryable
  // with the record intact), then drop the record. Errors surface — never a
  // silent orphan. Same quiesced span as rename (HOU-827's sibling): a stale
  // dispatch landing between the teardown and the directory removal would
  // respawn a runtime into the doomed directory, whose next write recreates it
  // — a DELETED agent reappearing in the sidebar.
  async handler({ deps, userId, authz, agentId, res }) {
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
    // A local agent's id is its path, so a future agent can reuse it — leaving
    // the entry behind would hand it a dead agent's color.
    if (deps.vfs) {
      const colorWs = await deps.store.getOrCreatePersonalWorkspace(userId);
      await clearAgentColor(deps.vfs, colorWs.id, agentId);
    }
    deps.events?.emit(authz.workspace.ownerUserId, {
      type: "AgentsChanged",
      workspaceId: authz.workspace.id,
    });
    json(res, 200, { ok: true });
  },
});

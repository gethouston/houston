import type { HoustonEvent } from "@houston-ai/core";
import { postTurnAgentKeys } from "./agent-invalidation-keys.ts";
import type {
  InvalidationContext,
  InvalidationPlan,
} from "./agent-invalidation-types.ts";
import { queryKeys } from "./query-keys.ts";
import { eventTargetsOpenWorkspace } from "./space-id.ts";

const empty = (): InvalidationPlan => ({
  invalidate: [],
  patchAllConversations: [],
});

export function planInvalidation(
  ev: HoustonEvent,
  ctx: InvalidationContext,
): InvalidationPlan {
  const plan = empty();
  const open = ctx.workspaceId;

  switch (ev.type) {
    case "ActivityChanged":
      plan.invalidate.push(queryKeys.activity(ev.data.agent_path));
      plan.patchAllConversations.push(ev.data.agent_path);
      break;
    case "SkillsChanged":
      plan.invalidate.push(queryKeys.skills(ev.data.agent_path));
      plan.invalidate.push(queryKeys.skillsManifest(ev.data.agent_path));
      plan.invalidate.push(["skill-detail", ev.data.agent_path]);
      break;
    case "SharedSkillsChanged":
      plan.invalidate.push(["shared-skills"]);
      break;
    case "FilesChanged":
      plan.invalidate.push(queryKeys.files(ev.data.agent_path));
      plan.invalidate.push(queryKeys.filePreviewPdfs(ev.data.agent_path));
      break;
    case "ConfigChanged":
      plan.invalidate.push(queryKeys.config(ev.data.agent_path));
      break;
    case "ContextChanged":
      plan.invalidate.push(queryKeys.instructions(ev.data.agent_path));
      plan.invalidate.push(queryKeys.workspaceContext(ev.data.agent_path));
      break;
    case "AgentRoleChanged":
      if (open && (ctx.isKnownAgent?.(ev.data.agent_path) ?? true)) {
        plan.reloadAgentsWorkspace = open;
      }
      break;
    case "ConversationsChanged":
      plan.patchAllConversations.push(ev.data.agent_path);
      plan.invalidate.push(queryKeys.chatHistoryForAgent(ev.data.agent_path));
      break;
    case "RoutinesChanged":
      plan.invalidate.push(queryKeys.routines(ev.data.agent_path));
      plan.invalidate.push(queryKeys.memberRoutines());
      break;
    case "RoutineRunsChanged":
      plan.invalidate.push(["routine-runs", ev.data.agent_path]);
      break;
    case "LearningsChanged":
      plan.invalidate.push(queryKeys.learnings(ev.data.agent_path));
      break;
    case "AgentsChanged":
      if (open && eventTargetsOpenWorkspace(ev.data.workspace_id, open)) {
        plan.reloadAgentsWorkspace = open;
        plan.invalidate.push(["agent-delegation"]);
      }
      break;
    case "SidebarLayoutChanged":
      if (open && eventTargetsOpenWorkspace(ev.data.workspace_id, open)) {
        plan.invalidate.push(queryKeys.sidebarLayout(open));
      }
      break;
    case "HeartbeatChanged":
      plan.invalidate.push(queryKeys.heartbeat());
      break;
    case "PreferencesChanged":
      plan.invalidate.push(queryKeys.preferences());
      break;
    case "SessionStatus":
      if (ev.data.status === "completed" || ev.data.status === "error") {
        const agentPath = ev.data.agent_path;
        plan.invalidate.push(queryKeys.activity(agentPath));
        plan.patchAllConversations.push(agentPath);
        plan.invalidate.push(...postTurnAgentKeys(agentPath));
      }
      break;
    case "ProviderLoginComplete":
      plan.invalidate.push(queryKeys.providerStatuses());
      plan.invalidate.push(queryKeys.providerUsage());
      plan.focusWindow = true;
      break;
    case "CustomIntegrationsChanged":
      plan.invalidate.push(queryKeys.customIntegrations());
      plan.invalidate.push(["integration-connections"]);
      if (ctx.customOAuthReturn) plan.focusWindow = true;
      break;
    case "EventStreamReconnected":
      plan.invalidateAll = true;
      if (open) plan.reloadAgentsWorkspace = open;
      break;
  }

  if (ctx.isKnownAgent) {
    const known = ctx.isKnownAgent;
    plan.patchAllConversations = plan.patchAllConversations.filter(known);
  }
  return plan;
}

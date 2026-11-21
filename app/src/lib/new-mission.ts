import { missionControlDraftScope } from "../components/board/mission-control-scope.ts";
import { useAgentStore } from "../stores/agents.ts";
import {
  newConversationDraftKey,
  newTaskHeldBySeed,
  seedDraft,
} from "../stores/drafts.ts";
import { useUIStore } from "../stores/ui.ts";
import { openHome } from "./home-nav.ts";
import { openMissionChat } from "./mission-chat.ts";
import type { NewMissionScope } from "./new-mission-scope.ts";
import { openAgentBoard, openComposeBoard } from "./open-agent.ts";
import { isMissionBoardView } from "./top-level-views.ts";
import type { Agent } from "./types.ts";
import { isMobileViewport } from "./viewport.ts";

export function startNewMission(
  scope: NewMissionScope = { kind: "home" },
): void {
  if (newTaskHeldBySeed()) return;
  if (isMobileViewport()) {
    if (composeScoped(scope)) return;
    composeOverWholeRoster();
    return;
  }
  const ui = useUIStore.getState();
  const fire = () => useUIStore.getState().onStartMission?.();
  if (isMissionBoardView(ui.viewMode) && ui.onStartMission) {
    fire();
    return;
  }
  openComposeBoard();
  setTimeout(fire, 50);
}

function composeScoped(scope: NewMissionScope): boolean {
  if (scope.kind === "agent") {
    const agent = useAgentStore
      .getState()
      .agents.find((a) => a.id === scope.agentId);
    if (!agent) return false;
    openMissionChat(agent, null);
    return true;
  }
  return false;
}

function composeOverWholeRoster(): void {
  const { agents } = useAgentStore.getState();
  if (agents.length === 0) {
    openHome();
    return;
  }
  askRoster(agents, undefined);
}

function askRoster(roster: Agent[], scopeIds: string[] | undefined): void {
  if (roster.length === 1) {
    openMissionChat(roster[0], null);
    return;
  }
  useUIStore.getState().setNewMissionSheetOpen(true, scopeIds);
}

export function composeTaskFor(agent: Agent, draft: string): () => void {
  if (isMobileViewport()) {
    const end = seedDraft(
      newConversationDraftKey(missionControlDraftScope()),
      draft,
    );
    openMissionChat(agent, null);
    return end;
  }
  const end = seedDraft(
    newConversationDraftKey(missionControlDraftScope(agent.id)),
    draft,
  );
  useUIStore.getState().requestNewTask(agent.id);
  openAgentBoard(agent.id);
  return end;
}

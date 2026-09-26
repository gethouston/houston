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

/**
 * Compose on the current employee's board when it is mounted. Otherwise open
 * a board first (`openComposeBoard`). The phone uses its scoped chat picker.
 */
export function startNewMission(
  scope: NewMissionScope = { kind: "home" },
): void {
  // A seeded composer (the email lesson's ask) keeps its words until the
  // lesson moves on; a New task opened by hand waits for it.
  if (newTaskHeldBySeed()) return;
  // The phone fork, before any board handler: composing on the phone is the
  // agent picker sheet into an empty draft CHAT push (`lib/mission-chat.ts`),
  // never the desktop board's side composer. One agent skips the question.
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

/**
 * The scoped phone compose, or `false` when the scope named nothing usable —
 * a deleted agent falls through to the roster-wide
 * question rather than dead-ending on a stale id.
 */
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

/** The unscoped compose: the whole workspace roster, or home when it holds
 *  no agents at all — the one teamless fallback every nav shares. */
function composeOverWholeRoster(): void {
  const { agents } = useAgentStore.getState();
  if (agents.length === 0) {
    openHome();
    return;
  }
  askRoster(agents, undefined);
}

/** One agent skips the question; several open the picker sheet, narrowed to
 *  `scopeIds` when the caller had a shortlist (`undefined` = everyone). */
function askRoster(roster: Agent[], scopeIds: string[] | undefined): void {
  if (roster.length === 1) {
    openMissionChat(roster[0], null);
    return;
  }
  useUIStore.getState().setNewMissionSheetOpen(true, scopeIds);
}

/**
 * Open `agent`'s New task composer with `draft` already typed in, the way the
 * user would reach it by hand: on the desktop, the agent's board with its
 * composer open (the board takes `newTaskRequest`); on the phone, the empty
 * draft chat. The words are a SEED ({@link seedDraft}): the composer shows
 * them in a slot of their own, so a draft the user had parked there is never
 * touched. Sending stays the user's own act.
 *
 * Returns the end of the seed, for the caller to run once it is done with the
 * composer, whether or not the words were sent.
 */
export function composeTaskFor(agent: Agent, draft: string): () => void {
  if (isMobileViewport()) {
    // The phone's chat reads the Mission Control scope (`use-mission-chat-source.ts`).
    const end = seedDraft(
      newConversationDraftKey(missionControlDraftScope()),
      draft,
    );
    openMissionChat(agent, null);
    return end;
  }
  // An employee's board saves its composer under its own scope
  // (`use-agent-board-scope.ts`).
  const end = seedDraft(
    newConversationDraftKey(missionControlDraftScope(agent.id)),
    draft,
  );
  useUIStore.getState().requestNewTask(agent.id);
  openAgentBoard(agent.id);
  return end;
}

import { join } from "node:path";
import type { ProviderOption } from "@houston/domain";
import { processAssistantCatalog } from "@houston/host/src/assistant/catalog-source";
import { piProviderIds } from "../ai/pi-catalog";
import { connectedProviderChoices } from "../ai/provider-choices";
import type { PiBackendDeps } from "../backends/pi/backend";
import { makeAssistantTools } from "../session/tools/assistant";
import type { AssistantToolOptions } from "../session/tools/assistant-call";
import { makeCoordinatorCredentialTool } from "../session/tools/coordinator-credential";
import { makeRequestConnectionTool } from "../session/tools/integrations";
import { makeMissionTools } from "../session/tools/missions";
import { makeReadMissionTool } from "../session/tools/read-mission";
import { getHistoryAt } from "../store/conversation-file";
import type { ArchiveLoader } from "./turn-archive-fetch";
import type { TurnSessionRequest } from "./turn-session";

/**
 * The AI Manager's own tools on a pooled turn: the operation family and the
 * mission tools, both over THIS turn's sandbox facade, which is where the
 * turn's Houston credential lives (never in the tools).
 *
 * A long-lived coordinator builds the same set once per process
 * (session/assistant-family.ts, session/host-tools.ts). A pool worker cannot:
 * the turn, not the process, says whether it is the coordinator.
 */

/** The turn's own data directory and hydrated agent workspace. */
export interface TurnToolDirs {
  dataDir: string;
  workspaceDir: string;
}

/** The family's catalog and transport, or undefined when this turn is not
 *  the coordinator, has no facade, or the build carries no readable catalog. */
export function turnAssistantOptions(
  turn: TurnSessionRequest,
): AssistantToolOptions | undefined {
  if (turn.role !== "coordinator" || !turn.sandbox) return undefined;
  const catalog = processAssistantCatalog();
  return catalog ? { catalog, call: turn.sandbox.call } : undefined;
}

/**
 * `dirs` are the turn's own: houston_recall searches the transcript and the
 * memories this turn hydrated, not the process's (empty) stores. The connection card and the
 * key-entry tool are here rather than behind the `integrations` scope: Houston
 * never runs an integration, so the gateway does not grant it one.
 */
export function buildTurnCoordinatorTools(
  turn: TurnSessionRequest,
  dirs: TurnToolDirs,
  loadArchive?: ArchiveLoader,
): PiBackendDeps["customTools"] {
  const assistant = turnAssistantOptions(turn);
  if (!assistant) return [];
  const conversations = join(dirs.dataDir, "conversations");
  // houston_recall searches the whole transcript: the archive segments the
  // hot set left remote land first (turn-archive-fetch.ts).
  const readHistory = async (id: string) => {
    await loadArchive?.(id, {});
    return getHistoryAt(conversations, id);
  };
  return [
    ...makeAssistantTools(assistant, {
      readHistory,
      workspaceDir: dirs.workspaceDir,
    }),
    ...makeMissionTools({
      call: assistant.call,
      personalAssistant: true,
      providers: missionProviders(),
      resolveProviders: missionProviders,
    }),
    makeReadMissionTool({ call: assistant.call, personalAssistant: true }),
    makeRequestConnectionTool(),
    makeCoordinatorCredentialTool(assistant),
  ];
}

/**
 * The providers a mission may pin, by catalog. A worker's own credential
 * store holds nothing (the turn's credential lives in the turn's data dir),
 * so whether one is connected is for the agent the mission lands on to judge,
 * against its own credentials and endpoint settings, exactly as when Houston
 * runs on its pod.
 */
function missionProviders(): ProviderOption[] {
  const curated = connectedProviderChoices().map((option) => ({
    ...option,
    connected: true,
  }));
  // Every provider the engine knows, not only those this worker could run:
  // an empty model list is the open-catalog signal, so the pin's model rides
  // through as written for the target to judge.
  const known = new Set(curated.map((option) => option.id));
  const others = piProviderIds()
    .filter((id) => !known.has(id))
    .map((id) => ({ id, name: id, connected: true, models: [] }));
  return [...curated, ...others];
}

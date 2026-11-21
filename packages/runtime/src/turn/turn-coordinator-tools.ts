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

export function turnAssistantOptions(
  turn: TurnSessionRequest,
): AssistantToolOptions | undefined {
  if (turn.role !== "coordinator" || !turn.sandbox) return undefined;
  const catalog = processAssistantCatalog();
  return catalog ? { catalog, call: turn.sandbox.call } : undefined;
}

export function buildTurnCoordinatorTools(
  turn: TurnSessionRequest,
  dataDir: string,
  loadArchive?: ArchiveLoader,
): PiBackendDeps["customTools"] {
  const assistant = turnAssistantOptions(turn);
  if (!assistant) return [];
  const conversations = join(dataDir, "conversations");
  const readHistory = async (id: string) => {
    await loadArchive?.(id, {});
    return getHistoryAt(conversations, id);
  };
  return [
    ...makeAssistantTools(assistant, readHistory),
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

function missionProviders(): ProviderOption[] {
  const curated = connectedProviderChoices().map((option) => ({
    ...option,
    connected: true,
  }));
  const known = new Set(curated.map((option) => option.id));
  const others = piProviderIds()
    .filter((id) => !known.has(id))
    .map((id) => ({ id, name: id, connected: true, models: [] }));
  return [...curated, ...others];
}

import type { CitationsModule } from "@houston/sdk";
import { getEngine } from "./engine";
import { engineCall } from "./tauri";

export const citationsFacade = {
  source: () => getEngine().engineSdk,
  module: (): CitationsModule => getEngine().engineSdk.citations,
  compose: (agentPath: string, draftKey: string, text: string) =>
    engineCall("compose_citations", () =>
      getEngine().composeCitations(agentPath, draftKey, text),
    ),
};

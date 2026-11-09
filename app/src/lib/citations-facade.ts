/**
 * File comments as the app reaches them: the draft lists the composer chips
 * and the preview marks read (SDK state, read straight off the engine's SDK),
 * and the send fold, wrapped in the same error-surfacing policy every other
 * engine call gets. Its own file for the reason `agents-facade.ts` gives.
 */

import type { CitationsModule } from "@houston/sdk";
import { getEngine } from "./engine";
import { engineCall } from "./tauri";

export const citationsFacade = {
  /** The snapshot source `useSdkSnapshot` subscribes a draft's list on. */
  source: () => getEngine().engineSdk,
  module: (): CitationsModule => getEngine().engineSdk.citations,
  /** Upload the draft's crops and fold its comments into `text`. */
  compose: (agentPath: string, draftKey: string, text: string) =>
    engineCall("compose_citations", () =>
      getEngine().composeCitations(agentPath, draftKey, text),
    ),
};

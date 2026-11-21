import type { Capabilities } from "@houston/engine-adapter";
import { createComposerPrewarm } from "./composer-prewarm";
import { describeError } from "./describe-error";
import { getEngine } from "./engine";
import { reportError } from "./error-report";
import { queryClient } from "./query-client";
import { queryKeys } from "./query-keys";
import { engineCall } from "./tauri";

export const composerPrewarm = createComposerPrewarm({
  engine: () => ({
    draftChanged: (draft, capabilities) =>
      engineCall(
        "prewarm_conversation",
        () => getEngine().draftChanged(draft, capabilities),
        undefined,
        { surface: false },
      ),
    claimNewConversationId: (draftKey) =>
      getEngine().claimNewConversationId(draftKey),
  }),
  capabilities: () =>
    queryClient.getQueryData<Capabilities>(queryKeys.capabilities()),
  report: (command, err) => reportError(command, describeError(err), err),
});

/**
 * Warm-while-typing as the app reaches it: the composer prewarm bound to the
 * live engine and the capability snapshot the app already holds.
 *
 * Part of `./tauri` rather than a layer of its own, in its own file for the
 * reason `./delegation-facade` is: it reaches the engine through `getEngine()`
 * and its failures through `engineCall` (`scripts/check-boundaries.mjs` rule D
 * names this file for that reason). The call takes no surface of its own
 * (`surface: false`, logged only) because a keystroke must never raise a
 * toast; the composer reports the failure instead, to Sentry, with offline and
 * waking failures on the quiet path. The send it was warming for works
 * without it.
 */

import type { Capabilities } from "@houston/engine-adapter";
import { createComposerPrewarm } from "./composer-prewarm";
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
  // `engineCall` already wrote the log line, so this is the Sentry half only.
  report: (command, err) =>
    reportError(command, err instanceof Error ? err.message : String(err), err),
});

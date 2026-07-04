/**
 * Standalone entry: `pnpm --filter @houston/fake-host start`.
 *
 * The Playwright config boots this as a `webServer`. It starts the host on the
 * default port and lets the process live until the harness tears it down.
 */

import { startFakeHost } from "./server";

startFakeHost().catch((err: unknown) => {
  console.error("[fake-host] failed to start:", err);
  process.exit(1);
});

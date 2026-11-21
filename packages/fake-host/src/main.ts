import { startFakeHost } from "./server";

startFakeHost().catch((err: unknown) => {
  console.error("[fake-host] failed to start:", err);
  process.exit(1);
});

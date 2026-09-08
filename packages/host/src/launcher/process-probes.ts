import { createServer } from "node:net";

/** Default free-port allocator: bind :0, read the assigned port, release it. */
export function osAllocatePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/**
 * How long a spawned runtime gets to bind its port and answer /health. A cold
 * boot inside a CPU-capped engine pod measures ~10.5s - the old 10s budget lost
 * that race by milliseconds and SIGTERM'd runtimes right as they logged
 * "runtime listening" (surfacing as "never became healthy" on the first message
 * to a fresh agent). Generous is safe here: a runtime that DIES during boot
 * fails fast via the launcher's onExit abort and never waits this out.
 */
const BOOT_HEALTH_BUDGET_MS = 60_000;

/** Default health probe: GET /health until 200 or the boot budget elapses. */
export async function pollHealth(port: number): Promise<void> {
  const deadline = Date.now() + BOOT_HEALTH_BUDGET_MS;
  for (;;) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      if (r.ok) {
        await r.text();
        return;
      }
    } catch {
      // not up yet
    }
    if (Date.now() > deadline)
      throw new Error(
        `runtime on port ${port} never became healthy within ${BOOT_HEALTH_BUDGET_MS / 1000}s`,
      );
    await new Promise((r) => setTimeout(r, 100));
  }
}

import { createServer } from "node:net";

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

const BOOT_HEALTH_BUDGET_MS = 60_000;

export async function pollHealth(port: number): Promise<void> {
  const deadline = Date.now() + BOOT_HEALTH_BUDGET_MS;
  for (;;) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      if (r.ok) {
        await r.text();
        return;
      }
    } catch {}
    if (Date.now() > deadline)
      throw new Error(
        `runtime on port ${port} never became healthy within ${BOOT_HEALTH_BUDGET_MS / 1000}s`,
      );
    await new Promise((r) => setTimeout(r, 100));
  }
}

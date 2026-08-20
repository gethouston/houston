import type { WorkspaceStore } from "../ports";
import { VIEW_RESTS } from "./view-capture";

const ATTEMPTS = 4;
const RETRY_DELAY_MS = 10_000;

/**
 * Boot self-warm: GET each view route against our own server once so an
 * agent whose pod slept since before view docs existed still gets its docs
 * published WITHOUT a first slow client request. The responses flow through
 * the server's own view capture, which publishes them. `/providers` relays
 * to the runtime, which takes ~10s to boot — hence the retry ladder.
 */
export function warmViewDocs(opts: {
  port: number;
  token: string;
  store: WorkspaceStore;
  fetchImpl?: typeof fetch;
}): void {
  const fetchImpl = opts.fetchImpl ?? fetch;
  void (async () => {
    const agents: string[] = [];
    for (const workspace of await opts.store.listWorkspaces()) {
      for (const agent of await opts.store.listAgents(workspace.id)) {
        agents.push(agent.id);
      }
    }
    // Same single-agent rule as the doc projector: the doc route names ONE
    // agent; on any other host shape the warm quietly stands down.
    const only = agents.length === 1 ? agents[0] : undefined;
    if (only === undefined) return;
    for (const rest of Object.keys(VIEW_RESTS)) {
      const url = `http://127.0.0.1:${opts.port}/agents/${encodeURIComponent(only)}/${rest}`;
      let lastStatus = 0;
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
        try {
          const response = await fetchImpl(url, {
            headers: { Authorization: `Bearer ${opts.token}` },
            signal: AbortSignal.timeout(30_000),
          });
          lastStatus = response.status;
          await response.body?.cancel();
          if (response.ok) break;
        } catch {
          lastStatus = -1; // network-level; retry
        }
      }
      if (lastStatus !== 200) {
        console.error(
          `[view-docs] boot warm for ${rest} gave up (last status ${lastStatus})`,
        );
      }
    }
  })().catch((error: unknown) => {
    console.error("[view-docs] boot warm failed", error);
  });
}

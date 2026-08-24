import type { HoustonEvent } from "@houston/protocol";
import type { EventHub } from "../events/hub";
import type { WorkspaceStore } from "../ports";
import { VIEW_RESTS } from "./view-capture";

// The ladder must OUTLAST the launcher's 60s boot-health budget
// (launcher/process.ts BOOT_HEALTH_BUDGET_MS): `/providers` probes answer 503
// while the runtime boots, and on a freshly woken pod the boot competes with
// store hydration for a capped CPU (observed >35s). 9 attempts × 10s spacing
// ≈ 85s of coverage — a give-up now means a runtime that blew its own boot
// budget, not a slow-but-healthy wake (HOUSTON-APP-5AP).
const ATTEMPTS = 9;
const RETRY_DELAY_MS = 10_000;
const REFRESH_DEBOUNCE_MS = 500;

interface SelfFetch {
  port: number;
  token: string;
  fetchImpl?: typeof fetch;
}

/** GET one of our own view routes so the server's capture re-publishes it. */
async function fetchView(
  self: SelfFetch,
  agentId: string,
  rest: string,
  attempts: number,
): Promise<number> {
  const fetchImpl = self.fetchImpl ?? fetch;
  const url = `http://127.0.0.1:${self.port}/agents/${encodeURIComponent(agentId)}/${rest}`;
  let lastStatus = 0;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
    try {
      const response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${self.token}` },
        signal: AbortSignal.timeout(30_000),
      });
      lastStatus = response.status;
      await response.body?.cancel();
      if (response.ok) break;
    } catch {
      lastStatus = -1; // network-level; retry
    }
  }
  return lastStatus;
}

async function singleAgentId(store: WorkspaceStore): Promise<string | null> {
  const agents: string[] = [];
  for (const workspace of await store.listWorkspaces()) {
    for (const agent of await store.listAgents(workspace.id)) {
      agents.push(agent.id);
    }
  }
  // Same single-agent rule as the doc projector: the doc route names ONE
  // agent; on any other host shape the warm quietly stands down.
  return agents.length === 1 ? (agents[0] ?? null) : null;
}

/**
 * Boot self-warm: GET each view route against our own server once so an
 * agent whose pod slept since before view docs existed still gets its docs
 * published WITHOUT a first slow client request. The responses flow through
 * the server's own view capture, which publishes them. `/providers` relays
 * to the runtime, which takes ~10s to boot — hence the retry ladder.
 */
export function warmViewDocs(
  opts: SelfFetch & { store: WorkspaceStore },
): void {
  void (async () => {
    const only = await singleAgentId(opts.store);
    if (only === null) return;
    for (const rest of Object.keys(VIEW_RESTS)) {
      const status = await fetchView(opts, only, rest, ATTEMPTS);
      if (status !== 200) {
        console.error(
          `[view-docs] boot warm for ${rest} gave up (last status ${status})`,
        );
      }
    }
  })().catch((error: unknown) => {
    console.error("[view-docs] boot warm failed", error);
  });
}

/** Domain changes that invalidate a view; each re-fetches its route. */
const EVENT_VIEW_RESTS: Partial<Record<HoustonEvent["type"], string>> = {
  SkillsChanged: "skills",
  CustomIntegrationsChanged: "integrations/custom/definitions",
};

/**
 * Keep views fresh on CHANGE, not only on reads: a skill installed by the
 * agent at night with no UI open would otherwise leave the previous skills
 * list served to asleep readers until the next live GET. Debounced per view.
 */
export function refreshViewsOnEvents(
  opts: SelfFetch & { store: WorkspaceStore; events: EventHub; userId: string },
): () => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  return opts.events.subscribe(opts.userId, (event) => {
    const rest = EVENT_VIEW_RESTS[event.type];
    if (!rest) return;
    const pending = timers.get(rest);
    if (pending) clearTimeout(pending);
    const timer = setTimeout(() => {
      timers.delete(rest);
      void (async () => {
        const agentId =
          "agentPath" in event && typeof event.agentPath === "string"
            ? event.agentPath
            : await singleAgentId(opts.store);
        if (agentId === null) return;
        const status = await fetchView(opts, agentId, rest, 1);
        if (status !== 200) {
          console.error(
            `[view-docs] refresh of ${rest} after ${event.type} answered ${status}`,
          );
        }
      })().catch((error: unknown) => {
        console.error(`[view-docs] refresh of ${rest} failed`, error);
      });
    }, REFRESH_DEBOUNCE_MS);
    timer.unref?.();
    timers.set(rest, timer);
  });
}

import type { HoustonEvent } from "@houston/protocol";
import type { EventHub } from "../events/hub";
import type { WorkspaceStore } from "../ports";
import { listAgentIds } from "./project-family";
import { VIEW_RESTS } from "./view-capture";

// The warm must OUTLAST the launcher's 60s boot-health budget
// (launcher/process.ts BOOT_HEALTH_BUDGET_MS): `/providers` probes answer 503
// while the runtime boots. Under a fleet-synchronised roll a CPU-starved pod
// can blow that budget outright (hydration alone was seen at >100s), and the
// warm's next probe re-spawns the runtime — so the window covers a FAILED
// first boot plus a full second one, not just one slow-but-healthy wake
// (HOUSTON-APP-5AP).
const WARM_BUDGET_MS = 180_000;
const RETRY_DELAY_MS = 10_000;
const REFRESH_DEBOUNCE_MS = 500;

interface SelfFetch {
  port: number;
  token: string;
  fetchImpl?: typeof fetch;
}

interface ViewAnswer {
  /** Last HTTP status, or -1 for a network-level failure. */
  status: number;
  /**
   * The last answer was the probe contract's "not here, not now" (503 +
   * Retry-After, channel/probe-wake.ts): the runtime is still starting or the
   * host is mid-shutdown. Nothing about the view itself failed.
   */
  notNow: boolean;
}

/**
 * GET one of our own view routes so the server's capture re-publishes it.
 * Retries every RETRY_DELAY_MS until a 200 or until `budgetMs` elapses; a zero
 * budget is a single attempt.
 */
async function fetchView(
  self: SelfFetch,
  agentId: string,
  rest: string,
  budgetMs: number,
): Promise<ViewAnswer> {
  const fetchImpl = self.fetchImpl ?? fetch;
  const url = `http://127.0.0.1:${self.port}/agents/${encodeURIComponent(agentId)}/${rest}`;
  const deadline = Date.now() + budgetMs;
  const answer: ViewAnswer = { status: 0, notNow: false };
  for (;;) {
    try {
      const response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${self.token}` },
        signal: AbortSignal.timeout(30_000),
      });
      answer.status = response.status;
      answer.notNow =
        response.status === 503 && response.headers.has("Retry-After");
      await response.body?.cancel();
      if (response.ok) break;
    } catch {
      answer.status = -1; // network-level; retry
      answer.notNow = false;
    }
    if (Date.now() + RETRY_DELAY_MS > deadline) break;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
  return answer;
}

async function singleAgentId(store: WorkspaceStore): Promise<string | null> {
  const agents = await listAgentIds(store);
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
      const { status, notNow } = await fetchView(
        opts,
        only,
        rest,
        WARM_BUDGET_MS,
      );
      if (status === 200) continue;
      // A runtime still not up after the whole window is the launcher's
      // failure, and it is already loud there (the eager spawn's "never became
      // healthy" error). The warm is best-effort on top: the previously
      // published doc keeps serving asleep readers and the next live read
      // re-publishes, so a give-up here is a breadcrumb, not a second error
      // per pod per roll.
      if (notNow) {
        console.warn(
          `[view-docs] boot warm for ${rest} stood down: runtime still starting after ${WARM_BUDGET_MS / 1000}s`,
        );
        continue;
      }
      console.error(
        `[view-docs] boot warm for ${rest} gave up (last status ${status})`,
      );
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
        const { status } = await fetchView(opts, agentId, rest, 0);
        if (status !== 200) {
          // An agent delete/rename unlinks `.agents/skills/**`, and the FS
          // watcher classifies each unlink as SkillsChanged for the now-gone
          // path — by refresh time the route answers 404 "agent not found".
          // That is the designed outcome of the delete, not a refresh failure;
          // there is no view left to keep fresh (HOUSTON-APP-5AP).
          if ((await opts.store.getAgent(agentId)) === null) return;
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

import type { HoustonEvent } from "@houston/protocol";
import type { EventHub } from "../events/hub";
import type { WorkspaceStore } from "../ports";
import { singleAgentId } from "./project-family";
import { VIEW_RESTS } from "./view-capture";

const WARM_BUDGET_MS = 180_000;
const RETRY_DELAY_MS = 10_000;
const REFRESH_DEBOUNCE_MS = 500;

interface SelfFetch {
  port: number;
  token: string;
  fetchImpl?: typeof fetch;
}

interface ViewAnswer {
  status: number;
  notNow: boolean;
  noAgent: boolean;
}

async function fetchView(
  self: SelfFetch,
  resolveAgentId: () => Promise<string | null>,
  rest: string,
  budgetMs: number,
): Promise<ViewAnswer> {
  const fetchImpl = self.fetchImpl ?? fetch;
  const deadline = Date.now() + budgetMs;
  const answer: ViewAnswer = { status: 0, notNow: false, noAgent: false };
  for (;;) {
    const agentId = await resolveAgentId();
    if (agentId === null) {
      answer.noAgent = true;
      break;
    }
    answer.noAgent = false;
    const url = `http://127.0.0.1:${self.port}/agents/${encodeURIComponent(agentId)}/${rest}`;
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
      answer.status = -1;
      answer.notNow = false;
    }
    if (Date.now() + RETRY_DELAY_MS > deadline) break;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
  return answer;
}

export function warmViewDocs(
  opts: SelfFetch & { store: WorkspaceStore },
): void {
  void (async () => {
    const resolve = () => singleAgentId(opts.store);
    if ((await resolve()) === null) return;
    for (const rest of Object.keys(VIEW_RESTS)) {
      const { status, notNow, noAgent } = await fetchView(
        opts,
        resolve,
        rest,
        WARM_BUDGET_MS,
      );
      if (status === 200) continue;
      if (noAgent) {
        console.warn(
          `[view-docs] boot warm for ${rest} stood down: host no longer serves exactly one agent`,
        );
        continue;
      }
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

const EVENT_VIEW_RESTS: Partial<Record<HoustonEvent["type"], string>> = {
  SkillsChanged: "skills",
  CustomIntegrationsChanged: "integrations/custom/definitions",
};

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
        const { status } = await fetchView(opts, async () => agentId, rest, 0);
        if (status !== 200) {
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

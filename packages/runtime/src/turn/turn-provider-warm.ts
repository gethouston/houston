import { providerDefaultModel, safeGetModel } from "../ai/providers";
import { untrackedFetch } from "./turn-network-marks";

/**
 * A prewarmed sandbox opens its connection to the model provider before the
 * turn arrives, so the turn's first model request skips DNS, TCP and TLS
 * (50 to 90 ms from inside a sandbox, measured 2026-10-03).
 *
 * Every pi provider sends through Node's global fetch, one connection pool per
 * origin, and that pool closes a connection idle for 4 s. So the warm asks the
 * provider's API every 3 s until the turn starts or the hold ends. It asks with
 * OPTIONS: on the sandbox's Node 22 a HEAD comes back `connection: close`,
 * which would leave nothing warm, while OPTIONS keeps the connection and has
 * no effect on the provider.
 *
 * Claude runs in its own CLI process, which dials Anthropic itself, and
 * Bedrock rides the AWS SDK's own pool, so neither is warmed here. A custom
 * endpoint's address, Qwen's region and Xiaomi's plan endpoint live in the
 * agent's files, which only the turn reads.
 */
export const PROVIDER_WARM_EVERY_MS = 3_000;
/** Bounds one warm however long its hold: a sandbox nobody sends to dies. */
export const PROVIDER_WARM_MAX_MS = 3 * 60_000;
const PROVIDER_WARM_REQUEST_MS = 5_000;

// Qwen's region and Xiaomi's plan endpoint come from the agent's files, and
// a Copilot business or enterprise host from its token, which never comes.
const NOT_WARMED = new Set([
  "anthropic",
  "amazon-bedrock",
  "openai-compatible",
  "qwen",
  "xiaomi",
  "github-copilot",
]);
const AZURE_OPENAI = "azure-openai-responses";

/** The URL whose origin a turn on this provider and model calls, or undefined
 *  when nothing in this process can warm it. */
export function providerWarmUrl(
  provider: string,
  model?: string,
  enterpriseUrl?: string,
): string | undefined {
  if (!provider || NOT_WARMED.has(provider)) return undefined;
  if (provider === AZURE_OPENAI) return httpsUrl(enterpriseUrl);
  try {
    const id = model || providerDefaultModel(provider);
    return id
      ? httpsUrl(safeGetModel(provider, id, false)?.baseUrl)
      : undefined;
  } catch {
    // An unknown provider or model: the turn reports its own error.
    return undefined;
  }
}

function httpsUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

type Timer = ReturnType<typeof setTimeout>;

export interface ProviderWarmerOptions {
  fetch?: typeof fetch;
  everyMs?: number;
  now?: () => number;
  log?: (line: string) => void;
}

/** Keeps one provider connection open for a sandbox's coming turn. */
export class ProviderWarmer {
  private readonly fetchImpl: () => typeof fetch;
  private readonly everyMs: number;
  private readonly now: () => number;
  private readonly log: (line: string) => void;
  private timer: Timer | undefined;
  private generation = 0;
  private stopped = false;

  constructor(options: ProviderWarmerOptions = {}) {
    this.fetchImpl = () => options.fetch ?? untrackedFetch();
    this.everyMs = options.everyMs ?? PROVIDER_WARM_EVERY_MS;
    this.now = options.now ?? Date.now;
    this.log = options.log ?? ((line) => console.log(line));
  }

  /** Warms url until stop() or holdMs (capped). A later start replaces it;
   *  nothing starts once a turn has stopped the warmer. */
  start(url: string, holdMs: number): boolean {
    if (this.stopped) return false;
    this.cancelTimer();
    const generation = ++this.generation;
    const until =
      this.now() + Math.min(Math.max(holdMs, 0), PROVIDER_WARM_MAX_MS);
    const origin = new URL(url).origin;
    let asked = 0;
    let failed = 0;
    const tick = async () => {
      if (generation !== this.generation) return;
      asked += 1;
      try {
        const res = await this.fetchImpl()(url, {
          method: "OPTIONS",
          signal: AbortSignal.timeout(PROVIDER_WARM_REQUEST_MS),
        });
        // Draining the answer hands the connection back to the pool.
        await res.arrayBuffer();
      } catch {
        failed += 1;
      }
      if (generation !== this.generation) return;
      if (this.now() + this.everyMs >= until) {
        this.log(
          `[prewarm] provider warm ended: origin=${origin} asked=${asked} failed=${failed}`,
        );
        return;
      }
      this.timer = setTimeout(() => void tick(), this.everyMs);
    };
    void tick();
    return true;
  }

  /** A turn arrived: its own request takes the warm connection from here. */
  stop(): void {
    this.stopped = true;
    this.generation += 1;
    this.cancelTimer();
  }

  private cancelTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
}

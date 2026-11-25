import { AZURE_OPENAI } from "../ai/azure-openai";
import { providerDefaultModel, safeGetModel } from "../ai/providers";
import { untrackedFetch } from "./turn-network-marks";

// WHY: Node's global fetch pool closes connections after 4 idle seconds. ADR-0015
export const PROVIDER_WARM_EVERY_MS = 3_000;
export const PROVIDER_WARM_MAX_MS = 3 * 60_000;
const PROVIDER_WARM_REQUEST_MS = 5_000;

// WHY: Claude CLI and the AWS SDK use their own pools; warming Node fetch cannot help. ADR-0015
const NOT_WARMED = new Set([
  "anthropic",
  "amazon-bedrock",
  "openai-compatible",
  "qwen",
  "xiaomi",
  "github-copilot",
]);

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

// WHY: Node 22 HEAD replies carry connection: close; OPTIONS keeps it, drain to reuse it. ADR-0015
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

import type {
  Api,
  AssistantMessageEventStream,
  Context,
  Model,
} from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { config } from "../config";
import { FIRST_BYTE_EXTRA_ATTEMPTS, firstByteDeadlineMs } from "./first-byte";
import { hedgedStream } from "./hedged-stream";

type StreamSimpleOptions = Parameters<ModelRuntime["streamSimple"]>[2];

export interface HedgeObserver {
  /** A request's response opened, `afterMs` after its first attempt. */
  answered?(afterMs: number, attempt: number): void;
  /** Another attempt of a request went out. */
  hedged?(attempt: number): void;
}

/**
 * `runtime` with every session request hedged (ai/hedged-stream.ts): a
 * request whose response has not opened within the provider's first-byte
 * deadline (ai/first-byte.ts) goes out again, at most twice, and the first
 * answer wins. pi sends each agent request through
 * `modelRuntime.streamSimple`, so this is the one seam; every other method
 * (model resolution, compaction's own calls) runs unchanged on `runtime`.
 *
 * Each hedge logs one `[provider_hedge]` line, the count of duplicate
 * requests and so of duplicate input tokens.
 */
export function hedgedModelRuntime(
  runtime: ModelRuntime,
  observer: HedgeObserver = {},
  deadlineFor: (provider: string) => number = (provider) =>
    firstByteDeadlineMs(provider, config.turnFirstByteDeadlineMs),
): ModelRuntime {
  const streamSimple = (
    model: Model<Api>,
    context: Context,
    options?: StreamSimpleOptions,
  ): AssistantMessageEventStream => {
    // pi's own provider-level retry (`retry.provider.maxRetries`, 0 unless a
    // settings file raises it) can sleep out a 429's Retry-After before any
    // event: that wait is not silence, so such a request is never hedged.
    const deadlineMs =
      (options?.maxRetries ?? 0) > 0 ? 0 : deadlineFor(model.provider);
    const target = `provider=${model.provider} model=${model.id}`;
    let hedges = 0;
    // Unhedged, the same race with no extra attempt still reports the first
    // byte (the pooled turn's `first_byte` mark).
    return hedgedStream(
      (signal) => runtime.streamSimple(model, context, { ...options, signal }),
      {
        deadlineMs,
        extraAttempts: deadlineMs > 0 ? FIRST_BYTE_EXTRA_ATTEMPTS : 0,
        signal: options?.signal,
        onAttempt(attempt, afterMs) {
          hedges++;
          observer.hedged?.(attempt);
          console.warn(
            `[provider_hedge] ${target} attempt=${attempt} sent: no response after ${afterMs}ms`,
          );
        },
        onAnswered(attempt, afterMs) {
          observer.answered?.(afterMs, attempt);
          if (hedges > 0)
            console.warn(
              `[provider_hedge] ${target} answered by attempt=${attempt} after ${afterMs}ms (${hedges} extra request${hedges === 1 ? "" : "s"})`,
            );
        },
      },
    );
  };
  return new Proxy(runtime, {
    get(target, key) {
      if (key === "streamSimple") return streamSimple;
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

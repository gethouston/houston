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
import { estimatePromptTokens } from "./prompt-tokens";

type StreamSimpleOptions = Parameters<ModelRuntime["streamSimple"]>[2];

export interface SentRequestSize {
  provider: string;
  promptTokens: number;
}

export interface HedgeObserver {
  sent?(request: SentRequestSize): void;
  answered?(afterMs: number, attempt: number): void;
  hedged?(attempt: number): void;
}

export function hedgedModelRuntime(
  runtime: ModelRuntime,
  observer: HedgeObserver = {},
  deadlineFor: (provider: string, promptTokens: number) => number = (
    provider,
    promptTokens,
  ) =>
    firstByteDeadlineMs(provider, config.turnFirstByteDeadlineMs, promptTokens),
): ModelRuntime {
  const streamSimple = (
    model: Model<Api>,
    context: Context,
    options?: StreamSimpleOptions,
  ): AssistantMessageEventStream => {
    const promptTokens = estimatePromptTokens(context);
    observer.sent?.({ provider: model.provider, promptTokens });
    const deadlineMs =
      (options?.maxRetries ?? 0) > 0
        ? 0
        : deadlineFor(model.provider, promptTokens);
    const target = `provider=${model.provider} model=${model.id}`;
    let hedges = 0;
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

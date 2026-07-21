import type { HoustonEvent } from "@houston-ai/core";
import { useEffect, useRef } from "react";
import { readAgentModelOverrides } from "../lib/agent-model-overrides";
import { buildAiGenerationProps } from "../lib/ai-generation";
import { analytics, classifyAnalyticsError } from "../lib/analytics";
import { subscribeHoustonEvents } from "../lib/events";
import { tauriConfig } from "../lib/tauri";

/** What the `final_result` feed frame carries (ui/chat FeedEntry). */
interface FinalResultData {
  cost_usd: number | null;
  duration_ms: number | null;
  usage?: {
    context_tokens: number;
    output_tokens: number;
    cached_tokens: number;
  } | null;
}

/**
 * The agent's configured brain, cached briefly so one config read serves the
 * turns of a sit-down instead of one read per turn. 60s keeps a model-picker
 * change from being stale for long.
 */
const OVERRIDES_TTL_MS = 60_000;
type CachedOverrides = {
  at: number;
  value: { providerOverride?: string; modelOverride?: string };
};
const overridesCache = new Map<string, CachedOverrides>();

async function agentBrain(agentPath: string) {
  const hit = overridesCache.get(agentPath);
  if (hit && Date.now() - hit.at < OVERRIDES_TTL_MS) return hit.value;
  const value = await readAgentModelOverrides(agentPath, tauriConfig.read);
  overridesCache.set(agentPath, { at: Date.now(), value });
  return value;
}

/**
 * One `$ai_generation` per finished turn, feeding the AI Usage dashboard
 * (cost / latency / tokens by model). Async because the model/provider come
 * from the agent config; fire-and-forget like every analytics path — a failed
 * capture must never touch the event pipeline.
 */
async function trackGeneration(
  agentPath: string,
  sessionKey: string,
  data: FinalResultData,
) {
  const brain = await agentBrain(agentPath);
  analytics.trackAiGeneration(
    buildAiGenerationProps({
      usage: data.usage,
      costUsd: data.cost_usd,
      durationMs: data.duration_ms,
      provider: brain.providerOverride,
      model: brain.modelOverride,
      sessionKey,
    }),
  );
}

/**
 * Subscribes to the HoustonEvent firehose and fires analytics for events
 * that originate from the backend (assistant replies, session failures,
 * backend errors) — i.e. anything that has no obvious call site in the
 * React code.
 *
 * Mount once in App.tsx. Never mounted in ui/ (library boundary rule).
 */
export function useAnalyticsSubscriber() {
  const repliesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unlisten = subscribeHoustonEvents((p: HoustonEvent) => {
      switch (p.type) {
        case "FeedItem": {
          // Activation signal: user got a finalized assistant reply.
          // "assistant_text_streaming" is skipped — it fires continuously
          // during streaming and would inflate counts. "assistant_text" is
          // emitted once per reply when the stream finalizes.
          if (p.data.item.feed_type === "assistant_text") {
            const key = `${p.data.agent_path}:${p.data.session_key}`;
            if (repliesRef.current.has(key)) break;
            repliesRef.current.add(key);
            analytics.track("chat_message_received");
          }
          // Terminal frame of a model turn: exactly one per turn (NOT
          // deduped like the activation signal above — every generation
          // counts for the AI Usage dashboard).
          if (p.data.item.feed_type === "final_result") {
            trackGeneration(
              p.data.agent_path,
              p.data.session_key,
              p.data.item.data as FinalResultData,
            ).catch(() => {
              // Analytics unavailable — never disturb the event pipeline.
            });
          }
          break;
        }

        case "SessionStatus": {
          const { status, error } = p.data;
          if (status === "completed") {
            analytics.track("session_completed");
          }
          if (status === "error" && error) {
            const error_kind = classifyAnalyticsError(error);
            analytics.track("session_failed", { error_kind });
            analytics.track("app_error_shown", {
              source: "session",
              error_kind,
            });
          }
          break;
        }

        case "Toast": {
          if (p.data.variant === "error") {
            analytics.track("app_error_shown", {
              source: "toast",
              error_kind: classifyAnalyticsError(p.data.message ?? ""),
            });
          }
          break;
        }
      }
    });

    return () => unlisten();
  }, []);
}

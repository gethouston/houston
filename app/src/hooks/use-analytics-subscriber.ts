import type { HoustonEvent } from "@houston-ai/core";
import { useEffect, useRef } from "react";
import { readAgentModelOverrides } from "../lib/agent-model-overrides";
import { buildAiGenerationProps } from "../lib/ai-generation";
import { analytics, classifyAnalyticsError } from "../lib/analytics";
import { subscribeHoustonEvents } from "../lib/events";
import { sessionFailureEvents } from "../lib/session-failure-analytics";
import { tauriConfig } from "../lib/tauri";

interface FinalResultData {
  cost_usd: number | null;
  duration_ms: number | null;
  usage?: {
    context_tokens: number;
    output_tokens: number;
    cached_tokens: number;
  } | null;
}

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

export function useAnalyticsSubscriber() {
  const repliesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unlisten = subscribeHoustonEvents((p: HoustonEvent) => {
      switch (p.type) {
        case "FeedItem": {
          if (p.data.item.feed_type === "assistant_text") {
            const key = `${p.data.agent_path}:${p.data.session_key}`;
            if (repliesRef.current.has(key)) break;
            repliesRef.current.add(key);
            analytics.track("chat_message_received");
          }
          if (p.data.item.feed_type === "final_result") {
            trackGeneration(
              p.data.agent_path,
              p.data.session_key,
              p.data.item.data as FinalResultData,
            ).catch(() => {});
          }
          break;
        }

        case "SessionStatus": {
          if (p.data.status === "completed") {
            analytics.track(
              "session_completed",
              p.data.stop_reason
                ? { stop_reason: p.data.stop_reason }
                : undefined,
            );
          }
          if (p.data.status === "error")
            for (const { event, props } of sessionFailureEvents(
              p.data,
              Date.now(),
            ))
              analytics.track(event, props);
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

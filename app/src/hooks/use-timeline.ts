/**
 * `useTimeline` — derive a cross-session activity timeline for an agent.
 *
 * Phase 4 of RFC #248 / `advanced.timeline`. Reads the agent's activities
 * (via the existing `useActivity` hook) to derive the list of session
 * ids, then calls `/v1/timeline` to get the union of `chat_feed` rows
 * across those sessions ordered newest first.
 *
 * The engine has no concept of "agent" — it just unions sessions. The
 * frontend owns the agent→sessions mapping.
 */
import { useQuery } from "@tanstack/react-query";
import type { TimelineResponse } from "@houston-ai/engine-client";
import { useActivity } from "./queries";
import { tauriTimeline } from "../lib/tauri";

const DEFAULT_LIMIT = 200;

export function useTimeline(agentPath: string | null | undefined, limit?: number) {
  const activities = useActivity(agentPath ?? undefined);
  const sessionIds = (activities.data ?? [])
    .map((a) => a.claude_session_id ?? null)
    .filter((s): s is string => Boolean(s));

  return useQuery<TimelineResponse>({
    queryKey: [
      "timeline",
      agentPath ?? "",
      sessionIds.join(","),
      limit ?? DEFAULT_LIMIT,
    ] as const,
    queryFn: () => tauriTimeline.fetch(sessionIds, limit ?? DEFAULT_LIMIT),
    enabled: Boolean(agentPath) && sessionIds.length > 0,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

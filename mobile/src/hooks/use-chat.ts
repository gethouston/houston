// Chat history + send-message hooks for a specific session.
//
// User messages are handled with an *optimistic* local overlay because
// the engine persists the user_message asynchronously (spawned tokio
// task waiting on Claude CLI's SessionId emit, 1-3 s window). Without
// the overlay the user's bubble disappears while we wait for the server
// to agree that they sent anything.
//
// The overlay lives in a module-scoped Map keyed by sessionKey so a
// remount of the chat view doesn't lose it. Entries are dropped once
// the refetched server history contains a matching user_message.

import { topics } from "@houston-ai/engine-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { getEngine, getWs, useEngineReady } from "../lib/engine";
import {
  dropPending,
  pendingForSession,
  pushPending,
  reconcilePending,
  snapshot,
  subscribe,
} from "./chat-optimistic";

export { autoTitleFromText, useCreateMission } from "./use-create-mission";

interface ChatEntry {
  feed_type: string;
  data: unknown;
}

export function useChatHistory(
  agentPath: string | null,
  sessionKey: string | null,
  options: { isActive?: boolean } = {},
) {
  const ready = useEngineReady();
  useEffect(() => {
    if (!ready || !sessionKey) return;
    const t = topics.session(sessionKey);
    getWs().subscribe([t]);
    return () => getWs().unsubscribe([t]);
  }, [ready, sessionKey]);

  const query = useQuery({
    queryKey: ["chat", sessionKey, agentPath],
    enabled: ready && !!agentPath && !!sessionKey,
    queryFn: async () => {
      if (!agentPath || !sessionKey) {
        throw new Error("agentPath and sessionKey are required");
      }
      return await getEngine().loadChatHistory(agentPath, sessionKey);
    },
    // Backstop polling: while a session is "running" (agent is
    // actively writing), refetch every 2s. The WS firehose is the
    // primary delivery mechanism and usually wins; this is the
    // belt-and-suspenders for when the tunnel chain or iOS suspension
    // eats an event. As soon as the conversation status flips off
    // "running", the caller passes `isActive: false` and polling
    // stops — no battery drain in steady state.
    refetchInterval: options.isActive ? 2_000 : false,
  });

  // Subscribe to the optimistic overlay and reconcile whenever the
  // server query refetches.
  useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (!sessionKey || !query.data) return;
    reconcilePending(sessionKey, query.data);
  }, [sessionKey, query.data]);

  const pendingMessages = sessionKey ? pendingForSession(sessionKey) : [];
  const merged: ChatEntry[] = [
    ...(query.data ?? []),
    ...pendingMessages.map((m) => ({
      feed_type: "user_message" as const,
      data: m.text,
    })),
  ];

  return { ...query, data: merged };
}

export function useSendMessage(agentPath: string, sessionKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (prompt: string) => {
      return await getEngine().startSession(agentPath, {
        sessionKey,
        prompt,
      });
    },
    onMutate: (prompt: string) => {
      const id = pushPending(sessionKey, prompt);
      return { id };
    },
    onError: (_err, _prompt, ctx) => {
      if (ctx?.id) dropPending(sessionKey, ctx.id);
    },
    onSettled: () => {
      // Refresh so we pick up the server's official user_message +
      // streaming responses. `reconcilePending` inside useChatHistory
      // drops the overlay once the server copy lands.
      qc.invalidateQueries({ queryKey: ["chat", sessionKey] });
    },
  });
}

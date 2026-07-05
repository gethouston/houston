import { create } from "zustand";

/** Composite per-conversation key (agent-qualified, same identity as the VM scope). */
const getSessionStatusKey = (agentPath: string, sessionKey: string) =>
  `${agentPath}\u0000${sessionKey}`;

export interface QueuedChatMessage {
  id: string;
  text: string;
  files: File[];
  createdAt: number;
}

interface QueuedMessageState {
  queues: Record<string, QueuedChatMessage[]>;
  enqueue: (
    agentPath: string,
    sessionKey: string,
    text: string,
    files: File[],
  ) => void;
  remove: (agentPath: string, sessionKey: string, id: string) => void;
  takeAll: (agentPath: string, sessionKey: string) => QueuedChatMessage[];
  clear: (agentPath: string, sessionKey: string) => void;
}

const EMPTY_QUEUE: QueuedChatMessage[] = [];

function createQueueId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const useQueuedMessageStore = create<QueuedMessageState>((set, get) => ({
  queues: {},

  enqueue: (agentPath, sessionKey, text, files) =>
    set((state) => {
      const key = getSessionStatusKey(agentPath, sessionKey);
      const item: QueuedChatMessage = {
        id: createQueueId(),
        text,
        files,
        createdAt: Date.now(),
      };
      return {
        queues: {
          ...state.queues,
          [key]: [...(state.queues[key] ?? []), item],
        },
      };
    }),

  remove: (agentPath, sessionKey, id) =>
    set((state) => {
      const key = getSessionStatusKey(agentPath, sessionKey);
      const next = (state.queues[key] ?? []).filter((item) => item.id !== id);
      if (next.length > 0) {
        return { queues: { ...state.queues, [key]: next } };
      }
      const { [key]: _removed, ...rest } = state.queues;
      return { queues: rest };
    }),

  takeAll: (agentPath, sessionKey) => {
    const key = getSessionStatusKey(agentPath, sessionKey);
    const items = get().queues[key] ?? [];
    set((state) => {
      const { [key]: _removed, ...rest } = state.queues;
      return { queues: rest };
    });
    return items;
  },

  clear: (agentPath, sessionKey) =>
    set((state) => {
      const key = getSessionStatusKey(agentPath, sessionKey);
      const { [key]: _removed, ...rest } = state.queues;
      return { queues: rest };
    }),
}));

export function useQueuedMessages(
  agentPath: string | null,
  sessionKey: string | null,
) {
  return useQueuedMessageStore((state) => {
    if (!agentPath || !sessionKey) return EMPTY_QUEUE;
    return (
      state.queues[getSessionStatusKey(agentPath, sessionKey)] ?? EMPTY_QUEUE
    );
  });
}

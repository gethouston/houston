import { create } from "zustand";

export type SessionRunStatus = "starting" | "running" | "completed" | "error";

interface SessionStatusState {
  statuses: Record<string, SessionRunStatus>;
  setStatus: (
    agentPath: string,
    sessionKey: string,
    status: SessionRunStatus,
  ) => void;
  clearAll: () => void;
}

export function getSessionStatusKey(agentPath: string, sessionKey: string) {
  return `${agentPath}\u0000${sessionKey}`;
}

export const useSessionStatusStore = create<SessionStatusState>((set) => ({
  statuses: {},
  setStatus: (agentPath, sessionKey, status) =>
    set((s) => ({
      statuses: {
        ...s.statuses,
        [getSessionStatusKey(agentPath, sessionKey)]: status,
      },
    })),
  clearAll: () => set({ statuses: {} }),
}));

export function useSessionStatus(agentPath: string, sessionKey: string) {
  return useSessionStatusStore(
    (s) => s.statuses[getSessionStatusKey(agentPath, sessionKey)],
  );
}

export function isActiveSessionStatus(status: SessionRunStatus | undefined) {
  return status === "starting" || status === "running";
}

export interface ActiveStream {
  kind: "turn" | "observer";
  dispose: () => void;
  lastSeq?: number;
  lastProgressAt?: number;
  held?: boolean;
  accepted?: boolean;
  stopUnsent?: () => (() => void) | null;
}

export const streamKey = (agentPath: string, sessionKey: string): string =>
  JSON.stringify([agentPath, sessionKey]);

import type { WireFrame } from "./types";

export type SnapshotTool = {
  name: string;
  input?: unknown;
  isError?: boolean;
  content?: string;
  mission?: { id: string; title: string; agent: string };
};

export type ConversationSnapshot = {
  running: boolean;
  partial: string;
  seq: number;
  turnId?: string;
  thinking?: string;
  tools?: SnapshotTool[];
};

export const EMPTY_SNAPSHOT: ConversationSnapshot = {
  running: false,
  partial: "",
  seq: 0,
};

export function reduceSnapshot(
  prev: ConversationSnapshot,
  event: WireFrame,
): ConversationSnapshot {
  const seq = event.seq ?? prev.seq;
  const turnOf = (id: string | undefined) => (id ? { turnId: id } : {});
  const activity = () => ({
    ...(prev.thinking !== undefined ? { thinking: prev.thinking } : {}),
    ...(prev.tools !== undefined ? { tools: prev.tools } : {}),
  });
  switch (event.type) {
    case "user":
      return { running: true, partial: "", seq, ...turnOf(event.turnId) };
    case "text":
      return {
        running: true,
        partial: prev.partial + event.data,
        seq,
        ...turnOf(event.turnId ?? prev.turnId),
        ...activity(),
      };
    case "thinking":
      return {
        running: true,
        partial: prev.partial,
        seq,
        ...turnOf(event.turnId ?? prev.turnId),
        ...activity(),
        thinking: (prev.thinking ?? "") + event.data,
      };
    case "tool_start":
      return {
        running: true,
        partial: prev.partial,
        seq,
        ...turnOf(event.turnId ?? prev.turnId),
        ...activity(),
        tools: [
          ...(prev.tools ?? []),
          { name: event.data.name, input: event.data.args },
        ],
      };
    case "tool_end": {
      const tools = [...(prev.tools ?? [])];
      for (let i = tools.length - 1; i >= 0; i--) {
        const t = tools[i];
        if (t && t.isError === undefined) {
          tools[i] = {
            ...t,
            isError: event.data.isError,
            ...(event.data.content ? { content: event.data.content } : {}),
            ...(event.data.mission ? { mission: event.data.mission } : {}),
          };
          break;
        }
      }
      return {
        running: true,
        partial: prev.partial,
        seq,
        ...turnOf(event.turnId ?? prev.turnId),
        ...activity(),
        ...(tools.length ? { tools } : {}),
      };
    }
    case "landed":
      return { ...prev, seq };
    case "usage":
    case "file_changes":
    case "reply_complete":
      return {
        running: true,
        partial: prev.partial,
        seq,
        ...turnOf(event.turnId ?? prev.turnId),
        ...activity(),
      };
    case "done":
    case "error":
    case "provider_error":
      return { running: false, partial: "", seq };
    case "provider_switched":
    case "context_compacted":
    case "context_cleared":
      return {
        running: prev.running,
        partial: prev.partial,
        seq,
        ...turnOf(event.turnId ?? prev.turnId),
        ...activity(),
      };
    case "sync":
      return prev;
  }
}

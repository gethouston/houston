import type { TokenUsage } from "./conversation";
import type { PendingInteraction } from "./domain/interaction";
import type { ProviderError } from "./provider-error";
import type { TurnErrorData } from "./turn-error";

export type WireEvent =
  | {
      type: "sync";
      data: {
        running: boolean;
        partial: string;
        seq: number;
        resync?: boolean;
        turnId?: string;
        thinking?: string;
        tools?: {
          name: string;
          input?: unknown;
          isError?: boolean;
          content?: string;
          mission?: { id: string; title: string; agent: string };
        }[];
      };
    }
  | {
      type: "user";
      data: {
        content: string;
        ts: number;
        nonce?: string;
        author?: { userId: string; name?: string };
        mentions?: { userId: string; name?: string }[];
      };
    }
  | { type: "text"; data: string }
  | { type: "thinking"; data: string }
  | { type: "tool_start"; data: { name: string; args: unknown } }
  | {
      type: "tool_end";
      data: {
        name: string;
        isError: boolean;
        content?: string;
        mission?: { id: string; title: string; agent: string };
      };
    }
  | { type: "usage"; data: TokenUsage }
  | {
      type: "provider_switched";
      data: {
        provider: string;
        summarized: boolean;
        pre_tokens?: number | null;
      };
    }
  | {
      type: "context_compacted";
      data: {
        trigger: "native" | "proactive" | "manual";
        pre_tokens?: number | null;
      };
    }
  | {
      type: "context_cleared";
      data: null;
    }
  | {
      type: "provider_error";
      data: ProviderError;
    }
  | {
      type: "file_changes";
      data: { created: string[]; modified: string[] };
    }
  | {
      type: "reply_complete";
      data: null;
    }
  | {
      type: "done";
      data: null;
      pendingInteraction?: PendingInteraction;
    }
  | { type: "error"; data: TurnErrorData };

export type WireEventType = WireEvent["type"];

export const TOOL_RESULT_PREVIEW_MAX = 4_000;

export function clipToolResult(text: string): string {
  return text.length <= TOOL_RESULT_PREVIEW_MAX
    ? text
    : `${text.slice(0, TOOL_RESULT_PREVIEW_MAX)}\n… (truncated)`;
}

export type WireFrame = WireEvent & { seq?: number; turnId?: string };

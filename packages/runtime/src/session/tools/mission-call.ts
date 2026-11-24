import { currentActingContext } from "../acting-context";
import { currentConversationId } from "../conversation-context";
import { retryComputeBusyOnce } from "./compute-busy-retry";
import type { SandboxFetch } from "./sandbox-fetch";
import { CONVERSATION_ID_HEADER } from "./save-learning";
import { hostErrorFrom, type SessionToolErrorDetails } from "./tool-error";

export interface MissionCall {
  <T>(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    signal: AbortSignal | undefined,
  ): Promise<{ ok: true; data: T } | SessionToolErrorDetails>;
  readonly sandbox: SandboxFetch;
}

export function missionCall(fetchSandbox: SandboxFetch): MissionCall {
  const call = async <T>(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    signal: AbortSignal | undefined,
  ): Promise<{ ok: true; data: T } | SessionToolErrorDetails> => {
    try {
      const acting = currentActingContext();
      const conversationId = currentConversationId();
      const res = await retryComputeBusyOnce(
        () =>
          fetchSandbox(`/sandbox/missions${path}`, {
            method,
            headers: {
              "content-type": "application/json",
              ...(acting?.actingAs
                ? { "x-houston-acting-as": acting.actingAs }
                : {}),
              ...(acting?.actingUser
                ? { "x-houston-acting-user": acting.actingUser }
                : {}),
              ...(conversationId
                ? { [CONVERSATION_ID_HEADER]: conversationId }
                : {}),
            },
            ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
            signal,
          }),
        signal,
      );
      if (!res.ok)
        return {
          ok: false,
          error: await hostErrorFrom(res, "mission request"),
        };
      return { ok: true, data: (await res.json()) as T };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: "transport_error",
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  };
  return Object.assign(call, { sandbox: fetchSandbox });
}

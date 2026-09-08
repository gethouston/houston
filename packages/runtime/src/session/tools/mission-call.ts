import { currentActingContext } from "../acting-context";
import { currentConversationId } from "../conversation-context";
import type { SandboxFetch } from "./sandbox-fetch";
import { CONVERSATION_ID_HEADER } from "./save-learning";
import { hostErrorFrom, type SessionToolErrorDetails } from "./tool-error";

/**
 * The mission tools' one authed call to the host, shared by every tool in the
 * family so they cannot disagree about what a request carries.
 *
 * The acting identity and this conversation's id ride the headers, taken from
 * the turn's async scope rather than the tool's arguments: the host stamps
 * attribution from them and enforces the self/depth guards, neither of which an
 * agent may author.
 */
export interface MissionCall {
  <T>(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    signal: AbortSignal | undefined,
  ): Promise<{ ok: true; data: T } | SessionToolErrorDetails>;
  /**
   * The sandbox transport underneath. A mission tool's REFUSAL has to reach a
   * sibling route to name the agents the caller could have used
   * (mission-agents.ts), and that route is not under `/sandbox/missions` — so
   * the transport rides along rather than being threaded separately through
   * every tool's options.
   */
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
      const res = await fetchSandbox(`/sandbox/missions${path}`, {
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
      });
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

import { currentActingContext } from "../acting-context";
import { currentConversationId } from "../conversation-context";
import type { SandboxFetch } from "./sandbox-fetch";
import { CONVERSATION_ID_HEADER } from "./save-learning";

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
  (
    method: "GET" | "POST",
    path: string,
    body: unknown,
    signal: AbortSignal | undefined,
  ): Promise<unknown>;
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
  const call = async (
    method: "GET" | "POST",
    path: string,
    body: unknown,
    signal: AbortSignal | undefined,
  ): Promise<unknown> => {
    const acting = currentActingContext();
    const conversationId = currentConversationId();
    const res = await fetchSandbox(`/sandbox/missions${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(acting?.actingAs ? { "x-houston-acting-as": acting.actingAs } : {}),
        ...(acting?.actingUser
          ? { "x-houston-acting-user": acting.actingUser }
          : {}),
        ...(conversationId ? { [CONVERSATION_ID_HEADER]: conversationId } : {}),
      },
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      // The host's error bodies are agent-actionable plain language (cap hit,
      // still running, unknown agent or id) — relay them so the agent can
      // explain or correct itself.
      throw new Error(
        `mission request failed (${res.status}): ${detail.slice(0, 300)}`,
      );
    }
    return res.json();
  };
  return Object.assign(call, { sandbox: fetchSandbox });
}

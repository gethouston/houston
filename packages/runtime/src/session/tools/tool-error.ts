import type { AgentToolResult } from "@earendil-works/pi-coding-agent";

/**
 * Failures the sibling tools of `houston_call` report as VALUES.
 *
 * Same reason as the assistant family (assistant-result.ts): a thrown exception
 * reaches the model as one opaque string, and most of these failures are things
 * the model can fix on its own turn (it left an agent out, it searched for
 * nothing, it named a mission that has no conversation yet). A named code plus
 * a sentence that says what to do next is what ends the guessing loop; an
 * exception restarts it.
 */

export type SessionToolErrorCode =
  /** The personal assistant left `agent` out, and it holds no board of its own. */
  | "agent_required"
  /** The named mission has no readable conversation here. */
  | "mission_not_found"
  /** The tool was called with nothing to act on (an empty search). */
  | "empty_query"
  /** The host refused; `message` relays its own agent-actionable words. */
  | "host_error"
  | "transport_error"
  /** That board already holds as many agent-started missions as it allows. */
  | "mission_cap"
  /** A mission Houston started may not start further missions. */
  | "mission_depth"
  /** The CALLER already has as many missions running as it may start, spread
   *  across every board it can reach. */
  | "mission_fanout"
  | "agent_not_found"
  | "agent_ambiguous"
  | "invalid_provider"
  | "agent_unreachable"
  | "agent_refused";

export interface SessionToolError {
  code: SessionToolErrorCode;
  message: string;
  /** The host's HTTP status, when the failure came from a response. */
  status?: number;
}

/** The failure half of any of these tools' `details`. */
export interface SessionToolErrorDetails {
  ok: false;
  error: SessionToolError;
}

/**
 * A failure, reported as a result. The text leads with `ERROR` so a model
 * skimming the transcript cannot read a refusal as a success, and carries the
 * code so it can react to the specific cause.
 */
export function toolErrorResult(
  error: SessionToolError,
): AgentToolResult<SessionToolErrorDetails> {
  return {
    content: [
      { type: "text" as const, text: `ERROR ${error.code}: ${error.message}` },
    ],
    details: { ok: false, error },
  };
}

/** The host's refusal, relayed with its own words and its status. */
export async function hostErrorFrom(
  res: Response,
  what: string,
): Promise<SessionToolError> {
  const detail = await res.text().catch(() => "");
  let payload: unknown;
  try {
    payload = JSON.parse(detail);
  } catch {
    payload = null;
  }
  if (typeof payload === "object" && payload !== null) {
    const { code, error } = payload as { code?: unknown; error?: unknown };
    if (isActionableCode(code) && typeof error === "string")
      return { code, message: error, status: res.status };
  }
  return {
    code: "host_error",
    status: res.status,
    message: `${what} was refused (HTTP ${res.status})${detail ? `: ${detail.slice(0, 300)}` : ""}.`,
  };
}

function isActionableCode(code: unknown): code is SessionToolErrorCode {
  return (
    code === "mission_cap" ||
    code === "mission_depth" ||
    code === "mission_fanout" ||
    code === "agent_not_found" ||
    code === "agent_ambiguous" ||
    code === "invalid_provider" ||
    code === "agent_unreachable" ||
    code === "agent_refused"
  );
}

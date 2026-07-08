// A pending interaction: the ordered sequence of steps a mission is waiting on
// the user for. Recorded when the model calls ask_user / request_connection,
// carried on the terminal `done` wire frame, and persisted on the Activity so
// the board card settles to `needs_you` (present) vs `done` (absent). The UI
// renders it as ONE composer-replacing card that walks the user through the
// steps one at a time, with a "1 of X" progress indicator.
//
// A turn's steps are the question steps (from one ask_user call, 1 to 3
// questions) FOLLOWED BY at most one signin step (the user must sign in to
// Houston first) FOLLOWED BY the connect steps (one per request_connection
// call, deduped by toolkit), FOLLOWED BY any custom-integration / MCP-server
// proposal steps (from propose_custom_integration / propose_mcp_server). Any
// single kind alone still yields a valid sequence.

export interface InteractionOption {
  id: string;
  label: string;
}

/**
 * How a custom integration authenticates its outbound HTTP requests. The secret
 * itself never travels on this shape (nor on any PendingInteraction) — only how
 * to attach it: as a request header (optionally prefixed, e.g. `Bearer `) or as
 * a query parameter. The gateway injects the stored key at request time.
 */
export type CustomIntegrationAuth =
  | { type: "header"; header: string; prefix?: string }
  | { type: "query"; param: string };

/**
 * How a remote MCP server authenticates. As with {@link CustomIntegrationAuth}
 * the secret VALUE never travels on this shape (nor on any PendingInteraction) —
 * only how to attach it: a bearer token, a custom header carrying the raw value,
 * or nothing at all. The gateway injects the stored value at request time.
 */
export type McpServerAuth =
  | { type: "none" }
  | { type: "bearer" }
  | { type: "header"; header: string };

/** One step in the interaction sequence. `id` is tool-assigned (`q1`..`qN` for
 *  question steps, `s1` for the single signin step, `c1`..`cN` for connect
 *  steps, `x1`..`xN` for custom-integration proposals, `m1`..`mN` for MCP-server
 *  proposals) so each step's outcome is addressable. A `question` carries its
 *  text + optional single-select options; a `signin` asks the user to sign in to
 *  Houston with an optional user-facing reason; a `connect` names the toolkit to
 *  connect with an optional user-facing reason; a `custom_integration` /
 *  `mcp_server` carries the agent-authored proposal (NO secret) the user
 *  supplies the key/token for in the card that renders in place of the chat
 *  input. */
export type InteractionStep =
  | {
      kind: "question";
      id: string;
      question: string;
      options?: InteractionOption[];
    }
  | { kind: "signin"; id: string; reason?: string }
  | { kind: "connect"; id: string; toolkit: string; reason?: string }
  | {
      kind: "custom_integration";
      id: string;
      proposal: {
        name: string;
        baseUrl: string;
        auth: CustomIntegrationAuth;
        description: string;
      };
      reason?: string;
    }
  | {
      kind: "mcp_server";
      id: string;
      proposal: {
        name: string;
        url: string;
        auth: McpServerAuth;
        description?: string;
      };
      reason?: string;
    };

/** The ordered steps the mission is waiting on: question steps first (at most 3),
 *  then at most one signin step, then connect steps, then proposal steps. Always
 *  at least one step. */
export interface PendingInteraction {
  steps: InteractionStep[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

/** One step, structurally valid. */
export const isInteractionStep = (v: unknown): v is InteractionStep => {
  if (!isRecord(v) || typeof v.id !== "string") return false;
  if (v.kind === "question") return typeof v.question === "string";
  if (v.kind === "signin")
    return v.reason === undefined || typeof v.reason === "string";
  if (v.kind === "connect") return typeof v.toolkit === "string";
  if (v.kind === "custom_integration") {
    const p = v.proposal;
    return (
      isRecord(p) &&
      typeof p.name === "string" &&
      typeof p.baseUrl === "string" &&
      typeof p.description === "string" &&
      isRecord(p.auth)
    );
  }
  if (v.kind === "mcp_server") {
    const p = v.proposal;
    return (
      isRecord(p) &&
      typeof p.name === "string" &&
      typeof p.url === "string" &&
      isRecord(p.auth)
    );
  }
  return false;
};

/** Structural guard for persisted/wire data. Interactions outlive code: an
 *  activity, chat message, or localStorage entry written by an OLDER build
 *  (the pre-step `{kind, question}` / `{kind, questions}` / `{kind, toolkit}`
 *  shapes) has no `steps` and must be treated as absent, never rendered.
 *  Every seam that READS a persisted interaction goes through this guard. */
export const isPendingInteraction = (v: unknown): v is PendingInteraction =>
  isRecord(v) &&
  Array.isArray(v.steps) &&
  v.steps.length > 0 &&
  v.steps.every(isInteractionStep);

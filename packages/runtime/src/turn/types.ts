import type { ChatMessage, TurnMode } from "@houston/protocol";
import type { ServedCredential } from "../auth/auth-file";

/** Independently deployable authority carried by a per-turn grant. */
export type TurnGrantScope = "integrations" | "agent-writes";

/** Parsed short-lived authority for host-proxying tools. */
export interface TurnGrant {
  url: string;
  token: string;
  expires: number;
  scopes: TurnGrantScope[];
}

/**
 * The self-contained turn request the control plane sends. Everything a turn
 * needs rides in: identity (for the GCS prefix), the user's text, and the
 * short-TTL access credential. The runtime holds NO per-tenant state between
 * requests.
 */
export interface TurnRequest {
  workspaceId: string;
  agentId: string;
  conversationId: string;
  text: string;
  /** Echoed on the user frame so the sending client can skip its own message. */
  nonce?: string;
  /** Object-storage prefix that IS this agent ("ws/<workspaceId>/<agentId>"). */
  gcsPrefix: string;
  /** null = workspace not connected yet (the turn fails with a clear error). */
  credential: ServedCredential | null;
  /**
   * The provider this turn is PINNED to — the conversation's picked provider,
   * forwarded by the dispatcher. When present it is the provider the turn runs
   * on (and the provider a failure names), even if the attached credential
   * belongs to a different provider: a dispatcher that serves the wrong
   * credential must surface as THIS provider's auth error, never silently move
   * the turn onto a provider the user did not pick (PRODUCT-1515). Absent =
   * legacy dispatch: the credential's provider is the pin.
   */
  provider?: string;
  /** Per-turn model override (a routine's pinned model). Absent = inherit. */
  model?: string;
  /** Per-turn reasoning-effort override (a routine's pinned effort). Absent = inherit. */
  effort?: string;
  /**
   * Per-turn execution mode ("plan" = read-only + planning overlay; "auto" =
   * Autopilot, acts without the blocking tools). Absent = execute. Routine fire
   * paths set "auto" so scheduled work never waits for user intervention.
   */
  mode?: TurnMode;
  /**
   * Presentation-only bubble text, when it must differ from `text` (the real
   * prompt the model runs on). Persisted alongside the user message so a
   * history reload renders `displayText ?? content`. Absent when they match.
   */
  displayText?: string;
  /**
   * The teammates the message @mentions (HOU-944). Structure only: the model
   * runs on `text`, where the names already appear as plain "@Name". Persisted
   * beside the user message and echoed on the `user` frame. Absent when the
   * message mentions nobody.
   */
  mentions?: ChatMessage["mentions"];
  /** Gateway-minted identity reused across a retried dispatch. */
  turnId?: string;
  /** Per-claim gateway token. Secret material, never log this value. */
  hostToken?: string;
  /** Human attribution for machine-dispatched work. */
  actingAs?: { userId: string; name?: string };
  /** Hydrate and resolve the model without calling it or writing back. */
  shadow?: boolean;
  /**
   * Hosted-gateway turn context (HOU-711): the org's shared note and the
   * caller's context, injected into the session prompt exactly as the
   * long-lived server path does. Either present = "use these" (each defaults
   * to ""); both absent = the workspace's own context files.
   */
  workspaceContext?: string;
  userContext?: string;
  /**
   * First turnlog sequence number this execution may use. The gateway keeps
   * ONE turnlog stream per conversation, so a worker that restarted at 1 on a
   * conversation's second turn would collide with the first turn's frames
   * (replay = resync). Absent = 1 (a fresh conversation, or a legacy caller).
   */
  turnlogSeqStart?: number;
  /**
   * A scheduled routine fire (pool path): the worker derives the prompt and
   * pins from the agent's own routine file and keeps the run-row lifecycle the
   * standing host would have kept. Requires a claim: only the control-plane
   * scheduler dispatches routine turns.
   */
  routine?: {
    id: string;
    /**
     * Trigger events (Composio / webhooks) that woke this routine. Present =
     * the worker builds the trigger prompt (events framed as untrusted data)
     * instead of the plain scheduled-run prompt.
     */
    events?: { id: string; trigger_slug: string; payload: unknown }[];
  };
  /** Exclusive conversation claim granted to this worker. */
  claim?: {
    id: string;
    bootId: string;
    token: string;
    heartbeatUrl: string;
  };
  /** Secret turn-local authority. Never log, export, persist, or put in env. */
  grant?: TurnGrant;
}

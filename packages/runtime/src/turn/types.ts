import type {
  ChatMessage,
  GrantableOperation,
  TurnLimits,
  TurnMode,
} from "@houston/protocol";
import type { PrefetchedObjects } from "@houston/runtime-client/object-sync";
import type { ServedCredential } from "../auth/auth-file";
import type { ClaudeSubscriptionType } from "../auth/claude-plan";
import type { MissionTitleRequest } from "../session/mission-title";

/**
 * Independently deployable authority carried by a per-turn grant. `code-run`
 * means the gateway serves `POST {grant.url}/v1/code/run` for this turn: the
 * worker reaches the code sandbox through the grant and never holds a sandbox
 * URL, app token or GCP identity of its own. `browser-live` means the gateway
 * serves the conversation's browser live routes to this worker for this turn,
 * so the `browser` tool may hand the page to the person.
 */
export type TurnGrantScope =
  | "integrations"
  | "agent-writes"
  | "code-run"
  | "browser-live";

/** Parsed short-lived authority for host-proxying tools. */
export interface TurnGrant {
  url: string;
  token: string;
  expires: number;
  scopes: TurnGrantScope[];
}

/**
 * Houston's own per-turn credential: the gateway mints it for the owner of the
 * assistant this turn runs, bound to the turn's claim (released claim = dead
 * token). Secret material: it lives in the sandbox facade's closure only,
 * never in a log, a file, a child's env or the session.
 */
export interface TurnCoordinator {
  token: string;
  /** Unix seconds. */
  expires: number;
}

/** The served credential, plus the plan a pool dispatch names beside it. */
export type TurnCredential = ServedCredential & {
  /** A Claude login's plan (auth/claude-plan.ts). Never written to auth.json. */
  subscriptionType?: ClaudeSubscriptionType;
};

/**
 * The self-contained turn request the control plane sends. Everything a turn
 * needs rides in: identity (for the GCS prefix), the user's text, and the
 * short-TTL access credential. The runtime holds NO per-tenant state between
 * requests.
 */
export interface TurnRequest {
  /** Per-request mode ref; never accepted from the wire. */
  liveMode?: import("../session/turn-mode-context").TurnModeRef;
  workspaceId: string;
  agentId: string;
  conversationId: string;
  text: string;
  /** Echoed on the user frame so the sending client can skip its own message. */
  nonce?: string;
  /** Object-storage prefix that IS this agent ("ws/<workspaceId>/<agentId>"). */
  gcsPrefix: string;
  /** null = workspace not connected yet (the turn fails with a clear error). */
  credential: TurnCredential | null;
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
  nextStepSuggestions?: boolean;
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
  /**
   * The acting person's plan limits, stamped by the gateway. A routine this
   * turn saves is held to them (turn-sandbox-writes.ts). Absent = no limit.
   */
  limits?: TurnLimits;
  /**
   * A new mission's first send: title its card after the reply, in this same
   * worker, before sync-back (turn-mission-title.ts). Absent on every other turn.
   */
  missionTitle?: MissionTitleRequest;
  /** Gateway-minted identity reused across a retried dispatch. */
  turnId?: string;
  /**
   * Per-claim gateway token. Secret material, never log this value. On pooled
   * turns the gateway sends a turn-scoped bearer that expires with the turn's
   * claim, never the agent's standing host token; the worker keeps it in
   * memory only (pool-leaks.test.ts: never on disk, never in a child's env).
   */
  hostToken?: string;
  /** Signed gateway authority; human attribution cannot authorize inference. */
  actingToken?: string;
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
  /** Present only on Houston's own turn (parse-turn-coordinator.ts). */
  coordinator?: TurnCoordinator;
  /** The person's answers to approval cards, raw as their message sent them. */
  approvals?: unknown;
  /** One-use approvals the person's message carries for this turn. */
  grants?: GrantableOperation[];
  /** The agent's listing and small files, read by the dispatcher next to
   *  the store and shipped with a claimed turn so a far-away worker skips
   *  those round trips. Absent means read the store directly. */
  prefetch?: PrefetchedObjects;
}

import type { ServerResponse } from "node:http";
import type { ActivityContributor, HoustonEvent } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import type { Vfs } from "../vfs";
import {
  clearDeletedApprovals,
  substituteApprovals,
} from "./agents-turn-approvals";
import { admitTurnMessage } from "./agents-turn-message";
import {
  applyModeSwitch,
  recordLiveTurn,
  stampAttribution,
} from "./agents-turn-record";
import type { TurnBody } from "./turn-body";

/**
 * WHAT THE HOST DOES TO A TURN ON ITS WAY TO THE AGENT'S ENGINE.
 *
 * Every seam here keys on a conversation rest the runtime also serves, so none
 * of them is a route: the request is forwarded either way (routes/agents.ts),
 * and these run first. They are written as one function per concern so the body
 * memo (turn-body.ts) is the only thing they share and their order is the only
 * thing that couples them — the order they are listed in below is the order
 * they must run in.
 */
export interface TurnSeamCtx {
  readonly vfs?: Vfs;
  readonly paths: WorkspacePaths;
  readonly agent: Agent;
  readonly workspace: Workspace;
  readonly method: string;
  /** The path after `/agents/:agentId/`, raw — the engine gets these bytes. */
  readonly rest: string;
  readonly emit?: (event: HoustonEvent) => void;
  /** The acting human a trusted gateway vouched for; null off the gateway. */
  readonly actingAuthor: ActivityContributor | null;
  /** That same identity as the gateway-minted token, for what it starts. */
  readonly actingAs?: string;
  /** WHO the message is from, for the retry identity it is fingerprinted under. */
  readonly actor: string;
  /** The conversation of the USER TURN this request is, when it is one. */
  readonly turnConversationId: string | undefined;
  readonly body: TurnBody;
  /** What the admission seam decided about this message. */
  readonly message: TurnMessageState;
  /**
   * What the engine's answer is written to. The approval seam REPLACES it with
   * a substituting stream, which is why it is the one mutable field here.
   */
  client: ServerResponse;
}

/**
 * WHETHER THIS MESSAGE TRAVELS AT ALL, decided by the admission seam
 * (agents-turn-message.ts) before any other seam records anything about it.
 * Mutated in place, because a seam reads what the ones before it decided.
 */
export interface TurnMessageState {
  /** A definitive refusal: the route answers it, and nothing is forwarded. */
  refusal?: { status: 400 | 409 | 503; code: string };
  /** The runtime already accepted this exact message: record it a second time. */
  duplicate: boolean;
  /** Frees this request's own retry reservation when the turn was not accepted. */
  release?: () => void;
}

export type TurnSeam = (ctx: TurnSeamCtx) => Promise<void> | void;

/** The conversation a `POST conversations/:id/messages` starts a turn in. */
export function turnConversationOf(
  method: string,
  rest: string,
): string | undefined {
  const match =
    method === "POST" ? rest.match(/^conversations\/([^/]+)\/messages$/) : null;
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

const SEAMS: TurnSeam[] = [
  admitTurnMessage,
  recordLiveTurn,
  applyModeSwitch,
  stampAttribution,
  clearDeletedApprovals,
  substituteApprovals,
];

export async function runTurnSeams(ctx: TurnSeamCtx): Promise<void> {
  // A refused message is not forwarded, so every seam after the refusal would
  // be recording a turn that never happens.
  for (const seam of SEAMS) {
    if (ctx.message.refusal) return;
    await seam(ctx);
  }
}

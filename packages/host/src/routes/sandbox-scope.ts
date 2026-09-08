import type { IncomingMessage, ServerResponse } from "node:http";
import type { CredentialVault } from "../ports";
import { assistantClaim } from "./assistant-claim";
import { bearer, json } from "./http";

/**
 * WHAT THE COORDINATOR MAY REACH on the runtime-facing `/sandbox/*` surface.
 *
 * Every `/sandbox/*` route authenticates the same way: a valid HMAC sandbox
 * token, which every runtime this host spawns carries. That is the right gate
 * for an ordinary agent, whose sandbox token is exactly its reach. It is NOT
 * the right gate for the personal assistant: the coordinator is a runtime the
 * user talks to about their whole account, so a prompt injection inside its
 * chat reaches whatever its token reaches. Without this gate that includes
 * installing a community skill into an agent's tree, writing a scheduled task,
 * and executing a connected app - none of which the coordinator has a tool for,
 * and all of which the catalogued surface would have required an approval
 * receipt for (`assistant/approvals.ts`).
 *
 * So the coordinator's reach is stated ONCE, here, as an allowlist keyed on the
 * claim rather than on the route: its own Houston operations, the mission board
 * it delegates work through, its own memory document, its transcript recall,
 * and the read-only provider status its turns run on. Everything else answers
 * 403 `coordinator_scope`.
 *
 * Ordinary agents are untouched: the gate only fires for a claim that IS the
 * coordinator (the `.assistant` dot-agent locally, the single agent of an
 * assistant pod - `routes/assistant-claim.ts` owns that decision, and it is the
 * same decision the assistant surface itself is authorized by).
 */

/**
 * The route families the coordinator reaches, matched against the request path.
 *
 * `/sandbox/credential` and `/sandbox/credential/revoked` are on the list
 * because they are how ANY runtime, coordinator included, is served the model
 * credential its own turn runs on - withholding them would leave the assistant
 * unable to answer at all. They serve only the claim's own agent, so they hand
 * the coordinator nothing beyond its own turn.
 */
const COORDINATOR_SCOPE: readonly RegExp[] = [
  // Houston operations: the catalogued surface, with its own approval receipts.
  /^\/sandbox\/assistant\/(call|pending)$/,
  // Delegation: the mission board is how the coordinator hands work to agents.
  /^\/sandbox\/missions(\/(read|start|status|settle))?$/,
  // Its own memory document (routes/learnings-sandbox.ts scopes the write to
  // the claim's agent, which for this claim is the coordinator itself).
  /^\/sandbox\/learnings\/save$/,
  // Recall over its own conversations (the pod-auth transcript facade).
  /^\/sandbox\/transcripts\/conversations\//,
  // The credential its own turn runs on, and the revocation report that keeps
  // a dead token from being served again.
  /^\/sandbox\/credential(\/revoked)?$/,
  // Read-only provider status (quota), which the model reports to the user.
  /^\/sandbox\/provider-usage$/,
];

/**
 * Refuse a `/sandbox/*` call the coordinator has no business making, answering
 * true when the request is finished. Returns false for every request that is
 * not a coordinator's, which is every ordinary agent's and every non-sandbox
 * path - those travel on to the route that serves them.
 */
export function refuseOutOfCoordinatorScope(
  deps: { vault: CredentialVault; gatewayFronted?: boolean },
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): boolean {
  if (!path.startsWith("/sandbox/")) return false;
  const token = bearer(req, url);
  // Not the coordinator (an ordinary agent, or no valid token at all): this
  // gate has nothing to say. An unauthenticated call is still refused by the
  // route itself, which owns the 401 its callers already read.
  if (!assistantClaim(deps.vault, token, deps)) return false;
  if (COORDINATOR_SCOPE.some((allowed) => allowed.test(path))) return false;
  json(res, 403, {
    error:
      "Houston's assistant does not do this itself - start a mission and let one of your agents do it",
    code: "coordinator_scope",
  });
  return true;
}

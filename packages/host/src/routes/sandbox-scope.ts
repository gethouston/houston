import type { IncomingMessage, ServerResponse } from "node:http";
import type { CredentialVault } from "../ports";
import { assistantClaim } from "./assistant-claim";
import { bearer, json } from "./http";

const COORDINATOR_SCOPE: readonly RegExp[] = [
  /^\/sandbox\/assistant\/(call|pending)$/,
  /^\/sandbox\/missions(\/(read|start|status|settle))?$/,
  /^\/sandbox\/learnings\/save$/,
  /^\/sandbox\/transcripts\/conversations\//,
  /^\/sandbox\/credential(\/revoked)?$/,
  /^\/sandbox\/provider-usage$/,
];

export function refuseOutOfCoordinatorScope(
  deps: { vault: CredentialVault; gatewayFronted?: boolean },
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): boolean {
  if (!path.startsWith("/sandbox/")) return false;
  const token = bearer(req, url);
  if (!assistantClaim(deps.vault, token, deps)) return false;
  if (COORDINATOR_SCOPE.some((allowed) => allowed.test(path))) return false;
  json(res, 403, {
    error:
      "The AI Manager does not do this itself - start a mission and let one of your agents do it",
    code: "coordinator_scope",
  });
  return true;
}

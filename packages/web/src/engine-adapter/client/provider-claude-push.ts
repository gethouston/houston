import {
  pushClaudeOAuthCredential,
  pushSetupClaudeOAuthCredential,
} from "../control-plane";
import type { AdapterContext } from "./context";
import { providerRoutingSettled } from "./provider-routing";

/**
 * Push a desktop-extracted Anthropic OAuth credential (the `claude` CLI's
 * `.credentials.json` JSON) to the ACTIVE SPACE's agent pod, which stores and
 * materializes it on the PVC.
 *
 * The desktop calls this for a REMOTE engine after a successful browser login —
 * the pod can't read this machine's Keychain. Cloud-only: a co-located engine
 * shares the credential dir with its local runtime, so it never reaches here (a
 * call without a control plane is a programming error).
 *
 * TARGET RESOLUTION (HOU-979). The agent is resolved HERE, from the one
 * space-validated accessor. The caller used to pass it in, read straight off the
 * agent STORE — a third, unsynchronized source of the routing id that could name
 * the previous space's agent right after a switch. With no agent in this space
 * (first-run onboarding, the cloud-migration wizard) OR with the space's agent
 * list not yet settled, the push goes to the hidden SETUP runtime instead: the
 * same central store under the same `x-houston-org`, so it is always
 * space-correct, and the agents created or migrated next are already connected.
 * A guess at a specific agent is the one thing that is never acceptable.
 */
export async function pushClaudeCredential(
  ctx: AdapterContext,
  credentialJson: string,
): Promise<void> {
  const cp = ctx.cp;
  if (!cp) throw new Error("Pushing a Claude credential needs a cloud engine.");
  const agentId = providerRoutingSettled(ctx) ? ctx.providerAgentId() : null;
  if (agentId) {
    await pushClaudeOAuthCredential(cp, agentId, credentialJson);
    return;
  }
  await pushSetupClaudeOAuthCredential(cp, credentialJson);
}

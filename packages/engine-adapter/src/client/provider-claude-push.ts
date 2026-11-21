import { agentPath } from "../control-plane";
import type { AdapterContext } from "./context";
import { providerRoutingSettled } from "./provider-routing";
import { viaSdk } from "./sdk-error";

export async function pushClaudeCredential(
  ctx: AdapterContext,
  credentialJson: string,
): Promise<void> {
  if (!ctx.cp)
    throw new Error("Pushing a Claude credential needs a cloud engine.");
  const agentId = providerRoutingSettled(ctx) ? ctx.providerAgentId() : null;
  const credentials = ctx.sdk.providers.credentials;
  if (agentId) {
    await viaSdk(`${agentPath(agentId)}/credential/claude-oauth`, () =>
      credentials.pushClaudeOAuthCredential(agentId, credentialJson),
    );
    return;
  }
  await viaSdk("/setup-runtime/credential/claude-oauth", () =>
    credentials.pushSetupClaudeOAuthCredential(credentialJson),
  );
}

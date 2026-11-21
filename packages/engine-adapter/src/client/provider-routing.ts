import { NoAgentForProviderWriteError } from "../no-agent-provider-write-error";
import type { AdapterContext } from "./context";

export function providerRoutingSettled(ctx: AdapterContext): boolean {
  return !ctx.cp || ctx.agentList.kind !== "pending";
}

export function requireProviderRouting(ctx: AdapterContext): void {
  if (providerRoutingSettled(ctx)) return;
  throw new Error(
    "This space is still loading. Try connecting again in a moment.",
  );
}

export function requireProviderAgentId(ctx: AdapterContext): string {
  requireProviderRouting(ctx);
  const id = ctx.providerAgentId();
  if (!id) throw new NoAgentForProviderWriteError();
  return id;
}

import { EngineError } from "@houston/runtime-client";
import { emitLocalEcho } from "../bus";
import type { AdapterContext } from "./context";

export function isProviderAgentGoneError(err: unknown): boolean {
  if (!(err instanceof EngineError) || err.status !== 404) return false;
  try {
    const body = JSON.parse(err.body) as { error?: unknown };
    return body.error === "agent not found";
  } catch {
    return false;
  }
}

export async function withProviderAgentRetarget<T>(
  ctx: AdapterContext,
  run: (agentId: string | null) => Promise<T>,
): Promise<T> {
  const first = ctx.providerAgentId();
  try {
    return await run(first);
  } catch (err) {
    if (first === null || !isProviderAgentGoneError(err)) throw err;
    ctx.noteAgentGone(first);
    emitLocalEcho("AgentsChanged", {});
    return run(ctx.providerAgentId());
  }
}

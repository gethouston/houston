import type { AdapterContext } from "./context";

export const runtimeScope = (ctx: AdapterContext, agentPath: string): string =>
  ctx.cp ? agentPath : "";

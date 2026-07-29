import type { Capabilities } from "@houston-ai/engine-client";

export type ScreenPrefetch = "integrations" | "organization" | "store-catalog";

export function screenPrefetchPlan(
  capabilities: Capabilities | null | undefined,
): ScreenPrefetch[] {
  const plan: ScreenPrefetch[] = ["store-catalog"];
  if (capabilities?.integrations.includes("composio"))
    plan.push("integrations");
  if (capabilities?.multiplayer) plan.push("organization");
  return plan;
}

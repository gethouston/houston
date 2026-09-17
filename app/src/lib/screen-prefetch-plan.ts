import type { Capabilities } from "@houston/engine-adapter";

export type ScreenPrefetch = "integrations" | "organization";

export function screenPrefetchPlan(
  capabilities: Capabilities | null | undefined,
): ScreenPrefetch[] {
  const plan: ScreenPrefetch[] = [];
  if (capabilities?.integrations.includes("composio"))
    plan.push("integrations");
  if (capabilities?.multiplayer) plan.push("organization");
  return plan;
}

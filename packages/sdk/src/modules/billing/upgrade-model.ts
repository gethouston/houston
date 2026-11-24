import type { OrgBilling } from "@houston/wire-types";
import { planComposerMode, usagePercent } from "./model";

export type PlanUpgradeView =
  | { status: "free"; percent: null }
  | { status: "nearLimit" | "limit"; percent: number };

/** A free org's persistent upgrade entry: plain Free, the 80% warning, or the limit. */
export function planUpgradeView(
  billing: OrgBilling | null | undefined,
): PlanUpgradeView | null {
  if (billing?.tier !== "free") return null;
  const mode = planComposerMode(billing);
  const percent = usagePercent(billing);
  if (mode === "none" || percent === null)
    return { status: "free", percent: null };
  return { status: mode === "limit" ? "limit" : "nearLimit", percent };
}

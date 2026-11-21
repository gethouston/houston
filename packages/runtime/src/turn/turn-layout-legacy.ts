import { type TurnLayout, TurnSetupError } from "./turn-layout";

const LEGACY_LAYOUT: Record<string, string> = {
  ".houston/activity/activity.json": ".houston/activity.json",
  ".houston/routines/routines.json": ".houston/routines.json",
  ".houston/routine_runs/routine_runs.json": ".houston/routine_runs.json",
  ".houston/config/config.json": ".houston/config.json",
  ".houston/learnings/learnings.json": ".houston/memory/learnings.md",
};

export function pendingLegacyLayout(
  layout: Pick<TurnLayout, "workspaceRel">,
  listed: Iterable<string>,
): string[] {
  return pendingPairs(layout, listed).map(([, flat]) => flat);
}

export function pendingLegacyFamilies(
  layout: Pick<TurnLayout, "workspaceRel">,
  listed: Iterable<string>,
): string[] {
  return pendingPairs(layout, listed).map(([family]) => family);
}

function pendingPairs(
  layout: Pick<TurnLayout, "workspaceRel">,
  listed: Iterable<string>,
): [string, string][] {
  const keys = new Set(listed);
  const root = `${layout.workspaceRel}/`;
  return Object.entries(LEGACY_LAYOUT).filter(
    ([family, flat]) => keys.has(root + flat) && !keys.has(root + family),
  );
}

export function assertMigratedLayout(
  layout: Pick<TurnLayout, "workspaceRel">,
  listed: Iterable<string>,
): void {
  const pending = pendingLegacyLayout(layout, listed);
  if (pending.length === 0) return;
  throw new TurnSetupError(
    "agent_not_migrated",
    `agent store still holds the flat layout (${pending.join(", ")}); its migration must run first`,
  );
}

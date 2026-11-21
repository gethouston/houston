export type CloudMigrationOutcome = "done" | "skipped";

export interface CloudMigrationInputs {
  remoteGateway: boolean;
  isTauri: boolean;
  signedIn: boolean;
  hasLegacyWorkspaces: boolean;
  outcome: CloudMigrationOutcome | null;
  loading: boolean;
}

export type CloudMigrationGateState = "loading" | "show" | "pass";

export function cloudMigrationGateState(
  i: CloudMigrationInputs,
): CloudMigrationGateState {
  if (!i.remoteGateway) return "pass";
  if (!i.isTauri) return "pass";
  if (!i.signedIn) return "pass";
  if (i.outcome) return "pass";
  if (i.loading) return "loading";
  return i.hasLegacyWorkspaces ? "show" : "pass";
}

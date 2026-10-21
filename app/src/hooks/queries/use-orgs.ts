import type {
  CreateOrgOutcome,
  OrgPlan,
  OrgSummary,
} from "@houston/engine-adapter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriOrg } from "../../lib/tauri";
import { useWorkspaceStore } from "../../stores/workspaces";

/**
 * Create an org (C8), free unless asked for `paid`. Invalidates the spaces list and reloads the
 * workspace store so the new org appears in the switcher (it bridges in as an
 * `org:`-prefixed workspace). No `onError`: `tauriOrg.createOrg` routes through
 * `call()`, which surfaces + reports the failure once; a second toast here would
 * double up. The mutation resolves with the SDK's create outcome: the created
 * org, whose slug the caller persists (creation is NOT idempotent — a lost
 * response is reconciled via the spaces list, never a blind retry), or the
 * free slot already taken, an expected state where nothing was created, or a
 * paid org with the checkout that unlocks it.
 *
 * Listing spaces and moving an agent live in `use-spaces.ts` (`useOrgs`,
 * `useMoveAgent`, `useAgentMoveStatus`) — the share flow's read/move surface.
 */
export function useCreateTeam() {
  const qc = useQueryClient();
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces);
  return useMutation({
    mutationFn: (input: { name: string; plan?: OrgPlan }) =>
      tauriOrg.createOrg(input),
    onSuccess: async (outcome) => {
      qc.invalidateQueries({ queryKey: queryKeys.orgs() });
      if (outcome.kind !== "free_org_taken") await loadWorkspaces();
    },
  });
}

/** The org a create made, or null when the free slot was taken. */
export function createdOrg(outcome: CreateOrgOutcome): OrgSummary | null {
  return outcome.kind === "free_org_taken" ? null : outcome.org;
}

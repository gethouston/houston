import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriOrg } from "../../lib/tauri";
import { useWorkspaceStore } from "../../stores/workspaces";

/**
 * Create a team space (C8). Invalidates the spaces list and reloads the
 * workspace store so the new team appears in the switcher (it bridges in as an
 * `org:`-prefixed workspace). No `onError`: `tauriOrg.createOrg` routes through
 * `call()`, which surfaces + reports the failure once; a second toast here would
 * double up. The mutation resolves with the created `OrgSummary` so the caller
 * can persist the slug (creation is NOT idempotent — a lost response is
 * reconciled via the spaces list, never a blind retry).
 *
 * Listing spaces and moving an agent live in `use-spaces.ts` (`useOrgs`,
 * `useMoveAgent`, `useAgentMoveStatus`) — the share flow's read/move surface.
 */
export function useCreateTeam() {
  const qc = useQueryClient();
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces);
  return useMutation({
    mutationFn: (name: string) => tauriOrg.createOrg(name),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: queryKeys.orgs() });
      await loadWorkspaces();
    },
  });
}

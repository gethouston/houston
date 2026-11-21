import type {
  BillingInterval,
  CreateOrgOutcome,
  OrgPlan,
  OrgSummary,
} from "@houston/engine-adapter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriOrg } from "../../lib/tauri";
import { useWorkspaceStore } from "../../stores/workspaces";

export function useCreateTeam() {
  const qc = useQueryClient();
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces);
  return useMutation({
    mutationFn: (input: {
      name: string;
      plan?: OrgPlan;
      interval?: BillingInterval;
    }) => tauriOrg.createOrg(input),
    onSuccess: async (outcome) => {
      qc.invalidateQueries({ queryKey: queryKeys.orgs() });
      if (createdOrg(outcome)) await loadWorkspaces();
    },
  });
}

export function createdOrg(outcome: CreateOrgOutcome): OrgSummary | null {
  return "org" in outcome ? outcome.org : null;
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  IssueIdentityRequest,
  VerifiableCredential,
} from "@houston-ai/engine-client";

import { getEngine } from "../../lib/engine";
import { showErrorToast } from "../../lib/error-toast";

const KEY = ["workspace-identity"] as const;

export function useIdentity() {
  return useQuery<VerifiableCredential | null>({
    queryKey: KEY,
    queryFn: () => getEngine().getIdentity(),
  });
}

export function useIssueIdentity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: IssueIdentityRequest) => getEngine().issueIdentity(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (err) => showErrorToast("issueIdentity", (err as Error).message),
  });
}

export function useRevokeIdentity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => getEngine().revokeIdentity(),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (err) => showErrorToast("revokeIdentity", (err as Error).message),
  });
}

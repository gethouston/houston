import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  IssueCredentialRequest,
  VerifiableCredential,
  VerifyCredentialResult,
} from "@houston-ai/engine-client";

import { getEngine } from "../../lib/engine";
import { showErrorToast } from "../../lib/error-toast";

const KEY = "agent-credentials";

/** Fetch the credential history for one agent (newest last). */
export function useAgentCredentials(agentPath: string | undefined) {
  return useQuery<VerifiableCredential[]>({
    queryKey: [KEY, agentPath],
    enabled: Boolean(agentPath),
    queryFn: () => getEngine().listAgentCredentials(agentPath!),
  });
}

/** Most recently active credential, or `undefined` if none. */
export function useActiveAgentCredential(
  agentPath: string | undefined,
): VerifiableCredential | undefined {
  const list = useAgentCredentials(agentPath).data ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].status === "active") return list[i];
  }
  return undefined;
}

export function useIssueAgentCredential(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: IssueCredentialRequest) =>
      getEngine().issueAgentCredential(agentPath, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, agentPath] }),
    onError: (err) =>
      showErrorToast("issueAgentCredential", (err as Error).message),
  });
}

export function useRevokeAgentCredential(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (credentialId: string) =>
      getEngine().revokeAgentCredential(agentPath, credentialId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, agentPath] }),
    onError: (err) =>
      showErrorToast("revokeAgentCredential", (err as Error).message),
  });
}

export function useVerifyAgentCredential(agentPath: string) {
  return useMutation<
    VerifyCredentialResult,
    Error,
    { credentialId: string; context: unknown }
  >({
    mutationFn: ({ credentialId, context }) =>
      getEngine().verifyAgentCredential(agentPath, credentialId, context),
    onError: (err) =>
      showErrorToast("verifyAgentCredential", (err as Error).message),
  });
}

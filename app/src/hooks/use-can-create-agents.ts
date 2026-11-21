import { canCreateAgents } from "../lib/org-roles";
import { useCapabilities } from "./use-capabilities";
import { useOrgWriteLock } from "./use-org-write-lock";

export function useCanCreateAgents(): {
  canCreate: boolean;
  isLoading: boolean;
  isError: boolean;
} {
  const { capabilities, isLoading, isError } = useCapabilities();
  return { canCreate: canCreateAgents(capabilities), isLoading, isError };
}

export function useCanAddAgentsHere(): boolean {
  const { canCreate } = useCanCreateAgents();
  const { locked } = useOrgWriteLock();
  return canCreate && !locked;
}

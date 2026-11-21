import { isPersonalSpace } from "../lib/org-roles.ts";
import { isTeamWorkspace } from "../lib/space-id.ts";
import { useWorkspaceStore } from "../stores/workspaces.ts";
import { useCapabilities } from "./use-capabilities.ts";

export function usePersonalSpace(): boolean {
  const { capabilities } = useCapabilities();
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  return isPersonalSpace(
    capabilities,
    isTeamWorkspace(currentWorkspace?.id ?? ""),
  );
}

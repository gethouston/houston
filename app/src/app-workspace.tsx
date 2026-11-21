import type { Toast } from "@houston-ai/core";
import { ClaudeBrowserLogin } from "./components/shell/claude-browser-login";
import { ProviderLoginFallback } from "./components/shell/provider-login-fallback";
import { TeamMoveHost } from "./components/shell/team-move-host";
import { WorkspaceShell } from "./components/shell/workspace-shell";
import { useSidebarLayoutReady } from "./hooks/use-sidebar-layout";
import { useWorkspaceStore } from "./stores/workspaces";

export function useWorkspaceBootReads(): void {
  const workspaceId = useWorkspaceStore((s) => s.current?.id);
  useSidebarLayoutReady(workspaceId);
}

export function AppWorkspace({
  toasts,
  onDismissToast,
}: {
  toasts: Toast[];
  onDismissToast: (id: string) => void;
}) {
  return (
    <>
      <ProviderLoginFallback />
      <ClaudeBrowserLogin />
      <WorkspaceShell toasts={toasts} onDismissToast={onDismissToast} />
      <TeamMoveHost />
    </>
  );
}

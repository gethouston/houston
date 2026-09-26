import type { Toast } from "@houston-ai/core";
import { ClaudeBrowserLogin } from "./components/shell/claude-browser-login";
import { ProviderLoginFallback } from "./components/shell/provider-login-fallback";
import { TeamMoveHost } from "./components/shell/team-move-host";
import { WorkspaceShell } from "./components/shell/workspace-shell";
import { useSidebarLayoutReady } from "./hooks/use-sidebar-layout";
import { useWorkspaceStore } from "./stores/workspaces";

/**
 * Boot reads the shell needs the moment it mounts, started beside the splash's
 * own reads rather than after it: the rail order decides the desktop landing.
 */
export function useWorkspaceBootReads(): void {
  const workspaceId = useWorkspaceStore((s) => s.current?.id);
  useSidebarLayoutReady(workspaceId);
}

/**
 * The shell and what rides beside it: the login fallbacks (a sign-in launched
 * from a surface with no handler of its own) and the group move flow, mounted
 * above the rail so closing a menu never unmounts it.
 */
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

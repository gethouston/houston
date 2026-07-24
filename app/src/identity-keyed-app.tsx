import App from "./App";
import { WorkspaceLoading } from "./components/shell/workspace-loading";
import { useSession } from "./hooks/use-session";

/**
 * Mounts <App/> keyed by the signed-in identity so ANY identity change
 * (sign-out, sign-in, in-place account switch) unmounts and re-bootstraps the
 * whole subtree — the boot-splash latch (App's bootedRef), useHoustonInit's
 * run-once guard, and every store-backed screen start clean for the new user.
 *
 * This is the one identity boundary that holds across EVERY deployment mode.
 * HostedEngineGate unmounts App on session loss only in hosted-oauth builds;
 * static-host (pnpm dev, self-host with cloud identity) and sidecar builds
 * keep App mounted through App's own internal sign-in guard, which left the
 * HOU-903 in-place reset with emptied stores and spent init guards (blank
 * shell / false first-run on re-sign-in). Keying by uid closes that in all
 * modes, including a signed-in A->B switch that never passes through null.
 *
 * Held on the splash until the session query settles so the key is stable
 * from App's very first mount (no spurious remount when the session resolves
 * moments after page load). Identity-off hosts resolve null immediately, so
 * they mount once with the constant key and never remount.
 */
export function IdentityKeyedApp() {
  const session = useSession();
  if (session.isPending) return <WorkspaceLoading />;
  return <App key={session.data?.uid ?? "signed-out"} />;
}

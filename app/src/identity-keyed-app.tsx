import App from "./App";
import { WorkspaceLoading } from "./components/shell/workspace-loading";
import { useSession } from "./hooks/use-session";

export function IdentityKeyedApp() {
  const session = useSession();
  if (session.isPending) return <WorkspaceLoading />;
  return <App key={session.data?.uid ?? "signed-out"} />;
}

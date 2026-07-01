import type { ReactNode } from "react";
import { isConnectionPending } from "../../lib/engine";
import { ConnectionChooser } from "../auth/connection-chooser";

/**
 * Gates the app on the runtime engine-connection choice (HOU-621). In the
 * TS-engine build with no choice stored yet, renders the connection chooser;
 * otherwise the engine gates below take over. In every other build (the Rust
 * default, or a build with a baked host URL) the connection is never pending, so
 * this is a passthrough with zero behaviour change.
 */
export function ConnectionGate({ children }: { children: ReactNode }) {
  if (isConnectionPending()) return <ConnectionChooser />;
  return <>{children}</>;
}

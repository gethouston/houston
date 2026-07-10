import type { AgentChip } from "./agent-chip";
import type { AppDisplay } from "./app-display";
import { agentChipsFor } from "./connected-apps-model";
import { IntegrationDisconnectDialog } from "./integration-disconnect-dialog";

interface DisconnectAppDialogProps {
  /** The app pending disconnect, or null when the dialog is closed. */
  app: AppDisplay | null;
  /** toolkit -> agent ids with the app active, to name who loses access. */
  grantMap: ReadonlyMap<string, string[]>;
  chipById: ReadonlyMap<string, AgentChip>;
  onClose: () => void;
  onConfirm: (toolkit: string) => void;
}

/**
 * The confirm-gated "disconnect everywhere" dialog shared by both connected-apps
 * surfaces: a user-level connection disappears for ALL agents, so the body names
 * the agents that lose access (derived from the live grant map). A thin wrapper
 * over {@link IntegrationDisconnectDialog} that pins `scope="everywhere"` and the
 * affected-agents derivation both surfaces otherwise repeated verbatim.
 */
export function DisconnectAppDialog({
  app,
  grantMap,
  chipById,
  onClose,
  onConfirm,
}: DisconnectAppDialogProps) {
  return (
    <IntegrationDisconnectDialog
      app={app}
      scope="everywhere"
      affectedAgents={
        app
          ? agentChipsFor(grantMap.get(app.toolkit) ?? [], chipById)
          : undefined
      }
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

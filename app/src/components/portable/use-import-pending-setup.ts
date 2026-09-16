import { useCallback, useMemo } from "react";
import {
  useIntegrationConnections,
  useIntegrationToolkits,
} from "../../hooks/queries/use-integrations";
import { useCapabilities } from "../../hooks/use-capabilities";
import {
  pendingRoutineSetup,
  type RoutineSetupNeed,
  type WakeBinding,
} from "../../lib/routine-setup-needs";
import { appDisplay } from "../integrations/app-display";
import {
  INTEGRATION_PROVIDER,
  integrationsSupported,
} from "../integrations/model";

/** A routine as the import preview carries it. */
interface PreviewRoutine {
  name: string;
  trigger?: WakeBinding;
}

/**
 * What the installed agent will still need from the person: an app connected for
 * each event-driven routine whose toolkit this account has never connected, and
 * a web address for each webhook routine (an installed one always lands
 * unminted). The wizard closes the moment the install lands, so this list rides
 * the agent's own first message instead of a step nobody would read.
 */
export function useImportPendingSetup(
  enabled: boolean,
): (routines: PreviewRoutine[]) => RoutineSetupNeed[] {
  const { capabilities } = useCapabilities();
  const integrations = integrationsSupported(capabilities);
  const connections = useIntegrationConnections(
    INTEGRATION_PROVIDER,
    integrations && enabled,
  );
  const catalog = useIntegrationToolkits(
    INTEGRATION_PROVIDER,
    integrations && enabled,
  );

  const connected = useMemo(
    () =>
      integrations && connections.data
        ? connections.data
            .filter((c) => c.status === "active")
            .map((c) => c.toolkit)
        : null,
    [integrations, connections.data],
  );

  return useCallback(
    (routines: PreviewRoutine[]) =>
      pendingRoutineSetup(routines, connected, (toolkit) =>
        appDisplay(
          toolkit,
          (catalog.data ?? []).find((tk) => tk.slug === toolkit),
        ).name.trim(),
      ),
    [connected, catalog.data],
  );
}

import type { RoutineTriggerBinding } from "@houston/engine-adapter";
import { useMemo } from "react";
import {
  useIntegrationConnections,
  useIntegrationToolkits,
} from "../../hooks/queries/use-integrations";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useSession } from "../../hooks/use-session";
import { viewerIsRoutineCreator } from "../../lib/routine-provider-health";
import { routineConnectNeed } from "../../lib/routine-setup-needs";
import { appDisplay } from "../integrations/app-display";
import {
  INTEGRATION_PROVIDER,
  integrationsSupported,
} from "../integrations/model";

/**
 * The one question a freshly installed trigger routine raises: is the app it
 * wakes on connected on THIS account? The provisioning status is the gateway's
 * to report and takes up to a minute to settle, but "you never connected Gmail"
 * is knowable here and now from the account's own connections — so the surface
 * can offer "Connect Gmail" instead of a spinner that ends in "couldn't
 * confirm". Returns the app's real display name, never the machine slug.
 *
 * `null` while connections are unknown (loading, or a deployment without
 * integrations): an unknown account never reads as a missing connection. Also
 * `null` when the viewer is not the routine's creator: a teammate's routine
 * fires on the CREATOR's connections, which this account cannot see, so the
 * viewer's own missing Gmail says nothing about it (same scope rule as
 * `useRoutineProviderHealth`).
 */
export function useRoutineConnectNeed(
  trigger: RoutineTriggerBinding | undefined,
  createdBy: string | undefined,
): { toolkit: string; appName: string } | null {
  const { capabilities } = useCapabilities();
  const { data: session } = useSession();
  const isCreator = viewerIsRoutineCreator(createdBy, session?.uid ?? null);
  const enabled = integrationsSupported(capabilities) && isCreator;
  const connections = useIntegrationConnections(INTEGRATION_PROVIDER, enabled);
  const catalog = useIntegrationToolkits(INTEGRATION_PROVIDER, enabled);

  return useMemo(() => {
    const connected =
      enabled && connections.data
        ? connections.data
            .filter((c) => c.status === "active")
            .map((c) => c.toolkit)
        : null;
    const toolkit = routineConnectNeed(trigger, connected);
    if (!toolkit) return null;
    const entry = (catalog.data ?? []).find((tk) => tk.slug === toolkit);
    return { toolkit, appName: appDisplay(toolkit, entry).name };
  }, [enabled, connections.data, catalog.data, trigger]);
}

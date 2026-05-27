import { IntegrationsView } from "./integrations-view";
import type { TabProps } from "../../lib/types";

/**
 * Per-agent Integrations tab. Thin wrapper around the shared
 * `IntegrationsView` so this surface stays identical to the sidebar
 * workspace-level entry point — single source of truth, no drift.
 */
export default function IntegrationsTab(_props: TabProps) {
  return <IntegrationsView />;
}

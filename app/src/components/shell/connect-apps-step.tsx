import { Button, DialogHeader, DialogTitle } from "@houston-ai/core";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useIntegrationConnections,
  useIntegrationStatus,
  useIntegrationToolkits,
} from "../../hooks/queries";
import { INTEGRATION_PROVIDER, useConnectFlow } from "../integrations";
import { appDisplay } from "../integrations/app-display";
import { isToolkitConnected } from "../onboarding/missions/onboarding-flow";
import { ConnectStepTile } from "./connect-step-tile";

interface ConnectAppsStepProps {
  /** The agent created in the dialog's previous step, connect is scoped to it. */
  agent: { id: string; name: string; folderPath: string };
  /** Toolkit slugs the agent's definition declares it works with. */
  toolkits: string[];
  /** Dismiss the whole dialog, the setup mission is already running. */
  onDone: () => void;
}

/**
 * In-dialog step (only for templates that declare integrations): offer to
 * connect the apps the agent's definition names, one tile each with the app's
 * real logo + name and a Connect button running the app's own OAuth
 * (`useConnectFlow`, single-flight). Connecting is an OFFER, never a gate: the
 * single "Done" closes the dialog whether or not anything was connected, and
 * the self-setup mission has already started behind it. Failures surface
 * through `useConnectFlow` (its engine calls toast via `call()`), so no click
 * here swallows an error.
 */
export function ConnectAppsStep({
  agent,
  toolkits,
  onDone,
}: ConnectAppsStepProps) {
  const { t } = useTranslation("agentOnboarding");
  // Keep the detection + catalog queries enabled once a connect is kicked off,
  // regardless of the cached ready flag: `useConnectFlow` invalidates
  // connections when its OAuth poll resolves and we must refetch to see it.
  const [attempted, setAttempted] = useState(false);

  // Gate the integration queries on the gateway being ready (the Houston
  // session push landed) or on a connect having been attempted, so we never
  // fire a failing call while the provider is still warming up.
  const status = useIntegrationStatus();
  const ready = !!status.data?.find((p) => p.provider === INTEGRATION_PROVIDER)
    ?.ready;
  const enabled = ready || attempted;
  const connections = useIntegrationConnections(INTEGRATION_PROVIDER, enabled);
  const catalog = useIntegrationToolkits(INTEGRATION_PROVIDER, enabled);

  const { states, connect, cancel } = useConnectFlow({ agentId: agent.id });
  // This step keeps its one-at-a-time UX: while any tile's OAuth runs the
  // others stay disabled (the per-slug flow supports parallel, but this offer
  // doesn't render it). Parallel connect lands with the migration wizard wave.
  const anyConnecting = Object.keys(states).length > 0;

  const bySlug = useMemo(
    () => new Map((catalog.data ?? []).map((tk) => [tk.slug, tk])),
    [catalog.data],
  );

  const handleConnect = useCallback(
    (slug: string) => {
      setAttempted(true);
      // Return the promise so AsyncButton's in-flight guard covers the whole
      // OAuth hop + poll (a `void` would leave the rage-click window open).
      return connect(slug);
    },
    [connect],
  );

  return (
    <>
      <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
        <DialogTitle>{t("connect.title", { name: agent.name })}</DialogTitle>
      </DialogHeader>

      <div className="flex-1 min-h-0 overflow-y-auto px-6">
        <p className="mb-4 text-sm text-ink-muted">
          {t("connect.body", { name: agent.name })}
        </p>
        <div className="flex flex-col gap-2">
          {toolkits.map((slug) => (
            <ConnectStepTile
              key={slug}
              display={appDisplay(slug, bySlug.get(slug))}
              connected={isToolkitConnected(connections.data, slug)}
              connecting={slug in states}
              disabled={anyConnecting && !(slug in states)}
              onConnect={() => handleConnect(slug)}
              onCancel={() => cancel(slug)}
            />
          ))}
        </div>
      </div>

      <footer className="flex shrink-0 justify-end border-t border-ink/[0.06] px-6 py-4">
        <Button type="button" className="rounded-full" onClick={onDone}>
          {t("connect.done")}
        </Button>
      </footer>
    </>
  );
}

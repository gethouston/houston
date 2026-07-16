import { Button } from "@houston-ai/core";
import confetti from "canvas-confetti";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  useIntegrationConnections,
  useIntegrationToolkits,
} from "../../../hooks/queries";
import { appDisplay } from "../../integrations/app-display";
import { AppRow } from "../../integrations/app-row";
import { INTEGRATION_PROVIDER } from "../../integrations/model";
import { useConnectFlow } from "../../integrations/use-connect-flow";
import { ProviderBrowser } from "../../provider-browser/provider-browser";
import { useProviderBrowserData } from "../../provider-browser/use-provider-browser-data";
import { SuccessCheck } from "../success-check";
import { WizardFrame } from "./wizard-frame";

/**
 * Step 1 of the done-screen's two-step setup (HOU-719 redesign): reconnect
 * the AI. Reuses the SAME `<ProviderBrowser>` the migration-reconnect moment
 * and onboarding use — it owns the OAuth launch, dialogs, polling, and
 * failure toasts. The browser is ALWAYS mounted (each provider shows its own
 * Connect / connected state inline) — we deliberately do NOT collapse it to a
 * one-line "connected" confirmation on mount, because that hid the provider
 * cards whenever a provider happened to be pre-connected (e.g. a dev machine
 * with shared credentials); the step is titled "Connect your AI", so the
 * cards must always be visible.
 */
export function DoneStepAi() {
  const { providers, connections, catalog } = useProviderBrowserData();
  return (
    <ProviderBrowser
      providers={providers}
      connections={connections}
      catalog={catalog}
      showFilters={false}
    />
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** The onboarding's confetti payoff, mirrored exactly (setup-progress.tsx),
 *  so the wizard's celebration reads as the same voice as everywhere else. */
function fireConfetti() {
  if (prefersReducedMotion()) return;
  const base = { startVelocity: 45, ticks: 220, zIndex: 9999, scalar: 0.9 };
  confetti({
    ...base,
    particleCount: 140,
    spread: 80,
    origin: { x: 0.5, y: 0.55 },
  });
  confetti({
    ...base,
    particleCount: 70,
    spread: 60,
    angle: 60,
    origin: { x: 0, y: 0.7 },
  });
  confetti({
    ...base,
    particleCount: 70,
    spread: 60,
    angle: 120,
    origin: { x: 1, y: 0.7 },
  });
}

/**
 * The wizard's final beat (HOU-719): a short congrats screen shown after the
 * two setup steps, before closing into the app. The celebratory
 * {@link SuccessCheck} (onboarding's one colour-accent moment) over the space
 * backdrop, the confetti payoff on mount (guarded by the reduced-motion
 * check), then a single "Start building" button hands control back to the
 * caller to close the wizard.
 */
export function DoneCongrats({ onFinish }: { onFinish: () => void }) {
  const { t } = useTranslation("migration");
  useEffect(() => {
    fireConfetti();
  }, []);
  return (
    <WizardFrame
      mark={<SuccessCheck />}
      title={t("done.congratsTitle")}
      body={t("done.congratsBody")}
      footer={
        <Button className="h-11 rounded-full px-6" onClick={onFinish}>
          {t("done.finish")}
        </Button>
      }
    />
  );
}

/**
 * Step 2: the apps the legacy account had connected before, one row per
 * toolkit via the shared `<AppRow>` (real logo, real name, from the Composio
 * toolkit catalog). Connect is the REAL account-level OAuth hand-off — the
 * same `useConnectFlow` the Integrations tab runs (mint link, open browser,
 * poll until active, invalidate, toast failures) with no agent context.
 */
export function DoneStepApps({ integrations }: { integrations: string[] }) {
  const { t } = useTranslation("migration");

  // Toolkit catalog for real app names/logos, through the GATED hook: a raw
  // fetch here 404-toasted ("unknown integration provider") on hosts with no
  // Composio registered (dev/self-host with only the custom provider). The
  // hook stays idle there and the raw slugs render instead.
  const toolkitCatalog = useIntegrationToolkits(
    "composio",
    integrations.length > 0,
  );
  const bySlug = new Map(
    (toolkitCatalog.data ?? []).map((tk) => [tk.slug, tk]),
  );

  // Live account connections, so a toolkit the user already reconnected (or
  // connects right here) renders as Connected instead of a dead Connect.
  const connections = useIntegrationConnections(
    INTEGRATION_PROVIDER,
    integrations.length > 0,
  );
  const activeToolkits = new Set(
    (connections.data ?? [])
      .filter((c) => c.status === "active")
      .map((c) => c.toolkit),
  );

  const flow = useConnectFlow({});

  if (integrations.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2">
      {integrations.map((slug) => {
        const isConnected = activeToolkits.has(slug);
        const isBusy = flow.state?.toolkit === slug;
        return (
          <li key={slug}>
            <AppRow
              display={appDisplay(slug, bySlug.get(slug))}
              trailing={
                <Button
                  variant="secondary"
                  size="sm"
                  className="rounded-full"
                  disabled={isConnected || flow.state !== null}
                  onClick={() => void flow.connect(slug)}
                >
                  {isConnected
                    ? t("done.connected")
                    : isBusy
                      ? t("done.connecting")
                      : t("done.connect")}
                </Button>
              }
            />
          </li>
        );
      })}
    </ul>
  );
}

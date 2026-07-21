import { Button } from "@houston-ai/core";
import confetti from "canvas-confetti";
import { Check, Loader2 } from "lucide-react";
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
 * the AI. Reuses the SAME `<ProviderBrowser>` in the SAME `curated` mode as
 * onboarding's "Connect your AI" step (missions/connect-ai.tsx) — the featured
 * providers split into Subscription / API-key sections with a "see all" chip —
 * so the two screens read as one flow. It owns the OAuth launch, dialogs,
 * polling, and failure toasts.
 *
 * Two deliberate departures from onboarding: we pass NEITHER `onSelect` nor
 * `selectOnMount`. The migration step must not auto-advance — the user
 * continues via the Continue button — and a pre-connected provider (e.g. a dev
 * machine with shared credentials) must stay VISIBLE rather than collapse the
 * step to a one-line "connected" confirmation; the step is titled "Connect
 * your AI", so the cards must always show. Curated mode keeps pre-connected
 * providers on their cards (their connected state renders inline within the
 * sections), and the browser handles the missing `onSelect` cleanly — the
 * auto-select watcher and the local-connect dialog both no-op without it.
 */
export function DoneStepAi() {
  const { providers, connections, catalog } = useProviderBrowserData();
  return (
    <ProviderBrowser
      providers={providers}
      connections={connections}
      catalog={catalog}
      curated
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
 *
 * Connects run TRULY in parallel: each row's Connect is gated only on ITS OWN
 * slug being in flight (`slug in flow.states`), never on any other app, so the
 * user can hand off several OAuth tabs at once. A row mid-flight shows a live
 * "Connecting…" line with a per-slug Cancel that bails out of that one flow.
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
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {integrations.map((slug) => {
        const isConnected = activeToolkits.has(slug);
        const inFlight = slug in flow.states;
        return (
          <li key={slug}>
            <AppRow
              display={appDisplay(slug, bySlug.get(slug))}
              trailing={
                isConnected ? (
                  // Completed treatment, not a dimmed disabled button: a success
                  // check + label reads as "done", so the row settles instead of
                  // offering a dead action (design-system success token, no fill).
                  <span className="inline-flex items-center gap-1.5 pr-1 text-xs font-medium text-success">
                    <Check className="size-4" strokeWidth={2.5} />
                    {t("done.connected")}
                  </span>
                ) : inFlight ? (
                  // This app's OAuth is mid-flight: a live status line plus a
                  // per-slug Cancel that stops ONLY this flow (silent, leaves any
                  // other app still connecting untouched).
                  <span className="inline-flex items-center gap-2 pr-1 text-xs text-ink-muted">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {t("done.connecting")}
                    <button
                      type="button"
                      onClick={() => flow.cancel(slug)}
                      className="font-medium text-ink underline-offset-2 transition-colors hover:underline"
                    >
                      {t("done.cancel")}
                    </button>
                  </span>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="rounded-full"
                    onClick={() => void flow.connect(slug)}
                  >
                    {t("done.connect")}
                  </Button>
                )
              }
            />
          </li>
        );
      })}
    </ul>
  );
}

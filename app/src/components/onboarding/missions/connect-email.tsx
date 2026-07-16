import { Button, ConfirmDialog } from "@houston-ai/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useIntegrationConnections,
  useIntegrationStatus,
} from "../../../hooks/queries";
import { useCapabilities } from "../../../hooks/use-capabilities";
import { canManageAgentGrants } from "../../../lib/agent-access";
import type { Agent } from "../../../lib/types";
import { GoogleIcon, MicrosoftIcon } from "../../auth/provider-brand-icons";
import { INTEGRATION_PROVIDER, useConnectFlow } from "../../integrations";
import { SetupCard } from "../setup-card";
import { EmailActionRow } from "./email-action-row";
import { isToolkitConnected, shouldOfferConnectSkip } from "./onboarding-flow";

/** A click within this window of a connect starting is a stray double-tap, not
 *  an intent to cancel — ignore it so a double click can't start-then-abort. */
const CANCEL_GUARD_MS = 300;

interface ConnectEmailMissionProps {
  eyebrow: string;
  /** The agent created in the previous step — connect is scoped to it. */
  agent: Agent;
  onBack: () => void;
  /** Fires once the chosen email toolkit is connected and active. */
  onConnected: (toolkit: string, label: string) => void;
  /** Escape hatch for a dead end (gateway unready, OAuth failed): skip the
   *  email steps rather than strand first-run with no way forward. */
  onSkip: () => void;
}

/**
 * Onboarding: give the agent access to the user's email. Two one-click brand
 * ACTION rows (Gmail, Outlook) — tap one and the app's own OAuth on the
 * integrations provider starts immediately (platform mode — no Composio
 * account, no sign-in step; see `integrations/model.ts`). No
 * select-then-Connect two-step, no selection state: these are buttons. While a
 * connect is in flight its row becomes a CANCEL control (mirrors the AI step's
 * Connect pill); the other disables. `useConnectFlow` mints the hosted link,
 * opens the browser, and polls until the connection turns active; we hand off
 * the moment the tapped toolkit shows up connected. Other providers connect
 * later from Integrations (the skip hint says so) — a free-text row here fed
 * raw slugs to Composio and mostly failed, so it was removed.
 */
export function ConnectEmailMission({
  eyebrow,
  agent,
  onBack,
  onConnected,
  onSkip,
}: ConnectEmailMissionProps) {
  const { t } = useTranslation("setup");
  const { capabilities } = useCapabilities();
  const [chosen, setChosen] = useState<{
    toolkit: string;
    label: string;
  } | null>(null);
  // Once the user has kicked off a connect, keep the detection query enabled
  // regardless of the cached ready flag: `useConnectFlow` invalidates it when
  // its OAuth poll resolves, and we must refetch to see the new connection
  // even if the status cache still lags on `ready`.
  const [attempted, setAttempted] = useState(false);
  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false);

  // The gateway is "ready" only once it has the Houston session (App's session
  // sync pushes it). Gate the connection poll on it so we never fire a failing
  // call while the provider is still warming up (before any connect attempt).
  const status = useIntegrationStatus();
  const ready = !!status.data?.find((p) => p.provider === INTEGRATION_PROVIDER)
    ?.ready;
  const connections = useIntegrationConnections(
    INTEGRATION_PROVIDER,
    ready || attempted,
  );

  // Multiplayer: a connection made from this agent's flow is auto-granted to it
  // (mirrors the integrations tab). Single-player has no grants — this is false.
  const autoGrant = canManageAgentGrants(capabilities, agent);
  const {
    state: connectState,
    connect,
    cancel,
  } = useConnectFlow({
    agentId: agent.id,
    autoGrant,
  });
  const connecting = connectState !== null;

  // Advance the moment the tapped toolkit lands active. `useIntegrationConnect`
  // invalidates the connections query when its OAuth poll resolves, so the
  // refetch drives this. Guarded by a ref so the hand-off fires exactly once —
  // so a "connected" that lands in the same beat as a cancel click still wins.
  // `chosen` records which toolkit was last tapped so the match still holds.
  // Intended: if the user goes Back and returns, this remounts with a fresh ref,
  // so re-tapping an already-connected toolkit auto-advances immediately (no
  // second OAuth) — that's the right outcome, they already granted access.
  const handedOff = useRef(false);
  useEffect(() => {
    if (handedOff.current) return;
    if (chosen && isToolkitConnected(connections.data, chosen.toolkit)) {
      handedOff.current = true;
      onConnected(chosen.toolkit, chosen.label);
    }
  }, [chosen, connections.data, onConnected]);

  // One-click connect. Record the toolkit so the auto-advance effect matches it,
  // then kick off OAuth — unless it is already connected (a return after Back),
  // in which case the effect advances with no second OAuth. `busyRef` is the
  // synchronous rage-click guard (HOU-465): `connecting` only flips on the next
  // render, so two fast taps could both pass a `disabled` check; the ref blocks
  // the second before it can setChosen a different toolkit or mint a second
  // OAuth flow (useConnectFlow also single-flights internally).
  const busyRef = useRef(false);
  const startedAtRef = useRef(0);
  const startConnect = useCallback(
    (toolkit: string, label: string) => {
      if (busyRef.current) return;
      setChosen({ toolkit, label });
      setAttempted(true);
      if (isToolkitConnected(connections.data, toolkit)) return;
      busyRef.current = true;
      startedAtRef.current = Date.now();
      void Promise.resolve(connect(toolkit)).finally(() => {
        busyRef.current = false;
      });
    },
    [connect, connections.data],
  );

  // Cancel the in-flight OAuth wait: stops the poll loop and resets the flow so
  // `connecting` clears (the already-opened browser tab can't be closed from
  // here — same as the AI step's cancel). A cancel is a user action, not an
  // error, so no toast. Guarded so a stray double-tap on a just-started row
  // can't read as an instant cancel.
  const tryCancel = useCallback(() => {
    if (Date.now() - startedAtRef.current < CANCEL_GUARD_MS) return;
    cancel();
  }, [cancel]);

  // A brand row: cancel its own in-flight connect, or start one.
  const onBrandRow = useCallback(
    (toolkit: string, label: string) => {
      if (connectState?.toolkit === toolkit) {
        tryCancel();
        return;
      }
      startConnect(toolkit, label);
    },
    [connectState, tryCancel, startConnect],
  );

  // Always offered (bar an in-flight connect): the route can exist
  // (capabilities) while the gateway is unready or the OAuth hop failed, and a
  // first-run with no Continue strands the user. A confirm dialog is the
  // actual friction — see `skipConfirmOpen` below — so hiding the affordance
  // itself would just relocate the dead end.
  const showSkip = shouldOfferConnectSkip({ connecting });

  const busyLabel = t("tutorial.missions.connectEmail.connecting");
  const cancelLabel = t("tutorial.missions.connectEmail.cancel");
  const isLoading = (toolkit: string) => connectState?.toolkit === toolkit;
  // Other rows disable while any connect is in flight; the in-flight one stays
  // enabled as its own cancel control.
  const disabledExcept = (toolkit: string) =>
    connecting && connectState?.toolkit !== toolkit;

  return (
    <SetupCard
      onSpace
      eyebrow={eyebrow}
      title={t("tutorial.missions.connectEmail.title")}
      subtitle={t("tutorial.missions.connectEmail.body")}
      onBack={onBack}
      backLabel={t("tutorial.nav.back")}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <div className="flex w-full max-w-md flex-col gap-3">
          <EmailActionRow
            icon={<GoogleIcon />}
            label="Gmail"
            busyLabel={busyLabel}
            cancelLabel={cancelLabel}
            loading={isLoading("gmail")}
            disabled={disabledExcept("gmail")}
            onClick={() => onBrandRow("gmail", "Gmail")}
          />
          <EmailActionRow
            icon={<MicrosoftIcon />}
            label="Outlook"
            busyLabel={busyLabel}
            cancelLabel={cancelLabel}
            loading={isLoading("outlook")}
            disabled={disabledExcept("outlook")}
            onClick={() => onBrandRow("outlook", "Outlook")}
          />
        </div>
        {showSkip && (
          <div className="flex items-center justify-center gap-3">
            <p className="min-w-0 text-xs text-ink-muted">
              {t("tutorial.missions.connectEmail.skipHint")}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => setSkipConfirmOpen(true)}
            >
              {t("tutorial.missions.connectEmail.skip")}
            </Button>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={skipConfirmOpen}
        onOpenChange={setSkipConfirmOpen}
        title={t("tutorial.missions.connectEmail.skipConfirmTitle")}
        description={t("tutorial.missions.connectEmail.skipConfirmBody")}
        confirmLabel={t("tutorial.missions.connectEmail.skipConfirmAction")}
        cancelLabel={t("tutorial.missions.connectEmail.skipConfirmCancel")}
        variant="default"
        onConfirm={onSkip}
      />
    </SetupCard>
  );
}

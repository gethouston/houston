import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LayoutGrid, Loader2 } from "lucide-react";
import { AsyncButton } from "@houston-ai/core";
import { analytics } from "../../../lib/analytics";
import {
  useConnections,
  useResetConnections,
} from "../../../hooks/queries";
import { useComposioAuth } from "../../../hooks/use-composio-auth";
import { SetupCard } from "../setup-card";
import { SuccessCheck } from "../success-check";

interface ToolsMissionProps {
  eyebrow: string;
  onBack: () => void;
  onContinue: () => void;
}

/**
 * Let the assistant use the user's real apps. Deliberately jargon-free (no
 * "Composio" / "integration provider") and modeled exactly on the AI-connect
 * screen: one "Sign in" button that flips to an INLINE "waiting / cancel"
 * state (no modal), then a success state once the account is connected.
 */
export function ToolsMission({ eyebrow, onBack, onContinue }: ToolsMissionProps) {
  const { t } = useTranslation("setup");
  const { data: status } = useConnections();
  const reset = useResetConnections();
  // Optimistic: the moment sign-in resolves, show connected — don't flash the
  // "Sign in" button while the connections query refetches (~2s). The refetch
  // then reconciles the real status.
  const [justConnected, setJustConnected] = useState(false);
  const auth = useComposioAuth(() => {
    setJustConnected(true);
    void reset();
  });
  const connected = justConnected || status?.status === "ok";
  const waiting = auth.state.phase === "waiting";

  // Funnel step 9 (action): the user connected their apps account. `connected`
  // is derived from a polled query, so guard with a ref to fire exactly once.
  const toolsConnectedFired = useRef(false);
  useEffect(() => {
    if (connected && !toolsConnectedFired.current) {
      toolsConnectedFired.current = true;
      analytics.track("tools_provider_connected");
    }
  }, [connected]);

  const handleSignIn = useCallback(() => auth.startAuth(), [auth]);

  return (
    <SetupCard
      eyebrow={eyebrow}
      title={t("tutorial.missions.tools.title")}
      subtitle={connected ? undefined : t("tutorial.missions.tools.body")}
      onBack={onBack}
      backLabel={t("tutorial.nav.back")}
      onNext={onContinue}
      nextLabel={t("tutorial.nav.continue")}
      nextDisabled={!connected}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        {!connected && (
          <span className="flex size-16 items-center justify-center rounded-2xl bg-secondary">
            <LayoutGrid className="size-7 text-foreground" />
          </span>
        )}

        {connected ? (
          <div className="flex flex-col items-center gap-3">
            <SuccessCheck />
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm font-medium text-foreground">
                {t("tutorial.missions.tools.connected.title")}
              </span>
              <p className="max-w-sm text-sm text-muted-foreground">
                {t("tutorial.missions.tools.connected.body")}
              </p>
            </div>
          </div>
        ) : waiting ? (
          <div className="flex flex-col items-center gap-2">
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("tutorial.missions.tools.waiting")}
            </span>
            <button
              type="button"
              onClick={() => auth.close()}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {t("tutorial.missions.tools.cancel")}
            </button>
          </div>
        ) : (
          <div className="flex w-full max-w-sm flex-col items-center gap-4">
            <ol className="flex w-full flex-col gap-2">
              {[
                t("tutorial.missions.tools.steps.account"),
                t("tutorial.missions.tools.steps.authorize"),
              ].map((label, i) => (
                <li
                  key={label}
                  className="flex items-center gap-3 rounded-xl bg-secondary px-4 py-3 text-left"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold tabular-nums text-background">
                    {i + 1}
                  </span>
                  <span className="text-sm text-foreground">{label}</span>
                </li>
              ))}
            </ol>
            <AsyncButton
              className="h-11 rounded-full px-5"
              spinner={false}
              onClick={handleSignIn}
            >
              {t("tutorial.missions.tools.allow")}
            </AsyncButton>
            {auth.state.phase === "error" && auth.state.error && (
              <p className="text-sm text-destructive">{auth.state.error}</p>
            )}
          </div>
        )}
      </div>
    </SetupCard>
  );
}

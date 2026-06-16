import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Check, LayoutGrid, Loader2 } from "lucide-react";
import { AsyncButton } from "@houston-ai/core";
import {
  useConnections,
  useResetConnections,
} from "../../../hooks/queries";
import { useComposioAuth } from "../../../hooks/use-composio-auth";
import { ComposioAuthDialog } from "../../composio-auth-dialog";
import { SetupCard } from "../setup-card";

interface ToolsMissionProps {
  eyebrow: string;
  onBack: () => void;
  onContinue: () => void;
}

/**
 * Let the assistant use the user's real apps. Deliberately jargon-free: the
 * user never sees "Composio" or "integration provider" — just one clear
 * "Allow access" action, mirroring the AI-connect screen. Once granted, it's a
 * success state; Next is gated on the account being connected.
 */
export function ToolsMission({ eyebrow, onBack, onContinue }: ToolsMissionProps) {
  const { t } = useTranslation("setup");
  const { data: status } = useConnections();
  const reset = useResetConnections();
  const auth = useComposioAuth(() => reset());
  const connected = status?.status === "ok";
  const waiting = auth.state.phase === "waiting";

  const handleAllow = useCallback(() => auth.startAuth(), [auth]);

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
        <span className="flex size-16 items-center justify-center rounded-2xl bg-secondary">
          <LayoutGrid className="size-7 text-foreground" />
        </span>

        {connected ? (
          <div className="flex flex-col items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Check className="size-4" />
              {t("tutorial.missions.tools.connected.title")}
            </span>
            <p className="max-w-sm text-sm text-muted-foreground">
              {t("tutorial.missions.tools.connected.body")}
            </p>
          </div>
        ) : waiting ? (
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("tutorial.missions.tools.waiting")}
          </span>
        ) : (
          <AsyncButton
            className="h-11 rounded-full px-5"
            spinner={false}
            onClick={handleAllow}
          >
            {t("tutorial.missions.tools.allow")}
          </AsyncButton>
        )}
      </div>

      <ComposioAuthDialog
        state={auth.state}
        onClose={auth.close}
        onReopenBrowser={auth.reopenBrowser}
        onRetry={auth.startAuth}
      />
    </SetupCard>
  );
}
